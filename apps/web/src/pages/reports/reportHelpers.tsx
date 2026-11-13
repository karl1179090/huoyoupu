import React from 'react';
import type {
  ReportResult,
  ReportQuery,
  SourcePage,
} from '../../api/types.js';

export type SourceRef = SourcePage['items'][number];

export const KIND_ALLOWED_FILTERS: Record<
  ReportQuery['kind'],
  { customers: boolean; products: boolean; warehouses: boolean }
> = {
  sales_summary: { customers: true, products: true, warehouses: true },
  customer_product_comparison: { customers: true, products: true, warehouses: true },
  inventory: { customers: false, products: true, warehouses: true },
  customer_balances: { customers: true, products: false, warehouses: false },
  cash_flow: { customers: true, products: false, warehouses: false },
  inventory_loss: { customers: false, products: true, warehouses: true },
};

/**
 * Shanghai Timezone (Asia/Shanghai = UTC+8) Formatter for datetime Instants
 */
export function formatShanghaiInstant(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
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
    return iso;
  }
}

/**
 * Shanghai Timezone (Asia/Shanghai = UTC+8) Formatter for dates (YYYY-MM-DD)
 */
export function formatShanghaiDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d).replace(/\//g, '-');
  } catch {
    return iso;
  }
}

/**
 * Convert YYYY-MM-DD into Shanghai midnight ISO string: YYYY-MM-DDT00:00:00+08:00
 */
export function toShanghaiStartOfDay(dateStr: string): string {
  return `${dateStr}T00:00:00+08:00`;
}

/**
 * Get current Asia/Shanghai date string in YYYY-MM-DD format
 */
export function getShanghaiTodayDate(): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const p: Record<string, string> = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Get current Asia/Shanghai datetime-local input string in YYYY-MM-DDTHH:mm format
 */
export function getShanghaiNowInput(): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const p: Record<string, string> = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * Convert an ISO instant string (e.g. UTC 2026-10-31T16:00:00.000Z)
 * into an Asia/Shanghai date input string: YYYY-MM-DD (e.g. 2026-11-01)
 */
export function isoToShanghaiDateInput(iso?: string | null): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.substring(0, 10);
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    return `${p.year}-${p.month}-${p.day}`;
  } catch {
    return iso.substring(0, 10);
  }
}

/**
 * Convert an ISO instant string (e.g. UTC 2026-11-01T01:30:00.000Z)
 * into an Asia/Shanghai datetime-local input string: YYYY-MM-DDTHH:mm (e.g. 2026-11-01T09:30)
 */
export function isoToShanghaiDateTimeInput(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.substring(0, 16);
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  } catch {
    return iso.substring(0, 16);
  }
}

export function formatMoney(val?: string | null): string {
  if (val === null || val === undefined) return '—';
  return `¥${val}`;
}

export function formatQuantity(val?: number | null): string {
  if (val === null || val === undefined) return '—';
  return val.toLocaleString();
}

export interface TableProps<T> {
  rows: T[];
  isAdmin: boolean;
}

