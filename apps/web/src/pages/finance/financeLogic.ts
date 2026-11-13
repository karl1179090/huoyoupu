/**
 * HuoYouPu Finance Domain Pure Logic Module
 * Strict validation and formatting for customer finances, receipts, refunds, allocations, and statements.
 * Uses BigInt cents for money calculations to guarantee precision without floating-point errors.
 * Exported for production components and regression testing.
 */

export interface LocateAcrossPagesParams<T> {
  targetId: string;
  initialCursor?: string | null;
  fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string | null }>;
  matchesTarget: (item: T, targetId: string) => boolean;
  maxPages?: number;
  isCancelled: () => boolean;
  onPageFetched?: (items: T[], nextCursor: string | null) => void;
}

export interface LocateAcrossPagesOutput<T> {
  found: boolean;
  targetItem?: T;
  accumulatedItems: T[];
  finalNextCursor: string | null;
  pagesFetched: number;
}

/**
 * Searches across multiple paginated pages for a target item without relying on component state updates.
 * Robust against effect cancellations mid-search, collects all intermediate items, and preserves cursor state.
 */
export async function locateTargetAcrossPages<T>(
  params: LocateAcrossPagesParams<T>
): Promise<LocateAcrossPagesOutput<T>> {
  const {
    targetId,
    initialCursor,
    fetchPage,
    matchesTarget,
    maxPages = 10,
    isCancelled,
    onPageFetched,
  } = params;

  let cursor: string | null = initialCursor || null;
  let found = false;
  let targetItem: T | undefined = undefined;
  const accumulatedItems: T[] = [];
  let pagesFetched = 0;

  while (cursor && !found && pagesFetched < maxPages) {
    if (isCancelled()) {
      break;
    }
    pagesFetched++;
    const res = await fetchPage(cursor);
    if (isCancelled()) {
      break;
    }

    accumulatedItems.push(...res.items);
    cursor = res.nextCursor || null;

    if (onPageFetched) {
      onPageFetched(res.items, cursor);
    }

    const match = res.items.find(item => matchesTarget(item, targetId));
    if (match) {
      found = true;
      targetItem = match;
      break;
    }
  }

  return {
    found,
    targetItem,
    accumulatedItems,
    finalNextCursor: cursor,
    pagesFetched,
  };
}

export interface ResolveStatementCustomerParams {
  currentSelected: string;
  statementCustomerId?: string;
  initialCustomerId?: string;
  availableCustomers: Array<{ id: string }>;
  isTargetingStatement: boolean;
  statementFailed?: boolean;
}

/**
 * Coordinates initial customer resolution between customer list loader and target statement loader.
 * Guarantees that target statement customer or user-selected customer is never overwritten by default customer.
 */
export function resolveStatementCustomer(params: ResolveStatementCustomerParams): string {
  if (params.currentSelected) {
    return params.currentSelected;
  }
  if (params.statementCustomerId) {
    return params.statementCustomerId;
  }
  if (params.initialCustomerId) {
    return params.initialCustomerId;
  }
  if (params.isTargetingStatement && !params.statementFailed) {
    return '';
  }
  return params.availableCustomers.length > 0 ? params.availableCustomers[0]!.id : '';
}

export interface MoneyValidationResult {
  valid: boolean;
  value?: string;
  error?: string;
}

export interface AllocationDraft {
  orderId: string;
  amount: string;
}

export interface AllocationsValidationResult {
  valid: boolean;
  totalAllocated: string;
  remainingUnallocated: string;
  error?: string;
  lineErrors?: Record<number, string>;
}

/**
 * Converts a valid money string to integer cents as BigInt.
 * Prevents Number.MAX_SAFE_INTEGER overflow and IEEE-754 precision loss on large decimal amounts.
 */
export function moneyToCentsBigInt(moneyStr: string): bigint {
  const trimmed = moneyStr.trim();
  const isNegative = trimmed.startsWith('-');
  const clean = isNegative ? trimmed.slice(1) : trimmed;
  const parts = clean.split('.');
  const intPart = parts[0] || '0';
  const decPart = (parts[1] || '').padEnd(2, '0').slice(0, 2);
  const cents = BigInt(intPart) * 100n + BigInt(decPart);
  return isNegative ? -cents : cents;
}

