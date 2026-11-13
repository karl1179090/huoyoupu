import React, { useState, useEffect, useRef } from 'react';
import type { StockBalance, Batch, Warehouse, Product, Receipt } from '../../api/types.js';
import * as api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import {
  WarehouseIcon,
  PlusIcon,
  SearchIcon,
  RefreshCwIcon,
  ClipboardIcon,
  AlertCircleIcon,
} from '../../components/icons/index.js';
import { formatShanghaiDisplay, locateTargetAcrossPages } from '../finance/financeLogic.js';
import './inventory.css';

export interface InventoryListPageProps {
  onNavigateToReceipt: () => void;
  onNavigateToStocktake: () => void;
  onNavigateToSource?: (href: string) => void;
  initialReceiptId?: string;
  initialWarehouseId?: string;
  initialProductId?: string;
  initialBatchId?: string;
}

export function InventoryListPage({
  onNavigateToReceipt,
  onNavigateToStocktake,
  onNavigateToSource,
  initialReceiptId,
  initialWarehouseId,
  initialProductId,
  initialBatchId,
}: InventoryListPageProps) {
  const { isAdmin } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(initialWarehouseId || '');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductId || '');

  // View Mode: 'batches' | 'balances' | 'receipts'
  const [viewMode, setViewMode] = useState<'batches' | 'balances' | 'receipts'>(
    initialReceiptId ? 'receipts' : 'batches'
  );

  // Batches state & cursor
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchPositiveOnly, setBatchPositiveOnly] = useState<boolean>(true);
  const [batchNextCursor, setBatchNextCursor] = useState<string | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [loadingMoreBatches, setLoadingMoreBatches] = useState(false);

  // Balances state
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [balanceNextCursor, setBalanceNextCursor] = useState<string | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [loadingMoreBalances, setLoadingMoreBalances] = useState(false);

  // Receipts state & cursor
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptNextCursor, setReceiptNextCursor] = useState<string | null>(null);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [loadingMoreReceipts, setLoadingMoreReceipts] = useState(false);

  // Receipt Detail Modal
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);
  const [loadingReceiptDetail, setLoadingReceiptDetail] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Target Batch deep pagination lookup (P2)
  const [targetBatchNotFoundError, setTargetBatchNotFoundError] = useState<string | null>(null);
  const [locatingTargetBatch, setLocatingTargetBatch] = useState(false);

  // Scope & Generation guards (P2: prevents cross-warehouse / cross-filter stale response overwrites)
  const batchesScopeRef = useRef<{ warehouseId: string; productId: string; positiveOnly: boolean; generation: number }>({
    warehouseId: '',
    productId: '',
    positiveOnly: false,
    generation: 0,
  });

  const balancesScopeRef = useRef<{ warehouseId: string; productId: string; generation: number }>({
    warehouseId: '',
    productId: '',
    generation: 0,
  });

  const receiptsScopeRef = useRef<{ warehouseId: string; generation: number }>({
    warehouseId: '',
    generation: 0,
  });

  const receiptDetailScopeRef = useRef<{ receiptId: string; generation: number }>({
    receiptId: '',
    generation: 0,
  });

  useEffect(() => {
    void loadInitial();
  }, []);

  const loadInitial = async () => {
    try {
      const whs = await api.listAllWarehouses();
      setWarehouses(whs);
      const targetWhId = initialWarehouseId || whs.find(w => w.active)?.id || (whs.length > 0 ? whs[0]!.id : '');
      if (targetWhId) {
        setSelectedWarehouseId(targetWhId);
      }
      if (initialProductId) {
        setSelectedProductId(initialProductId);
      }

      // Exhaustively load products via nextCursor to avoid truncation
      const allProds: Product[] = [];
      let cursor: string | undefined = undefined;
      do {
        const pRes = await api.listProducts({ limit: 100, cursor });
        allProds.push(...pRes.items);
        cursor = pRes.nextCursor || undefined;
      } while (cursor);
      setProducts(allProds);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载基础资料失败');
    }
  };

  useEffect(() => {
    if (initialReceiptId) {
      setViewMode('receipts');
      void handleOpenReceiptDetail(initialReceiptId);
    }
  }, [initialReceiptId]);

  useEffect(() => {
    if (initialWarehouseId && initialWarehouseId !== selectedWarehouseId) {
      setSelectedWarehouseId(initialWarehouseId);
    }
    if (initialProductId && initialProductId !== selectedProductId) {
      setSelectedProductId(initialProductId);
    }
    if (initialBatchId) {
      setViewMode('batches');
      setBatchPositiveOnly(false);
    }
  }, [initialWarehouseId, initialProductId, initialBatchId]);

  // Cross-page search to locate target initialBatchId (B6 P2: resilient against self-cancellation)
  const locateBatchGenRef = useRef(0);
  const batchesRef = useRef<Batch[]>([]);
  batchesRef.current = batches;
  const batchNextCursorRef = useRef<string | null>(null);
  batchNextCursorRef.current = batchNextCursor;

  useEffect(() => {
    if (!initialBatchId || !selectedWarehouseId || viewMode !== 'batches') {
      setTargetBatchNotFoundError(null);
      return;
    }

    if (loadingBatches) {
      return; // Wait for initial page 1 load to finish
    }

    const currentBatches = batchesRef.current.length > 0 ? batchesRef.current : batches;
    const currentCursor = batchNextCursorRef.current ?? batchNextCursor;

    if (currentBatches.some(b => b.id === initialBatchId)) {
      setTargetBatchNotFoundError(null);
      return;
    }

    if (!currentCursor) {
      if (currentBatches.length > 0) {
        setTargetBatchNotFoundError(`未在当前仓库/商品批次中找到指定来源批次: #${initialBatchId}`);
      }
      return;
    }

    let cancelled = false;
    const currentGen = ++locateBatchGenRef.current;
    const whId = selectedWarehouseId;
    const prodId = selectedProductId;
    const targetId = initialBatchId;

    async function runLocate() {
      setLocatingTargetBatch(true);
      setTargetBatchNotFoundError(null);
      try {
        const result = await locateTargetAcrossPages({
          targetId,
          initialCursor: currentCursor,
          fetchPage: async (cursor) => {
            return api.listBatches({
              warehouseId: whId,
              productId: prodId || undefined,
              positiveOnly: false, // Ensure depleted historical batches are searchable
              limit: 50,
              cursor,
            });
          },
          matchesTarget: (item, tid) => item.id === tid,
          maxPages: 10,
          isCancelled: () => cancelled || locateBatchGenRef.current !== currentGen || batchesScopeRef.current.warehouseId !== whId,
          onPageFetched: (items, nextCursor) => {
            batchesRef.current = [...batchesRef.current, ...items];
            batchNextCursorRef.current = nextCursor;
            setBatches(prev => [...prev, ...items]);
            setBatchNextCursor(nextCursor);
          },
        });

        if (cancelled || locateBatchGenRef.current !== currentGen || batchesScopeRef.current.warehouseId !== whId) {
          return;
        }

        if (!result.found && !result.finalNextCursor) {
          setTargetBatchNotFoundError(`未在当前仓库/商品批次中找到指定来源批次: #${targetId}`);
        }
      } catch (err: unknown) {
        if (!cancelled && locateBatchGenRef.current === currentGen) {
          setTargetBatchNotFoundError(`定位目标批次失败: #${targetId}`);
        }
      } finally {
        if (locateBatchGenRef.current === currentGen) {
          setLocatingTargetBatch(false);
        }
      }
    }

    void runLocate();

    return () => {
      cancelled = true;
    };
  }, [initialBatchId, selectedWarehouseId, selectedProductId, viewMode, loadingBatches]);

  useEffect(() => {
    if (selectedWarehouseId) {
      if (viewMode === 'batches') {
        void loadBatches(selectedWarehouseId, selectedProductId, batchPositiveOnly, true);
      } else if (viewMode === 'balances') {
        void loadBalances(selectedWarehouseId, selectedProductId, true);
      } else if (viewMode === 'receipts') {
        void loadReceipts(selectedWarehouseId, true);
      }
    }
  }, [selectedWarehouseId, selectedProductId, viewMode, batchPositiveOnly]);

  const loadBatches = async (whId: string, prodId: string, positiveOnly: boolean, reset: boolean) => {
    const gen = ++batchesScopeRef.current.generation;
    batchesScopeRef.current.warehouseId = whId;
    batchesScopeRef.current.productId = prodId;
    batchesScopeRef.current.positiveOnly = positiveOnly;

    if (reset) {
      setBatches([]);
      setBatchNextCursor(null);
      setLoadingBatches(true);
      setError(null);
    } else {
      setLoadingMoreBatches(true);
    }
    try {
      const cursor = reset ? undefined : (batchNextCursor || undefined);
      const res = await api.listBatches({
        warehouseId: whId,
        productId: prodId || undefined,
        positiveOnly,
        limit: 50,
        cursor,
      });
      if (
        batchesScopeRef.current.generation !== gen ||
        batchesScopeRef.current.warehouseId !== whId ||
        batchesScopeRef.current.productId !== prodId ||
        batchesScopeRef.current.positiveOnly !== positiveOnly
      ) {
        return; // Discard stale response
      }
      if (reset) {
        setBatches(res.items);
        batchesRef.current = res.items;
      } else {
        setBatches(prev => [...prev, ...res.items]);
        batchesRef.current = [...batchesRef.current, ...res.items];
      }
      setBatchNextCursor(res.nextCursor);
      batchNextCursorRef.current = res.nextCursor;
    } catch (err: unknown) {
      if (
        batchesScopeRef.current.generation !== gen ||
        batchesScopeRef.current.warehouseId !== whId
      ) {
        return;
      }
      setError(err instanceof Error ? err.message : '加载批次数据失败');
    } finally {
      if (
        batchesScopeRef.current.generation === gen &&
        batchesScopeRef.current.warehouseId === whId
      ) {
        setLoadingBatches(false);
        setLoadingMoreBatches(false);
      }
    }
  };

  const loadBalances = async (whId: string, prodId: string, reset: boolean) => {
    const gen = ++balancesScopeRef.current.generation;
    balancesScopeRef.current.warehouseId = whId;
    balancesScopeRef.current.productId = prodId;

    if (reset) {
      setBalances([]);
      setBalanceNextCursor(null);
      setLoadingBalances(true);
      setError(null);
    } else {
      setLoadingMoreBalances(true);
    }
    try {
      const cursor = reset ? undefined : (balanceNextCursor || undefined);
      const res = await api.getStockBalances({
        warehouseId: whId,
        productId: prodId || undefined,
        limit: 50,
        cursor,
      });
      if (
        balancesScopeRef.current.generation !== gen ||
        balancesScopeRef.current.warehouseId !== whId ||
        balancesScopeRef.current.productId !== prodId
      ) {
        return; // Discard stale response
      }
      if (reset) {
        setBalances(res.items);
      } else {
        setBalances(prev => [...prev, ...res.items]);
      }
      setBalanceNextCursor(res.nextCursor || null);
    } catch (err: unknown) {
      if (
        balancesScopeRef.current.generation !== gen ||
        balancesScopeRef.current.warehouseId !== whId
      ) {
        return;
      }
      setError(err instanceof Error ? err.message : '加载汇总数据失败');
    } finally {
      if (
        balancesScopeRef.current.generation === gen &&
        balancesScopeRef.current.warehouseId === whId
      ) {
        setLoadingBalances(false);
        setLoadingMoreBalances(false);
      }
    }
  };

  const loadReceipts = async (whId: string, reset: boolean) => {
    const gen = ++receiptsScopeRef.current.generation;
    receiptsScopeRef.current.warehouseId = whId;

    if (reset) {
      setReceipts([]);
      setReceiptNextCursor(null);
      setLoadingReceipts(true);
      setError(null);
    } else {
      setLoadingMoreReceipts(true);
    }
    try {
      const cursor = reset ? undefined : (receiptNextCursor || undefined);
      const res = await api.listReceipts({
        warehouseId: whId,
        limit: 50,
        cursor,
      });
      if (
        receiptsScopeRef.current.generation !== gen ||
        receiptsScopeRef.current.warehouseId !== whId
      ) {
        return; // Discard stale response
      }
      if (reset) {
        setReceipts(res.items);
      } else {
        setReceipts(prev => [...prev, ...res.items]);
      }
      setReceiptNextCursor(res.nextCursor);
    } catch (err: unknown) {
      if (
        receiptsScopeRef.current.generation !== gen ||
        receiptsScopeRef.current.warehouseId !== whId
      ) {
        return;
      }
      setError(err instanceof Error ? err.message : '加载入库单列表失败');
    } finally {
      if (
        receiptsScopeRef.current.generation === gen &&
        receiptsScopeRef.current.warehouseId === whId
      ) {
        setLoadingReceipts(false);
        setLoadingMoreReceipts(false);
      }
    }
  };

  const handleOpenReceiptDetail = async (receiptId: string) => {
    const gen = ++receiptDetailScopeRef.current.generation;
    receiptDetailScopeRef.current.receiptId = receiptId;
    setActiveReceipt(null);
    setLoadingReceiptDetail(true);
    try {
      const detail = await api.getReceipt(receiptId);
      if (receiptDetailScopeRef.current.generation !== gen || receiptDetailScopeRef.current.receiptId !== receiptId) {
        return;
      }
      setActiveReceipt(detail);
    } catch (err: unknown) {
      if (receiptDetailScopeRef.current.generation !== gen || receiptDetailScopeRef.current.receiptId !== receiptId) {
        return;
      }
      alert(err instanceof Error ? err.message : '获取入库单详情失败');
    } finally {
      if (receiptDetailScopeRef.current.generation === gen && receiptDetailScopeRef.current.receiptId === receiptId) {
        setLoadingReceiptDetail(false);
      }
    }
  };

  const handleCloseReceiptDetail = () => {
    receiptDetailScopeRef.current.generation++;
    receiptDetailScopeRef.current.receiptId = '';
    setActiveReceipt(null);
  };

  const getProductName = (prodId: string) => {
    const p = products.find(x => x.id === prodId);
    return p ? `${p.name} (${p.specification || '标准'})` : prodId.substring(0, 8);
  };

  const getWarehouseName = (whId: string) => {
    const w = warehouses.find(x => x.id === whId);
    return w ? `${w.name} (${w.code})` : whId.substring(0, 8);
  };

  const currentWarehouse = warehouses.find(w => w.id === selectedWarehouseId);

  return (
    <div className="inv-container">
      {/* Header */}
      <div className="inv-header">
        <div className="inv-header-title">
          <h1>库存余量、批次与入库台账</h1>
          <p>
            分仓不可变批次台账，记录实际入库成本与不可伪造流水，支持在库与耗尽批次游标检索
          </p>
        </div>

        <div className="inv-header-actions">
          <button onClick={onNavigateToStocktake} className="btn btn-secondary">
            <ClipboardIcon size={16} />
            <span>实盘盘点工作台</span>
          </button>
          <button onClick={onNavigateToReceipt} className="btn btn-primary">
            <PlusIcon size={16} />
            <span>采购 / 期初入库登账</span>
          </button>
        </div>
      </div>

      {targetBatchNotFoundError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px' }}>
          <AlertCircleIcon size={16} />
          <span>{targetBatchNotFoundError}</span>
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px' }}>
          <AlertCircleIcon size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Tab Toolbar */}
      <div className="card">
        <div className="inv-filter-card">
          <div className="inv-filter-group">
            <span className="inv-filter-label">选择仓库:</span>
            <select
              className="select"
              style={{ width: '190px' }}
              value={selectedWarehouseId}
              onChange={e => setSelectedWarehouseId(e.target.value)}
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code}) {!w.active ? '[已停用]' : ''}
                </option>
              ))}
            </select>

            <span className="inv-filter-label" style={{ marginLeft: '6px' }}>商品筛选:</span>
            <select
              className="select"
              style={{ width: '200px' }}
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
            >
              <option value="">全部商品</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.specification || '标准'})
                </option>
              ))}
            </select>

            {viewMode === 'batches' && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', marginLeft: '6px' }}>
                <input
                  type="checkbox"
                  checked={batchPositiveOnly}
                  onChange={e => setBatchPositiveOnly(e.target.checked)}
                />
                <span>仅看在库批次 (余量 &gt; 0)</span>
              </label>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="inv-tabs">
              <button
                onClick={() => setViewMode('batches')}
                className={`inv-tab-btn ${viewMode === 'batches' ? 'active' : ''}`}
              >
                分批次余量明细
              </button>
              <button
                onClick={() => setViewMode('balances')}
                className={`inv-tab-btn ${viewMode === 'balances' ? 'active' : ''}`}
              >
                商品仓汇总
              </button>
              <button
                onClick={() => setViewMode('receipts')}
                className={`inv-tab-btn ${viewMode === 'receipts' ? 'active' : ''}`}
              >
                入库单记录
              </button>
            </div>

            <button
              onClick={() => {
                if (viewMode === 'batches') void loadBatches(selectedWarehouseId, selectedProductId, batchPositiveOnly, true);
                else if (viewMode === 'balances') void loadBalances(selectedWarehouseId, selectedProductId, true);
                else if (viewMode === 'receipts') void loadReceipts(selectedWarehouseId, true);
              }}
              className="btn btn-ghost btn-sm"
              title="刷新数据"
            >
              <RefreshCwIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="inv-table-wrapper">
        {viewMode === 'batches' && (
          <div>
            <table className="table">
              <thead>
                <tr>
                  <th>批次编号</th>
                  <th>商品名称与规格</th>
                  <th>批次来源</th>
                  <th>实际入库时间</th>
                  <th>系统登账时间</th>
                  <th className="text-right">可用基础库存</th>
                  {isAdmin && <th className="text-right">实际单位进价成本</th>}
                  {isAdmin && <th className="text-right">库存总成本 (元)</th>}
                </tr>
              </thead>
              <tbody>
                {loadingBatches && batches.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-subtle)' }}>正在加载批次余量...</td></tr>
                ) : batches.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-subtle)' }}>该仓库当前无匹配批次记录</td></tr>
                ) : (
                  batches.map(b => {
                    const isExhausted = b.quantityBase <= 0;
                    const isTarget = b.id === initialBatchId;
                    return (
                      <tr
                        key={b.id}
                        id={`batch-${b.id}`}
                        style={{
                          background: isTarget ? 'var(--primary-bg, #eff6ff)' : (isExhausted ? 'var(--bg-surface-subtle)' : undefined),
                          opacity: isExhausted && !isTarget ? 0.65 : 1,
                          outline: isTarget ? '2px solid var(--primary, #2563eb)' : undefined,
                        }}
                      >
                        <td style={{ fontWeight: 600 }} className="font-mono">#{b.id.substring(0, 8)}</td>
                        <td style={{ fontWeight: 600 }}>{getProductName(b.productId)}</td>
                        <td>
                          <span className={`badge ${b.sourceKind === 'receipt' ? 'badge-info' : b.sourceKind === 'stocktake_gain' ? 'badge-success' : 'badge-default'}`}>
                            {b.sourceKind === 'receipt' ? '入库单' : b.sourceKind === 'stocktake_gain' ? '盘盈入库' : b.sourceKind}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px' }}>{formatShanghaiDisplay(b.receivedAt)}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatShanghaiDisplay(b.recordedAt)}</td>
                        <td className="tabular-nums text-right" style={{ fontWeight: 700 }}>
                          {isExhausted ? (
                            <span style={{ color: 'var(--text-subtle)' }}>已耗尽 (0)</span>
                          ) : (
                            <span style={{ color: 'var(--success)' }}>{b.quantityBase}</span>
                          )}
                        </td>
                        {isAdmin && <td className="tabular-nums text-right">¥{b.unitCost}</td>}
                        {isAdmin && <td className="tabular-nums text-right" style={{ fontWeight: 600 }}>¥{b.costAmount}</td>}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Pagination footer */}
            <div className="inv-table-footer">
              <span>已加载 {batches.length} 条批次记录</span>
              {batchNextCursor && (
                <button
                  onClick={() => void loadBatches(selectedWarehouseId, selectedProductId, batchPositiveOnly, false)}
                  disabled={loadingMoreBatches}
                  className="btn btn-secondary btn-sm"
                >
                  {loadingMoreBatches ? '正在加载更多...' : '加载更多批次 (游标分页)'}
                </button>
              )}
            </div>
          </div>
        )}

        {viewMode === 'balances' && (
          <div>
            <table className="table">
              <thead>
                <tr>
                  <th>商品名称与规格</th>
                  <th className="text-right">汇总在库数量 (基础单位)</th>
                  {isAdmin && <th className="text-right">库存总成本 (元)</th>}
                </tr>
              </thead>
              <tbody>
                {loadingBalances && balances.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-subtle)' }}>正在加载商品汇总...</td></tr>
                ) : balances.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-subtle)' }}>该仓库当前无商品汇总记录</td></tr>
                ) : (
                  balances.map((bal, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{getProductName(bal.productId)}</td>
                      <td className="tabular-nums text-right" style={{ fontWeight: 700, color: bal.quantityBase > 0 ? 'var(--text-main)' : 'var(--text-subtle)' }}>
                        {bal.quantityBase}
                      </td>
                      {isAdmin && <td className="tabular-nums text-right" style={{ fontWeight: 600, color: 'var(--accent)' }}>¥{bal.costAmount}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Balances Pagination footer */}
            <div className="inv-table-footer">
              <span>已加载 {balances.length} 条商品汇总</span>
              {balanceNextCursor && (
                <button
                  onClick={() => void loadBalances(selectedWarehouseId, selectedProductId, false)}
                  disabled={loadingMoreBalances}
                  className="btn btn-secondary btn-sm"
                >
                  {loadingMoreBalances ? '正在加载更多...' : '加载更多汇总 (游标分页)'}
                </button>
              )}
            </div>
          </div>
        )}

        {viewMode === 'receipts' && (
          <div>
            <table className="table">
              <thead>
                <tr>
                  <th>入库单号</th>
                  <th>业务类型</th>
                  <th>目标仓库</th>
                  <th>实际入库时间</th>
                  <th>系统登账时间</th>
                  <th>供应商 / 凭证号</th>
                  <th>明细行数</th>
                  <th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {loadingReceipts && receipts.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-subtle)' }}>正在加载入库单列表...</td></tr>
                ) : receipts.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-subtle)' }}>暂无入库单记录</td></tr>
                ) : (
                  receipts.map(rcpt => (
                    <tr key={rcpt.id}>
                      <td style={{ fontWeight: 700 }} className="font-mono">{rcpt.receiptNo}</td>
                      <td>
                        <span className={`badge ${rcpt.kind === 'purchase' ? 'badge-primary' : 'badge-default'}`}>
                          {rcpt.kind === 'purchase' ? '采购入库' : '期初入库'}
                        </span>
                      </td>
                      <td>{getWarehouseName(rcpt.warehouseId)}</td>
                      <td style={{ fontSize: '12px' }}>{formatShanghaiDisplay(rcpt.receivedAt)}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatShanghaiDisplay(rcpt.recordedAt)}</td>
                      <td>{rcpt.supplierReference || '—'}</td>
                      <td>{rcpt.lines.length} 行</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => void handleOpenReceiptDetail(rcpt.id)}
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '12px' }}
                        >
                          查看明细
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination footer */}
            <div className="inv-table-footer">
              <span>已加载 {receipts.length} 张入库单</span>
              {receiptNextCursor && (
                <button
                  onClick={() => void loadReceipts(selectedWarehouseId, false)}
                  disabled={loadingMoreReceipts}
                  className="btn btn-secondary btn-sm"
                >
                  {loadingMoreReceipts ? '正在加载更多...' : '加载更多入库单 (游标分页)'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Receipt Detail Modal */}
      {activeReceipt && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '780px', width: '92%' }}>
            <div className="modal-header">
              <div>
                <span style={{ fontWeight: 700, fontSize: '16px' }}>入库单详情: {activeReceipt.receiptNo}</span>
                <span className={`badge ${activeReceipt.kind === 'purchase' ? 'badge-primary' : 'badge-default'}`} style={{ marginLeft: '8px' }}>
                  {activeReceipt.kind === 'purchase' ? '采购入库' : '期初入库'}
                </span>
              </div>
              <button onClick={handleCloseReceiptDetail} className="btn btn-ghost btn-sm">✕</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Meta Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', background: 'var(--bg-surface-subtle)', padding: '12px', borderRadius: 'var(--radius-sm)', fontSize: '12px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>目标仓库: </span>
                  <span style={{ fontWeight: 600 }}>{getWarehouseName(activeReceipt.warehouseId)}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>实际发生时间: </span>
                  <span style={{ fontWeight: 600 }}>{formatShanghaiDisplay(activeReceipt.receivedAt)}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>系统登账时间: </span>
                  <span style={{ fontWeight: 600 }}>{formatShanghaiDisplay(activeReceipt.recordedAt)}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>供应商凭据: </span>
                  <span style={{ fontWeight: 600 }}>{activeReceipt.supplierReference || '无'}</span>
                </div>
              </div>

              {/* Lines Table */}
              <table className="table" style={{ fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>商品与规格</th>
                    <th className="text-right">入库数量</th>
                    <th className="text-right">折合基础数量</th>
                    {isAdmin && <th className="text-right">实际单位进价成本</th>}
                    {isAdmin && <th className="text-right">成本总额 (元)</th>}
                    <th>生成批次标识</th>
                  </tr>
                </thead>
                <tbody>
                  {activeReceipt.lines.map((line, idx) => (
                    <tr key={line.id}>
                      <td>{idx + 1}</td>
                      <td style={{ fontWeight: 600 }}>{getProductName(line.productId)}</td>
                      <td className="tabular-nums text-right" style={{ fontWeight: 600 }}>
                        {line.quantity}
                      </td>
                      <td className="tabular-nums text-right">{line.quantityBase}</td>
                      {isAdmin && <td className="tabular-nums text-right">¥{line.unitCost}</td>}
                      {isAdmin && <td className="tabular-nums text-right" style={{ fontWeight: 600 }}>¥{line.costAmount}</td>}
                      <td className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        #{line.batchId.substring(0, 8)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-footer">
              <button onClick={handleCloseReceiptDetail} className="btn btn-secondary">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