export function SalesSummaryTable({ rows, isAdmin }: TableProps<any>) {
  return (
    <table className="report-table">
      <thead>
        <tr>
          <th>统计期间</th>
          <th style={{ textAlign: 'right' }}>订单笔数</th>
          <th style={{ textAlign: 'right' }}>销售总额</th>
          <th style={{ textAlign: 'right' }}>退货金额</th>
          <th style={{ textAlign: 'right' }}>净销售额</th>
          {isAdmin && <th style={{ textAlign: 'right' }}>销售总成本</th>}
          {isAdmin && <th style={{ textAlign: 'right' }}>退货成本信用</th>}
          {isAdmin && <th style={{ textAlign: 'right' }}>销售毛利</th>}
          <th style={{ textAlign: 'right' }}>实际收款</th>
          <th style={{ textAlign: 'right' }}>实际退款</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={idx}>
            <td style={{ fontWeight: 500 }}>
              {formatShanghaiDate(r.periodStart)} 至 {formatShanghaiDate(r.periodEnd)}
            </td>
            <td style={{ textAlign: 'right' }} className="tabular-nums font-mono">{formatQuantity(r.orderCount)}</td>
            <td style={{ textAlign: 'right' }} className="tabular-nums font-mono">¥{r.grossSalesAmount}</td>
            <td style={{ textAlign: 'right', color: 'var(--danger)' }} className="tabular-nums font-mono">-¥{r.returnAmount}</td>
            <td style={{ textAlign: 'right', fontWeight: 600 }} className="tabular-nums font-mono">¥{r.netSalesAmount}</td>
            {isAdmin && <td style={{ textAlign: 'right' }} className="tabular-nums font-mono">¥{r.salesCostAmount}</td>}
            {isAdmin && <td style={{ textAlign: 'right', color: 'var(--success)' }} className="tabular-nums font-mono">¥{r.returnCostCreditAmount}</td>}
            {isAdmin && (
              <td
                style={{
                  textAlign: 'right',
                  fontWeight: 600,
                  color: Number(r.grossProfit) >= 0 ? 'var(--success)' : 'var(--danger)',
                }}
                className="tabular-nums font-mono"
              >
                ¥{r.grossProfit}
              </td>
            )}
            <td style={{ textAlign: 'right', color: r.receiptAmount !== null ? 'var(--success)' : 'var(--text-subtle)' }} className="tabular-nums font-mono">
              {r.receiptAmount !== null ? `+¥${r.receiptAmount}` : '不可分摊'}
            </td>
            <td style={{ textAlign: 'right', color: r.refundAmount !== null ? 'var(--danger)' : 'var(--text-subtle)' }} className="tabular-nums font-mono">
              {r.refundAmount !== null ? `-¥${r.refundAmount}` : '不可分摊'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CustomerProductComparisonTable({ rows }: TableProps<any>) {
  const getTrendBadge = (trend: string) => {
    switch (trend) {
      case 'decreased':
        return <span className="badge badge-danger" style={{ fontSize: '10px' }}>下降</span>;
      case 'increased':
        return <span className="badge badge-success" style={{ fontSize: '10px' }}>增长</span>;
      case 'unchanged':
        return <span className="badge badge-default" style={{ fontSize: '10px' }}>持平</span>;
      case 'new':
        return <span className="badge badge-info" style={{ fontSize: '10px' }}>本期新增</span>;
      case 'no_baseline':
        return <span className="badge" style={{ fontSize: '10px', background: '#f3e8ff', color: '#7e22ce' }}>无基期</span>;
      default:
        return <span className="badge badge-default" style={{ fontSize: '10px' }}>{trend}</span>;
    }
  };

  return (
    <table className="report-table">
      <thead>
        <tr>
          <th>客户名称</th>
          <th>商品名称</th>
          <th>单位</th>
          <th style={{ textAlign: 'right' }}>本期下单</th>
          <th style={{ textAlign: 'right' }}>基期下单</th>
          <th style={{ textAlign: 'right' }}>本期退货</th>
          <th style={{ textAlign: 'right' }}>基期退货</th>
          <th style={{ textAlign: 'right' }}>本期净量</th>
          <th style={{ textAlign: 'right' }}>基期净量</th>
          <th style={{ textAlign: 'right' }}>变动数量</th>
          <th style={{ textAlign: 'right' }}>变动幅度</th>
          <th style={{ textAlign: 'center' }}>趋势</th>
          <th style={{ textAlign: 'right' }}>本期净额</th>
          <th style={{ textAlign: 'right' }}>基期净额</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => {
          const isZeroPurchase = r.currentOrderedQuantityBase === 0 && r.baselineOrderedQuantityBase > 0;
          return (
            <tr key={idx} style={{ background: isZeroPurchase ? '#fffbeb' : undefined }}>
              <td style={{ fontWeight: 500 }}>
                {r.customerName || (r.customerId ? r.customerId.substring(0, 8) : '—')}
              </td>
              <td><strong>{r.productName}</strong></td>
              <td>{r.baseUnitName}</td>
              <td style={{ textAlign: 'right' }} className="tabular-nums font-mono">
                {isZeroPurchase ? (
                  <span style={{ color: 'var(--danger)', fontWeight: 700 }}>0 (未购买)</span>
                ) : (
                  formatQuantity(r.currentOrderedQuantityBase)
                )}
              </td>
              <td style={{ textAlign: 'right' }} className="tabular-nums font-mono">{formatQuantity(r.baselineOrderedQuantityBase)}</td>
              <td style={{ textAlign: 'right', color: 'var(--danger)' }} className="tabular-nums font-mono">{formatQuantity(r.currentReturnQuantityBase)}</td>
              <td style={{ textAlign: 'right', color: 'var(--danger)' }} className="tabular-nums font-mono">{formatQuantity(r.baselineReturnQuantityBase)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }} className="tabular-nums font-mono">{formatQuantity(r.currentNetQuantityBase)}</td>
              <td style={{ textAlign: 'right' }} className="tabular-nums font-mono">{formatQuantity(r.baselineNetQuantityBase)}</td>
              <td
                style={{
                  textAlign: 'right',
                  fontWeight: 600,
                  color: r.quantityChangeBase < 0 ? 'var(--danger)' : r.quantityChangeBase > 0 ? 'var(--success)' : 'inherit',
                }}
                className="tabular-nums font-mono"
              >
                {r.quantityChangeBase > 0 ? `+${r.quantityChangeBase}` : r.quantityChangeBase}
              </td>
              <td style={{ textAlign: 'right' }} className="tabular-nums font-mono">
                {r.changePercent !== null ? `${r.changePercent}%` : '—'}
              </td>
              <td style={{ textAlign: 'center' }}>{getTrendBadge(r.trend)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }} className="tabular-nums font-mono">¥{r.currentNetSalesAmount}</td>
              <td style={{ textAlign: 'right' }} className="tabular-nums font-mono">¥{r.baselineNetSalesAmount}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function InventoryTable({ rows, isAdmin }: TableProps<any>) {
  return (
    <table className="report-table">
      <thead>
        <tr>
          <th>商品名称</th>
          <th>存放仓库</th>
          <th>批次号</th>
          <th>单位</th>
          <th style={{ textAlign: 'right' }}>结存数量 (基础单位)</th>
          {isAdmin && <th style={{ textAlign: 'right' }}>库存总成本</th>}
          <th>实际入库时间</th>
          <th>系统登记时间</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={idx}>
            <td style={{ fontWeight: 600 }}>{r.productName}</td>
            <td>{r.warehouseName || (r.warehouseId ? r.warehouseId.substring(0, 8) : '汇总全部')}</td>
            <td className="font-mono">{r.batchId ? r.batchId.substring(0, 8) : '—'}</td>
            <td>{r.baseUnitName}</td>
            <td style={{ textAlign: 'right', fontWeight: 600 }} className="tabular-nums font-mono">
              {formatQuantity(r.quantityBase)}
            </td>
            {isAdmin && (
              <td style={{ textAlign: 'right' }} className="tabular-nums font-mono">
                ¥{r.costAmount}
              </td>
            )}
            <td>{formatShanghaiInstant(r.receivedAt)}</td>
            <td>{formatShanghaiInstant(r.recordedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CustomerBalancesTable({ rows }: TableProps<any>) {
  return (
    <table className="report-table">
      <thead>
        <tr>
          <th>客户名称</th>
          <th style={{ textAlign: 'right' }}>净往来余额</th>
          <th style={{ textAlign: 'right' }}>应收未结金额</th>
          <th style={{ textAlign: 'right' }}>商业退货信用</th>
          <th style={{ textAlign: 'right' }}>预收未分配资金</th>
          <th style={{ textAlign: 'center' }}>账本版本</th>
          <th>时点快照时间</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={idx}>
            <td style={{ fontWeight: 600 }}>{r.customerName}</td>
            <td
              style={{
                textAlign: 'right',
                fontWeight: 700,
                color: Number(r.netBalance) > 0 ? 'var(--danger)' : Number(r.netBalance) < 0 ? 'var(--success)' : 'inherit',
              }}
              className="tabular-nums font-mono"
            >
              ¥{r.netBalance}
            </td>
            <td style={{ textAlign: 'right' }} className="tabular-nums font-mono">¥{r.receivableBalance}</td>
            <td style={{ textAlign: 'right', color: 'var(--success)' }} className="tabular-nums font-mono">¥{r.creditBalance}</td>
            <td style={{ textAlign: 'right', color: 'var(--info)' }} className="tabular-nums font-mono">¥{r.unallocatedAmount}</td>
            <td style={{ textAlign: 'center' }} className="font-mono">v{r.version}</td>
            <td>{formatShanghaiInstant(r.asOf)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CashFlowTable({ rows }: TableProps<any>) {
  return (
    <table className="report-table">
      <thead>
        <tr>
          <th>实际发生时间</th>
          <th>流水登记时间</th>
          <th style={{ textAlign: 'center' }}>收退款类型</th>
          <th>往来客户</th>
          <th style={{ textAlign: 'right' }}>发生金额</th>
          <th>支付结算方式</th>
          <th>流水事件编号</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={idx}>
            <td>{formatShanghaiInstant(r.occurredAt)}</td>
            <td>{formatShanghaiInstant(r.recordedAt)}</td>
            <td style={{ textAlign: 'center' }}>
              <span className={`badge ${r.kind === 'receipt' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '11px' }}>
                {r.kind === 'receipt' ? '收款入账' : '退款出账'}
              </span>
            </td>
            <td style={{ fontWeight: 600 }}>{r.customerName}</td>
            <td
              style={{
                textAlign: 'right',
                fontWeight: 600,
                color: r.kind === 'receipt' ? 'var(--success)' : 'var(--danger)',
              }}
              className="tabular-nums font-mono"
            >
              {r.kind === 'receipt' ? `+¥${r.amount}` : `-¥${r.amount}`}
            </td>
            <td>{r.method}</td>
            <td className="font-mono">{r.eventId.substring(0, 8)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InventoryLossTable({ rows }: TableProps<any>) {
  const getKindBadge = (kind: string) => {
    switch (kind) {
      case 'stocktake_gain':
        return <span className="badge badge-success" style={{ fontSize: '11px' }}>盘盈入账</span>;
      case 'stocktake_loss':
        return <span className="badge badge-danger" style={{ fontSize: '11px' }}>盘亏扣减</span>;
      case 'return_loss':
        return <span className="badge badge-warning" style={{ fontSize: '11px' }}>退货损耗</span>;
      case 'loss_reversal':
        return <span className="badge badge-info" style={{ fontSize: '11px' }}>损耗冲回</span>;
      default:
        return <span className="badge badge-default" style={{ fontSize: '11px' }}>{kind}</span>;
    }
  };

  return (
    <table className="report-table">
      <thead>
        <tr>
          <th>损益流水编号</th>
          <th style={{ textAlign: 'center' }}>损益类型</th>
          <th>商品标识</th>
          <th>仓库标识</th>
          <th>批次标识</th>
          <th style={{ textAlign: 'right' }}>损益金额</th>
          <th>业务生效时间</th>
          <th>系统登记时间</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={idx}>
            <td className="font-mono">{r.id.substring(0, 8)}</td>
            <td style={{ textAlign: 'center' }}>{getKindBadge(r.kind)}</td>
            <td className="font-mono">{r.productId.substring(0, 8)}</td>
            <td className="font-mono">{r.warehouseId.substring(0, 8)}</td>
            <td className="font-mono">{r.batchId ? r.batchId.substring(0, 8) : '—'}</td>
            <td style={{ textAlign: 'right', fontWeight: 600 }} className="tabular-nums font-mono">
              ¥{r.amount}
            </td>
            <td>{formatShanghaiInstant(r.effectiveAt)}</td>
            <td>{formatShanghaiInstant(r.recordedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface ReportResultViewerProps {
  result: ReportResult;
  isAdmin: boolean;
  onNavigateToSource?: (source: SourceRef) => void;
  nameResolvers?: {
    customers?: Record<string, string>;
    products?: Record<string, string>;
    warehouses?: Record<string, string>;
  };
}

export function ReportResultViewer({
  result,
  isAdmin,
  onNavigateToSource,
  nameResolvers,
}: ReportResultViewerProps) {
  const renderTable = () => {
    if (!result.rows || result.rows.length === 0) {
      return (
        <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-subtle)' }}>
          暂无符合统计条件的数据明细
        </div>
      );
    }

    switch (result.kind) {
      case 'sales_summary':
        return <SalesSummaryTable rows={result.rows} isAdmin={isAdmin} />;
      case 'customer_product_comparison':
        return <CustomerProductComparisonTable rows={result.rows} isAdmin={isAdmin} />;
      case 'inventory':
        return <InventoryTable rows={result.rows} isAdmin={isAdmin} />;
      case 'customer_balances':
        return <CustomerBalancesTable rows={result.rows} isAdmin={isAdmin} />;
      case 'cash_flow':
        return <CashFlowTable rows={result.rows} isAdmin={isAdmin} />;
      case 'inventory_loss':
        return <InventoryLossTable rows={result.rows} isAdmin={isAdmin} />;
      default:
        return (
          <div style={{ padding: '24px', color: 'var(--danger)' }}>
            未知报表类型: {(result as any).kind}
          </div>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Metadata & Watermark & Normalized Query Bar */}
      <div className="report-metadata-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-main)' }}>
            快照ID: #{result.id.substring(0, 8)}
          </span>
          <span>生成时间: {formatShanghaiInstant(result.generatedAt)}</span>
          <span>数据截止 (asOf): {formatShanghaiInstant(result.asOf)}</span>
          <span className="badge badge-default" style={{ fontSize: '11px' }}>
            水印: {result.sourceWatermark || '—'}
          </span>
          <span className="badge badge-default" style={{ fontSize: '11px' }}>
            时区: {result.timezone}
          </span>
        </div>

        {/* Periods */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {result.currentPeriod && (
            <div className="report-period-badge">
              <span style={{ fontWeight: 600 }}>本期区间:</span>
              <span>{formatShanghaiDate(result.currentPeriod.start)} 至 {formatShanghaiDate(result.currentPeriod.end)}</span>
              {result.currentPeriod.incomplete && (
                <span className="badge badge-warning" style={{ fontSize: '10px', padding: '1px 4px' }}>
                  本月未完结 (统计中)
                </span>
              )}
            </div>
          )}

          {result.baselinePeriod && (
            <div className="report-period-badge">
              <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>基期对比:</span>
              <span>{formatShanghaiDate(result.baselinePeriod.start)} 至 {formatShanghaiDate(result.baselinePeriod.end)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Normalized Query Condition Bar with explicit values and names */}
      {result.normalizedQuery && (
        <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid var(--border-default)', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span><strong>规范化主题:</strong> {result.normalizedQuery.kind}</span>
            {result.normalizedQuery.period && (
              <span><strong>期间模式:</strong> {result.normalizedQuery.period.mode}</span>
            )}
            {result.normalizedQuery.pointAsOf && (
              <span><strong>结存时点:</strong> {formatShanghaiInstant(result.normalizedQuery.pointAsOf)}</span>
            )}
            {result.normalizedQuery.quantityBasis && (
              <span><strong>数量口径:</strong> {result.normalizedQuery.quantityBasis}</span>
            )}
            {result.normalizedQuery.filters?.decreasesOnly !== undefined && (
              <span><strong>仅看下降:</strong> {result.normalizedQuery.filters.decreasesOnly ? '是' : '否'}</span>
            )}
            {result.normalizedQuery.filters?.minDecreaseQuantityBase !== undefined && (
              <span><strong>最小下降量:</strong> {result.normalizedQuery.filters.minDecreaseQuantityBase}</span>
            )}
            {result.normalizedQuery.filters?.minDecreasePercent && (
              <span><strong>最小下降比例:</strong> {result.normalizedQuery.filters.minDecreasePercent}%</span>
            )}
          </div>

          {/* Concrete filter entities with names */}
          {(result.normalizedQuery.filters && (
              result.normalizedQuery.filters.customerIds?.length ||
              result.normalizedQuery.filters.productIds?.length ||
              result.normalizedQuery.filters.warehouseIds?.length
            )) && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-main)' }}>
              {(() => {
                const cIds = result.normalizedQuery.filters?.customerIds || [];
                const pIds = result.normalizedQuery.filters?.productIds || [];
                const wIds = result.normalizedQuery.filters?.warehouseIds || [];
                return (
                  <>
                    {cIds.length > 0 && (
                      <span className="badge" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                        <strong>客户:</strong> {cIds.map(id => nameResolvers?.customers?.[id] || `${id.substring(0, 8)}...`).join(', ')}
                      </span>
                    )}
                    {pIds.length > 0 && (
                      <span className="badge" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                        <strong>商品:</strong> {pIds.map(id => nameResolvers?.products?.[id] || `${id.substring(0, 8)}...`).join(', ')}
                      </span>
                    )}
                    {wIds.length > 0 && (
                      <span className="badge" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                        <strong>仓库:</strong> {wIds.map(id => nameResolvers?.warehouses?.[id] || `${id.substring(0, 8)}...`).join(', ')}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Collapsible raw JSON normalized query for full audit */}
          <details style={{ marginTop: '4px', fontSize: '11px' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 500 }}>
              展开核对完整规范化条件 (JSON)
            </summary>
            <pre style={{ marginTop: '4px', padding: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '4px', overflowX: 'auto', fontSize: '11px' }}>
              {JSON.stringify(result.normalizedQuery, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* Main Table */}
      <div className="report-table-wrapper">
        {renderTable()}
      </div>
    </div>
  );
}

export interface SourcesModalProps {
  reportId: string;
  sources: SourceRef[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error?: string | null;
  onClose: () => void;
  onLoadMore?: () => void;
  onNavigateToSource?: (source: SourceRef) => void;
}

export function SourcesModal({
  reportId,
  sources,
  nextCursor,
  loading,
  loadingMore,
  error,
  onClose,
  onLoadMore,
  onNavigateToSource,
}: SourcesModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>底层事实依据明细来源 (Sources)</h3>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>快照ID: #{reportId} · 已加载 {sources.length} 条</span>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-subtle)' }}>
              正在加载依据来源...
            </div>
          ) : error ? (
            <div style={{ color: 'var(--danger)', padding: '12px', background: 'var(--danger-bg)', borderRadius: 'var(--radius-sm)' }}>
              {error}
            </div>
          ) : sources.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-subtle)' }}>
              暂无明细依据来源记录
            </div>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>实体类型</th>
                  <th>标识ID</th>
                  <th>版本号</th>
                  <th>业务记录时间</th>
                  <th>系统定位地址 (点击跳转/定位)</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s, idx) => (
                  <tr key={idx}>
                    <td>
                      <span className="badge badge-default">{s.entityType}</span>
                    </td>
                    <td className="font-mono">{s.id.substring(0, 10)}</td>
                    <td className="font-mono">{s.version !== null ? `v${s.version}` : '—'}</td>
                    <td>{formatShanghaiInstant(s.recordedAt)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToSource) {
                              onNavigateToSource(s);
                            }
                          }}
                          className="btn btn-ghost btn-sm font-mono"
                          style={{ fontSize: '11px', color: 'var(--accent)', padding: '2px 6px', textDecoration: 'underline' }}
                          title={onNavigateToSource ? `点击钻取查看对应业务单据: ${s.href}` : `未接通路由，来源: ${s.href}`}
                        >
                          {s.href}
                        </button>
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard?.writeText(JSON.stringify(s, null, 2))}
                          className="btn btn-ghost btn-xs"
                          style={{ fontSize: '10px', padding: '1px 4px', color: 'var(--text-muted)' }}
                          title="复制完整来源元数据"
                        >
                          复制
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {nextCursor && onLoadMore && (
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="btn btn-secondary btn-sm"
              >
                {loadingMore ? '正在加载更多...' : '加载更多来源 (下一页)'}
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-default)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-secondary btn-sm">关闭</button>
        </div>
      </div>
    </div>
  );
}
