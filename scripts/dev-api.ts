import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {chmod,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {userInfo} from 'node:os';
import {createTestDatabase} from '@huoyoupu/database/testing';
import {createApp} from '../apps/api/src/app.js';
import {initializeAdministrator} from '../apps/api/src/modules/auth/service.js';
import {parseSchema,type SchemaValue} from '@huoyoupu/contracts';

const host='127.0.0.1',port=3000,publicOrigin='http://localhost:5173';
const apiUrl=`http://${host}:${port}`;
type App=ReturnType<typeof createApp>;
type Login={cookie:string;csrf:string};
class DevelopmentCheckError extends Error {}

function pgBin():string{
 const candidates=[process.env.PG_BIN,'/opt/homebrew/opt/postgresql@18/bin','/usr/local/opt/postgresql@18/bin','/usr/lib/postgresql/18/bin'];
 const directory=candidates.find(value=>value&&existsSync(join(value,'initdb')));
 if(!directory)throw new Error('PostgreSQL 18 binaries are required; set PG_BIN');
 if(!/\b18\./.test(execFileSync(join(directory,'postgres'),['--version'],{encoding:'utf8'})))throw new Error('PG_BIN must point to PostgreSQL 18');
 return directory;
}
async function requireFreePort():Promise<void>{
 const probe=createServer();await new Promise<void>((resolve,reject)=>{
  probe.once('error',reject);probe.listen(port,host,()=>probe.close(error=>error?reject(error):resolve()));
 });
}
function requireStatus(actual:number,expected:number,route:string):void{
 if(actual!==expected)throw new DevelopmentCheckError(`${route}: expected ${expected}, received ${actual}`);
}
async function login(app:App,loginName:string,password:string):Promise<Login>{
 const challenge=await app.inject({url:'/api/v1/auth/session'});requireStatus(challenge.statusCode,200,'auth challenge');
 const csrf=parseSchema('Session',challenge.json()).csrfToken;
 const response=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:publicOrigin,cookie:String(challenge.headers['set-cookie']).split(';')[0]!,'x-csrf-token':csrf},payload:{loginName,password}});
 requireStatus(response.statusCode,200,'auth login');const session=parseSchema('Session',response.json());
 if(!session.user)throw new Error('Authenticated session required');
 return {cookie:String(response.headers['set-cookie']).split(';')[0]!,csrf:session.csrfToken};
}
async function seed(app:App,adminPassword:string,employeePassword:string){
 const credentials=await login(app,'admin',adminPassword);
 async function post<S extends 'User'|'Product'|'Warehouse'|'Customer'|'Address'|'Receipt'|'OrderAdmin'|'PrintTemplate'>(route:string,payload:object,schema:S,status=201):Promise<SchemaValue<S>>{
  const response=await app.inject({method:'POST',url:`/api/v1${route}`,headers:{origin:publicOrigin,cookie:credentials.cookie,'x-csrf-token':credentials.csrf,'idempotency-key':randomUUID()},payload});
  requireStatus(response.statusCode,status,route);return parseSchema(schema,response.json());
 }
 const employee=await post('/users',{loginName:'employee',password:employeePassword,role:'employee'},'User');
 const products=[
  await post('/products',{code:'DEMO-SOY',name:'虚构500ml酱油',specification:'500ml／瓶',brand:'联调示例',baseUnit:{name:'瓶',defaultSalePrice:'3.500000'},units:[{name:'件',multiplierBase:12,defaultSalePrice:'40.000000'}]},'Product'),
  await post('/products',{code:'DEMO-WATER',name:'虚构330ml汽水',specification:'330ml／罐',brand:'联调示例',baseUnit:{name:'罐',defaultSalePrice:'2.500000'},units:[{name:'箱',multiplierBase:24,defaultSalePrice:'55.000000'}]},'Product'),
 ];
 const warehouses=[await post('/warehouses',{code:'DEMO-W1',name:'虚构主仓'},'Warehouse'),await post('/warehouses',{code:'DEMO-W2',name:'虚构副仓'},'Warehouse')];
 const customer=await post('/customers',{code:'DEMO-C1',name:'虚构联调便利店',phone:'',notes:'仅供本机UI联调的虚构数据'},'Customer');
 const addresses=[
  await post(`/customers/${customer.id}/addresses`,{label:'主店',contactName:'虚构收货人甲',phone:'',address:'虚构示例路1号（测试地址）',isDefault:true},'Address'),
  await post(`/customers/${customer.id}/addresses`,{label:'分店',contactName:'虚构收货人乙',phone:'',address:'虚构示例路2号（测试地址）',isDefault:false},'Address'),
 ];
 const receivedAt=new Date(Date.now()-3*86400000).toISOString();
 const receipts=[];
 for(const [index,warehouse] of warehouses.entries()){
  receipts.push(await post('/receipts',{kind:'purchase',warehouseId:warehouse.id,receivedAt,supplierReference:`虚构联调批次${index+1}`,lines:products.map((product,i)=>({productId:product.id,unitId:product.units.find(unit=>unit.multiplierBase>1)!.id,quantity:5,unitCost:i===0?'24.000000':'30.000000'}))},'Receipt'));
 }
 const draftInput={customerId:customer.id,addressId:addresses[0]!.id,lines:[{clientLineId:'main',productId:products[0]!.id,warehouseId:warehouses[0]!.id,unitId:products[0]!.units.find(unit=>unit.multiplierBase>1)!.id,quantity:1,unitPrice:'40.000000',allocationMode:'auto'},{clientLineId:'second',productId:products[0]!.id,warehouseId:warehouses[1]!.id,unitId:products[0]!.baseUnitId,quantity:2,unitPrice:'3.500000',allocationMode:'auto'}],discountAmount:'1.00',roundOffAmount:'0.00',remark:'虚构已确认销售，多仓明细供联调'};
 const order=await post('/orders',draftInput,'OrderAdmin');
 const confirmed=await post(`/orders/${order.id}/confirm`,{expectedVersion:order.version},'OrderAdmin',200);
 const draft=await post('/orders',{...draftInput,addressId:addresses[1]!.id,remark:'虚构待确认草稿'},'OrderAdmin');
 const template=await post('/print-templates',{name:'虚构A4配送单',config:{paper:{size:'A4',orientation:'portrait',marginMm:10},headerFields:['companyName','orderNo','customerName','deliveryAddress'],columns:[{field:'productName',label:'商品',widthMm:65,align:'left'},{field:'warehouseName',label:'仓库',widthMm:30,align:'left'},{field:'quantity',label:'数量',widthMm:20,align:'right'},{field:'unitName',label:'单位',widthMm:15,align:'center'},{field:'unitPrice',label:'单价',widthMm:30,align:'right'},{field:'netAmount',label:'金额',widthMm:30,align:'right'}],minRowHeightMm:7,showRemark:true}},'PrintTemplate');
 for(const [route,payload] of [
  ['/company',{expectedVersion:1,name:'虚构联调配送商',phone:'',address:'虚构公司地址'}],
  [`/print-templates/${template.id}`,{expectedVersion:template.version,isDefault:true}],
 ] as const){const response=await app.inject({method:'PATCH',url:`/api/v1${route}`,headers:{origin:publicOrigin,cookie:credentials.cookie,'x-csrf-token':credentials.csrf,'idempotency-key':randomUUID()},payload});requireStatus(response.statusCode,200,route);}
 const employeeLogin=await login(app,'employee',employeePassword);
 for(const [route,status]of [[`/orders/${confirmed.id}`,200],['/products',403]] as const){const response=await app.inject({url:`/api/v1${route}`,headers:{cookie:employeeLogin.cookie}});requireStatus(response.statusCode,status,`employee ${route}`);}
 for(const [route,schema,count]of [['/products','ProductPage',2],['/warehouses','WarehousePage',2],['/inventory/batches','BatchPage',4]] as const){
  const response=await app.inject({url:`/api/v1${route}`,headers:{cookie:credentials.cookie}});requireStatus(response.statusCode,200,route);const result=parseSchema(schema,response.json());if(result.items.length!==count)throw new DevelopmentCheckError(`Unexpected seed count: ${route}`);
 }
 const customerCheck=await app.inject({url:`/api/v1/customers/${customer.id}`,headers:{cookie:credentials.cookie}});requireStatus(customerCheck.statusCode,200,'customer addresses');if(parseSchema('Customer',customerCheck.json()).addresses.length!==2)throw new DevelopmentCheckError('Unexpected customer address count');
 // Startup checks do not leave test login sessions or their secrets on disk.
 for(const account of [credentials,employeeLogin]){const response=await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:{origin:publicOrigin,cookie:account.cookie,'x-csrf-token':account.csrf}});requireStatus(response.statusCode,204,'auth logout');}
 return {products:products.map(product=>({id:product.id,code:product.code})),warehouses:warehouses.map(warehouse=>({id:warehouse.id,code:warehouse.code})),customerId:customer.id,addressIds:addresses.map(address=>address.id),receiptIds:receipts.map(receipt=>receipt.id),confirmedOrderId:confirmed.id,draftOrderId:draft.id,employeeId:employee.id,templateId:template.id};
}

