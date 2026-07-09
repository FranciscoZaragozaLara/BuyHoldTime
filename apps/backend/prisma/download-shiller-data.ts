import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const LANDING_PAGE_URL = 'https://shillerdata.com/';
const FALLBACK_DOWNLOAD_URL = 'https://img1.wsimg.com/blobby/go/e5e77e0b-59d1-44d9-ab25-4763ac982e53/downloads/907c87f4-4176-4a13-9487-abddeadceb1b/ie_data.xls?ver=1783525168910';
const DEST_PATH = path.join(__dirname, '../../../source/SchillePERatio.xls');

async function main() {
  let downloadUrl = FALLBACK_DOWNLOAD_URL;

  console.log(`Querying ${LANDING_PAGE_URL} via curl to find latest download link...`);
  try {
    const html = execSync(`curl -sL "${LANDING_PAGE_URL}"`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    
    // Regex to match the GoDaddy wsimg download link for ie_data.xls
    const regex = /https:\/\/img1\.wsimg\.com\/blobby\/go\/[a-f0-9-]+\/downloads\/[a-f0-9-]+\/ie_data\.xls\?ver=[0-9]+/i;
    const match = html.match(regex);

    if (match) {
      downloadUrl = match[0];
      console.log(`Found latest dynamic URL: ${downloadUrl}`);
    } else {
      console.log(`Dynamic URL not matched in HTML, using fallback: ${downloadUrl}`);
    }
  } catch (err: any) {
    console.warn(`Failed to scrape landing page: ${err.message}. Proceeding with fallback URL.`);
  }

  console.log(`Downloading spreadsheet from: ${downloadUrl}`);
  try {
    // Make sure destination folder exists
    const dir = path.dirname(DEST_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Download file using curl to follow redirects and bypass TLS connect blockages
    execSync(`curl -sL "${downloadUrl}" -o "${DEST_PATH}"`);
    
    if (fs.existsSync(DEST_PATH)) {
      const stats = fs.statSync(DEST_PATH);
      console.log(`File successfully saved to: ${DEST_PATH} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } else {
      throw new Error('Downloaded file not found on disk');
    }

    // Run the seed script automatically to import updated data
    console.log('Executing seed-shiller-pe.ts to load the downloaded data into the database...');
    const backendPath = path.join(__dirname, '..');
    execSync('npx ts-node prisma/seed-shiller-pe.ts', {
      cwd: backendPath,
      stdio: 'inherit',
    });
    
    console.log('Database updated successfully with latest Shiller indicators!');
  } catch (error: any) {
    console.error('Failed to download or import Shiller data:', error.message);
  }
}

main().catch(console.error);
