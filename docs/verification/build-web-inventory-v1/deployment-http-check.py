import json,ssl,urllib.request,urllib.error,http.cookiejar,uuid
from pathlib import Path
origin='https://localhost:49443'
jar=http.cookiejar.CookieJar()
client=urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile='test-ca.crt')),urllib.request.HTTPCookieProcessor(jar))
csrf=None

def call(method,path,payload=None,status=200,write=False,extra=None):
 headers={'Origin':origin}
 if csrf: headers['x-csrf-token']=csrf
 if write: headers['idempotency-key']=str(uuid.uuid4())
 if extra: headers.update(extra)
 data=None if payload is None else json.dumps(payload).encode()
 if data is not None: headers['Content-Type']='application/json'
 req=urllib.request.Request(origin+path,data=data,headers=headers,method=method)
 try:r=client.open(req,timeout=15)
 except urllib.error.HTTPError as e:r=e
 body=r.read().decode()
 assert r.code==status,(method,path,r.code,body)
 return json.loads(body),r.headers

assert call('GET','/health')[0]['status']=='ok'
call('GET','/api/v1/users',status=401)
challenge,_=call('GET','/api/v1/auth/session');csrf=challenge['csrfToken']
password=Path('infra/secrets/admin_password').read_text().strip()
login,headers=call('POST','/api/v1/auth/login',{'loginName':'admin','password':password});csrf=login['csrfToken']
cookies=';'.join(headers.get_all('Set-Cookie'))
assert 'Secure' in cookies and 'HttpOnly' in cookies and 'SameSite=Strict' in cookies
call('GET','/api/v1/users')
call('POST','/api/v1/customers',{'code':'BAD','name':'bad'},status=403,write=True,extra={'Origin':'https://other.invalid'})
def post(path,body,status=201):return call('POST','/api/v1'+path,body,status=status,write=True)[0]
c=post('/customers',{'code':'DEPLOY-C','name':'部署恢复虚构客户'})
post('/customers/'+c['id']+'/addresses',{'contactName':'虚构测试','address':'虚构测试地址','isDefault':True})
p=post('/products',{'code':'DEPLOY-P','name':'部署恢复商品','baseUnit':{'name':'瓶','defaultSalePrice':'5'}})
w=post('/warehouses',{'code':'DEPLOY-W','name':'部署隔离仓'})
post('/receipts',{'kind':'opening','warehouseId':w['id'],'receivedAt':'2026-01-01T00:00:00Z','lines':[{'productId':p['id'],'unitId':p['baseUnitId'],'quantity':10,'unitCost':'2'}]})
d=post('/orders',{'customerId':c['id'],'lines':[{'clientLineId':'deploy','productId':p['id'],'warehouseId':w['id'],'unitId':p['baseUnitId'],'quantity':2,'unitPrice':'5','allocationMode':'auto'}],'discountAmount':'0.00','roundOffAmount':'0.00'})
post('/orders/'+d['id']+'/confirm',{'expectedVersion':d['version']},200)
post('/cash-events',{'kind':'receipt','customerId':c['id'],'amount':'12.00','occurredAt':'2026-11-10T00:00:00Z','method':'cash','allocationMode':'auto'})
post('/customers/'+c['id']+'/statements',{'periodStart':'2026-01-01T00:00:00Z','periodEnd':'2027-01-01T00:00:00Z'})
print('HTTPS_CA_LOGIN_SECURE_COOKIE_ORIGIN_AND_FICTIONAL_BUSINESS_OK')
