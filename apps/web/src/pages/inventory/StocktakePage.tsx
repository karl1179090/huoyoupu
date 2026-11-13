import React, { useState, useEffect, useRef } from 'react';
import type { Stocktake, Warehouse, Product, Batch } from '../../api/types.js';
import * as api from '../../api/client.js';
import {
  ClipboardIcon,
  PlusIcon,
  CheckIcon,
  AlertCircleIcon,
  RefreshCwIcon,
} from '../../components/icons/index.js';
import {
  validateStocktakeCount,
  validateUnitCost,
  validateAllStocktakeLines,
  isStocktakeStaleError,
  formatShanghaiDateTime,
  type StocktakeLineDraft,
} from './inventoryLogic.js';
import { formatShanghaiDisplay, formatSourceVersionTag } from '../finance/financeLogic.js';
import './inventory.css';

export interface StocktakePageProps {
  onBack?: () => void;
  initialStocktakeId?: string;
  onNavigateToSource?: (href: string) => void;
}

interface EditableStocktakeLine extends StocktakeLineDraft {
  productId: string;
  batchId: string | null;
  snapshotBatchVersion: number | null;
  differenceBase: number;
  resultBatchId: string | null;
  error?: string;
  gainError?: string;
}

export function StocktakePage({ onBack, initialStocktakeId, onNavigateToSource }: StocktakePageProps) {
  const [stocktakes, setStocktakes] = useState<Stocktake[]>([]);
  const [stocktakesNextCursor, setStocktakesNextCursor] = useState<string | null>(null);
  const [loadingMoreStocktakes, setLoadingMoreStocktakes] = useState(false);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [activeStocktake, setActiveStocktake] = useState<Stocktake | null>(null);

  // Editable lines for draft stocktake
  const [editableLines, setEditableLines] = useState<EditableStocktakeLine[]>([]);

  // Modals & loading states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingLines, setSavingLines] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Stale snapshot & alerts
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Creation options
  const [includeZeroStock, setIncludeZeroStock] = useState(false);

  // Idempotency Intent Key & Frozen Payload Management (P1: Freeze on retry, rotate on edit)
  const createIntentKeyRef = useRef<string>(crypto.randomUUID());
  const frozenCreatePayloadRef = useRef<{ warehouseId: string; lines: Array<{ productId: string; batchId: string | null }> } | null>(null);

  const rotateCreateKey = () => {
    createIntentKeyRef.current = crypto.randomUUID();
    frozenCreatePayloadRef.current = null;
  };

  // Draft Save Intent (P1: preserves draft counts PATCH across network retries)
  const frozenDraftSaveIntentRef = useRef<{
    stocktakeId: string;
    expectedVersion: number;
    lines: Array<{ id: string; actualQuantityBase: number; gainCostUnitId?: string; gainUnitCost?: string }>;
    key: string;
  } | null>(null);

  // Two-Phase Confirmation Intent (P1: preserves PATCH/Confirm phases across network retries)
  interface ConfirmIntentState {
    stocktakeId: string;
    expectedPatchVersion: number;
    patchPayload: Array<{ id: string; actualQuantityBase: number; gainCostUnitId?: string; gainUnitCost?: string }>;
    patchKey: string;
    confirmKey: string;
    phase: 'idle' | 'patched';
    patchedVersion: number | null;
  }
  const confirmIntentRef = useRef<ConfirmIntentState | null>(null);

  // Scope & Generation guard for Stocktake Detail (P2: prevents stale detail response from overwriting newer target)
  const stocktakeDetailScopeRef = useRef<{ id: string; generation: number }>({ id: '', generation: 0 });

  useEffect(() => {
    if (initialStocktakeId && (!activeStocktake || activeStocktake.id !== initialStocktakeId)) {
      void loadStocktakeDetail(initialStocktakeId);
    }
  }, [initialStocktakeId]);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [whs, stRes] = await Promise.all([
          api.listAllWarehouses(),
          api.listStocktakes({ limit: 50 }),
        ]);

        const allProds: Product[] = [];
        let cursor: string | undefined = undefined;
        do {
          const pRes = await api.listProducts({ limit: 100, cursor });
          allProds.push(...pRes.items);
          cursor = pRes.nextCursor || undefined;
        } while (cursor);

        if (!cancelled) {
          setWarehouses(whs);
          setProducts(allProds);
          const activeWh = whs.find(w => w.active);
          if (activeWh) {
            setSelectedWarehouseId(activeWh.id);
          } else if (whs.length > 0) {
            setSelectedWarehouseId(whs[0]!.id);
          }
          setStocktakes(stRes.items);
          setStocktakesNextCursor(stRes.nextCursor);

          // Only trigger default stocktake detail if no target detail was initiated
          if (!stocktakeDetailScopeRef.current.id) {
            const targetStId = initialStocktakeId || (stRes.items.length > 0 ? stRes.items[0]!.id : null);
            if (targetStId) {
              void loadStocktakeDetail(targetStId);
            }
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载基础数据失败');
        }
      }
    }
    void loadData();
    return () => { cancelled = true; };
  }, []);

  const loadStocktakeDetail = async (id: string) => {
    const gen = ++stocktakeDetailScopeRef.current.generation;
    stocktakeDetailScopeRef.current.id = id;

    setLoadingDetail(true);
    setError(null);
    setIsStale(false);
    confirmIntentRef.current = null; // Fresh intent for confirmation
    try {
      const st = await api.getStocktake(id);
      if (
        stocktakeDetailScopeRef.current.generation !== gen ||
        stocktakeDetailScopeRef.current.id !== id
      ) {
        return; // Discard stale detail response
      }
      setActiveStocktake(st);
      initEditableLines(st);
    } catch (err: unknown) {
      if (
        stocktakeDetailScopeRef.current.generation !== gen ||
        stocktakeDetailScopeRef.current.id !== id
      ) {
        return;
      }
      setError(err instanceof Error ? err.message : '获取盘点单详情失败');
    } finally {
      if (
        stocktakeDetailScopeRef.current.generation === gen &&
        stocktakeDetailScopeRef.current.id === id
      ) {
        setLoadingDetail(false);
      }
    }
  };

  const loadMoreStocktakes = async () => {
    if (!stocktakesNextCursor) return;
    setLoadingMoreStocktakes(true);
    try {
      const res = await api.listStocktakes({ limit: 50, cursor: stocktakesNextCursor });
      setStocktakes(prev => [...prev, ...res.items]);
      setStocktakesNextCursor(res.nextCursor);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载更多盘点记录失败');
    } finally {
      setLoadingMoreStocktakes(false);
    }
  };

  const initEditableLines = (st: Stocktake) => {
    const lines: EditableStocktakeLine[] = st.lines.map(l => {
      const actual = l.actualQuantityBase ?? l.snapshotQuantityBase;
      const diff = actual - l.snapshotQuantityBase;

      const prod = products.find(p => p.id === l.productId);
      const defaultUnitId = l.gainCostUnitId || prod?.units[0]?.id || '';

      return {
        id: l.id,
        productId: l.productId,
        batchId: l.batchId,
        snapshotQuantityBase: l.snapshotQuantityBase,
        snapshotBatchVersion: l.snapshotBatchVersion,
        actualQuantityRaw: String(actual),
        actualQuantityBase: actual,
        gainCostUnitId: defaultUnitId,
        gainUnitCost: l.gainUnitCost || '',
        differenceBase: diff,
        resultBatchId: l.resultBatchId,
      };
    });
    setEditableLines(lines);
  };

  /**
   * P2 Fix: Fetches ALL warehouse batches by exhaustively paging through nextCursor,
   * guaranteeing no first-100 batch truncation when creating warehouse stocktakes.
   */
  const handleCreateSnapshot = async () => {
    if (!selectedWarehouseId) return;
    setCreating(true);
    setError(null);
    setIsStale(false);
    try {
      let payload: { warehouseId: string; lines: Array<{ productId: string; batchId: string | null }> };
      if (frozenCreatePayloadRef.current && frozenCreatePayloadRef.current.warehouseId === selectedWarehouseId) {
        payload = frozenCreatePayloadRef.current;
      } else {
        const allWarehouseBatches: Batch[] = [];
        let currentCursor: string | undefined = undefined;

        // Exhaustively retrieve all positive batches in warehouse
        do {
          const batchRes = await api.listBatches({
            warehouseId: selectedWarehouseId,
            positiveOnly: true,
            limit: 100,
            cursor: currentCursor,
          });
          allWarehouseBatches.push(...batchRes.items);
          currentCursor = batchRes.nextCursor || undefined;
        } while (currentCursor);

        const linesPayload: Array<{ productId: string; batchId: string | null }> = [];
        const addedProductIds = new Set<string>();

        // Add all positive batches
        allWarehouseBatches.forEach(b => {
          linesPayload.push({
            productId: b.productId,
            batchId: b.id,
          });
          addedProductIds.add(b.productId);
        });

        // Add zero-stock products if requested (only products with zero existing batches)
        if (includeZeroStock) {
          products.forEach(p => {
            if (!addedProductIds.has(p.id)) {
              linesPayload.push({
                productId: p.id,
                batchId: null,
              });
            }
          });
        }

        if (linesPayload.length === 0) {
          setError('该仓库当前没有批次记录。可勾选“包含零库存商品”以盘点录入盘盈商品。');
          setCreating(false);
          return;
        }

        payload = {
          warehouseId: selectedWarehouseId,
          lines: linesPayload,
        };
        frozenCreatePayloadRef.current = payload;
      }

      const newSt = await api.createStocktake(
        payload,
        createIntentKeyRef.current
      );

      // Successfully created: reset key and frozen payload
      rotateCreateKey();

      setActiveStocktake(newSt);
      initEditableLines(newSt);
      setSuccessMsg(`盘点快照 ${newSt.stocktakeNo} 已生成！包含全仓 ${newSt.lines.length} 项盘点行。`);
      setCreateModalOpen(false);

      const updatedList = await api.listStocktakes({ limit: 50 });
      setStocktakes(updatedList.items);
      setStocktakesNextCursor(updatedList.nextCursor);
    } catch (err: unknown) {
      if (isStocktakeStaleError(err)) {
        setIsStale(true);
        setError('生成快照失败：库存状态已发生变化。请重试。');
      } else {
        setError(err instanceof Error ? err.message : '创建盘点快照失败');
      }
    } finally {
      setCreating(false);
    }
  };

  /**
   * P1 Fix: When editing actual quantity, validate raw input immediately.
   * If invalid (e.g. 18.5), mark line with error and clear valid numerical value,
   * completely preventing submission of old/hidden integer values.
   */
  const updateLineCount = (lineId: string, rawVal: string) => {
    confirmIntentRef.current = null; // User modified intention, reset two-phase intent!
    frozenDraftSaveIntentRef.current = null; // Reset draft save intent!
    setEditableLines(prev =>
      prev.map(l => {
        if (l.id !== lineId) return l;
        const check = validateStocktakeCount(rawVal);
        const actual = check.valid ? check.value! : NaN;
        const diff = isNaN(actual) ? 0 : actual - l.snapshotQuantityBase;
        return {
          ...l,
          actualQuantityRaw: rawVal,
          actualQuantityBase: actual,
          differenceBase: diff,
          error: check.valid ? undefined : check.error,
        };
      })
    );
  };

  const updateLineGainCost = (lineId: string, patch: { gainCostUnitId?: string; gainUnitCost?: string }) => {
    confirmIntentRef.current = null; // User modified intention, reset two-phase intent!
    frozenDraftSaveIntentRef.current = null; // Reset draft save intent!
    setEditableLines(prev =>
      prev.map(l => {
        if (l.id !== lineId) return l;
        const updated = { ...l, ...patch };
        if (patch.gainUnitCost !== undefined) {
          const check = validateUnitCost(patch.gainUnitCost);
          updated.gainError = check.valid ? undefined : check.error;
        }
        return updated;
      })
    );
  };

  // Evaluate unified line validation for UI button gating
  const currentValidation = validateAllStocktakeLines(editableLines);

  const handleSaveDraftCounts = async () => {
    if (!activeStocktake || activeStocktake.status !== 'draft') return;

    // P1 Validation Guard
    const check = validateAllStocktakeLines(editableLines);
    if (!check.valid) {
      setError(check.error || '存在未通过校验的实盘行');
      return;
    }

    setSavingLines(true);
    setError(null);

    // Reuse frozen draft save intent on retry, or initialize new one
    let patchLines: Array<{ id: string; actualQuantityBase: number; gainCostUnitId?: string; gainUnitCost?: string }>;
    let expectedVersion: number;
    let saveKey: string;

    if (
      frozenDraftSaveIntentRef.current &&
      frozenDraftSaveIntentRef.current.stocktakeId === activeStocktake.id &&
      frozenDraftSaveIntentRef.current.expectedVersion === activeStocktake.version
    ) {
      patchLines = frozenDraftSaveIntentRef.current.lines;
      expectedVersion = frozenDraftSaveIntentRef.current.expectedVersion;
      saveKey = frozenDraftSaveIntentRef.current.key;
    } else {
      patchLines = editableLines.map(l => {
        const isGain = l.actualQuantityBase > l.snapshotQuantityBase;
        return {
          id: l.id,
          actualQuantityBase: l.actualQuantityBase,
          gainCostUnitId: isGain ? (l.gainCostUnitId || undefined) : undefined,
          gainUnitCost: isGain ? (l.gainUnitCost || undefined) : undefined,
        };
      });
      expectedVersion = activeStocktake.version;
      saveKey = crypto.randomUUID();
      frozenDraftSaveIntentRef.current = {
        stocktakeId: activeStocktake.id,
        expectedVersion,
        lines: patchLines,
        key: saveKey,
      };
    }

    try {
      const updated = await api.updateStocktake(
        activeStocktake.id,
        {
          expectedVersion,
          lines: patchLines,
        },
        saveKey
      );

      // On successful save, clear frozen intent
      frozenDraftSaveIntentRef.current = null;
      confirmIntentRef.current = null;

      setActiveStocktake(updated);
      initEditableLines(updated);
      setSuccessMsg('实盘数据与盘盈成本已保存！');
    } catch (err: unknown) {
      if (isStocktakeStaleError(err)) {
        setIsStale(true);
        setError('盘点快照已过期 (STOCKTAKE_STALE)：关联的账面库存已被新交易改变。系统禁止以旧快照覆盖最新状态，请重新发起快照。');
      } else {
        setError(err instanceof Error ? `保存盘点实盘数据失败: ${err.message}` : '保存盘点实盘数据失败');
      }
    } finally {
      setSavingLines(false);
    }
  };

  /**
   * P1 Fix: Two-phase confirmation with frozen idempotency keys per phase.
   * Phase 1 commits draft lines with patchKey; Phase 2 confirms with confirmKey and patchedVersion.
   * If confirm request drops or fails, retrying skips Phase 1 and avoids 409 VERSION_CONFLICT!
   * Zero write requests are sent if any line count or cost is invalid.
   */
  const handleConfirmStocktake = async () => {
    if (!activeStocktake || activeStocktake.status !== 'draft') return;

    // Strict P1 check: reject any invalid raw input
    const check = validateAllStocktakeLines(editableLines);
    if (!check.valid) {
      setError(check.error || '存在非法实盘数量或未填盘盈成本，禁止过账');
      return;
    }

    setConfirming(true);
    setError(null);
    try {
      // 1. Initialize two-phase confirmation intent if needed
      if (!confirmIntentRef.current || confirmIntentRef.current.stocktakeId !== activeStocktake.id) {
        confirmIntentRef.current = {
          stocktakeId: activeStocktake.id,
          expectedPatchVersion: activeStocktake.version,
          patchPayload: editableLines.map(l => {
            const isGain = l.actualQuantityBase > l.snapshotQuantityBase;
            return {
              id: l.id,
              actualQuantityBase: l.actualQuantityBase,
              gainCostUnitId: isGain ? (l.gainCostUnitId || undefined) : undefined,
              gainUnitCost: isGain ? (l.gainUnitCost || undefined) : undefined,
            };
          }),
          patchKey: crypto.randomUUID(),
          confirmKey: crypto.randomUUID(),
          phase: 'idle',
          patchedVersion: null,
        };
      }

      // Phase 1: Update stocktake draft counts
      if (confirmIntentRef.current.phase === 'idle') {
        const updated = await api.updateStocktake(
          confirmIntentRef.current.stocktakeId,
          {
            expectedVersion: confirmIntentRef.current.expectedPatchVersion,
            lines: confirmIntentRef.current.patchPayload,
          },
          confirmIntentRef.current.patchKey
        );
        confirmIntentRef.current.phase = 'patched';
        confirmIntentRef.current.patchedVersion = updated.version;
        setActiveStocktake(updated);
      }

      // Phase 2: Confirm stocktake using the exact patched version and frozen confirm key
      const expectedConfirmVersion = confirmIntentRef.current.patchedVersion!;
      const confirmed = await api.confirmStocktake(
        confirmIntentRef.current.stocktakeId,
        { expectedVersion: expectedConfirmVersion },
        confirmIntentRef.current.confirmKey
      );

      // On successful confirmation, clear the confirmation intent
      confirmIntentRef.current = null;

      setActiveStocktake(confirmed);
      initEditableLines(confirmed);
      setSuccessMsg(`盘点单 ${confirmed.stocktakeNo} 已成功确认并完成过账！`);

      const updatedList = await api.listStocktakes({ limit: 50 });
      setStocktakes(updatedList.items);
      setStocktakesNextCursor(updatedList.nextCursor);
    } catch (err: unknown) {
      if (isStocktakeStaleError(err)) {
        setIsStale(true);
        setError('盘点快照已过期 (STOCKTAKE_STALE)：关联账面库存已被新交易改变。禁止覆盖最新库存，请重新发起快照。');
      } else {
        setError(err instanceof Error ? `确认盘点并过账失败: ${err.message}` : '确认盘点并过账失败');
      }
    } finally {
      setConfirming(false);
    }
  };

  const getProductName = (prodId: string) => {
    const p = products.find(x => x.id === prodId);
    return p ? `${p.name} (${p.specification || '标准'})` : prodId.substring(0, 8);
  };

  const getProductUnits = (prodId: string) => {
    const p = products.find(x => x.id === prodId);
    return p?.units || [];
  };

  return (
    <div className="inv-container">
      {/* Header */}
      <div className="inv-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onBack} className="btn btn-secondary btn-sm">← 返回库存</button>
          <div className="inv-header-title">
            <h1>实盘盘点工作台</h1>
            <p>
              锁定不可变账面快照，实盘支持小数拦截、盘亏指定批次与盘盈必填成本。严格防止过期快照覆盖。
            </p>
          </div>
        </div>

        <div className="inv-header-actions">
          <button onClick={() => setCreateModalOpen(true)} className="btn btn-primary">
            <PlusIcon size={16} />
            <span>新建盘点快照</span>
          </button>
        </div>
      </div>

      {/* Stale Warning Banner (P2: Clear action to rebuild fresh snapshot) */}
      {isStale && (
        <div className="inv-stale-banner">
          <AlertCircleIcon size={20} />
          <div style={{ flex: 1 }}>
            <div className="inv-stale-banner-title">盘点快照已过期 (STOCKTAKE_STALE)</div>
            <div>
              该快照锁定后，关联的账面库存已被新发生的销售、采购或更正交易改变。系统禁止以旧快照盲目覆盖最新库存。
              请点击下方按钮重新发起“新建盘点快照”，获取最新基准。
            </div>
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  setIsStale(false);
                  setCreateModalOpen(true);
                }}
                className="btn btn-primary btn-sm"
              >
                <PlusIcon size={14} />
                <span>重新发起新建快照</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {error && !isStale && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px' }}>
          <AlertCircleIcon size={16} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '13px' }}>
          <CheckIcon size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Workbench Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '16px', alignItems: 'start' }}>
        {/* Left: Snapshots List */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '13px' }}>历史盘点快照 ({stocktakes.length})</span>
            <button
              onClick={() => void api.listStocktakes({ limit: 50 }).then(res => {
                setStocktakes(res.items);
                setStocktakesNextCursor(res.nextCursor);
              })}
              className="btn btn-ghost btn-sm"
              title="刷新列表"
            >
              <RefreshCwIcon size={14} />
            </button>
          </div>
          <div className="card-body" style={{ padding: '8px', maxHeight: '600px', overflowY: 'auto' }}>
            {stocktakes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-subtle)', fontSize: '12px' }}>
                暂无盘点记录
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {stocktakes.map(st => (
                  <div
                    key={st.id}
                    onClick={() => void loadStocktakeDetail(st.id)}
                    style={{
                      padding: '10px 12px',
                      background: activeStocktake?.id === st.id ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                      border: activeStocktake?.id === st.id ? '1px solid var(--accent)' : '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-main)' }}>{st.stocktakeNo}</span>
                      <span className={`badge ${st.status === 'confirmed' ? 'badge-success' : 'badge-warning'}`}>
                        {st.status === 'confirmed' ? '已过账' : '草稿录入中'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      快照时间: {formatShanghaiDisplay(st.countedAt)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '2px' }}>
                      行数: {st.lines.length} 行
                    </div>
                  </div>
                ))}

                {stocktakesNextCursor && (
                  <button
                    onClick={loadMoreStocktakes}
                    disabled={loadingMoreStocktakes}
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: '6px', width: '100%', fontSize: '11px' }}
                  >
                    {loadingMoreStocktakes ? '加载中...' : '加载更多快照'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Active Stocktake Sheet */}
        <div>
          {!activeStocktake ? (
            <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-subtle)' }}>
              请在左侧选择一张盘点单，或点击上方“新建盘点快照”开始实盘
            </div>
          ) : (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '16px' }}>
                    盘点单: {activeStocktake.stocktakeNo}
                  </span>
                  <span className={`badge ${activeStocktake.status === 'confirmed' ? 'badge-success' : 'badge-warning'}`} style={{ marginLeft: '8px' }}>
                    {activeStocktake.status === 'confirmed' ? '已确认并完成过账' : '实盘录入中 (草稿)'}
                  </span>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    快照时间: {formatShanghaiDisplay(activeStocktake.countedAt)} | 版本: v{activeStocktake.version}
                  </div>
                </div>

                {activeStocktake.status === 'draft' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleSaveDraftCounts}
                      disabled={savingLines || confirming || isStale || !currentValidation.valid}
                      className="btn btn-secondary btn-sm"
                      title={!currentValidation.valid ? currentValidation.error : undefined}
                    >
                      <span>{savingLines ? '正在保存...' : '暂存实盘数'}</span>
                    </button>
                    <button
                      onClick={handleConfirmStocktake}
                      disabled={confirming || savingLines || isStale || !currentValidation.valid}
                      className="btn btn-primary btn-sm"
                      title={!currentValidation.valid ? currentValidation.error : undefined}
                    >
                      <CheckIcon size={14} />
                      <span>{confirming ? '正在确认过账...' : '确认盘点并过账'}</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '36px' }}>#</th>
                      <th>商品与规格</th>
                      <th>所属批次</th>
                      <th className="text-right">账面数量 (基础单位)</th>
                      <th className="text-right" style={{ width: '130px' }}>实盘数量 (基础单位)</th>
                      <th className="text-right">损益差异</th>
                      <th>盘盈核算与进价成本</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editableLines.map((l, i) => {
                      const isGain = !isNaN(l.actualQuantityBase) && l.actualQuantityBase > l.snapshotQuantityBase;
                      const isLoss = !isNaN(l.actualQuantityBase) && l.actualQuantityBase < l.snapshotQuantityBase;
                      const prodUnits = getProductUnits(l.productId);

                      return (
                        <tr key={l.id} style={{ background: isGain ? '#f0fdf4' : isLoss ? '#fef2f2' : undefined }}>
                          <td>{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{getProductName(l.productId)}</td>
                          <td>
                            {l.batchId ? (
                              <span className="font-mono" style={{ fontSize: '12px' }}>
                                #{l.batchId.substring(0, 8)}
                              </span>
                            ) : (
                              <span className="badge badge-default" style={{ fontSize: '11px' }}>零库存新增项</span>
                            )}
                          </td>
                          <td className="tabular-nums text-right" style={{ fontWeight: 600 }}>
                            {l.snapshotQuantityBase}
                          </td>
                          <td className="text-right">
                            {activeStocktake.status === 'draft' ? (
                              <div>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  className="input tabular-nums text-right"
                                  style={{
                                    width: '100px',
                                    height: '30px',
                                    fontSize: '13px',
                                    borderColor: l.error ? 'var(--danger)' : undefined,
                                  }}
                                  value={l.actualQuantityRaw}
                                  onChange={e => updateLineCount(l.id, e.target.value)}
                                  disabled={isStale}
                                />
                                {l.error && (
                                  <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '2px' }}>
                                    {l.error}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="tabular-nums font-bold">{l.actualQuantityBase}</span>
                            )}
                          </td>
                          <td className="tabular-nums text-right" style={{ fontWeight: 700 }}>
                            {isGain ? (
                              <span style={{ color: 'var(--success)' }}>+{l.differenceBase} (盘盈)</span>
                            ) : isLoss ? (
                              <span style={{ color: 'var(--danger)' }}>{l.differenceBase} (盘亏)</span>
                            ) : (
                              <span style={{ color: 'var(--text-subtle)' }}>0 (无差异)</span>
                            )}
                          </td>
                          <td>
                            {isGain ? (
                              activeStocktake.status === 'draft' ? (
                                <div className="stocktake-gain-box">
                                  <label>核算单位 *</label>
                                  <select
                                    className="select"
                                    style={{ height: '26px', fontSize: '11px', padding: '2px 6px' }}
                                    value={l.gainCostUnitId || ''}
                                    onChange={e => updateLineGainCost(l.id, { gainCostUnitId: e.target.value })}
                                  >
                                    {prodUnits.map(u => (
                                      <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                  </select>

                                  <label style={{ marginLeft: '4px' }}>进价单价 *</label>
                                  <input
                                    type="text"
                                    placeholder="盘盈进价成本"
                                    className="input tabular-nums"
                                    style={{ width: '90px', height: '26px', fontSize: '11px' }}
                                    value={l.gainUnitCost || ''}
                                    onChange={e => updateLineGainCost(l.id, { gainUnitCost: e.target.value })}
                                  />
                                </div>
                              ) : (
                                <span style={{ fontSize: '12px', color: 'var(--success)' }}>
                                  已生成新批次 | 单位成本: ¥{l.gainUnitCost || '—'}
                                </span>
                              )
                            ) : isLoss ? (
                              <span style={{ fontSize: '12px', color: 'var(--danger)' }}>
                                指定扣减源批次 #{l.batchId ? l.batchId.substring(0, 8) : '—'}
                              </span>
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--text-subtle)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Stocktake Modal */}
      {createModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '15px' }}>新建实盘盘点快照</span>
              <button onClick={() => setCreateModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  盘点仓库 *
                </label>
                <select
                  className="select"
                  value={selectedWarehouseId}
                  onChange={e => {
                    rotateCreateKey();
                    setSelectedWarehouseId(e.target.value);
                  }}
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={includeZeroStock}
                    onChange={e => {
                      rotateCreateKey();
                      setIncludeZeroStock(e.target.checked);
                    }}
                  />
                  <span>同时纳入零库存商品 (batchId: null，用于直接盘盈入库)</span>
                </label>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'var(--bg-surface-subtle)', padding: '10px', borderRadius: 'var(--radius-sm)' }}>
                系统将基于所选仓库的全量在库批次锁定不可变账面快照。生成后请及时录入实盘数并确认过账，若期间库存发生变动，系统将提示快照过期（STOCKTAKE_STALE）。
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setCreateModalOpen(false)} className="btn btn-secondary">
                取消
              </button>
              <button
                onClick={handleCreateSnapshot}
                disabled={creating || !selectedWarehouseId}
                className="btn btn-primary"
              >
                {creating ? '正在锁定快照...' : '确认生成快照'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
