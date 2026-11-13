/**
 * HuoYouPu Inventory Domain Pure Logic Module
 * Strict validation and formatting for inventory, receipts, batches, and stocktaking.
 * Exported for production components and regression testing.
 */

export {
  locateTargetAcrossPages,
  type LocateAcrossPagesParams,
  type LocateAcrossPagesOutput,
} from '../finance/financeLogic.js';

export interface QuantityValidationResult {
  valid: boolean;
  value?: number;
  error?: string;
}

export interface UnitCostValidationResult {
  valid: boolean;
  value?: string;
  error?: string;
}

/**
 * Validates a receipt quantity string.
 * Must be a positive safe integer (> 0).
 * Decimal quantities (e.g. "1.5", "2.0") and non-safe integers are strictly rejected.
 * Never use parseInt to truncate decimals.
 */
export function validateReceiptQuantity(raw: string): QuantityValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, error: '数量不能为空' };
  }
  // Disallow decimal point, negative sign, scientific notation
  if (!/^[1-9]\d*$/.test(trimmed)) {
    if (trimmed.includes('.') || trimmed.includes(',')) {
      return { valid: false, error: '数量必须为正整数，不支持小数' };
    }
    if (trimmed.startsWith('-') || trimmed === '0') {
      return { valid: false, error: '数量必须大于 0' };
    }
    return { valid: false, error: '数量格式不正确，必须为纯数字正整数' };
  }

  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num > Number.MAX_SAFE_INTEGER) {
    return { valid: false, error: '数量超过系统支持的最大安全整数' };
  }

  return { valid: true, value: num };
}

/**
 * Validates actual stocktake quantity (actualQuantityBase).
 * Must be a non-negative safe integer (>= 0).
 * Decimal quantities are strictly rejected.
 */
export function validateStocktakeCount(raw: string): QuantityValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, error: '实盘数量不能为空' };
  }
  if (!/^(0|[1-9]\d*)$/.test(trimmed)) {
    if (trimmed.includes('.') || trimmed.includes(',')) {
      return { valid: false, error: '实盘数量必须为整数，不支持小数' };
    }
    if (trimmed.startsWith('-')) {
      return { valid: false, error: '实盘数量不能为负数' };
    }
    return { valid: false, error: '实盘数量格式不正确' };
  }

  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num > Number.MAX_SAFE_INTEGER) {
    return { valid: false, error: '实盘数量超过系统支持的最大安全整数' };
  }

  return { valid: true, value: num };
}

/**
 * Validates unit cost (UnitPrice string).
 * Must be a non-negative decimal string with up to 6 decimal places.
 * Must NOT be empty.
 */
export function validateUnitCost(raw: string): UnitCostValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, error: '实际进价成本不能为空，必须明确填写' };
  }
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(trimmed)) {
    return { valid: false, error: '单价必须为非负数值，最多支持6位小数' };
  }
  return { valid: true, value: trimmed };
}

export interface StocktakeLineCheck {
  actualQuantityBase: number;
  snapshotQuantityBase: number;
  gainCostUnitId?: string | null;
  gainUnitCost?: string | null;
}

/**
 * Validates stocktake lines before updating or confirming.
 * When actualQuantityBase > snapshotQuantityBase (gain), gainCostUnitId and gainUnitCost are REQUIRED.
 */
export function validateStocktakeGainRequirements(
  lines: StocktakeLineCheck[]
): { valid: boolean; gainErrors: Record<number, string> } {
  const gainErrors: Record<number, string> = {};
  let valid = true;

  lines.forEach((line, index) => {
    if (line.actualQuantityBase > line.snapshotQuantityBase) {
      // Gain: require gainCostUnitId and gainUnitCost
      if (!line.gainCostUnitId) {
        gainErrors[index] = '盘盈行必须指定入库核算单位';
        valid = false;
      } else if (!line.gainUnitCost || !validateUnitCost(line.gainUnitCost).valid) {
        gainErrors[index] = '盘盈行必须提供有效的盘盈单位成本';
        valid = false;
      }
    }
  });

  return { valid, gainErrors };
}

