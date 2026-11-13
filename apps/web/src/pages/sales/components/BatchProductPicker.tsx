import React, { useState, useEffect, useRef } from 'react';
import type {
  Product,
  Warehouse,
  Batch,
  Unit,
} from '../../../api/types.js';
import {
  type PickerLineItem,
  type SessionTracker,
  validateQuantityInput,
  updateBatchAllocation,
  switchAllocationMode,
  applyPriceQuoteToLine,
  validateSession,
  createSessionTracker,
  bumpSession,
  isSessionCurrent,
  addLineToSession,
} from './batchPickerLogic.js';
import * as api from '../../../api/client.js';
import { useAuth } from '../../../context/AuthContext.js';
import {
  SearchIcon,
  XIcon,
  PlusIcon,
  TrashIcon,
  CheckIcon,
  AlertCircleIcon,
  BoxIcon,
  CartIcon,
} from '../../../components/icons/index.js';

export type { PickerLineItem } from './batchPickerLogic.js';

interface BatchProductPickerProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  warehouses: Warehouse[];
  onConfirm: (newLines: PickerLineItem[]) => void;
}

export function BatchProductPicker({
  isOpen,
  onClose,
  customerId,
  warehouses,
  onConfirm,
}: BatchProductPickerProps) {
  const { isAdmin } = useAuth();
  const [mobileTab, setMobileTab] = useState<'catalog' | 'selected'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // The persistent session state for all lines chosen in this modal session
  const [sessionLines, setSessionLines] = useState<PickerLineItem[]>([]);

  // Cached batches per product+warehouse
  const [batchCache, setBatchCache] = useState<Record<string, Batch[]>>({});
  const [loadingBatches, setLoadingBatches] = useState<Record<string, boolean>>({});

  // Production Session Tracker to prevent late async responses from leaking across cancellations
  const sessionTrackerRef = useRef<SessionTracker>(createSessionTracker());
  // Unit change request counter per line to prevent race conditions
  const lineReqSeqRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!isOpen) {
      bumpSession(sessionTrackerRef.current);
      setSearchQuery('');
      setSessionLines([]);
      setSelectedProduct(null);
      setMobileTab('catalog');
      return;
    }
    const curGen = bumpSession(sessionTrackerRef.current);
    void searchProducts('', curGen);
  }, [isOpen]);

  const searchProducts = async (q: string, targetGen?: number) => {
    const curGen = targetGen ?? sessionTrackerRef.current.gen;
    setLoading(true);
    try {
      const res = await api.listProducts({ q: q.trim() || undefined, limit: 50, includeInactive: false });
      if (!isSessionCurrent(sessionTrackerRef.current, curGen)) return;
      setProducts(res.items);
      if (res.items.length > 0 && !selectedProduct) {
        setSelectedProduct(res.items[0]!);
      }
    } catch {
      // Keep state
    } finally {
      if (isSessionCurrent(sessionTrackerRef.current, curGen)) setLoading(false);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    void searchProducts(val);
  };

  const loadBatchesFor = async (productId: string, warehouseId: string) => {
    const key = `${productId}:${warehouseId}`;
    if (batchCache[key] || loadingBatches[key]) return;
    setLoadingBatches(prev => ({ ...prev, [key]: true }));
    try {
      const res = await api.listBatches({ productId, warehouseId, positiveOnly: true, limit: 100 });
      setBatchCache(prev => ({ ...prev, [key]: res.items }));
    } catch {
      setBatchCache(prev => ({ ...prev, [key]: [] }));
    } finally {
      setLoadingBatches(prev => ({ ...prev, [key]: false }));
    }
  };

  // Add a product to the session list with generation protection
  const addProductToSession = async (prod: Product) => {
    const curGen = sessionTrackerRef.current.gen;
    const defaultWarehouseId = warehouses[0]?.id || '';
    const defaultUnit = prod.units.find(u => u.id === prod.baseUnitId) || prod.units[0];
    const unitId = defaultUnit?.id || '';

    let initialPrice = defaultUnit?.defaultSalePrice || '0.00';
    let source = '默认价';

    if (customerId && unitId) {
      try {
        const quote = await api.getCustomerPriceQuote(customerId, { productId: prod.id, unitId });
        if (!isSessionCurrent(sessionTrackerRef.current, curGen)) return;
        initialPrice = quote.unitPrice;
        source = quote.source === 'history' ? '历史成交价' : quote.source === 'customer_rule' ? '专属价' : '默认价';
      } catch {
        // Fallback to default
      }
    }

    if (!isSessionCurrent(sessionTrackerRef.current, curGen)) return;

    const newLine: PickerLineItem = {
      clientLineId: 'line-' + Math.random().toString(36).substring(2, 9),
      productId: prod.id,
      productName: prod.name,
      specification: prod.specification,
      warehouseId: defaultWarehouseId,
      unitId,
      quantity: 1,
      quantityRaw: '1',
      unitPrice: initialPrice,
      priceEdited: false,
      allocationMode: 'auto',
      batchSelections: [],
      units: prod.units,
      baseUnitId: prod.baseUnitId,
      priceSource: source,
    };

    setSessionLines(prev => addLineToSession(prev, newLine));
    if (defaultWarehouseId) {
      void loadBatchesFor(prod.id, defaultWarehouseId);
    }
  };

  const updateLine = (clientLineId: string, patch: Partial<PickerLineItem>) => {
    setSessionLines(prev =>
      prev.map(item => {
        if (item.clientLineId !== clientLineId) return item;
        const updated = { ...item, ...patch };

        // If warehouse changed, clear previous batches and reload
        if (patch.warehouseId && patch.warehouseId !== item.warehouseId) {
          updated.batchSelections = [];
          void loadBatchesFor(item.productId, patch.warehouseId);
        }

        // If unit changed, fetch recommended price for new unit with race protection
        if (patch.unitId && patch.unitId !== item.unitId && customerId) {
          const reqSeq = (lineReqSeqRef.current[clientLineId] || 0) + 1;
          lineReqSeqRef.current[clientLineId] = reqSeq;
          const targetUnitId = patch.unitId;

          void api.getCustomerPriceQuote(customerId, { productId: item.productId, unitId: targetUnitId })
            .then(q => {
              if (lineReqSeqRef.current[clientLineId] !== reqSeq) return;
              const source = q.source === 'history' ? '历史成交价' : q.source === 'customer_rule' ? '专属价' : '默认价';
              setSessionLines(curr =>
                curr.map(l => {
                  if (l.clientLineId !== clientLineId) return l;
                  return applyPriceQuoteToLine(l, q.unitPrice, source, targetUnitId);
                })
              );
            })
            .catch(() => {});
        }

        return updated;
      })
    );
  };

  const handleQuantityInputChange = (clientLineId: string, rawVal: string) => {
    const { quantity, quantityError } = validateQuantityInput(rawVal);
    updateLine(clientLineId, {
      quantity,
      quantityRaw: rawVal,
      quantityError,
    });
  };

  const removeLine = (clientLineId: string) => {
    setSessionLines(prev => prev.filter(l => l.clientLineId !== clientLineId));
  };

  const duplicateLine = (item: PickerLineItem) => {
    const clone: PickerLineItem = {
      ...item,
      clientLineId: 'line-' + Math.random().toString(36).substring(2, 9),
      batchSelections: [],
      priceEdited: false,
    };
    setSessionLines(prev => addLineToSession(prev, clone));
  };

  // Validate entire session before confirming
  const validation = validateSession(sessionLines, batchCache);

  const handleConfirm = () => {
    if (!validation.valid) return;
    onConfirm(sessionLines);
    bumpSession(sessionTrackerRef.current);
    onClose();
  };

  const handleCancel = () => {
    bumpSession(sessionTrackerRef.current);
    setSessionLines([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-full">
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BoxIcon size={20} style={{ color: 'var(--accent)' }} />
            <div>
              <span style={{ fontWeight: 600, fontSize: '16px' }}>批量选品与配置</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '10px' }}>
                在同一会话中多选商品、分仓设价、多批次分配
              </span>
            </div>
          </div>
          <button onClick={handleCancel} className="btn btn-ghost btn-sm" style={{ padding: '4px' }}>
            <XIcon size={18} />
          </button>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="hide-desktop" style={{ padding: '8px 16px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', padding: '3px', border: '1px solid var(--border-default)' }}>
            <button
              type="button"
              onClick={() => setMobileTab('catalog')}
              className={`btn btn-sm ${mobileTab === 'catalog' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1, fontSize: '12px', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <SearchIcon size={14} />
              <span>浏览商品 ({products.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('selected')}
              className={`btn btn-sm ${mobileTab === 'selected' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1, fontSize: '12px', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <CartIcon size={14} />
              <span>已选配置 ({sessionLines.length}行)</span>
            </button>
          </div>
        </div>

        {/* Modal Body: Responsive Split View */}
        <div className="modal-body picker-modal-body" style={{ padding: '16px', display: 'flex', gap: '16px', overflow: 'hidden' }}>
          {/* Left Column: Product Search */}
          <div className={`picker-catalog-col ${mobileTab === 'selected' ? 'picker-col-hidden-mobile' : ''}`} style={{ gap: '10px' }}>
            <div style={{ position: 'relative' }}>
              <SearchIcon size={16} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-subtle)' }} />
              <input
                type="text"
                autoFocus
                className="input"
                style={{ paddingLeft: '32px' }}
                placeholder="搜索商品名称、规格、条码或助记码(如 500mljy)..."
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
              />
            </div>

            <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface)' }}>
              {loading && products.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '13px' }}>搜索商品中...</div>
              ) : products.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '13px' }}>未找到匹配商品</div>
              ) : (
                products.map(prod => {
                  const isFocused = selectedProduct?.id === prod.id;
                  const addedCount = sessionLines.filter(l => l.productId === prod.id).length;
                  return (
                    <div
                      key={prod.id}
                      onClick={() => setSelectedProduct(prod)}
                      style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--border-light)',
                        cursor: 'pointer',
                        backgroundColor: isFocused ? 'var(--accent-subtle)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1, paddingRight: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {prod.name}
                          </span>
                          {prod.mnemonicCode && (
                            <span className="badge badge-default" style={{ fontSize: '10px' }}>{prod.mnemonicCode}</span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          规格: {prod.specification || '标准'} · 编码: {prod.code}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {addedCount > 0 && (
                          <span className="badge badge-info" style={{ fontSize: '11px' }}>
                            已选 {addedCount} 行
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void addProductToSession(prod);
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px' }}
                          title="加入选品清单"
                        >
                          <PlusIcon size={14} />
                          <span>添加</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Selected Lines */}
          <div className={`picker-selected-col ${mobileTab === 'catalog' ? 'picker-col-hidden-mobile' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-main)' }}>
                  本次选品清单 ({sessionLines.length} 行配置)
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-subtle)', marginLeft: '8px' }}>
                  切换或搜索商品保留已选项与配置
                </span>
              </div>
              {sessionLines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSessionLines([])}
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--danger)' }}
                >
                  清空清单
                </button>
              )}
            </div>

            {/* Validation alerts */}
            {!validation.valid && validation.errors.length > 0 && (
              <div style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px', marginBottom: '8px' }}>
                <div style={{ fontWeight: 600, marginBottom: '2px' }}>选品配置存在未完成项：</div>
                {validation.errors.slice(0, 3).map((err, i) => (
                  <div key={i}>· {err}</div>
                ))}
              </div>
            )}

            <div className="picker-lines-scroll" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
              {sessionLines.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border-default)', borderRadius: 'var(--radius-md)', padding: '40px', color: 'var(--text-subtle)' }}>
                  <BoxIcon size={36} style={{ color: 'var(--border-strong)', marginBottom: '10px' }} />
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>选品清单为空</div>
                  <div style={{ fontSize: '12px', marginTop: '4px' }}>从左侧选择商品并点击“添加”，可在同一会话批量配置多行</div>
                </div>
              ) : (
                sessionLines.map((line, idx) => {
                  const currentUnit = line.units.find(u => u.id === line.unitId) || line.units[0];
                  const multiplier = currentUnit?.multiplierBase || 1;
                  const targetBaseQty = line.quantity * multiplier;
                  const batchKey = `${line.productId}:${line.warehouseId}`;
                  const availableBatches = batchCache[batchKey] || [];
                  const allocatedBaseQty = line.batchSelections.reduce((acc, b) => acc + b.quantityBase, 0);
                  const isShortage = line.allocationMode === 'manual' && allocatedBaseQty < targetBaseQty;
                  const isOverAllocated = line.allocationMode === 'manual' && allocatedBaseQty > targetBaseQty;

                  return (
                    <div
                      key={line.clientLineId}
                      style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-surface)',
                        boxShadow: 'var(--shadow-sm)',
                        padding: '12px 14px',
                      }}
                    >
                      {/* Row Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)' }}>
                            #{idx + 1} {line.productName}
                          </span>
                          {line.specification && (
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>({line.specification})</span>
                          )}
                          {line.priceSource && (
                            <span className="badge badge-default" style={{ fontSize: '10px' }}>{line.priceSource}</span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => duplicateLine(line)}
                            className="btn btn-ghost btn-sm"
                            title="拆行/同商品不同仓"
                            style={{ fontSize: '11px', padding: '2px 6px' }}
                          >
                            + 拆行
                          </button>
                          <button
                            type="button"
                            onClick={() => removeLine(line.clientLineId)}
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger)', padding: '2px 6px' }}
                            title="删除该行"
                          >
                            <TrashIcon size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Row Controls */}
                      <div className="picker-line-grid" style={{ alignItems: 'flex-start' }}>
                        {/* Warehouse */}
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>出货仓库</label>
                          <select
                            className="select"
                            value={line.warehouseId}
                            onChange={e => updateLine(line.clientLineId, { warehouseId: e.target.value })}
                            style={{ fontSize: '12px', height: '30px', padding: '4px 6px' }}
                          >
                            {warehouses.map(w => (
                              <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Unit */}
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>销售单位</label>
                          <select
                            className="select"
                            value={line.unitId}
                            onChange={e => updateLine(line.clientLineId, { unitId: e.target.value })}
                            style={{ fontSize: '12px', height: '30px', padding: '4px 6px' }}
                          >
                            {line.units.map(u => (
                              <option key={u.id} value={u.id}>
                                {u.name} {u.multiplierBase > 1 ? `(1${u.name}=${u.multiplierBase})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Quantity with Strict Integer Validation */}
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>销售数量 (正整数)</label>
                          <input
                            type="text"
                            className="input tabular-nums"
                            value={line.quantityRaw}
                            onChange={e => handleQuantityInputChange(line.clientLineId, e.target.value)}
                            style={{
                              fontSize: '12px',
                              height: '30px',
                              padding: '4px 6px',
                              borderColor: line.quantityError ? 'var(--danger)' : undefined,
                            }}
                          />
                          {line.quantityError && (
                            <span style={{ fontSize: '10px', color: 'var(--danger)', display: 'block', marginTop: '2px' }}>
                              {line.quantityError}
                            </span>
                          )}
                        </div>

                        {/* Unit Price */}
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>成交单价 (元)</label>
                          <input
                            type="text"
                            className="input tabular-nums"
                            value={line.unitPrice}
                            onChange={e => updateLine(line.clientLineId, { unitPrice: e.target.value, priceEdited: true, priceSource: '手动修改' })}
                            style={{ fontSize: '12px', height: '30px', padding: '4px 6px' }}
                          />
                        </div>

                        {/* Allocation Mode */}
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>批次分配</label>
                          <select
                            className="select"
                            value={line.allocationMode}
                            onChange={e => {
                              const mode = e.target.value as 'auto' | 'manual';
                              const switched = switchAllocationMode(line, mode);
                              updateLine(line.clientLineId, {
                                allocationMode: switched.allocationMode,
                                batchSelections: switched.batchSelections,
                                batchSelectionsRaw: switched.batchSelectionsRaw,
                                batchSelectionErrors: switched.batchSelectionErrors,
                              });
                              if (mode === 'manual') {
                                void loadBatchesFor(line.productId, line.warehouseId);
                              }
                            }}
                            style={{ fontSize: '12px', height: '30px', padding: '4px 6px' }}
                          >
                            <option value="auto">自动 (FIFO)</option>
                            <option value="manual">手动指定批次</option>
                          </select>
                        </div>
                      </div>

                      {/* Manual Batch Selection Sub-panel */}
                      {line.allocationMode === 'manual' && (
                        <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600 }}>
                              选择批次 (需分配 {targetBaseQty} 基础单位，已分配 {allocatedBaseQty})
                            </div>
                            {isShortage && (
                              <span style={{ fontSize: '11px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <AlertCircleIcon size={14} />
                                还需补选 {targetBaseQty - allocatedBaseQty} 基础单位
                              </span>
                            )}
                            {isOverAllocated && (
                              <span style={{ fontSize: '11px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <AlertCircleIcon size={14} />
                                已超配 {allocatedBaseQty - targetBaseQty} 基础单位
                              </span>
                            )}
                          </div>

                          {loadingBatches[batchKey] ? (
                            <div style={{ fontSize: '12px', color: 'var(--text-subtle)', padding: '6px' }}>加载可用批次中...</div>
                          ) : availableBatches.length === 0 ? (
                            <div style={{ fontSize: '12px', color: 'var(--warning)', padding: '6px' }}>当前仓库暂无可分配批次余量</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {availableBatches.map(b => {
                                const selected = line.batchSelections.find(s => s.batchId === b.id);
                                const currentQty = selected?.quantityBase || 0;
                                return (
                                  <div
                                    key={b.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '6px 8px',
                                      background: 'var(--bg-surface)',
                                      borderRadius: 'var(--radius-sm)',
                                      border: '1px solid var(--border-light)',
                                      fontSize: '12px',
                                    }}
                                  >
                                    <div>
                                      <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                        批次 #{b.id.substring(0, 8)}
                                      </span>
                                      <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                                        入库时间: {b.receivedAt ? b.receivedAt.substring(0, 10) : '—'}
                                      </span>
                                      <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                                        可用余量: {b.quantityBase}
                                      </span>
                                      {isAdmin && (
                                        <span style={{ color: 'var(--text-subtle)', marginLeft: '8px' }}>
                                          成本: ¥{b.unitCost}
                                        </span>
                                      )}
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <label style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>分配量:</label>
                                        <input
                                          type="text"
                                          className="input tabular-nums"
                                          style={{
                                            width: '80px',
                                            height: '26px',
                                            fontSize: '11px',
                                            padding: '2px 6px',
                                            borderColor: line.batchSelectionErrors?.[b.id] ? 'var(--danger)' : undefined,
                                            backgroundColor: line.batchSelectionErrors?.[b.id] ? 'var(--danger-bg)' : undefined,
                                          }}
                                          value={line.batchSelectionsRaw?.[b.id] ?? (currentQty ? String(currentQty) : '')}
                                          onChange={e => {
                                            const updatedLine = updateBatchAllocation(line, b.id, e.target.value, b.quantityBase);
                                            updateLine(line.clientLineId, {
                                              batchSelections: updatedLine.batchSelections,
                                              batchSelectionsRaw: updatedLine.batchSelectionsRaw,
                                              batchSelectionErrors: updatedLine.batchSelectionErrors,
                                            });
                                          }}
                                        />
                                      </div>
                                      {line.batchSelectionErrors?.[b.id] && (
                                        <span style={{ fontSize: '10px', color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                                          {line.batchSelectionErrors[b.id]}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            已选配置: <strong style={{ color: 'var(--text-main)' }}>{sessionLines.length}</strong> 行
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleCancel} className="btn btn-secondary">
              取 消
            </button>
            <button
              onClick={handleConfirm}
              className="btn btn-primary"
              disabled={!validation.valid}
              title={!validation.valid ? '请完善选品行数量或批次配置后再加入' : '统一加入订单'}
            >
              <CheckIcon size={16} />
              <span>确认加入订单 ({sessionLines.length} 行)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
