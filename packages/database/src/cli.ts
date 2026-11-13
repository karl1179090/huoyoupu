import {createDatabase, migrate} from './index.js';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const {pool} = createDatabase(url);
try { console.log(JSON.stringify({applied: await migrate(pool)})); }
finally { await pool.end(); }