export interface StocktakeLineDraft {
  id: string;
  actualQuantityRaw: string;
  actualQuantityBase: number;
  snapshotQuantityBase: number;
  gainCostUnitId?: string | null;
  gainUnitCost?: string | null;
}

/**
 * Complete unified validator for stocktake lines (used by draft save, confirmation, and button disable state).
 * Prevents submitting stale or hidden integer values when raw input is currently invalid (e.g. 18.5).
 */
export function validateAllStocktakeLines(lines: StocktakeLineDraft[]): {
  valid: boolean;
  hasInvalidQuantity: boolean;
  hasInvalidGain: boolean;
  error?: string;
  lineErrors: Record<string, string>;
} {
  const lineErrors: Record<string, string> = {};
  let hasInvalidQuantity = false;
  let hasInvalidGain = false;

  for (const l of lines) {
    const qCheck = validateStocktakeCount(l.actualQuantityRaw);
    if (!qCheck.valid) {
      lineErrors[l.id] = qCheck.error || '实盘数量非法';
      hasInvalidQuantity = true;
      continue;
    }

    const actual = qCheck.value!;
    if (actual > l.snapshotQuantityBase) {
      if (!l.gainCostUnitId) {
        lineErrors[l.id] = '盘盈行必须指定核算单位';
        hasInvalidGain = true;
      } else if (!l.gainUnitCost || !validateUnitCost(l.gainUnitCost).valid) {
        lineErrors[l.id] = '盘盈行必须提供有效的进价单价';
        hasInvalidGain = true;
      }
    }
  }

  let error: string | undefined = undefined;
  if (hasInvalidQuantity) {
    error = '实盘明细中存在非法数量输入（不支持小数或负数，不能提交旧整数）';
  } else if (hasInvalidGain) {
    error = '实盘明细中存在未完善的盘盈行（盘盈必须指定核算单位与成本）';
  }

  return {
    valid: !hasInvalidQuantity && !hasInvalidGain,
    hasInvalidQuantity,
    hasInvalidGain,
    error,
    lineErrors,
  };
}

/**
 * Formats Shanghai business datetime to ISO string with timezone `+08:00`.
 * E.g., date="2026-11-11", time="14:30" => "2026-11-11T14:30:00+08:00".
 * If time is omitted, defaults to "00:00:00".
 */
export function formatShanghaiDateTime(dateStr: string, timeStr?: string): string {
  const date = dateStr.trim();
  const time = timeStr?.trim() || '00:00';
  const fullTime = time.length === 5 ? `${time}:00` : time;
  return `${date}T${fullTime}+08:00`;
}

/**
 * Gets current Shanghai datetime components.
 */
export function getCurrentShanghaiDateTime(): { date: string; time: string; iso: string } {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const shanghaiTime = new Date(utc + 3600000 * 8);

  const year = shanghaiTime.getFullYear();
  const month = String(shanghaiTime.getMonth() + 1).padStart(2, '0');
  const day = String(shanghaiTime.getDate()).padStart(2, '0');
  const hours = String(shanghaiTime.getHours()).padStart(2, '0');
  const minutes = String(shanghaiTime.getMinutes()).padStart(2, '0');
  const seconds = String(shanghaiTime.getSeconds()).padStart(2, '0');

  const date = `${year}-${month}-${day}`;
  const time = `${hours}:${minutes}`;
  const iso = `${date}T${hours}:${minutes}:${seconds}+08:00`;

  return { date, time, iso };
}

/**
 * Checks if an error corresponds to STOCKTAKE_STALE.
 * Accurately inspects ClientError.code, status 409, and backend message "盘点后相关库存已变更".
 * Strictly distinguishes from VERSION_CONFLICT.
 */
export function isStocktakeStaleError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object' && err !== null) {
    const code = (err as Record<string, unknown>).code;
    // Explicit code check
    if (code === 'STOCKTAKE_STALE') return true;
    if (code === 'VERSION_CONFLICT') return false; // Not a physical stock change, just draft concurrency
  }

  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('STOCKTAKE_STALE')) return true;
  if (msg.includes('盘点后相关库存已变更')) return true;
  if (msg.includes('无批次盘盈行仅适用于账面库存为零的商品')) return true;

  return false;
}
