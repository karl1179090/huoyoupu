import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const mode=process.argv[2]??'serve';
if(!['serve','migrate','initialize-admin'].includes(mode))throw new Error('Unknown runtime mode');
if(!process.env.DATABASE_URL){
 const password=(await readFile(process.env.DB_PASSWORD_FILE??'/run/secrets/db_password','utf8')).trim();
 if(!password)throw new Error('Database secret is empty');
 const url=new URL('postgresql://db:5432/huoyoupu');
 url.username=process.env.DB_USER??'huoyoupu';url.password=password;url.hostname=process.env.DB_HOST??'db';url.pathname=`/${process.env.DB_NAME??'huoyoupu'}`;
 process.env.DATABASE_URL=url.toString();
}
if(mode==='serve')await import('../apps/api/dist/server.js');
else if(mode==='migrate')await import('../packages/database/dist/cli.js');
else{
 const directory=await mkdtemp(join(tmpdir(),'huoyoupu-admin-'));
 try{
  const file=join(directory,'password');await writeFile(file,await readFile('/run/secrets/admin_password'),{mode:0o600});
  process.env.HYP_ADMIN_PASSWORD_FILE=file;
  await import('../apps/api/dist/modules/auth/initialize.js');
 }finally{await rm(directory,{recursive:true,force:true});}
}