/**
 * Converts integer cents as BigInt back to standard 2-decimal money string.
 */
export function centsBigIntToMoney(cents: bigint): string {
  const isNegative = cents < 0n;
  const abs = isNegative ? -cents : cents;
  const intPart = abs / 100n;
  const decPart = (abs % 100n).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${intPart}.${decPart}`;
}

/**
 * Validates money string (2 decimal places).
 * If allowNegative is true, allows leading '-' (e.g. for opening balance).
 */
export function validateMoney(raw: string, allowNegative = false): MoneyValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, error: '金额不能为空' };
  }

  // Regex for positive money: e.g. "100", "100.00", "0.50"
  const positivePattern = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
  // Regex with optional negative: e.g. "-100", "-50.25"
  const signedPattern = /^-?(0|[1-9]\d*)(\.\d{1,2})?$/;

  const pattern = allowNegative ? signedPattern : positivePattern;

  if (!pattern.test(trimmed)) {
    return {
      valid: false,
      error: allowNegative
        ? '金额格式不正确，最多支持2位小数（支持负数）'
        : '金额格式不正确，必须为大于0的正数且最多支持2位小数',
    };
  }

  // Check if zero when negative not allowed
  const isNegative = trimmed.startsWith('-');
  if (!allowNegative && isNegative) {
    return { valid: false, error: '金额必须大于 0' };
  }

  const cents = moneyToCentsBigInt(trimmed);
  if (!allowNegative && cents <= 0n) {
    return { valid: false, error: '金额必须大于 0' };
  }

  // Normalize to standard 2 decimal places using BigInt
  const normalized = centsBigIntToMoney(cents);

  return { valid: true, value: normalized };
}

/**
 * Validates manual multi-order payment allocations against the total available cash/funds amount.
 * Uses BigInt cents to strictly prevent floating-point inaccuracies.
 * Total allocations must be <= totalAvailableAmount.
 */
export function validateAllocations(
  allocations: AllocationDraft[],
  totalAvailableAmount: string
): AllocationsValidationResult {
  const cashCheck = validateMoney(totalAvailableAmount);
  if (!cashCheck.valid) {
    return {
      valid: false,
      totalAllocated: '0.00',
      remainingUnallocated: '0.00',
      error: `资金总额无效: ${cashCheck.error}`,
    };
  }

  const totalCents = moneyToCentsBigInt(cashCheck.value!);
  let totalAllocatedCents = 0n;
  const lineErrors: Record<number, string> = {};
  const seenOrderIds = new Set<string>();

  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i];
    if (!alloc) continue;
    if (!alloc.orderId.trim()) {
      lineErrors[i] = '必须选择关联订单';
      continue;
    }
    if (seenOrderIds.has(alloc.orderId)) {
      lineErrors[i] = '订单不可重复分配';
      continue;
    }
    seenOrderIds.add(alloc.orderId);

    const check = validateMoney(alloc.amount);
    if (!check.valid) {
      lineErrors[i] = check.error || '分配金额无效';
      continue;
    }
    const cents = moneyToCentsBigInt(check.value!);
    if (cents <= 0n) {
      lineErrors[i] = '分配金额必须大于 0';
      continue;
    }
    totalAllocatedCents += cents;
  }

  const totalAllocatedStr = centsBigIntToMoney(totalAllocatedCents);
  const remainingCents = totalCents - totalAllocatedCents;
  const remainingStr = centsBigIntToMoney(remainingCents > 0n ? remainingCents : 0n);

  if (Object.keys(lineErrors).length > 0) {
    return {
      valid: false,
      totalAllocated: totalAllocatedStr,
      remainingUnallocated: remainingStr,
      error: '存在未通过校验的订单分摊行',
      lineErrors,
    };
  }

  if (totalAllocatedCents > totalCents) {
    return {
      valid: false,
      totalAllocated: totalAllocatedStr,
      remainingUnallocated: '0.00',
      error: `分配金额总计 (¥${totalAllocatedStr}) 超出可用金额 (¥${cashCheck.value})`,
      lineErrors,
    };
  }

  return {
    valid: true,
    totalAllocated: totalAllocatedStr,
    remainingUnallocated: remainingStr,
    lineErrors: {},
  };
}

/**
 * Formats Shanghai statement period [start, end) as right-open interval with +08:00.
 */
export function formatShanghaiPeriod(
  startDateStr: string,
  endDateStr: string
): { valid: boolean; periodStart?: string; periodEnd?: string; error?: string } {
  const start = startDateStr.trim();
  const end = endDateStr.trim();

  if (!start || !end) {
    return { valid: false, error: '请选择完整的对账周期起始与截止日期' };
  }

  if (start >= end) {
    return { valid: false, error: '周期起始日期必须早于截止日期（采用右开区间 [起始, 截止) 规范）' };
  }

  const periodStart = `${start}T00:00:00+08:00`;
  const periodEnd = `${end}T00:00:00+08:00`;

  return { valid: true, periodStart, periodEnd };
}

/**
 * Checks if a monthly statement snapshot is marked as stale.
 */
export function isStaleStatement(statement: { stale: boolean }): boolean {
  return statement.stale === true;
}

/**
 * Parses LedgerEntry kind into friendly business label, styling, and credit/debit sign.
 * Matches real backend service kinds: 'sale', 'return', 'receipt', 'refund', 'opening', 'reversal', 'reclassification'.
 * Also supports legacy/extended variants for robust backward compatibility.
 */
export function parseLedgerKind(kind: string): { label: string; badgeClass: string; isCredit: boolean } {
  switch (kind) {
    // Real backend finance kinds
    case 'sale':
    case 'sale_receivable':
      return { label: '销售应收增加', badgeClass: 'badge-warning', isCredit: false };

    case 'return':
    case 'sale_return_credit':
      return { label: '退货信用冲减', badgeClass: 'badge-danger', isCredit: true };

    case 'receipt':
    case 'cash_receipt':
      return { label: '实际收款入账', badgeClass: 'badge-success', isCredit: true };

    case 'refund':
    case 'cash_refund':
      return { label: '实际现金退款', badgeClass: 'badge-info', isCredit: false };

    case 'opening':
    case 'opening_balance':
      return { label: '期初往来账款', badgeClass: 'badge-default', isCredit: false };

    case 'reversal':
    case 'cash_reversal':
      return { label: '收退款红字冲正', badgeClass: 'badge-danger', isCredit: false };

    case 'reclassification':
      return { label: '往来调账重分类', badgeClass: 'badge-accent', isCredit: false };

    case 'balance_application':
      return { label: '余额核销订单', badgeClass: 'badge-accent', isCredit: true };

    case 'void_reversal':
      return { label: '作废订单冲销', badgeClass: 'badge-danger', isCredit: true };

    default:
      return { label: kind, badgeClass: 'badge-default', isCredit: false };
  }
}

/**
 * Formats source version tag safely, preventing '(v)' when version is null or undefined.
 */
export function formatSourceVersionTag(version?: number | null): string {
  if (version === null || version === undefined) return '';
  return `(v${version})`;
}

/**
 * Formats a signed money string from backend (e.g. "-500.00", "120.00").
 * Preserves the true mathematical sign and strictly prevents double signs like "+¥-500.00".
 * E.g.:
 *   "-500.00" -> "-¥500.00"
 *   "120.00"  -> "+¥120.00" (if showPositiveSign=true) or "¥120.00" (default)
 *   "0.00"    -> "¥0.00"
 */
export function formatSignedMoney(amountStr?: string | null, showPositiveSign = false): string {
  if (!amountStr) return '¥0.00';
  const trimmed = amountStr.trim();
  if (!trimmed) return '¥0.00';

  if (trimmed.startsWith('-')) {
    return `-¥${trimmed.substring(1)}`;
  }
  if (trimmed.startsWith('+')) {
    return `+¥${trimmed.substring(1)}`;
  }
  if (showPositiveSign && parseFloat(trimmed) > 0) {
    return `+¥${trimmed}`;
  }
  return `¥${trimmed}`;
}

/**
 * Formats Shanghai timestamp display.
 */
export function formatShanghaiDisplay(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d).replace(/\//g, '-');
  } catch {
    return iso.replace('T', ' ').substring(0, 19);
  }
}
