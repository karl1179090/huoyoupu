import {spawn} from 'node:child_process';
import {readFile,access,chmod,link,rm,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import pg from 'pg';
const [mode,path]=process.argv.slice(2);
if(!['backup','restore'].includes(mode)||!path)throw new Error('Usage: node scripts/database-backup.mjs backup|restore archive.dump');
const connectionString=process.env.DATABASE_URL??(process.env.DATABASE_URL_FILE?await readFile(process.env.DATABASE_URL_FILE,'utf8'):undefined);
if(!connectionString)throw new Error('Set DATABASE_URL_FILE (private file) or DATABASE_URL');
const url=new URL(connectionString.trim());
if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('A PostgreSQL URL is required');
const env={...process.env,PGHOST:url.searchParams.get('host')??url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGAPPNAME:'huoyoupu-backup'};
if(url.searchParams.has('sslmode'))env.PGSSLMODE=url.searchParams.get('sslmode');
// Never pass a password or connection URI on a process command line or print it.
async function run(binary,args){
 await new Promise((done,reject)=>{const child=spawn(process.env.PG_BIN?join(process.env.PG_BIN,binary):binary,args,{env,stdio:['ignore','ignore','pipe']});let output='';child.stderr.on('data',chunk=>{output+=String(chunk);});child.on('error',reject);child.on('exit',code=>code===0?done():reject(new Error(`${binary} failed (${code}); ${output.replaceAll(env.PGPASSWORD||'__absent_secret__','[redacted]')}`)));});
}
const file=resolve(path);
if(mode==='backup'){
 await mkdir(dirname(file),{recursive:true,mode:0o700});
 try{await access(file);throw new Error('Archive already exists; use a new versioned filename');}catch(error){if(error.code!=='ENOENT')throw error;}
 const partial=`${file}.${process.pid}.partial`;
 try{process.umask(0o077);await run('pg_dump',['--format=custom','--no-owner','--no-privileges',`--file=${partial}`]);await chmod(partial,0o600);await link(partial,file);console.log('Backup completed');}
 finally{await rm(partial,{force:true});}
}else{
 await access(file);
 const pool=new pg.Pool({connectionString:connectionString.trim()});
 try{
  const result=await pool.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S')");
  if(result.rows[0].count!==0)throw new Error('Restore target must be a separately created empty database; no data will be overwritten');
 }finally{await pool.end();}
 await run('pg_restore',['--exit-on-error','--single-transaction','--no-owner','--no-privileges',`--dbname=${env.PGDATABASE}`,file]);
 console.log('Restore completed into empty database');
}
