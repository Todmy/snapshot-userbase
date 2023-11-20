import 'dotenv/config';
import { locDB } from './mysql';
import snapshot from '@snapshot-labs/snapshot.js';

const chunkSize = 10000;

async function fetchData(addresses, network = '1') {
  const abi = [
    'function callCode(address _addr) public view returns (bytes code)',
  ];
  const CONTRACT_ADDRESS = '0xd130B43062D875a4B7aF3f8fc036Bc6e9D3E1B3E';
  const funcName = 'callCode';
  const provider = snapshot.utils.getProvider(network);
  try {
    const response = await snapshot.utils.multicall(
      network,
      provider,
      abi,
      addresses.map((address) => [CONTRACT_ADDRESS, funcName, [address]]),
    );
    const contractAddresses = response.map((code, index) => {
      return code[0] !== '0x' ? addresses[index] : null;
    }).filter((address) => address !== null);
    return contractAddresses;
  } catch (error) {
    console.log('Error fetching balances! from address', addresses[0], ' to ', addresses[addresses.length - 1]);
    throw `Error fetching balances! from address ${addresses[0]} to ${addresses[addresses.length - 1]}`
  }
}

async function getAddresses(chunkSize: number, iteration: number): Promise<string[]> {
  try {
    const query = `
      SELECT address
      FROM users
      WHERE address >= '0x00'
      ORDER BY address
      LIMIT ${chunkSize} OFFSET ${chunkSize * iteration};
    `;
    const [result]: any[] = await locDB.query(query);
    return result.map((row) => row.address);
  } catch (error) {
    console.log('Error fetching addresses! for chunk', iteration);
    throw `Fetch addresses error`;
  }
}

async function saveContracts(addresses: string[]) {
  try {
    const query = `
      INSERT INTO users (address, is_contract) VALUES ?
      ON DUPLICATE KEY UPDATE
          is_contract = VALUES(is_contract);
      `;
    await locDB.query(query, [addresses.map((address) => [address, '1'])]);
  } catch (error) {
    console.log('Error saving contracts! from address', addresses[0], ' to ', addresses[addresses.length - 1]);
    throw `Save contracts error`;
  }
}

(async () => {
  let count = 0;
  for (let i = 0; true; i++) {
    const addresses = await getAddresses(chunkSize, i);
    if (addresses.length === 0) {
      break;
    }
    try {
      const contractAddresses = await fetchData(addresses);
      count += addresses.length;
      console.log(count, '| Found contracts', contractAddresses.length, 'from', addresses[0], ' to ', addresses[addresses.length - 1]);
      if (contractAddresses.length !== 0) {
        await saveContracts(contractAddresses as string[]);
      }
    } catch (error) {
      console.log(error)
      console.log('Error fetching code! from address', addresses[0], ' to ', addresses[addresses.length - 1]);
      throw `Error fetching code! from address ${addresses[0]} to ${addresses[addresses.length - 1]}`
    }
  }

  process.exit(0);
})();