import 'dotenv/config';
import snapshot from '@snapshot-labs/snapshot.js';
import { locDB } from './mysql';
import { ethers } from 'ethers';

const MULTI_CHUNCK_SIZE = 10000;

async function fetchData(network, addresses) {
  const abi = [
    'function getEthBalance(address addr) public view returns (uint256 balance)',
  ];
  const MULTICALL_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
  const funcName = 'getEthBalance';
  const provider = snapshot.utils.getProvider(network);
  try {
    const response = await snapshot.utils.multicall(
      network,
      provider,
      abi,
      addresses.map((address) => [MULTICALL_ADDRESS, funcName, [address]]),
    );
    const balances = response.map((balance, i) => [
      addresses[i],
      parseFloat(ethers.formatEther(balance.toString()))
    ]);

    return balances;
  } catch (error) {
    console.log('Error fetching balances! from address', addresses[0], ' to ', addresses[addresses.length - 1]);
    throw `Error fetching balances! from address ${addresses[0]} to ${addresses[addresses.length - 1]}`
  }
}

async function getAddresses(chunkSize: number, iteration: number): Promise<string[]> {
  const query = `
    SELECT address
    FROM users
    WHERE address >= '0x00'
    ORDER BY address
    LIMIT ${chunkSize} OFFSET ${chunkSize * iteration};
  `;
  const [result]: any[] = await locDB.query(query);
  return result.map((row) => row.address);
}

async function saveBalances(network, balances) {
  const query = `
    INSERT INTO assets_base (address, network, assets, updated) VALUES ?
    ON DUPLICATE KEY UPDATE
        assets = VALUES(assets),
        updated = VALUES(updated);
    `;
  await locDB.query(query, [balances.map((balance) => [balance[0], network, balance[1], Date.now() / 1000])]);
}

async function processNetwork(networkId) {
  console.log('Processing network', networkId);
  for (let i = 0; true; i++) {
    const addresses = await getAddresses(MULTI_CHUNCK_SIZE, i);
    if (addresses.length === 0) {
      break;
    }
    const res = await fetchData(networkId, addresses);
    console.log('Processed chunk from ', i * MULTI_CHUNCK_SIZE, ' to ', i * MULTI_CHUNCK_SIZE + res.length);
    await saveBalances(networkId, res);
  }
  console.log('Finished processing network', networkId);
}

(async () => {
  await processNetwork('1'); // ethereum - eth
  await processNetwork('137'); // polygon - matic
  await processNetwork('250'); // fantom - ftm
  await processNetwork('56'); // binance smart chain - bnb
  await processNetwork('10'); // optimism - eth
  await processNetwork('25'); // cronos - cro
  await processNetwork('100'); // gnosis - xdai
  await processNetwork('1284'); // moonbeam - glmr
  await processNetwork('1285'); // moonriver - movr
  await processNetwork('42161');  // arbitrum one - eth
  await processNetwork('42170'); // arbitrum Nova - eth
  await processNetwork('42220'); // celo - celo
  await processNetwork('43114') // avalanche - avax
  await processNetwork('1666600000') // harmony - one
  await processNetwork('8453') // base - eth

  process.exit(0);
})();
