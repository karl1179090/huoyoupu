import type { Address, AddressSnapshot, Batch, Unit } from '../../../api/types.js';

export interface PickerLineItem {
  clientLineId: string;
  productId: string;
  productName: string;
  specification?: string;
  warehouseId: string;
  unitId: string;
  quantity: number;
  quantityRaw: string;
  quantityError?: string;
  unitPrice: string;
  priceEdited?: boolean;
  allocationMode: 'auto' | 'manual';
  batchSelections: { batchId: string; quantityBase: number }[];
  batchSelectionsRaw?: Record<string, string>;
  batchSelectionErrors?: Record<string, string>;
  remark?: string;
  units: Unit[];
  baseUnitId?: string;
  priceSource?: string;
  priceNote?: string;
  readOnlyBadgeText?: string;
  returnedQuantityBase?: number;
}

/**
 * Validates a raw quantity string, strictly enforcing positive integer.
 * Rejects decimals (1.5, 2.35), negatives, non-numeric, 0, or safe integer overflow.
 */
export function validateQuantityInput(raw: string): { quantity: number; quantityError?: string } {
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return { quantity: 0, quantityError: '数量必须为正整数' };
  }
  const val = Number(trimmed);
  if (!Number.isSafeInteger(val)) {
    return { quantity: 0, quantityError: '数量超出有效范围' };
  }
  return { quantity: val, quantityError: undefined };
}

/**
 * Updates manual batch allocation for a line item.
 * Preserves raw input, validates non-negative integer, rejects decimals like 1.5,
 * and tracks per-batch allocation errors without silent truncation.
 */
export function updateBatchAllocation(
  line: PickerLineItem,
  batchId: string,
  rawInput: string,
  batchMaxQty: number
): PickerLineItem {
  const trimmed = rawInput.trim();
  let error: string | undefined = undefined;
  let numVal = 0;

  if (trimmed === '') {
    numVal = 0;
  } else if (!/^(0|[1-9]\d*)$/.test(trimmed)) {
    error = '批次分配量必须为非负整数';
  } else {
    numVal = Number(trimmed);
    if (!Number.isSafeInteger(numVal)) {
      error = '分配量超出安全数值范围';
    } else if (numVal > batchMaxQty) {
      error = `超出批次余量(${batchMaxQty})`;
    }
  }

  const nextRaw = { ...(line.batchSelectionsRaw || {}), [batchId]: rawInput };
  const nextErrors = { ...(line.batchSelectionErrors || {}) };
  if (error) {
    nextErrors[batchId] = error;
  } else {
    delete nextErrors[batchId];
  }

  let nextSelections = [...line.batchSelections];
  const idx = nextSelections.findIndex(s => s.batchId === batchId);
  if (!error && numVal > 0) {
    if (idx >= 0) {
      nextSelections[idx] = { batchId, quantityBase: numVal };
    } else {
      nextSelections.push({ batchId, quantityBase: numVal });
    }
  } else {
    nextSelections = nextSelections.filter(s => s.batchId !== batchId);
  }

  return {
    ...line,
    batchSelections: nextSelections,
    batchSelectionsRaw: nextRaw,
    batchSelectionErrors: nextErrors,
  };
}

/**
 * Switches a line's allocation mode.
 * When switching to 'auto', clears all batchSelections, raw inputs, and errors
 * so manual residue NEVER blocks auto mode submission.
 */
export function switchAllocationMode(line: PickerLineItem, mode: 'auto' | 'manual'): PickerLineItem {
  if (mode === 'auto') {
    return {
      ...line,
      allocationMode: 'auto',
      batchSelections: [],
      batchSelectionsRaw: {},
      batchSelectionErrors: {},
    };
  }
  return {
    ...line,
    allocationMode: 'manual',
  };
}

/**
 * Validates the entire picker session before committing lines to the order.
 */
