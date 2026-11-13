import pg from '/app/node_modules/pg/lib/index.js';
import {readFile} from 'node:fs/promises';
const pool=new pg.Pool({host:'db',database:process.env.DB_NAME??'huoyoupu',user:'huoyoupu',password:(await readFile('/run/secrets/db_password','utf8')).trim()});
try {
 const names=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 const manifest={};
 for(const {tablename}of names){const name=tablename.replaceAll('"','""');manifest[tablename]=(await pool.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text) AS hash FROM "${name}" t`)).rows[0].hash;}
 const stock=(await pool.query('SELECT quantity_base,cost_amount::text FROM stock_balances')).rows;
 const account=(await pool.query('SELECT net_balance::text FROM customer_accounts')).rows;
 console.log(JSON.stringify({manifest,stock,account}));
} finally {await pool.end();}
