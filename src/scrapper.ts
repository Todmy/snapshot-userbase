import 'dotenv/config';
import { locDB } from './mysql';
import { load } from 'cheerio';
import axios from 'axios';

const DEV_MODE = true;

const supportedNetworks = {
  '1': 'https://etherscan.io/address/',
  '10': 'https://optimistic.etherscan.io/address/',
  '25': 'https://cronoscan.com/address/',
  '56': 'https://bscscan.com/address/',
  '69': 'https://testnet.bscscan.com/address/',
  '100': 'https://gnosisscan.io/address/',
  '137': 'https://polygonscan.com/address/',
  '199': 'https://bttcscan.com/address/',
  '250': 'https://ftmscan.com/address/',
  '1101': 'https://zkevm.polygonscan.com/address/',
  '1284': 'https://moonscan.io/address/',
  '1285': 'https://moonriver.moonscan.io/address/',
  '42161': 'https://arbiscan.io/address/',
  '42170': 'https://nova.arbiscan.io/',
  '42220': 'https://celoscan.io/address/',
};


async function fetchData(address, network = '1', skipMultiChain = false) {
  const url = supportedNetworks[network];
  console.log('url |', `${url}${address}`);
  const response = await axios.get(`${url}${address}`)
  const html = response.data;
  const $ = load(html);
  const balanceSelector = '#ContentPlaceHolder1_divTokenHolding #dropdownMenuBalance';
  const transactionSelector = '#ContentPlaceHolder1_divTxDataInfo p'
  const tokenSelector = 'h4:contains(\'ETH Balance\') + div > div';
  const contractSelector = '#ContentPlaceHolder1_li_contracts';
  
  const tokenHtml = $(tokenSelector).text().replace(/\n/g, '').trim();
  const balanceHtml = $(balanceSelector).text().replace(/\n/g, '').trim();
  const transactionsHtml = $(transactionSelector).text().replace(/\n/g, '').trim();
  const contractHtml = $(contractSelector);

  const token = tokenHtml ? parseFloat(tokenHtml) : 0;

  let balanceMatch = balanceHtml.match(/\$?(\d{1,3}(,\d{3})*(\.\d+)?)/);
  let balance = balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0;

  const transactionMatch = transactionsHtml.match(/(\d+)\s*transactions/);
  const transactions = transactionMatch ? parseInt(transactionMatch[1]) : 0;

  const isContract = contractHtml.length > 0;

  const otherNetworks = $('#ContentPlaceHolder1_divMultichainAddress div > span').text();

  let otherNetworksData: any[] = [];
  if (otherNetworks && !skipMultiChain) {
    const otherNetworkSelector = '#ContentPlaceHolder1_divMultichainAddress ul:first-child a';
    const otherNetworksLinks = $(otherNetworkSelector).toArray().map((el) => $(el).attr('href'));
    const networkIds = Object.entries(supportedNetworks).map(([networkId, networkUrl]) => {
      if (otherNetworksLinks.includes(`${networkUrl}${address}`)) {
        return networkId;
      } else {
        return null;
      }
    }).filter((networkId) => networkId !== null);
    otherNetworksData = await processOtherNetworks(address, networkIds);
  }

  // console.log(`Balance for ${address} (${isContract}). eth: ${ether}, oth ${balance}; trns: ${transactions} | ${otherNetworks}`);
  
  return [
    {
      network,
      address,
      isContract,
      token,
      balance,
      transactions,
      updated: Math.floor(Date.now() / 1000)
    },
    ...otherNetworksData
  ]
}

async function processOtherNetworks(address, networks): Promise<any[]> {
  // concurrent
  const data = await Promise.all(networks.map(async (network) => {
    if (network) {
      const response = await fetchData(address, network, true);
      return response[0];
    }
  }));
  
  // sequential
  // const data: any[] = [];
  // for (let i = 0; i < networks.length; i++) {
  //   const network = networks[i];
  //   if (network) {
  //     const response = await fetchData(address, network, true);
  //     // const randomDelay = Math.floor(Math.random() * 2000);
  //     // await delay(randomDelay);
  //     data.push(response[0]);
  //   }
  // }
  return data;
}

async function getAddress(tryCount = 0) {
  if (tryCount > 10) {
    throw new Error('Too many tries. Do we reach the end?');
  }

  try {
    const query = `
      SELECT u.address FROM users${DEV_MODE ? '_clone' : ''} AS u
      LEFT JOIN assets${DEV_MODE ? '_clone' : ''} AS a ON u.address = a.address
      WHERE a.address IS NULL
      ORDER BY RAND()
      LIMIT 1;
    `;

    const [result]: any[] = await locDB.query(query);
    const address = result[0].address;

    const updateLockQuery = `
      INSERT INTO locks (address, created) VALUES (?, ?);
    `;

    const now = Math.floor(Date.now() / 1000);

    await locDB.query(updateLockQuery, [address, now]);

    return address;
  } catch (error) {
    return getAddress(tryCount + 1);
  }
}

async function updateAssets(assets) {
  try {
    const isContract = assets[0].isContract;
  
    const updateUserQuery = `
      UPDATE users${DEV_MODE ? '_clone' : ''} SET is_contract = ? WHERE address = ?;
    `;
  
    await locDB.query(updateUserQuery, [isContract, assets[0].address]);
  } catch (error) {
    console.log('Cannot update is_contract field of address', error);
    throw error;
  }

  try {
    const query = `
      INSERT INTO assets${DEV_MODE ? '_clone' : ''} (address, network, base_tokens, side_tokens_sum, transactions_n, updated) VALUES ?;
    `;

    await locDB.query(query, [assets.map(({ address, network, token, balance, transactions, updated }) => [address, network, token, balance, transactions, updated])]);
  } catch (error) {
    console.log('Cannot update assets', error);
    throw error;
  }

  try {
    // filter unique addresses
    const allLockedAddresses = assets.map(({ address }) => address)
    const uniqueAddresses = [...new Set(allLockedAddresses)];
    const query = `
      DELETE FROM locks WHERE address IN (?);
    `;

    await locDB.query(query, [uniqueAddresses]);
  } catch (error) {
    console.log('Cannot delete locks', error);
    throw error;
  }
}

(async function() {
  let i = 0;
  while (true) {
    try {
      if (DEV_MODE) {
        const addresses: any[] = [];
        for (let j = 0; j < 10; j++) {
          const address = await getAddress();
          addresses.push(address);
        }

        const assets = await Promise.all(addresses.map((address) => fetchData(address)));
        await Promise.all(assets.map((asset) => updateAssets(asset).then(() => {
          i++;
          console.log('iteration:', i, '| address:', asset[0].address);
        })));
      } else {
        const address = await getAddress();
        const assets = await fetchData(address);
        await updateAssets(assets);
        i++;
        console.log('iteration:', i, '| address:', address);
      }
    } catch (error: any) {
      if (error.message === 'Too many tries. Do we reach the end?') {
        console.log('We reach the end');
        break;
      }
    }
  }
  process.exit(0);
})();
