import type {
  LineAddCommand,
  LineSetCommand,
  LineRemoveCommand,
} from '../../api/types.js';

/**
 * UI state of one editable order line as loaded into OrderEditPage.
 *
 * `initial*` fields snapshot what the editor displayed when the order was loaded.
 * They are the only safe baseline for deciding whether the operator actually
 * changed a field. They are intentionally not derived from the displayed
 * `unitPrice` (which for return-derived lines is a six-decimal approximation of
 * the original pricing basis) nor from `originalLineId`'s unit (the editable
 * remainder of a returned line is edited in the base unit, while the pre-split
 * source line may have been sold in cases).
 */
export interface RevisionLineState {
  clientLineId: string;
  originalLineId?: string;
  isNew?: boolean;
  isRemoved?: boolean;
  readOnly?: boolean;
  productId: string;
  warehouseId: string;
  unitId: string;
  quantity: number;
  unitPrice: string;
  priceEdited?: boolean;
  allocationMode: 'auto' | 'manual';
  batchSelections: { batchId: string; quantityBase: number }[];
  remark?: string;
  returnedQuantityBase?: number;
  /** Loaded quantity; absent means "same as current". */
  initialQuantity?: number;
  initialUnitId?: string;
  initialWarehouseId?: string;
  initialRemark?: string;
  initialAllocationMode?: 'auto' | 'manual';
}

export type LineChange = LineAddCommand | LineSetCommand | LineRemoveCommand;

/**
 * Builds the minimal `lineChanges` payload for a revision.
 *
 * Rules (matching the backend pricing-basis contract):
 * - Unchanged existing lines produce NO command, so the backend keeps their
 *   stored `pricingBasis` and never re-prices them from the displayed value.
 *   This includes return-derived remainder lines whose displayed unit price is
 *   only an approximation (e.g. 1 cent / 2 bottles -> 0.005000 / bottle).
 * - `unitPrice` is sent only when the operator explicitly edited it.
 * - `unitId` is sent only when the operator switched unit, or when a returned
 *   line's quantity/price is submitted (the backend defaults the unit to the
 *   pre-split source unit, so the base unit must be explicit there).
 * - `quantity` uses the backend's total-quantity semantics for lines that still
 *   carry `returnedQuantityBase > 0` (remaining + already returned).
 */
export function buildLineChanges(lines: readonly RevisionLineState[]): LineChange[] {
  const lineChanges: LineChange[] = [];

  for (const l of lines) {
    if (l.isRemoved && l.originalLineId) {
      const returned = l.returnedQuantityBase || 0;
      if (returned > 0) {
        // Never remove a line that is the source of confirmed returns; shrink it
        // to the protected historical quantity instead. The base unit must be
        // explicit because the backend otherwise assumes the pre-split source
        // unit (e.g. a case of 12) for the submitted total quantity.
        lineChanges.push({
          op: 'set',
          lineId: l.originalLineId,
          unitId: l.unitId,
          quantity: returned,
        });
      } else {
        lineChanges.push({ op: 'remove', lineId: l.originalLineId });
      }
      continue;
    }

    if (l.isNew) {
      lineChanges.push({
        op: 'add',
        line: {
          clientLineId: l.clientLineId,
          productId: l.productId,
          warehouseId: l.warehouseId,
          unitId: l.unitId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          allocationMode: l.allocationMode,
          batchSelections: l.allocationMode === 'manual' ? l.batchSelections : undefined,
          remark: l.remark,
        },
      });
      continue;
    }

    if (!l.originalLineId || l.readOnly) continue;

    const returned = l.returnedQuantityBase || 0;
    const quantityChanged = l.initialQuantity !== undefined && l.quantity !== l.initialQuantity;
    const unitChanged = l.initialUnitId !== undefined && l.unitId !== l.initialUnitId;
    const warehouseChanged = l.initialWarehouseId !== undefined && l.warehouseId !== l.initialWarehouseId;
    const priceChanged = Boolean(l.priceEdited && l.unitPrice.trim() !== '');
    const remarkChanged = (l.remark ?? '') !== (l.initialRemark ?? '');
    const modeChanged = l.initialAllocationMode !== undefined && l.allocationMode !== l.initialAllocationMode;
    const manualAllocation = l.allocationMode === 'manual' && l.batchSelections.length > 0;

    if (
      !quantityChanged &&
      !unitChanged &&
      !warehouseChanged &&
      !priceChanged &&
      !remarkChanged &&
      !modeChanged &&
      !manualAllocation
    ) {
      // Untouched line: emit nothing so pricingBasis and split amounts survive.
      continue;
    }

    const command: LineSetCommand = { op: 'set', lineId: l.originalLineId };

    if (quantityChanged || unitChanged) {
      command.quantity = returned > 0 ? l.quantity + returned : l.quantity;
    }
    if (unitChanged || (returned > 0 && (quantityChanged || priceChanged))) {
      command.unitId = l.unitId;
    }
    if (priceChanged) {
      command.unitPrice = l.unitPrice;
    }
    if (warehouseChanged) {
      command.warehouseId = l.warehouseId;
    }
    if (modeChanged || manualAllocation) {
      command.allocationMode = l.allocationMode;
      if (l.allocationMode === 'manual') {
        command.batchSelections = l.batchSelections;
      }
    }
    if (remarkChanged) {
      command.remark = l.remark ?? '';
    }

    lineChanges.push(command);
  }

  return lineChanges;
}