let root:string|undefined,bin:string|undefined,started=false;
let database:Awaited<ReturnType<typeof createTestDatabase>>|undefined;
let app:App|undefined;
let stop:()=>void=()=>{};
const stopped=new Promise<void>(resolve=>{stop=resolve;});
const stopSignal=()=>stop();
process.on('SIGINT',stopSignal);process.on('SIGTERM',stopSignal);
let stage='port check';
try{
 await requireFreePort();bin=pgBin();
 // Always a new private cluster. DATABASE_URL and TEST_DATABASE_URL are never used.
 root=await mkdtemp('/tmp/huoyoupu-dev-');await chmod(root,0o700);
 const data=join(root,'data'),socket=join(root,'socket');await mkdir(socket,{mode:0o700});
 stage='private cluster initialization';execFileSync(join(bin,'initdb'),['-D',data,'-A','trust','--no-locale','-E','UTF8'],{stdio:'ignore'});
 execFileSync(join(bin,'pg_ctl'),['-D',data,'-l',join(root,'postgres.log'),'-o',`-F -h '' -k ${socket}`,'-w','start'],{stdio:'ignore'});started=true;
 const adminUrl=new URL(`postgresql://${encodeURIComponent(userInfo().username)}@localhost/postgres`);adminUrl.searchParams.set('host',socket);
 stage='random database migration';database=await createTestDatabase({adminUrl:adminUrl.toString()});
 const adminPassword=randomBytes(24).toString('base64url'),employeePassword=randomBytes(24).toString('base64url');
 await initializeAdministrator(database.pool,{loginName:'admin',password:adminPassword});
 app=createApp({database:database.pool,publicOrigin,logger:false});
 stage='existing API seed and focused authentication checks';const ids=await seed(app,adminPassword,employeePassword);
 const credentialsFile=join(root,'credentials.json');
 await writeFile(credentialsFile,JSON.stringify({purpose:'Disposable local UI development only',apiUrl,publicOrigin,admin:{loginName:'admin',password:adminPassword},employee:{loginName:'employee',password:employeePassword},databaseName:database.name,ids},null,2)+'\n',{mode:0o600,flag:'wx'});
 stage='HTTP listener';await app.listen({host,port});
 const health=await fetch(`${apiUrl}/health`);if(health.status!==200||(await health.json() as {status?:string}).status!=='ok')throw new Error('Health check failed');
 process.stdout.write(JSON.stringify({status:'ready',apiUrl,publicOrigin,credentialsFile,pid:process.pid,databaseName:database.name,verified:{health:true,adminLogin:true,employeeLogin:true,employeePermissions:true,products:2,warehouses:2,addresses:2,batches:4,confirmedOrders:1,drafts:1}})+'\n');
 await stopped;
}catch(error){
 const code=error&&typeof error==='object'&&'code'in error?String(error.code):'STARTUP_FAILED';
 const diagnostic=error instanceof DevelopmentCheckError?error.message:code;
 process.stderr.write(code==='EADDRINUSE'?'Port 3000 is occupied; no process was terminated.\n':`Development API failed at ${stage} (${diagnostic}); private resources will be cleaned.\n`);process.exitCode=1;
}finally{
 // HTTP must stop before pool physical sockets, DROP, and cluster shutdown.
 try{if(app)await app.close();}
 finally{
  try{if(database)await database.cleanup();}
  finally{
   let clusterStopped=!started;
   try{if(started&&bin&&root){execFileSync(join(bin,'pg_ctl'),['-D',join(root,'data'),'-m','fast','-w','stop'],{stdio:'ignore'});clusterStopped=true;}}
   finally{if(root&&clusterStopped)await rm(root,{recursive:true,force:true});else if(root)process.stderr.write(`Private cluster shutdown failed; preserve its files for recovery: ${root}\n`);}
  }
 }
 process.off('SIGINT',stopSignal);process.off('SIGTERM',stopSignal);
}
