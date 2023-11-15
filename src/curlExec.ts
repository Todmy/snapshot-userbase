import { exec } from 'child_process';

export async function scrapeWebsite(url: string): Promise<string> {
  try {
    return new Promise((resolve, reject) => {
      exec(`curl '${url}' \
      -H 'authority: etherscan.io' \
      -H 'accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' \
      -H 'accept-language: en-US,en;q=0.9,uk-UA;q=0.8,uk;q=0.7,ru;q=0.6' \
      -H 'cache-control: no-cache' \
      -H 'cookie: _ga=GA1.2.435613484.1637781733; ASP.NET_SessionId=2eljqujwo310famd2vnlxqux; etherscan_offset_datetime=+1; __stripe_mid=09f148f4-3fdc-4053-a719-41e21a26ad8b8063ab; __cuid=64085f63f5ec4edcbc3bb3c06a20a658; amp_fef1e8=85eeca71-e73c-4fa4-8e51-462b5d32f512R...1hesq82ga.1hesq82gf.7.4.b; etherscan_cookieconsent=True; cf_chl_2=e44fe0b34ac2c0c; cf_clearance=3dj1nKwTN7.Rs5rf_ub6wuqr_fPom5H88XzVsHEFaBA-1700053922-0-1-cf37a94c.64abf519.c47a3949-150.2.1700053922; __cflb=02DiuFnsSsHWYH8WqVXcJWaecAw5gpnmdsGYGfaJsCMLp' \
      -H 'pragma: no-cache' \
      -H 'sec-ch-ua: \"Google Chrome\";v=\"119\", \"Chromium\";v=\"119\", \"Not?A_Brand\";v=\"24\"' \
      -H 'sec-ch-ua-mobile: ?0' \
      -H 'sec-ch-ua-platform: \"macOS\"' \
      -H 'sec-fetch-dest: document' \
      -H 'sec-fetch-mode: navigate' \
      -H 'sec-fetch-site: none' \
      -H 'sec-fetch-user: ?1' \
      -H 'upgrade-insecure-requests: 1' \
      -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36' \
      --compressed`, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          reject(error);
          return;
        }
        resolve(stdout);
      });
    });
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Example usage
// scrapeWebsite('0xc9A601f10731f724F45F9443BF1746216ba10277');
// scrapeWebsite('0xe085789A6A0fc5D0253082bf857C8e4DbEa8F2f2');
