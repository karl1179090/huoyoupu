/**
 * Normalisation for strict Money input fields (整单优惠 / 减免抹零).
 *
 * The backend Money contract requires exactly two decimals
 * (`^(0|[1-9][0-9]{0,17})\.[0-9]{2}$`), while a user typing "1" or "1.0" is
 * perfectly normal. This helper converts such raw editor text into the exact
 * payload value WITHOUT floating point math, rounding, truncation or clamping:
 *
 * - ''            -> '0.00'  (existing empty-means-zero semantics)
 * - '0' / '0.0'   -> '0.00'
 * - '1' / '1.0'   -> '1.00'
 * - '1.05'        -> '1.05'  (already canonical, untouched)
 * - '0.5'         -> '0.50'
 *
 * Anything with more than two decimals, a negative sign, or a non-decimal shape
 * is reported as an explicit error so callers can invalidate the old quote and
 * disable confirmation instead of silently guessing an amount.
 *
 * The raw editor state is never rewritten here; only request payloads and
 * validation read the normalised value.
 */
export interface MoneyInputResult {
  /** Canonical two-decimal Money string; only meaningful when `valid` is true. */
  value: string;
  valid: boolean;
  error: string | null;
}

export const MONEY_INPUT_ERROR = '金额仅支持最多两位小数的非负数值';

const CANONICAL_MONEY = /^(0|[1-9][0-9]{0,17})\.[0-9]{2}$/;
const PADDABLE_MONEY = /^(0|[1-9][0-9]{0,17})(?:\.([0-9]{1,2}))?$/;

/** Normalises a raw discount / round-off editor value into strict Money. */
export function normalizeMoneyInput(raw: string): MoneyInputResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: '0.00', valid: true, error: null };

  const match = PADDABLE_MONEY.exec(trimmed);
  if (!match) return { value: '', valid: false, error: MONEY_INPUT_ERROR };

  const whole = match[1]!;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const value = `${whole}.${fraction}`;
  // Guard the accepted upper bound with the same pure string contract (no float math).
  if (!CANONICAL_MONEY.test(value)) return { value: '', valid: false, error: MONEY_INPUT_ERROR };
  return { value, valid: true, error: null };
}
