import test from 'node:test';
import assert from 'node:assert/strict';
import {withTransaction} from '@huoyoupu/database';
import {apiFixture, writeHeaders} from './helpers.js';
import {rebuildStockBalances} from '../src/modules/inventory/stock.js';
import {AppError} from '../src/lib/errors.js';

test('independent acceptance: summary rebuild requires agreement between batches and immutable movements', async () => {
  const f = await apiFixture();
  try {
    const credentials = await f.login();
    const post = async (url: string, payload: Record<string, unknown>) => {
      const response = await f.app.inject({method:'POST',url,headers:writeHeaders(credentials),payload});
      assert.equal(response.statusCode,201,response.body); return response.json();
    };
    const product = await post('/api/v1/products',{code:'independent-stock',name:'独立核验商品',baseUnit:{name:'瓶',defaultSalePrice:'5'}});
    const warehouse = await post('/api/v1/warehouses',{code:'independent',name:'核验仓'});
    const receipt = await post('/api/v1/receipts',{kind:'purchase',warehouseId:warehouse.id,receivedAt:'2026-01-01T00:00:00Z',lines:[{productId:product.id,unitId:product.baseUnitId,quantity:3,unitCost:'2.123456'}]});
    const key = [{productId:product.id,warehouseId:warehouse.id}];
    await f.pool.query('UPDATE stock_balances SET quantity_base=1,cost_amount=0 WHERE product_id=$1',[product.id]);
    await withTransaction(f.pool,client=>rebuildStockBalances(client,key));
    let summary = (await f.pool.query('SELECT quantity_base,cost_amount::text FROM stock_balances WHERE product_id=$1',[product.id])).rows[0];
    assert.equal(Number(summary.quantity_base),3); assert.equal(summary.cost_amount,'6.37');
    await f.pool.query('UPDATE inventory_batches SET remaining_cost_amount=6.36 WHERE id=$1',[receipt.lines[0].batchId]);
    await assert.rejects(withTransaction(f.pool,client=>rebuildStockBalances(client,key)),(error:unknown)=>error instanceof AppError && error.code==='RELATED_RECORD_CONFLICT');
    summary = (await f.pool.query('SELECT cost_amount::text FROM stock_balances WHERE product_id=$1',[product.id])).rows[0];
    assert.equal(summary.cost_amount,'6.37');
    await assert.rejects(f.pool.query('DELETE FROM stock_movements WHERE product_id=$1',[product.id]),(error:unknown)=>!!error && typeof error==='object' && 'code' in error && error.code==='23514');
  } finally {await f.cleanup();}
});
