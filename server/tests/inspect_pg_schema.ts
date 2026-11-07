import { Client } from 'pg';

async function inspect(url: string) {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const res = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log(`URL: ${url}`);
    console.log(`Tables count: ${res.rows.length}`);
    console.log(`Tables: ${res.rows.map((r) => r.table_name).join(', ')}`);
    await client.end();
  } catch (err: any) {
    console.error(`Failed ${url}:`, err.message);
  }
}

async function main() {
  await inspect('postgres://postgres:ecvlocal@localhost:5434/enhancecv');
  await inspect('postgres://postgres:ecvlocal@localhost:5434/enhancecv_test');
}

main();
