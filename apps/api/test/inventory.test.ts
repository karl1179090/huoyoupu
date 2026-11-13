import assert from 'node:assert/strict';
import test from 'node:test';
import { selectReleaseSources } from '../src/modules/inventory/stock.js';

test('release selection uses reverse original issue sequence and only eligible remaining quantity', () => {
  assert.deepEqual(selectReleaseSources([{ id: 'early', issueSequence: 1, availableQuantityBase: 3 }, { id: 'late', issueSequence: 2, availableQuantityBase: 2 }], 4), [{ allocationId: 'late', quantityBase: 2 }, { allocationId: 'early', quantityBase: 2 }]);
  assert.throws(() => selectReleaseSources([{ id: 'returned', issueSequence: 2, availableQuantityBase: 0 }], 1));
});
