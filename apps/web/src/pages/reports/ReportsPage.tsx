import React, { useState, useEffect, useRef } from 'react';
import type {
  ReportResult,
  ReportQuery,
  Product,
  Customer,
  Warehouse,
} from '../../api/types.js';
import * as api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import {
  ChartIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  SearchIcon,
} from '../../components/icons/index.js';
import {
  ReportResultViewer,
  SourcesModal,
  KIND_ALLOWED_FILTERS,
  toShanghaiStartOfDay,
  getShanghaiNowInput,
  isoToShanghaiDateInput,
  isoToShanghaiDateTimeInput,
  type SourceRef,
} from './reportHelpers.js';
import './reports.css';

export interface ReportsPageProps {
  initialQuery?: ReportQuery;
  initialReportRunId?: string;
  onBackToAi?: () => void;
  onNavigateToSource?: (source: SourceRef) => void;
}

export function ReportsPage({
  initialQuery,
  initialReportRunId,
  onBackToAi,
  onNavigateToSource,
}: ReportsPageProps) {
  const { isAdmin } = useAuth();

  // Query selection
  const [kind, setKind] = useState<ReportQuery['kind']>(initialQuery?.kind || 'sales_summary');

  // Period vs Point states
  const isPointKind = kind === 'inventory' || kind === 'customer_balances';
  const [pointAsOfDate, setPointAsOfDate] = useState(() => getShanghaiNowInput());

  // Period states
  const [periodMode, setPeriodMode] = useState<'mtd_previous' | 'calendar_months' | 'custom'>(
    initialQuery?.period?.mode || 'mtd_previous'
  );
  // Default natural month: 2026-11-01 to 2026-12-01 (right-open interval)
  const [startDate, setStartDate] = useState('2026-11-01');
  const [endDate, setEndDate] = useState('2026-12-01');
  const [baselineStartDate, setBaselineStartDate] = useState('2026-10-01');
  const [baselineEndDate, setBaselineEndDate] = useState('2026-11-01');

  // Comparison specific filters
  const [quantityBasis, setQuantityBasis] = useState<'ordered' | 'net'>('ordered');
  const [decreasesOnly, setDecreasesOnly] = useState(false);
  const [minDecreaseQuantityBase, setMinDecreaseQuantityBase] = useState<number | undefined>(undefined);
  const [minDecreasePercent, setMinDecreasePercent] = useState<string>('');

  // Catalog filters
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');

  // Results & Loading states
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [is410Expired, setIs410Expired] = useState(false);

  // Concurrency & generation guards (R3)
  const queryGenRef = useRef(0);
  const paginationGenRef = useRef(0);
  const sourcesGenRef = useRef(0);
  const [sourcesReportId, setSourcesReportId] = useState<string | null>(null);
  const initialQueryConsumedRef = useRef(false);
  const lastLoadedRunIdRef = useRef<string | null>(null);

  // Sources drilldown modal
  const [sourcesModalOpen, setSourcesModalOpen] = useState(false);
  const [sources, setSources] = useState<SourceRef[]>([]);
  const [sourcesNextCursor, setSourcesNextCursor] = useState<string | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesLoadingMore, setSourcesLoadingMore] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  // Hydrate all form fields from a ReportQuery or normalizedQuery using true Asia/Shanghai conversions (N2)
  const hydrateFormFromQuery = (q: ReportQuery) => {
    setKind(q.kind);
    if (q.period) {
      setPeriodMode(q.period.mode);
      if (q.period.start) {
        setStartDate(isoToShanghaiDateInput(q.period.start));
      }
      if (q.period.end) {
        setEndDate(isoToShanghaiDateInput(q.period.end));
      }
      if (q.period.baselineStart) {
        setBaselineStartDate(isoToShanghaiDateInput(q.period.baselineStart));
      }
      if (q.period.baselineEnd) {
        setBaselineEndDate(isoToShanghaiDateInput(q.period.baselineEnd));
      }
    }
    if (q.pointAsOf) {
      setPointAsOfDate(isoToShanghaiDateTimeInput(q.pointAsOf));
    }
    if (q.quantityBasis) {
      setQuantityBasis(q.quantityBasis);
    }
    const qFilters = q.filters;
    if (qFilters?.decreasesOnly !== undefined) {
      setDecreasesOnly(qFilters.decreasesOnly);
    }
    if (qFilters?.minDecreaseQuantityBase !== undefined) {
      setMinDecreaseQuantityBase(qFilters.minDecreaseQuantityBase);
    }
    if (qFilters?.minDecreasePercent) {
      setMinDecreasePercent(qFilters.minDecreasePercent);
    }
    if (qFilters?.customerIds && qFilters.customerIds.length > 0) {
      setSelectedCustomerId(qFilters.customerIds[0] || '');
    } else {
      setSelectedCustomerId('');
    }
    if (qFilters?.productIds && qFilters.productIds.length > 0) {
      setSelectedProductId(qFilters.productIds[0] || '');
    } else {
      setSelectedProductId('');
    }
    if (qFilters?.warehouseIds && qFilters.warehouseIds.length > 0) {
      setSelectedWarehouseId(qFilters.warehouseIds[0] || '');
    } else {
      setSelectedWarehouseId('');
    }
  };

  // Mount effect: decide whether to hydrate existing run, execute initialQuery, or run default query
  // N1: ZERO implicit POST calls on initialReportRunId mount; no unprompted default query overwrite
  useEffect(() => {
    void loadFilterData();

    if (initialReportRunId) {
      lastLoadedRunIdRef.current = initialReportRunId;
      void loadExistingReportRun(initialReportRunId);
    } else if (initialQuery && !initialQueryConsumedRef.current) {
      initialQueryConsumedRef.current = true;
      hydrateFormFromQuery(initialQuery);
      void runExplicitQuery(initialQuery);
    } else {
      void handleQuery();
    }
  }, []);

  // When initialReportRunId prop updates while component remains mounted (N1)
  useEffect(() => {
    if (initialReportRunId && initialReportRunId !== lastLoadedRunIdRef.current) {
      lastLoadedRunIdRef.current = initialReportRunId;
      void loadExistingReportRun(initialReportRunId);
    }
  }, [initialReportRunId]);

  const loadExistingReportRun = async (runId: string) => {
    const currentGen = ++queryGenRef.current;
    setLoading(true);
    setError(null);
    setIs410Expired(false);
    try {
      const res = await api.getReportRun(runId, { limit: 50 });
      if (queryGenRef.current !== currentGen) return; // Stale!
      setResult(res);

      // Pre-fill form from snapshot's normalizedQuery with authentic Shanghai conversions (N2)
      if (res.normalizedQuery) {
        hydrateFormFromQuery(res.normalizedQuery);
      }
    } catch (err: unknown) {
      if (queryGenRef.current !== currentGen) return;
      handleCatchError(err, '读取历史报表快照失败');
    } finally {
      if (queryGenRef.current === currentGen) {
        setLoading(false);
      }
    }
  };

  const loadFilterData = async () => {
    try {
      const [cRes, pRes, wRes] = await Promise.all([
        api.listCustomers({ limit: 100 }),
        api.listProducts({ limit: 100 }),
        api.listWarehouses(),
      ]);
      setCustomers(cRes.items);
      setProducts(pRes.items);
      setWarehouses(wRes.items);
    } catch (err: unknown) {
      console.warn('加载基础筛选资料失败', err);
    }
  };

  const handleKindChange = (newKind: ReportQuery['kind']) => {
    setKind(newKind);
    // Cleanup non-applicable filters for the new kind
    const allowed = KIND_ALLOWED_FILTERS[newKind];
    const newCust = allowed.customers ? selectedCustomerId : '';
    const newProd = allowed.products ? selectedProductId : '';
    const newWh = allowed.warehouses ? selectedWarehouseId : '';
    if (!allowed.customers) setSelectedCustomerId('');
    if (!allowed.products) setSelectedProductId('');
    if (!allowed.warehouses) setSelectedWarehouseId('');
    let newDecOnly = decreasesOnly;
    let newMinDecQty = minDecreaseQuantityBase;
    let newMinDecPct = minDecreasePercent;
    if (newKind !== 'customer_product_comparison') {
      newDecOnly = false;
      newMinDecQty = undefined;
      newMinDecPct = '';
      setDecreasesOnly(false);
      setMinDecreaseQuantityBase(undefined);
      setMinDecreasePercent('');
    }

    // Trigger explicit query for user-selected kind
    const q = buildQuery(newKind, {
      customerId: newCust,
      productId: newProd,
      warehouseId: newWh,
      decreasesOnly: newDecOnly,
      minDecreaseQuantityBase: newMinDecQty,
      minDecreasePercent: newMinDecPct,
    });
    void runExplicitQuery(q);
  };

  const buildQuery = (
    targetKind: ReportQuery['kind'] = kind,
    overrides?: {
      customerId?: string;
      productId?: string;
      warehouseId?: string;
      decreasesOnly?: boolean;
      minDecreaseQuantityBase?: number;
      minDecreasePercent?: string;
    }
  ): ReportQuery => {
    const allowed = KIND_ALLOWED_FILTERS[targetKind];
    const filters: ReportQuery['filters'] = {};

    const custId = overrides && overrides.customerId !== undefined ? overrides.customerId : selectedCustomerId;
    const prodId = overrides && overrides.productId !== undefined ? overrides.productId : selectedProductId;
    const whId = overrides && overrides.warehouseId !== undefined ? overrides.warehouseId : selectedWarehouseId;

    if (allowed.customers && custId) {
      filters.customerIds = [custId];
    }
    if (allowed.products && prodId) {
      filters.productIds = [prodId];
    }
    if (allowed.warehouses && whId) {
      filters.warehouseIds = [whId];
    }

    if (targetKind === 'customer_product_comparison') {
      const decOnly = overrides && overrides.decreasesOnly !== undefined ? overrides.decreasesOnly : decreasesOnly;
      const minQty = overrides && overrides.minDecreaseQuantityBase !== undefined ? overrides.minDecreaseQuantityBase : minDecreaseQuantityBase;
      const minPct = overrides && overrides.minDecreasePercent !== undefined ? overrides.minDecreasePercent : minDecreasePercent;
      if (decOnly) filters.decreasesOnly = true;
      if (typeof minQty === 'number' && minQty > 0) {
        filters.minDecreaseQuantityBase = minQty;
      }
      if (minPct.trim()) {
        filters.minDecreasePercent = minPct.trim();
      }
    }

    const targetIsPoint = targetKind === 'inventory' || targetKind === 'customer_balances';
    // Point kinds: send ONLY pointAsOf, NEVER period!
    if (targetIsPoint) {
      // Ensure Shanghai time with +08:00
      const pointIso = pointAsOfDate.includes('+')
        ? pointAsOfDate
        : `${pointAsOfDate}:00+08:00`;
      return {
        kind: targetKind,
        pointAsOf: pointIso,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      };
    }

    // Period kinds: send period, NEVER pointAsOf!
    let period: ReportQuery['period'] = { mode: periodMode };
    if (periodMode === 'mtd_previous') {
      period = { mode: 'mtd_previous' };
    } else if (periodMode === 'calendar_months') {
      // Enforce Shanghai midnight: YYYY-MM-DDT00:00:00+08:00
      period = {
        mode: 'calendar_months',
        start: toShanghaiStartOfDay(startDate),
        end: toShanghaiStartOfDay(endDate),
      };
    } else if (periodMode === 'custom') {
      period = {
        mode: 'custom',
        start: toShanghaiStartOfDay(startDate),
        end: toShanghaiStartOfDay(endDate),
      };
      if (targetKind === 'customer_product_comparison') {
        period.baselineStart = toShanghaiStartOfDay(baselineStartDate);
        period.baselineEnd = toShanghaiStartOfDay(baselineEndDate);
      }
    }

    const q: ReportQuery = {
      kind: targetKind,
      period,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    };

    if (targetKind === 'customer_product_comparison') {
      q.quantityBasis = quantityBasis;
    }

    return q;
  };

  const handleQuery = async () => {
    const currentGen = ++queryGenRef.current;
    setLoading(true);
    setError(null);
    setIs410Expired(false);
    try {
      const q = buildQuery();
      const res = await api.queryReport(q);
      if (queryGenRef.current !== currentGen) return; // Stale query, discard!
      setResult(res);
    } catch (err: unknown) {
      if (queryGenRef.current !== currentGen) return;
      handleCatchError(err, '报表统计查询失败');
    } finally {
      if (queryGenRef.current === currentGen) {
        setLoading(false);
      }
    }
  };

  const runExplicitQuery = async (q: ReportQuery) => {
    const currentGen = ++queryGenRef.current;
    setLoading(true);
    setError(null);
    setIs410Expired(false);
    try {
      const res = await api.queryReport(q);
      if (queryGenRef.current !== currentGen) return; // Stale explicit query, discard!
      setResult(res);
    } catch (err: unknown) {
      if (queryGenRef.current !== currentGen) return;
      handleCatchError(err, '执行指定报表查询失败');
    } finally {
      if (queryGenRef.current === currentGen) {
        setLoading(false);
      }
    }
  };

  const handleCatchError = (err: unknown, defaultMsg: string) => {
    const errMsg = err instanceof Error ? err.message : defaultMsg;
    if (
      errMsg.includes('410') ||
      errMsg.includes('SNAPSHOT_EXPIRED') ||
      (err as any)?.status === 410
    ) {
      setIs410Expired(true);
      setError('该统计快照已在服务端过期 (410 SNAPSHOT_EXPIRED)，请重新执行实时统计');
      setResult(null);
    } else {
      setError(errMsg);
    }
  };

  /**
   * Paging along the exact same report snapshot ID via getReportRun (with concurrency guards)
   */
  const handleLoadMoreRows = async () => {
    if (!result || !result.nextCursor || loadingMore) return;
    const targetReportId = result.id;
    const currentQueryGen = queryGenRef.current;
    const currentPaginationGen = ++paginationGenRef.current;
    setLoadingMore(true);
    try {
      const nextRun = await api.getReportRun(targetReportId, {
        cursor: result.nextCursor,
        limit: 50,
      });
      // R3: Guard against newer query or newer pagination request
      if (queryGenRef.current !== currentQueryGen || paginationGenRef.current !== currentPaginationGen) {
        return; // Stale!
      }
      setResult(prev => {
        if (!prev || prev.id !== targetReportId) {
          return prev; // Snapshot changed in between, discard!
        }
        return {
          ...nextRun,
          id: targetReportId,
          rows: [...(prev.rows as any[]), ...(nextRun.rows as any[])] as any,
        };
      });
    } catch (err: unknown) {
      if (queryGenRef.current !== currentQueryGen || paginationGenRef.current !== currentPaginationGen) return;
      handleCatchError(err, '加载下一页报表数据失败');
    } finally {
      if (paginationGenRef.current === currentPaginationGen) {
        setLoadingMore(false);
      }
    }
  };

  const handleOpenSources = async () => {
    if (!result) return;
    const targetId = result.id;
    setSourcesReportId(targetId);
    setSourcesModalOpen(true);
    setSourcesLoading(true);
    setSourcesError(null);
    const currentGen = ++sourcesGenRef.current;
    try {
      const res = await api.getReportSources(targetId, { limit: 50 });
      if (sourcesGenRef.current !== currentGen) return;
      setSources(res.items);
      setSourcesNextCursor(res.nextCursor);
    } catch (err: unknown) {
      if (sourcesGenRef.current !== currentGen) return;
      const errMsg = err instanceof Error ? err.message : '加载事实依据明细来源失败';
      if (errMsg.includes('410') || errMsg.includes('SNAPSHOT_EXPIRED') || (err as any)?.status === 410) {
        setIs410Expired(true);
        setSourcesError('该快照已在服务端过期 (410 SNAPSHOT_EXPIRED)');
      } else {
        setSourcesError(errMsg);
      }
    } finally {
      if (sourcesGenRef.current === currentGen) {
        setSourcesLoading(false);
      }
    }
  };

  const handleLoadMoreSources = async () => {
    if (!result || !sourcesNextCursor || sourcesLoadingMore) return;
    const targetId = sourcesReportId || result.id;
    const currentGen = ++sourcesGenRef.current;
    setSourcesLoadingMore(true);
    try {
      const res = await api.getReportSources(targetId, {
        cursor: sourcesNextCursor,
        limit: 50,
      });
      if (sourcesGenRef.current !== currentGen) return;
      setSources(prev => [...prev, ...res.items]);
      setSourcesNextCursor(res.nextCursor);
    } catch (err: unknown) {
      if (sourcesGenRef.current !== currentGen) return;
      setSourcesError(err instanceof Error ? err.message : '加载更多来源失败');
    } finally {
      if (sourcesGenRef.current === currentGen) {
        setSourcesLoadingMore(false);
      }
    }
  };

  const allowedFilters = KIND_ALLOWED_FILTERS[kind];

  return (
    <div className="reports-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ChartIcon size={22} />
            <span>经营统计与数据分析报表</span>
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            销售毛利、客户对比、库存结存、往来账本、资金流水与盘点损溢六类业务统计
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {onBackToAi && (
            <button type="button" onClick={onBackToAi} className="btn btn-secondary btn-sm">
              ← 返回 AI 智能报表
            </button>
          )}
          {initialReportRunId && (
            <span className="badge badge-warning" style={{ fontSize: '12px', padding: '4px 8px' }}>
              正在复核 AI 快照 #{initialReportRunId.substring(0, 8)}
            </span>
          )}
          {!isAdmin && (
            <span className="badge badge-warning" style={{ fontSize: '12px', padding: '4px 8px' }}>
              员工模式：成本与毛利受权限保护已隐藏
            </span>
          )}
        </div>
      </div>

      {/* Query Filter Box */}
      <div className="report-query-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Top row: Kind selector */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '13px', fontWeight: 600 }}>报表统计主题:</label>
            <select
              className="select"
              style={{ width: '240px', fontWeight: 500 }}
              value={kind}
              onChange={e => handleKindChange(e.target.value as ReportQuery['kind'])}
            >
              <option value="sales_summary">1. 销售与毛利汇总 (sales_summary)</option>
              <option value="customer_product_comparison">2. 客户商品对比 (customer_product_comparison)</option>
              <option value="inventory">3. 库存结存报表 (inventory)</option>
              <option value="customer_balances">4. 客户往来余额 (customer_balances)</option>
              <option value="cash_flow">5. 资金收退流水 (cash_flow)</option>
              <option value="inventory_loss">6. 盘点损益汇总 (inventory_loss)</option>
            </select>

            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {isPointKind ? '（时点结存类，仅发送 pointAsOf，禁止发送 period）' : '（期间发生额类，支持同期对比模式，禁止发送 pointAsOf）'}
            </span>
          </div>

          {/* Second row: Period or PointAsOf Controls */}
          <div className="report-filter-grid">
            {isPointKind ? (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                  结存统计时点 (pointAsOf, Asia/Shanghai)
                </label>
                <input
                  type="datetime-local"
                  className="input"
                  value={pointAsOfDate}
                  onChange={e => setPointAsOfDate(e.target.value)}
                />
              </div>
            ) : (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                    期间统计口径 (period.mode)
                  </label>
                  <select
                    className="select"
                    value={periodMode}
                    onChange={e => setPeriodMode(e.target.value as any)}
                  >
                    <option value="mtd_previous">本月至今对比上月同期 (mtd_previous)</option>
                    <option value="calendar_months">完整自然月度对比 (calendar_months)</option>
                    <option value="custom">自定义日期期间 (custom)</option>
                  </select>
                </div>

                {periodMode !== 'mtd_previous' && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                        本期开始日期 (上海自然日零点)
                      </label>
                      <input
                        type="date"
                        className="input"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                        本期截止日期 (右开边界)
                      </label>
                      <input
                        type="date"
                        className="input"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {kind === 'customer_product_comparison' && periodMode === 'custom' && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                        基期开始日期 (baselineStart)
                      </label>
                      <input
                        type="date"
                        className="input"
                        value={baselineStartDate}
                        onChange={e => setBaselineStartDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                        基期截止日期 (baselineEnd)
                      </label>
                      <input
                        type="date"
                        className="input"
                        value={baselineEndDate}
                        onChange={e => setBaselineEndDate(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {/* Catalog Filters: Whitelisted strictly by kind */}
            {allowedFilters.customers && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                  限定往来客户 (customerIds)
                </label>
                <select
                  className="select"
                  value={selectedCustomerId}
                  onChange={e => setSelectedCustomerId(e.target.value)}
                >
                  <option value="">全部客户</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {allowedFilters.products && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                  限定商品品项 (productIds)
                </label>
                <select
                  className="select"
                  value={selectedProductId}
                  onChange={e => setSelectedProductId(e.target.value)}
                >
                  <option value="">全部商品</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.mnemonicCode ? `(${p.mnemonicCode})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {allowedFilters.warehouses && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                  限定仓库归属 (warehouseIds)
                </label>
                <select
                  className="select"
                  value={selectedWarehouseId}
                  onChange={e => setSelectedWarehouseId(e.target.value)}
                >
                  <option value="">全部仓库</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Third row: Customer-Product Comparison specific options */}
          {kind === 'customer_product_comparison' && (
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 500, marginRight: '6px' }}>数量统计口径:</label>
                <select
                  className="select"
                  style={{ width: '130px', height: '28px', fontSize: '12px' }}
                  value={quantityBasis}
                  onChange={e => setQuantityBasis(e.target.value as any)}
                >
                  <option value="ordered">有效下单量 (ordered)</option>
                  <option value="net">净销量 (net)</option>
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={decreasesOnly}
                  onChange={e => setDecreasesOnly(e.target.checked)}
                />
                仅看销量下降商品客户 (decreasesOnly)
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px' }}>最小减少量:</span>
                <input
                  type="number"
                  min={0}
                  className="input"
                  style={{ width: '80px', height: '28px', fontSize: '12px' }}
                  value={minDecreaseQuantityBase ?? ''}
                  onChange={e => setMinDecreaseQuantityBase(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="基础单位"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px' }}>最小降幅(%):</span>
                <input
                  type="text"
                  className="input"
                  style={{ width: '70px', height: '28px', fontSize: '12px' }}
                  value={minDecreasePercent}
                  onChange={e => setMinDecreasePercent(e.target.value)}
                  placeholder="如 10"
                />
              </div>
            </div>
          )}

          {/* Action row */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={handleQuery}
              disabled={loading}
              className="btn btn-primary"
            >
              <ChartIcon size={16} />
              <span>{loading ? '正在计算中...' : '执行统计查询 (新快照)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 410 Expired Banner */}
      {is410Expired && (
        <div style={{ padding: '12px 16px', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--warning)', fontSize: '13px' }}>
            <AlertCircleIcon size={16} />
            <span>该快照已在服务端过期 (410 SNAPSHOT_EXPIRED)，请重新点击发起实时报表统计</span>
          </div>
          <button onClick={handleQuery} className="btn btn-secondary btn-sm">
            重新生成快照
          </button>
        </div>
      )}

      {error && !is410Expired && (
        <div style={{ padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Result Card */}
      {result && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '14px' }}>统计结果数据</span>
              <span className="badge badge-info" style={{ fontSize: '11px' }}>
                当前已载入 {result.rows?.length || 0} 行
              </span>
              {result.nextCursor && (
                <span className="badge badge-default" style={{ fontSize: '10px' }}>
                  有后续未展示数据
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleOpenSources}
                className="btn btn-secondary btn-sm"
              >
                <SearchIcon size={13} />
                <span>查看事实依据来源</span>
              </button>
              <button
                type="button"
                onClick={handleQuery}
                disabled={loading}
                className="btn btn-secondary btn-sm"
              >
                <RefreshCwIcon size={13} />
                <span>重新生成快照</span>
              </button>
            </div>
          </div>

          <ReportResultViewer
            result={result}
            isAdmin={isAdmin}
            onNavigateToSource={onNavigateToSource}
          />

          {/* Pagination: Load more rows along the exact same report ID */}
          {result.nextCursor && (
            <div style={{ padding: '14px', borderTop: '1px solid var(--border-default)', display: 'flex', justifyContent: 'center', background: 'var(--bg-surface-subtle)' }}>
              <button
                type="button"
                onClick={handleLoadMoreRows}
                disabled={loadingMore}
                className="btn btn-secondary btn-sm"
                style={{ minWidth: '180px' }}
              >
                {loadingMore ? '正在读取下一页快照数据...' : '加载更多数据 (下一页)'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Sources Drilldown Modal */}
      {sourcesModalOpen && result && (
        <SourcesModal
          reportId={result.id}
          sources={sources}
          nextCursor={sourcesNextCursor}
          loading={sourcesLoading}
          loadingMore={sourcesLoadingMore}
          error={sourcesError}
          onClose={() => setSourcesModalOpen(false)}
          onLoadMore={handleLoadMoreSources}
          onNavigateToSource={onNavigateToSource}
        />
      )}
    </div>
  );
}
