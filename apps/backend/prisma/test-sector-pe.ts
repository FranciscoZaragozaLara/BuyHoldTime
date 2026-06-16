import 'dotenv/config';

async function main() {
  const fmpApiKey = 'aHWvhgdKuBbca6TnHQyXFDwe4w5I6ja5';
  const sector = 'Technology';
  
  // Test 1: Wide range
  const url = `https://financialmodelingprep.com/stable/historical-sector-pe?sector=${encodeURIComponent(sector)}&from=1997-01-01&to=2026-06-15&apikey=${fmpApiKey}`;
  console.log('Fetching sector PE from URL:', url);
  try {
    const response = await fetch(url);
    const json = await response.json();
    if (Array.isArray(json)) {
      console.log('Returned Array Length:', json.length);
      console.log('Newest Item:', json[0]);
      console.log('Oldest Item:', json[json.length - 1]);
      console.log('Sample values:', json.slice(0, 5).map(x => `${x.date}: ${x.pe}`));
    } else {
      console.log('Returned object:', json);
    }
  } catch (err: any) {
    console.log('Fetch failed:', err.message);
  }

  // Test 2: Sector snapshot
  const url2 = `https://financialmodelingprep.com/stable/sector-pe-snapshot?date=2026-06-01&apikey=${fmpApiKey}`;
  console.log('\nFetching sector snapshot from URL:', url2);
  try {
    const response2 = await fetch(url2);
    const json2 = await response2.json();
    console.log('Snapshot response:', JSON.stringify(json2, null, 2));
  } catch (err: any) {
    console.log('Fetch 2 failed:', err.message);
  }
}

main().catch(console.error);
