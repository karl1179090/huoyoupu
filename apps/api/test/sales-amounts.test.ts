import test from 'node:test';
import assert from 'node:assert/strict';
import {returnAmounts} from '../src/modules/sales/amounts.js';

test('return net/subtotal/discount conserve every low-value source across all two-part return partitions',()=>{
 for(let q=1n;q<=12n;q++)for(let subtotal=0n;subtotal<=30n;subtotal++)for(let net=0n;net<=subtotal;net++)for(let first=1n;first<=q;first++){
  const initial={quantity:q,subtotal,net,returnedQuantity:0n,returnedSubtotal:0n,returnedNet:0n};const a=returnAmounts(initial,first);assert.ok(a.net>=0n&&a.discount>=0n);assert.equal(a.subtotal,a.net+a.discount);
  if(first<q){const b=returnAmounts({...initial,returnedQuantity:first,returnedSubtotal:a.subtotal,returnedNet:a.net},q-first);assert.ok(b.net>=0n&&b.discount>=0n);assert.equal(a.net+b.net,net);assert.equal(a.subtotal+b.subtotal,subtotal);assert.equal(a.discount+b.discount,subtotal-net);}
  else{assert.equal(a.net,net);assert.equal(a.subtotal,subtotal);assert.equal(a.discount,subtotal-net);}
 }
});

test('twelve-bottle discounted line locks exactly original subtotal, and three one-cent parts never create negative discounts',()=>{
 assert.deepEqual(returnAmounts({quantity:12n,subtotal:1200n,net:1050n,returnedQuantity:0n,returnedSubtotal:0n,returnedNet:0n},3n),{net:263n,subtotal:300n,discount:37n});
 let source={quantity:3n,subtotal:2n,net:1n,returnedQuantity:0n,returnedSubtotal:0n,returnedNet:0n};let discounts=0n;
 for(let i=0;i<3;i++){const a=returnAmounts(source,1n);assert.ok(a.discount>=0n);source={...source,returnedQuantity:source.returnedQuantity+1n,returnedSubtotal:source.returnedSubtotal+a.subtotal,returnedNet:source.returnedNet+a.net};discounts+=a.discount;}
 assert.equal(source.returnedSubtotal,2n);assert.equal(source.returnedNet,1n);assert.equal(discounts,1n);
});
