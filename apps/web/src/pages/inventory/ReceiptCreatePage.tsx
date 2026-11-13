import React, { useState, useEffect, useRef } from 'react';
import type { Warehouse, Product, ReceiptInput } from '../../api/types.js';
import * as api from '../../api/client.js';
import {
  PlusIcon,
  TrashIcon,
  CheckIcon,
  AlertCircleIcon,
} from '../../components/icons/index.js';
import {
  validateReceiptQuantity,
  validateUnitCost,
  formatShanghaiDateTime,
  getCurrentShanghaiDateTime,
} from './inventoryLogic.js';
import './inventory.css';

export interface ReceiptCreatePageProps {
  onBack: () => void;
  onReceiptCreated: () => void;
}

export interface ReceiptLineDraft {
  clientId: string;
  productId: string;
  unitId: string;
  quantityRaw: string;
  unitCost: string;
  quantityError?: string;
  costError?: string;
}

export function ReceiptCreatePage({ onBack, onReceiptCreated }: ReceiptCreatePageProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [kind, setKind] = useState<'purchase' | 'opening'>('purchase');
  const [warehouseId, setWarehouseId] = useState('');

  // Shanghai business datetime defaults
  const shTime = getCurrentShanghaiDateTime();
  const [receivedDate, setReceivedDate] = useState(shTime.date);
  const [receivedTime, setReceivedTime] = useState(shTime.time);

  const [supplierReference, setSupplierReference] = useState('');
  const [lines, setLines] = useState<ReceiptLineDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Idempotency key per intent (P1: preserved on uncertain retry, rotated on intent modification)
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const frozenPayloadRef = useRef<ReceiptInput | null>(null);

  const rotateKey = () => {
    idempotencyKeyRef.current = crypto.randomUUID();
    frozenPayloadRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const whs = await api.listAllWarehouses();
        const allProds: Product[] = [];
        let cursor: string | undefined = undefined;
        do {
          const pRes = await api.listProducts({ limit: 100, cursor });
          allProds.push(...pRes.items);
          cursor = pRes.nextCursor || undefined;
        } while (cursor);

        if (!cancelled) {
          const activeWhs = whs.filter(w => w.active);
          setWarehouses(activeWhs.length > 0 ? activeWhs : whs);
          setProducts(allProds.filter(p => p.active));
          if (activeWhs.length > 0) {
            setWarehouseId(activeWhs[0]!.id);
          } else if (whs.length > 0) {
            setWarehouseId(whs[0]!.id);
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

  const addLine = () => {
    rotateKey();
    if (products.length === 0) return;
    const p = products[0]!;
    const u = p.units[0]!;
    setLines(prev => [
      ...prev,
      {
        clientId: 'rcpt-' + Math.random().toString(36).substring(2, 9),
        productId: p.id,
        unitId: u.id,
        quantityRaw: '1',
        unitCost: '', // Strictly empty: user must explicitly provide real purchase cost!
      },
    ]);
  };

  const updateLine = (clientId: string, patch: Partial<ReceiptLineDraft>) => {
    rotateKey();
    setLines(prev =>
      prev.map(l => {
        if (l.clientId !== clientId) return l;
        const updated = { ...l, ...patch };

        // When product changes, reset unitId to product's first unit
        if (patch.productId && patch.productId !== l.productId) {
          const newProd = products.find(p => p.id === patch.productId);
          if (newProd && newProd.units[0]) {
            updated.unitId = newProd.units[0].id;
          }
        }

        // Validate quantity in real time if updated
        if ('quantityRaw' in patch && patch.quantityRaw !== undefined) {
          const qCheck = validateReceiptQuantity(patch.quantityRaw);
          updated.quantityError = qCheck.valid ? undefined : qCheck.error;
        }

        // Validate unit cost in real time if updated
        if ('unitCost' in patch && patch.unitCost !== undefined) {
          const cCheck = validateUnitCost(patch.unitCost);
          updated.costError = cCheck.valid ? undefined : cCheck.error;
        }

        return updated;
      })
    );
  };

  const removeLine = (clientId: string) => {
    rotateKey();
    setLines(prev => prev.filter(l => l.clientId !== clientId));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!warehouseId) {
      setError('请选择入库仓库');
      return;
    }
    if (lines.length === 0) {
      setError('请至少添加一行入库商品明细');
      return;
    }

    let payload: ReceiptInput;
    if (frozenPayloadRef.current) {
      payload = frozenPayloadRef.current;
    } else {
      // Validate all lines
      let hasLineError = false;
      const validatedLines = lines.map(l => {
        const qCheck = validateReceiptQuantity(l.quantityRaw);
        const cCheck = validateUnitCost(l.unitCost);
        if (!qCheck.valid || !cCheck.valid) {
          hasLineError = true;
        }
        return {
          ...l,
          quantityError: qCheck.valid ? undefined : qCheck.error,
          costError: cCheck.valid ? undefined : cCheck.error,
          parsedQuantity: qCheck.value,
          parsedUnitCost: cCheck.value,
        };
      });

      if (hasLineError) {
        setLines(validatedLines);
        setError('明细行中存在格式错误，请检查数量与实际进价成本（不支持小数数量，成本必填）');
        return;
      }

      const shanghaiDateTimeIso = formatShanghaiDateTime(receivedDate, receivedTime);
      payload = {
        kind,
        warehouseId,
        receivedAt: shanghaiDateTimeIso,
        supplierReference: supplierReference.trim() || undefined,
        lines: validatedLines.map(l => ({
          productId: l.productId,
          unitId: l.unitId,
          quantity: l.parsedQuantity!,
          unitCost: l.parsedUnitCost!,
        })),
      };
      frozenPayloadRef.current = payload;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.confirmReceipt(payload, idempotencyKeyRef.current);
      rotateKey(); // Success: rotate key for subsequent actions
      onReceiptCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '入库登账记账失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="inv-container">
      {/* Top Header */}
      <div className="inv-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onBack} className="btn btn-secondary btn-sm">← 返回</button>
          <div className="inv-header-title">
            <h1>商品入库登账</h1>
            <p>
              支持采购入库与期初入库，生成独立不可变批次。实际成本须明确填报，不默认取售价。
            </p>
          </div>
        </div>

        <div className="inv-header-actions">
          <button onClick={handleSubmit} disabled={submitting || lines.length === 0} className="btn btn-primary">
            <CheckIcon size={16} />
            <span>{submitting ? '正在确认入库...' : '确认入库登账'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px' }}>
          <AlertCircleIcon size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Meta Card */}
      <div className="card">
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>入库类型 *</label>
            <select
              className="select"
              value={kind}
              onChange={e => {
                rotateKey();
                setKind(e.target.value as 'purchase' | 'opening');
              }}
            >
              <option value="purchase">采购入库 (生成新采购批次)</option>
              <option value="opening">期初入库 (录入期初结存批次)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>入库目标仓库 *</label>
            <select
              className="select"
              value={warehouseId}
              onChange={e => {
                rotateKey();
                setWarehouseId(e.target.value);
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
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>实际发生时间 (上海业务时间，可补录) *</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="date"
                className="input"
                style={{ flex: 1.3 }}
                value={receivedDate}
                onChange={e => {
                  rotateKey();
                  setReceivedDate(e.target.value);
                }}
              />
              <input
                type="time"
                className="input"
                style={{ flex: 1 }}
                value={receivedTime}
                onChange={e => {
                  rotateKey();
                  setReceivedTime(e.target.value);
                }}
              />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '2px', display: 'block' }}>
              系统登账时间由服务器登记流水自动保存
            </span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>供应商凭据 / 单号</label>
            <input
              type="text"
              className="input"
              placeholder="如 CG-2026-001 或 供应商合同号"
              value={supplierReference}
              onChange={e => {
                rotateKey();
                setSupplierReference(e.target.value);
              }}
            />
          </div>
        </div>
      </div>

      {/* Lines Card */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>入库商品明细 ({lines.length} 行)</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
              数量必须为安全整数，单价请明确填写真实进价成本
            </span>
          </div>
          <button onClick={addLine} className="btn btn-secondary btn-sm">
            <PlusIcon size={14} /> 增加入库明细行
          </button>
        </div>

        <div className="card-body" style={{ padding: '14px' }}>
          {lines.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-subtle)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-sm)' }}>
              请点击上方“增加入库明细行”录入采购或期初商品
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {lines.map((l, i) => {
                const prod = products.find(p => p.id === l.productId);
                const units = prod?.units || [];
                return (
                  <div
                    key={l.clientId}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      padding: '10px',
                      border: l.quantityError || l.costError ? '1px solid var(--danger)' : '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface)',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '32px 2fr 1.2fr 1fr 1.4fr 36px', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-subtle)' }}>#{i + 1}</span>

                      {/* Product select */}
                      <div>
                        <select
                          className="select"
                          value={l.productId}
                          onChange={e => updateLine(l.clientId, { productId: e.target.value })}
                        >
                          {products.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.specification || '标准'})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Unit select */}
                      <div>
                        <select
                          className="select"
                          value={l.unitId}
                          onChange={e => updateLine(l.clientId, { unitId: e.target.value })}
                        >
                          {units.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name} (×{u.multiplierBase})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity input (raw string) */}
                      <div>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="数量"
                          className="input tabular-nums"
                          style={{ borderColor: l.quantityError ? 'var(--danger)' : undefined }}
                          value={l.quantityRaw}
                          onChange={e => updateLine(l.clientId, { quantityRaw: e.target.value })}
                        />
                      </div>

                      {/* Unit Cost input (explicitly required) */}
                      <div>
                        <input
                          type="text"
                          className="input tabular-nums"
                          placeholder="实际单位进价成本 (元) *"
                          style={{ borderColor: l.costError ? 'var(--danger)' : undefined }}
                          value={l.unitCost}
                          onChange={e => updateLine(l.clientId, { unitCost: e.target.value })}
                        />
                      </div>

                      {/* Delete button */}
                      <div>
                        <button
                          type="button"
                          onClick={() => removeLine(l.clientId)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger)', padding: '6px' }}
                          title="删除该行"
                        >
                          <TrashIcon size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Validation error labels */}
                    {(l.quantityError || l.costError) && (
                      <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--danger)', paddingLeft: '40px' }}>
                        {l.quantityError && <span>数量错误: {l.quantityError}</span>}
                        {l.costError && <span>成本错误: {l.costError}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