export function validateSession(
  sessionLines: PickerLineItem[],
  batchCache: Record<string, Batch[]> = {}
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (sessionLines.length === 0) {
    errors.push('选品清单为空');
    return { valid: false, errors };
  }

  for (let i = 0; i < sessionLines.length; i++) {
    const line = sessionLines[i]!;
    const rowNum = i + 1;
    if (line.quantityError || line.quantity <= 0) {
      errors.push(`第${rowNum}行 [${line.productName}] 数量不合法（必须为正整数）`);
    }
    if (!/^\d+(\.\d{1,6})?$/.test(line.unitPrice.trim()) || Number(line.unitPrice) < 0) {
      errors.push(`第${rowNum}行 [${line.productName}] 单价格式不正确`);
    }

    if (line.allocationMode === 'manual') {
      if (line.batchSelectionErrors && Object.keys(line.batchSelectionErrors).length > 0) {
        const errList = Object.values(line.batchSelectionErrors);
        errors.push(`第${rowNum}行 [${line.productName}] 批次分配数量错误: ${errList[0]}`);
      }

      const currentUnit = line.units.find(u => u.id === line.unitId) || line.units[0];
      const multiplier = currentUnit?.multiplierBase || 1;
      const targetBaseQty = line.quantity * multiplier;
      const allocatedBaseQty = line.batchSelections.reduce((acc, b) => acc + b.quantityBase, 0);

      if (allocatedBaseQty < targetBaseQty) {
        errors.push(`第${rowNum}行 [${line.productName}] 手动批次分配不足（需分配${targetBaseQty}，当前${allocatedBaseQty}）`);
      } else if (allocatedBaseQty > targetBaseQty) {
        errors.push(`第${rowNum}行 [${line.productName}] 手动批次分配超配（需分配${targetBaseQty}，当前${allocatedBaseQty}）`);
      }

      const batchKey = `${line.productId}:${line.warehouseId}`;
      const availableBatches = batchCache[batchKey] || [];
      if (availableBatches.length > 0) {
        for (const sel of line.batchSelections) {
          const matched = availableBatches.find(b => b.id === sel.batchId);
          if (!matched) {
            errors.push(`第${rowNum}行 所选批次不属于当前仓库`);
          } else if (sel.quantityBase > matched.quantityBase) {
            errors.push(`第${rowNum}行 批次超出可用余量 ${matched.quantityBase}`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Checks if order lines have any validation errors.
 * Strictly ignores batch errors on lines whose allocationMode === 'auto'.
 */
export function hasLineErrors(lines: PickerLineItem[]): boolean {
  return lines.some(l => {
    if (l.quantityError || l.quantity <= 0) return true;
    if (l.allocationMode === 'manual') {
      if (l.batchSelectionErrors && Object.keys(l.batchSelectionErrors).length > 0) return true;
      const currentUnit = l.units.find(u => u.id === l.unitId) || l.units[0];
      const multiplier = currentUnit?.multiplierBase || 1;
      const targetBaseQty = l.quantity * multiplier;
      const allocatedBaseQty = l.batchSelections.reduce((acc, b) => acc + b.quantityBase, 0);
      if (allocatedBaseQty !== targetBaseQty) return true;
    }
    return false;
  });
}

/**
 * Prepares an address payload adhering to backend mutual exclusivity:
 * - If selectedAddress has an ID (existing saved address), wires ONLY addressId.
 * - If custom deliverySnapshot with no selectedAddress ID, wires ONLY deliverySnapshot.
 * - Otherwise wires neither.
 */
export function getAddressPayload(
  selectedAddress?: Address | null,
  deliverySnapshot?: AddressSnapshot | null
): { addressId?: string; deliverySnapshot?: AddressSnapshot } {
  if (selectedAddress?.id) {
    return { addressId: selectedAddress.id, deliverySnapshot: undefined };
  }
  if (deliverySnapshot) {
    return { addressId: undefined, deliverySnapshot };
  }
  return { addressId: undefined, deliverySnapshot: undefined };
}

/**
 * Applies a customer price quote to a line item.
 * Strictly preserves the user's manual price if `priceEdited` is true,
 * or if the response unit does not match current line unit.
 */
export function applyPriceQuoteToLine(
  line: PickerLineItem,
  quotePrice: string,
  quoteSource: string,
  targetUnitId: string
): PickerLineItem {
  if (line.priceEdited || line.unitId !== targetUnitId) {
    return line; // Protected: do not overwrite user-customized price
  }
  return {
    ...line,
    unitPrice: quotePrice,
    priceSource: quoteSource,
  };
}

export interface QuoteState<T = unknown> {
  seq: number;
  loading: boolean;
  dirty: boolean;
  quote: T | null;
  error: string | null;
}

export function createInitialQuoteState<T = unknown>(): QuoteState<T> {
  return {
    seq: 0,
    loading: false,
    dirty: false,
    quote: null,
    error: null,
  };
}

export function invalidateQuoteOnConfigChange<T>(state: QuoteState<T>): QuoteState<T> {
  return {
    ...state,
    seq: state.seq + 1,
    dirty: true,
    loading: true,
    error: null,
  };
}

export function applyQuoteResponse<T>(
  state: QuoteState<T>,
  responseSeq: number,
  quote: T
): QuoteState<T> {
  if (responseSeq !== state.seq) {
    return state; // In-flight response superseded!
  }
  return {
    ...state,
    dirty: false,
    loading: false,
    quote,
    error: null,
  };
}

export function resetQuoteState<T>(state: QuoteState<T>, error?: string | null): QuoteState<T> {
  return {
    ...state,
    seq: state.seq + 1,
    dirty: false,
    loading: false,
    quote: null,
    error: error || null,
  };
}

export function applyQuoteError<T>(
  state: QuoteState<T>,
  responseSeq: number,
  error: string
): QuoteState<T> {
  if (responseSeq !== state.seq) {
    return state;
  }
  return {
    ...state,
    dirty: false,
    loading: false,
    quote: null,
    error,
  };
}

export interface SessionTracker {
  gen: number;
}

export function createSessionTracker(): SessionTracker {
  return { gen: 1 };
}

export function bumpSession(tracker: SessionTracker): number {
  return ++tracker.gen;
}

export function isSessionCurrent(tracker: SessionTracker, gen: number): boolean {
  return tracker.gen === gen;
}

/**
 * Adds a new line item to existing lines in a selection session.
 * Retains each item as an independent line with unique clientLineId,
 * strictly forbidding silent merging even if productId is identical.
 */
export function addLineToSession(
  existingLines: PickerLineItem[],
  newLine: PickerLineItem
): PickerLineItem[] {
  return [...existingLines, { ...newLine }];
}

/**
 * Merges newly picked lines from the modal session into order lines.
 * Retains every selected line independently without deduplicating or merging.
 */
export function addLinesToOrder(
  existingOrderLines: PickerLineItem[],
  incomingLines: PickerLineItem[]
): PickerLineItem[] {
  return [...existingOrderLines, ...incomingLines];
}
