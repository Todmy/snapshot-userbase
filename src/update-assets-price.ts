import 'dotenv/config';
import { locDB } from './mysql';
import axios from 'axios';

const mapChainIdToToken = {
  '1': 'eth',
  '10': 'eth',
  '56': 'bnb',
  '100': 'gno',
  '137': 'matic',
  '250': 'ftm',
  '1284': 'glmr',
  '1285': 'movr',
  '42161': 'eth',
  '42170': 'eth',
  '42220': 'celo',
  '43114': 'avax',
  '1666600000': 'one',
  '8453': 'eth',
};

async function fetchNetworks() {
  try {
    const [result]: any[] = await locDB.query(`
      SELECT DISTINCT network FROM assets_base;
    `);
    return result.map((row) => row.network);
  } catch (error) {
    console.log('Error fetching networks!', error);
    throw error;
  }
}

async function fetchPrices(networks) {
  try {
    const response = await Promise.all(
      networks.map((network) => axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${mapChainIdToToken[network].toUpperCase()}USDT`))
    )
    return response.map((res, index) => [networks[index], res.data.price]);
  } catch (error) {
    console.log('Error fetching prices!', error);
    throw error;
  }
}

async function savePrices(prices) {
  try {
    const updated = Date.now() / 1000;
    const query = `
      INSERT INTO assets_price (network, price, updated) VALUES ?
      ON DUPLICATE KEY UPDATE
          price = VALUES(price),
          updated = VALUES(updated);
      `;
    await locDB.query(query, [prices.map((price) => [price[0], price[1], updated])]);
  } catch (error) {
    console.log('Error saving prices!', error);
    throw error;
  }
}

(async () => {
  let networks = await fetchNetworks();
  networks = networks.reduce((acc, network) => {
    if (!mapChainIdToToken[network]) {
      console.log('Network not supported!', network, 'Please update manually in DB');
      return acc;
    }
    acc.push(network);
    return acc;
  }, []);
  const prices = await fetchPrices(networks);
  await savePrices(prices);
  console.log('Finished fetching prices');

  process.exit(0);
})();