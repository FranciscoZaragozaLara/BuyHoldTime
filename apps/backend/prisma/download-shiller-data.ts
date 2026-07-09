import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const SHILLER_URL = 'http://www.econ.yale.edu/~shiller/data/ie_data.xls';
const DEST_PATH = path.join(__dirname, '../../../source/SchillePERatio.xls');

async function main() {
  console.log(`Downloading latest Robert Shiller data from: ${SHILLER_URL}`);
  try {
    const response = await fetch(SHILLER_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Make sure destination folder exists
    const dir = path.dirname(DEST_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(DEST_PATH, buffer);
    console.log(`File successfully saved to: ${DEST_PATH} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

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
