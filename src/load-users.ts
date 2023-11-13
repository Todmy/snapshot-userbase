import 'dotenv/config';
import { remDB, locDB } from './mysql';

const chunkSize = 10000;

function fetchUniqueUsers() {
  let lastProcessedVoter = '0x00';

  return async function fetchNextBatch(): Promise<any[]> {
    let query = `
    SELECT 
        DISTINCT v.voter,
        CASE 
            WHEN p.author IS NOT NULL THEN TRUE
            ELSE FALSE
        END AS is_author
    FROM 
        defaultdb.votes AS v
    LEFT JOIN 
        defaultdb.proposals AS p ON v.voter COLLATE utf8mb4_unicode_ci = p.author COLLATE utf8mb4_unicode_ci
    WHERE 
        v.voter > '${lastProcessedVoter}'
        AND v.space != 'linea-build.eth'
        AND v.space != 'magicappstore.eth'
    ORDER BY 
        v.voter 
    LIMIT ${chunkSize};
    `;

    const [result]: any[] = await remDB.query(query);

    if (result.length === 0) {
      return [[], ''];
    }

    lastProcessedVoter = result[result.length - 1].voter;
    const formattedResult = result.map((row) => ({
      address: row.voter,
      isAuthor: row.is_author,
      isContract: null
    }));

    return [formattedResult, lastProcessedVoter];
  }
}

async function updateUsers() {
  const fetchNextBatch = fetchUniqueUsers();
  let totalCount = 0;

  for (let i = 0; true; i++) {
    try {
      const [addresses, lastProcessedVoter] = await fetchNextBatch();
      if (addresses.length === 0) {
        break;
      }

      await locDB.query('INSERT IGNORE INTO users (address, is_creator, is_contract) VALUES ?', [
        addresses.map(({ address, isAuthor, isContract }) => [address, isAuthor, isContract])
      ]);
      totalCount += addresses.length;
  
      console.log('iteration:', i, '| imported total: ', totalCount, '| last processed voter:', lastProcessedVoter);
    } catch (error) {
      console.log('handled error: ', error)
    }
  }
}

(async () => {
  await updateUsers();
  process.exit(0);
})();