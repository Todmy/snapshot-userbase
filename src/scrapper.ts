import 'dotenv/config';
import { locDB } from './mysql';
import { load } from 'cheerio';
import axios from 'axios';
import { scrapeWebsite } from './curlExec';

const DEV_MODE = process.env.DEV_MODE === 'true' || false;
const LOAD_IN_BATCHES = process.env.LOAD_IN_BATCHES === 'true' || true;
const USE_AXIOS = process.env.USE_AXIOS === 'true' || false;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '1');

const supportedNetworks = {
  '1': 'https://etherscan.io/address/',
  '56': 'https://bscscan.com/address/',
  '137': 'https://polygonscan.com/address/',
  '250': 'https://ftmscan.com/address/',
  // less popular networks 
  // '10': 'https://optimistic.etherscan.io/address/',
  // '25': 'https://cronoscan.com/address/',
  // '100': 'https://gnosisscan.io/address/',
  // '199': 'https://bttcscan.com/address/',
  // '1101': 'https://zkevm.polygonscan.com/address/',
  // '1284': 'https://moonscan.io/address/',
  // '1285': 'https://moonriver.moonscan.io/address/',
  // '42161': 'https://arbiscan.io/address/',
  // '42170': 'https://nova.arbiscan.io/',
  // '42220': 'https://celoscan.io/address/',
};

async function fetchData(address, network = '1', skipMultiChain = false) {
  const url = supportedNetworks[network];
  console.log('url |', `${url}${address}`);
  let html = '';
  try {
    if (USE_AXIOS) {
      const response = await axios.get(`${url}${address}`)
      html = response.data;
    } else {
      html = await scrapeWebsite(`${url}${address}`);
    }
  } catch (error) {
    console.log('error |', error);
    throw error;
  }
  const $ = load(html);
  const balanceSelector = '#ContentPlaceHolder1_divTokenHolding #dropdownMenuBalance';
  const transactionSelector = '#ContentPlaceHolder1_divTxDataInfo p'
  const tokenSelector = 'h4:contains(\'Balance\') + div > div';
  const contractSelector = '#ContentPlaceHolder1_li_contracts';
  
  const tokenHtml = $(tokenSelector).text().replace(/\n/g, '').trim();
  const balanceHtml = $(balanceSelector).text().replace(/\n/g, '').trim();
  const transactionsHtml = $(transactionSelector).text().replace(/\n/g, '').trim();
  const contractHtml = $(contractSelector);

  const title = $('title').text().trim();
  
  const isValidPage = title.includes(`Address ${address}`);

  if (!isValidPage) {
    console.log(`${url}${address}\n`, html)
    throw new Error('We are detected as bot');
  }

  const tokenMatch = tokenHtml.match(/\$?(\d{1,3}(,\d{3})*(\.\d+)?)/);
  const token = tokenMatch ? parseFloat(tokenMatch[1].replace(/,/g, '')) : 0;

  let balanceMatch = balanceHtml.match(/\$?(\d{1,3}(,\d{3})*(\.\d+)?)/);
  let balance = balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0;

  const transactionMatch = transactionsHtml.match(/(\d+)\s*transactions/);
  const transactions = transactionMatch ? parseInt(transactionMatch[1].replace(',', '')) : 0;

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

async function getMultipleAddresses(count) {
  const addresses: any[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const address = await getAddress();
      addresses.push(address);
    } catch (error) {
      if (addresses.length === 0) {
        throw error;
      } else {
        break;
      }
    }
  }
  return addresses;
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

function delay(ms: number) {
  const randomDelay = Math.floor(Math.random() * ms) + Math.floor(ms / 2);
  return new Promise( resolve => setTimeout(resolve, randomDelay) );
}

(async function() {
  let i = 0;
  while (true) {
    try {
      if (LOAD_IN_BATCHES) {
        const addresses = await getMultipleAddresses(BATCH_SIZE);

        const assets = await Promise.all(addresses.map((address) => fetchData(address)));
        await Promise.all(assets.map((asset) => updateAssets(asset).then(() => {
          i++;
          console.log('iteration:', i, '| address:', asset[0].address);
        })));
        await delay(3000);
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
      } else if (error.message === 'We are detected as bot') {
        console.log('We are detected as bot');
        break;
      }
    }
  }
  process.exit(0);
})();
