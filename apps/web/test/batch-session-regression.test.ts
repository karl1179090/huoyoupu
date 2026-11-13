import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Unit } from '../src/api/types.js';
import {
  type PickerLineItem,
  validateQuantityInput,
  updateBatchAllocation,
  switchAllocationMode,
  validateSession,
  hasLineErrors,
  getAddressPayload,
  applyPriceQuoteToLine,
  createInitialQuoteState,
  invalidateQuoteOnConfigChange,
  applyQuoteResponse,
  applyQuoteError,
  resetQuoteState,
  createSessionTracker,
  bumpSession,
  isSessionCurrent,
  addLineToSession,
  addLinesToOrder,
} from '../src/pages/sales/components/batchPickerLogic.js';

describe('Batch Selection & Order In-Table Interaction Regression', () => {

  const dummyUnits: Unit[] = [
    {
      id: 'unit-box',
      productId: 'p-1',
      name: '箱',
      multiplierBase: 24,
      defaultSalePrice: '48.00',
      defaultReceiptCost: null,
      active: true,
      version: 1,
    },
    {
      id: 'unit-bottle',
      productId: 'p-1',
      name: '瓶',
      multiplierBase: 1,
      defaultSalePrice: '2.50',
      defaultReceiptCost: null,
      active: true,
      version: 1,
    },
  ];

  test('1. Decimal quantities (1.5, 2.35) are strictly rejected and not truncated to 1 or 2', () => {
    // Test 1.5 in sales quantity
    const r1 = validateQuantityInput('1.5');
    assert.equal(r1.quantity, 0, '1.5 must not be parsed into 1');
    assert.ok(r1.quantityError, '1.5 must produce a validation error');

    // Test 2.35 in sales quantity
    const r2 = validateQuantityInput('2.35');
    assert.equal(r2.quantity, 0, '2.35 must not be parsed into 2');
    assert.ok(r2.quantityError, '2.35 must produce a validation error');

    // Test valid integer 5
    const r3 = validateQuantityInput('5');
    assert.equal(r3.quantity, 5);
    assert.equal(r3.quantityError, undefined);

    // Test manual batch allocation input with 1.5
    const line: PickerLineItem = {
      clientLineId: 'line-1',
      productId: 'p-1',
      productName: '雪花啤酒',
      warehouseId: 'wh-1',
      unitId: 'unit-bottle',
      quantity: 1,
      quantityRaw: '1',
      unitPrice: '2.50',
      allocationMode: 'manual',
      batchSelections: [],
      units: dummyUnits,
      baseUnitId: 'unit-bottle',
    };

    const updated = updateBatchAllocation(line, 'batch-1', '1.5', 10);
    assert.equal(updated.batchSelectionsRaw?.['batch-1'], '1.5', 'Raw decimal string must be retained');
    assert.equal(updated.batchSelections.length, 0, '1.5 must not be converted into 1');
    assert.ok(updated.batchSelectionErrors?.['batch-1'], 'Must flag non-integer error');

    const validation = validateSession([updated]);
    assert.equal(validation.valid, false, 'Validation must block join');
    assert.ok(validation.errors.some(e => e.includes('批次分配数量错误')));
  });

  test('2. Manual batch shortage and over-allocation block unified join', () => {
    const line: PickerLineItem = {
      clientLineId: 'line-1',
      productId: 'p-1',
      productName: '雪花啤酒',
      warehouseId: 'wh-1',
      unitId: 'unit-bottle',
      quantity: 10,
      quantityRaw: '10',
      unitPrice: '2.50',
      allocationMode: 'manual',
      batchSelections: [],
      units: dummyUnits,
      baseUnitId: 'unit-bottle',
    };

    // Allocate 3 (shortage: target is 10)
    const shortLine = updateBatchAllocation(line, 'batch-1', '3', 20);
    const vShort = validateSession([shortLine]);
    assert.equal(vShort.valid, false, 'Shortage must be invalid');
    assert.ok(vShort.errors.some(e => e.includes('手动批次分配不足（需分配10，当前3）')));

    // Allocate 15 (over-allocation: target is 10)
    const overLine = updateBatchAllocation(line, 'batch-1', '15', 20);
    const vOver = validateSession([overLine]);
    assert.equal(vOver.valid, false, 'Over-allocation must be invalid');
    assert.ok(vOver.errors.some(e => e.includes('手动批次分配超配（需分配10，当前15）')));

    // Allocate exactly 10
    const exactLine = updateBatchAllocation(line, 'batch-1', '10', 20);
    const vExact = validateSession([exactLine]);
    assert.equal(vExact.valid, true, 'Exact match must be valid');
    assert.equal(vExact.errors.length, 0);
  });

  test('3. Switching manual allocation mode with 1.5 error to auto clears error and unblocks submission', () => {
    const line: PickerLineItem = {
      clientLineId: 'line-err',
      productId: 'p-1',
      productName: '雪花啤酒',
      warehouseId: 'wh-1',
      unitId: 'unit-bottle',
      quantity: 5,
      quantityRaw: '5',
      unitPrice: '2.50',
      allocationMode: 'manual',
      batchSelections: [],
      units: dummyUnits,
      baseUnitId: 'unit-bottle',
    };

    // 1. User inputs 1.5 in manual batch allocation
    const errLine = updateBatchAllocation(line, 'batch-1', '1.5', 20);
    assert.ok(errLine.batchSelectionErrors?.['batch-1'], 'Must have batch error');
    assert.equal(hasLineErrors([errLine]), true, 'hasLineErrors must return true on manual error');
    assert.equal(validateSession([errLine]).valid, false, 'validateSession must return false');

    // 2. User switches allocation mode to auto (FIFO)
    const autoLine = switchAllocationMode(errLine, 'auto');
    assert.equal(autoLine.allocationMode, 'auto');
    assert.deepEqual(autoLine.batchSelections, []);
    assert.deepEqual(autoLine.batchSelectionsRaw, {});
    assert.deepEqual(autoLine.batchSelectionErrors, {});

    // 3. hasLineErrors and validateSession must be immediately unblocked
    assert.equal(hasLineErrors([autoLine]), false, 'Auto mode must ignore prior manual error');
    const vAuto = validateSession([autoLine]);
    assert.equal(vAuto.valid, true, 'Auto mode session must be valid for submission');
    assert.equal(vAuto.errors.length, 0);
  });

  test('4. Hand-filled price protection prevents async quote from overwriting manual price', () => {
    const line: PickerLineItem = {
      clientLineId: 'line-price',
      productId: 'p-1',
      productName: '雪花啤酒',
      warehouseId: 'wh-1',
      unitId: 'unit-box',
      quantity: 2,
      quantityRaw: '2',
      unitPrice: '45.00', // Manually negotiated price
      priceEdited: true, // User edited price!
      priceSource: '手动修改',
      allocationMode: 'auto',
      batchSelections: [],
      units: dummyUnits,
      baseUnitId: 'unit-bottle',
    };

    // Stale async customer quote returns standard 48.00
    const protectedLine = applyPriceQuoteToLine(line, '48.00', '历史成交价', 'unit-box');
    assert.equal(protectedLine.unitPrice, '45.00', 'Hand-edited price must not be overwritten');
    assert.equal(protectedLine.priceSource, '手动修改');

    // If priceEdited is false, auto price can update
    const uneditedLine: PickerLineItem = { ...line, priceEdited: false };
    const updatedLine = applyPriceQuoteToLine(uneditedLine, '48.00', '历史成交价', 'unit-box');
    assert.equal(updatedLine.unitPrice, '48.00', 'Unedited price receives automatic quote');
    assert.equal(updatedLine.priceSource, '历史成交价');

    // Mismatched unit quote does not apply
    const mismatchedLine = applyPriceQuoteToLine(uneditedLine, '2.50', '默认价', 'unit-bottle');
    assert.equal(mismatchedLine.unitPrice, '45.00', 'Stale quote for different unit is discarded');
  });

  test('5. In-flight quote sequencing, debounce race condition and immediate invalidation', async () => {
    interface MockQuote {
      total: string;
      configId: string;
    }

    // Step 1: Initial state
    let state = createInitialQuoteState<MockQuote>();
    assert.equal(state.seq, 0);
    assert.equal(state.dirty, false);
    assert.equal(state.loading, false);
    assert.equal(state.quote, null);

    // Step 2: User modifies config A -> immediately invalidated
    state = invalidateQuoteOnConfigChange(state);
    const seqA = state.seq;
    assert.equal(seqA, 1);
    assert.equal(state.dirty, true);
    assert.equal(state.loading, true);

    // Step 3: User quickly modifies config B before A finishes -> immediately invalidated again
    state = invalidateQuoteOnConfigChange(state);
    const seqB = state.seq;
    assert.equal(seqB, 2);
    assert.equal(state.dirty, true);
    assert.equal(state.loading, true);

    // Step 4: Simulated response A arrives late (seq = 1) -> must be discarded by applyQuoteResponse
    const stateAfterLateA = applyQuoteResponse(state, seqA, { total: '100.00', configId: 'config-A' });
    assert.equal(stateAfterLateA.quote, null, 'Superseded response A must be discarded');
    assert.equal(stateAfterLateA.dirty, true, 'State remains dirty');
    assert.equal(stateAfterLateA.loading, true, 'State remains loading');

    // Step 5: Simulated error from another late request (seq = 1) -> discarded by applyQuoteError
    const stateAfterLateErr = applyQuoteError(stateAfterLateA, seqA, '网络异常');
    assert.equal(stateAfterLateErr.error, null, 'Late error must not overwrite state');

    // Step 6: Response B arrives (seq = 2) -> applied cleanly
    const stateAfterB = applyQuoteResponse(stateAfterLateErr, seqB, { total: '200.00', configId: 'config-B' });
    assert.equal(stateAfterB.dirty, false);
    assert.equal(stateAfterB.loading, false);
    assert.ok(stateAfterB.quote);
    assert.equal(stateAfterB.quote.configId, 'config-B', 'Active quote strictly reflects config-B');
    assert.equal(stateAfterB.quote.total, '200.00');

    // Step 7: OrderLines emptied or invalidated -> resetQuoteState clears quote cleanly
    const resetState = resetQuoteState(stateAfterB, '未选定客户或明细');
    assert.equal(resetState.quote, null);
    assert.equal(resetState.error, '未选定客户或明细');
    assert.equal(resetState.dirty, false);
    assert.equal(resetState.loading, false);
  });

  test('6. Address payload mutual exclusivity prevents 400 backend error', () => {
    // 1. Saved customer address with ID
    const savedAddress = {
      id: 'addr-saved-1',
      customerId: 'cust-1',
      label: '默认地址',
      contactName: '张经理',
      phone: '13800000000',
      address: '建国门外大街1号',
      isDefault: true,
      active: true,
      version: 1,
    };
    const payloadSaved = getAddressPayload(savedAddress, {
      customerName: '北京酒庄',
      contactName: '张经理',
      phone: '13800000000',
      address: '建国门外大街1号',
    });
    assert.equal(payloadSaved.addressId, 'addr-saved-1', 'Must wire addressId for saved address');
    assert.equal(payloadSaved.deliverySnapshot, undefined, 'deliverySnapshot must be undefined when addressId is present');

    // 2. Ad-hoc custom delivery snapshot
    const customSnapshot = {
      customerName: '临时提货点',
      contactName: '临时收货人',
      phone: '13900000000',
      address: '临时交接地',
    };
    const payloadCustom = getAddressPayload(null, customSnapshot);
    assert.equal(payloadCustom.addressId, undefined, 'addressId must be undefined for custom snapshot');
    assert.deepEqual(payloadCustom.deliverySnapshot, customSnapshot, 'Must wire custom deliverySnapshot');

    // 3. No address
    const payloadNone = getAddressPayload(null, null);
    assert.equal(payloadNone.addressId, undefined);
    assert.equal(payloadNone.deliverySnapshot, undefined);
  });

  test('7. Production SessionTracker protects against delayed async adds after cancel or reset', async () => {
    // Uses real production tracker from batchPickerLogic.ts
    const tracker = createSessionTracker();
    let sessionLines: PickerLineItem[] = [];

    // Session 1 opens:
    const gen1 = tracker.gen;
    let asyncAddCompleted = false;

    // Simulate async operation started during session 1
    const mockDelayedAddSession1 = async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      // Production guard check as performed in BatchProductPicker:
      if (!isSessionCurrent(tracker, gen1)) {
        return; // Discard because session was cancelled/reset!
      }
      sessionLines = addLineToSession(sessionLines, {
        clientLineId: 'line-leaked',
        productId: 'p-leaked',
        productName: '泄露商品',
        warehouseId: 'wh-1',
        unitId: 'unit-bottle',
        quantity: 1,
        quantityRaw: '1',
        unitPrice: '10.00',
        allocationMode: 'auto',
        batchSelections: [],
        units: dummyUnits,
        baseUnitId: 'unit-bottle',
      });
      asyncAddCompleted = true;
    };

    const addPromise1 = mockDelayedAddSession1();

    // User cancels the modal or re-opens -> bumps session generation
    bumpSession(tracker);
    sessionLines = []; // Modal reset

    await addPromise1;

    assert.equal(asyncAddCompleted, false, 'Delayed add from old session must not execute');
    assert.equal(sessionLines.length, 0, 'No leaked items should enter sessionLines');

    // Session 2 operates normally:
    const gen2 = tracker.gen;
    let session2Added = false;
    const mockAddSession2 = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      if (!isSessionCurrent(tracker, gen2)) return;
      sessionLines = addLineToSession(sessionLines, {
        clientLineId: 'line-session2',
        productId: 'p-1',
        productName: '合法选品',
        warehouseId: 'wh-1',
        unitId: 'unit-bottle',
        quantity: 2,
        quantityRaw: '2',
        unitPrice: '2.50',
        allocationMode: 'auto',
        batchSelections: [],
        units: dummyUnits,
        baseUnitId: 'unit-bottle',
      });
      session2Added = true;
    };

    await mockAddSession2();
    assert.equal(session2Added, true);
    assert.equal(sessionLines.length, 1);
    assert.equal(sessionLines[0]!.clientLineId, 'line-session2');
  });

  test('8. Multi-product independent row configurations and addition via addLineToSession and addLinesToOrder', () => {
    let sessionLines: PickerLineItem[] = [];

    // Line 1: Snow beer in box unit, warehouse 1
    const line1: PickerLineItem = {
      clientLineId: 'line-snow-box',
      productId: 'p-1',
      productName: '雪花啤酒',
      warehouseId: 'wh-1',
      unitId: 'unit-box',
      quantity: 5,
      quantityRaw: '5',
      unitPrice: '48.00',
      allocationMode: 'auto',
      batchSelections: [],
      units: dummyUnits,
      baseUnitId: 'unit-bottle',
    };

    // Line 2: Same snow beer in bottle unit, warehouse 2
    const line2: PickerLineItem = {
      clientLineId: 'line-snow-bottle',
      productId: 'p-1', // Same product ID!
      productName: '雪花啤酒',
      warehouseId: 'wh-2', // Different warehouse!
      unitId: 'unit-bottle', // Different unit!
      quantity: 12,
      quantityRaw: '12',
      unitPrice: '2.50',
      allocationMode: 'auto',
      batchSelections: [],
      units: dummyUnits,
      baseUnitId: 'unit-bottle',
    };

    // Add lines via production addLineToSession:
    sessionLines = addLineToSession(sessionLines, line1);
    sessionLines = addLineToSession(sessionLines, line2);

    assert.equal(sessionLines.length, 2, 'Two distinct lines for same product must be retained independently in session');
    assert.equal(sessionLines[0]!.clientLineId, 'line-snow-box');
    assert.equal(sessionLines[1]!.clientLineId, 'line-snow-bottle');
    assert.notEqual(sessionLines[0]!.warehouseId, sessionLines[1]!.warehouseId);
    assert.notEqual(sessionLines[0]!.unitId, sessionLines[1]!.unitId);
    assert.notEqual(sessionLines[0]!.unitPrice, sessionLines[1]!.unitPrice);

    // Commit lines into existing order with existing items:
    const existingOrderLine: PickerLineItem = {
      clientLineId: 'line-existing-cider',
      productId: 'p-2',
      productName: '苹果酒',
      warehouseId: 'wh-1',
      unitId: 'unit-cider-bottle',
      quantity: 3,
      quantityRaw: '3',
      unitPrice: '15.00',
      allocationMode: 'auto',
      batchSelections: [],
      units: [],
    };

    let orderLines: PickerLineItem[] = [existingOrderLine];
    // Merge using production addLinesToOrder:
    orderLines = addLinesToOrder(orderLines, sessionLines);

    assert.equal(orderLines.length, 3, 'All 3 lines must remain independent without silent merging or dropping');
    assert.equal(orderLines[0]!.productId, 'p-2');
    assert.equal(orderLines[1]!.productId, 'p-1');
    assert.equal(orderLines[1]!.unitId, 'unit-box');
    assert.equal(orderLines[2]!.productId, 'p-1');
    assert.equal(orderLines[2]!.unitId, 'unit-bottle');

    const validation = validateSession(orderLines);
    assert.equal(validation.valid, true);
    assert.equal(hasLineErrors(orderLines), false);
  });
});
