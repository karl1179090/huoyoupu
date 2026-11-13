import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeReportQuery,shanghaiInstant} from '../src/modules/reporting/query.js';
import {AppError} from '../src/lib/errors.js';
const at=new Date('2026-11-10T03:04:05.006Z');
test('report periods use Shanghai wall clocks and canonical replayable intervals',()=>{
 const result=normalizeReportQuery({kind:'customer_product_comparison'},at);
 assert.deepEqual(result.currentPeriod,{start:'2026-10-31T16:00:00.000Z',end:at.toISOString(),incomplete:true});
 assert.deepEqual(result.baselinePeriod,{start:'2026-09-30T16:00:00.000Z',end:'2026-10-10T03:04:05.006Z'});
 assert.deepEqual(normalizeReportQuery(result.query,at),result);
 assert.equal(shanghaiInstant(2026,1).toISOString(),'2025-12-31T16:00:00.000Z');
});
test('short previous month stops at exclusive available month end',()=>{
 const result=normalizeReportQuery({kind:'customer_product_comparison'},new Date('2024-03-31T04:00:00Z'));
 assert.deepEqual(result.baselinePeriod,{start:'2024-01-31T16:00:00.000Z',end:'2024-02-29T16:00:00.000Z'});
 const complete=normalizeReportQuery({kind:'customer_product_comparison',period:{mode:'calendar_months',start:'2026-09-30T16:00:00Z',end:'2026-10-31T16:00:00Z'}},at);
 assert.equal(complete.currentPeriod?.incomplete,false);
 assert.deepEqual(complete.baselinePeriod,{start:'2026-08-31T16:00:00.000Z',end:'2026-09-30T16:00:00.000Z'});
});
test('unsupported query combinations fail instead of silently ignoring parameters',()=>{
 for(const query of [
  {kind:'sales_summary',period:{mode:'calendar_months',start:'2026-08-31T16:00:00Z',end:'2026-11-30T16:00:00Z'}},
  {kind:'cash_flow',groupBy:['product']},{kind:'inventory',period:{mode:'mtd_previous'}},
  {kind:'sales_summary',quantityBasis:'net'},{kind:'cash_flow',filters:{productIds:[]}},
  {kind:'sales_summary',pointAsOf:at.toISOString()},
  {kind:'customer_product_comparison',period:{mode:'custom',start:'2026-01-01T00:00:00Z',end:'2026-02-01T00:00:00Z'}},
  {kind:'sales_summary',period:{mode:'mtd_previous',start:'2026-01-01T00:00:00Z'}},
  {kind:'inventory',pointAsOf:'2027-01-01T00:00:00Z'},
  {kind:'sales_summary',period:{mode:'calendar_months',start:'2026-10-01T00:00:00Z',end:'2026-11-01T00:00:00Z'}},
 ])assert.throws(()=>normalizeReportQuery(query,at),error=>error instanceof AppError&&error.code==='UNSUPPORTED_QUERY');
});

import {compareProducts,summarizeSales,type CommercialFact} from '../src/modules/reporting/metrics.js';
const customerId='10000000-0000-4000-8000-000000000001',productId='20000000-0000-4000-8000-000000000001';
const fact=(changes:Partial<CommercialFact>={}):CommercialFact=>({kind:'sale',orderId:'order',at:'2026-10-05T00:00:00Z',customerId,customerName:'虚构客户',productId,productName:'酱油',baseUnitName:'瓶',warehouseId:'warehouse',quantityBase:10,amount:'10.00',costAmount:'3.33',...changes});
test('comparison keeps union zero rows, negative net, zero baseline and independent product units',()=>{
 const n=normalizeReportQuery({kind:'customer_product_comparison',period:{mode:'calendar_months',start:'2026-10-31T16:00:00Z',end:'2026-11-30T16:00:00Z'}},at);
 const facts=[fact(),fact({kind:'return',at:'2026-11-05T00:00:00Z',quantityBase:3,amount:'3.00',costAmount:'1.00'}),fact({productId:'30000000-0000-4000-8000-000000000001',at:'2026-11-05T00:00:00Z',quantityBase:5})];
 const ordered=compareProducts(n,facts);assert.equal(ordered.length,2);assert.equal(ordered[0]?.currentOrderedQuantityBase,0);assert.equal(ordered[0]?.currentNetQuantityBase,-3);assert.equal(ordered[0]?.changePercent,'-100.00');assert.equal(ordered[1]?.trend,'new');assert.equal(ordered[1]?.changePercent,null);
 n.query.quantityBasis='net';assert.equal(compareProducts(n,facts)[0]?.changePercent,'-130.00');
 const negative=compareProducts(n,[fact({kind:'return',quantityBase:2}),fact({at:'2026-11-05T00:00:00Z'})])[0]!;assert.equal(negative.trend,'no_baseline');assert.equal(negative.changePercent,null);
 const summary=summarizeSales(n,[fact(),fact({warehouseId:'other',quantityBase:2,amount:'2.00',costAmount:'0.67',at:'2026-11-01T00:00:00Z'}),fact({quantityBase:3,amount:'3.00',costAmount:'1.00',at:'2026-11-01T00:00:00Z'})],[])[0]!;
 assert.equal(summary.orderCount,1);assert.equal(summary.grossSalesAmount,'5.00');assert.equal(summary.grossProfit,'3.33');
});
test('percentage thresholds compare exact decimal strings and overlapping periods count each side',()=>{
 const n=normalizeReportQuery({kind:'customer_product_comparison',filters:{minDecreasePercent:'33.33'},period:{mode:'custom',start:'2026-11-01T00:00:00Z',end:'2026-11-10T00:00:00Z',baselineStart:'2026-10-01T00:00:00Z',baselineEnd:'2026-11-10T00:00:00Z'}},at);
 const rows=compareProducts(n,[fact({quantityBase:1}),fact({at:'2026-11-05T00:00:00Z',quantityBase:2})]);assert.equal(rows.length,1);assert.equal(rows[0]?.changePercent,'-33.33');
 n.query.filters!.minDecreasePercent='33.34';assert.deepEqual(compareProducts(n,[fact({quantityBase:1}),fact({at:'2026-11-05T00:00:00Z',quantityBase:2})]),[]);
});

test('decrease threshold uses exact ratio before presentation rounding',()=>{
 const n=normalizeReportQuery({kind:'customer_product_comparison',filters:{minDecreasePercent:'33.34'}},at);
 const facts=[fact({quantityBase:20000}),fact({at:'2026-11-05T00:00:00Z',quantityBase:13333})];
 assert.deepEqual(compareProducts(n,facts),[]);
 n.query.filters!.minDecreasePercent='33.33';const row=compareProducts(n,facts)[0]!;assert.equal(row.changePercent,'-33.34');
});
