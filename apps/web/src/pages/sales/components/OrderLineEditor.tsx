import React, { useState } from 'react';
import type { Warehouse, Batch, CalculatedLine } from '../../../api/types.js';
import {
  type PickerLineItem,
  validateQuantityInput,
  updateBatchAllocation,
  switchAllocationMode,
} from './batchPickerLogic.js';
import * as api from '../../../api/client.js';
import { useAuth } from '../../../context/AuthContext.js';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  TrashIcon,
  AlertCircleIcon,
  PlusIcon,
} from '../../../components/icons/index.js';

interface OrderLineEditorProps {
  line: PickerLineItem;
  index: number;
  warehouses: Warehouse[];
  calculatedLine?: CalculatedLine;
  readOnly?: boolean;
  onChange: (updated: PickerLineItem) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}

export function OrderLineEditor({
  line,
  index,
  warehouses,
  calculatedLine,
  readOnly = false,
  onChange,
  onRemove,
  onDuplicate,
}: OrderLineEditorProps) {
  const { isAdmin } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  const currentUnit = line.units.find(u => u.id === line.unitId) || line.units[0];
  const multiplier = currentUnit?.multiplierBase || 1;
  const targetBaseQty = line.quantity * multiplier;
  const allocatedBaseQty = line.batchSelections.reduce((acc, b) => acc + b.quantityBase, 0);
  const isShortage = line.allocationMode === 'manual' && allocatedBaseQty < targetBaseQty;
  const isOverAllocated = line.allocationMode === 'manual' && allocatedBaseQty > targetBaseQty;

  const loadBatches = async () => {
    if (batches.length > 0) return;
    setLoadingBatches(true);
    try {
      const res = await api.listBatches({
        productId: line.productId,
        warehouseId: line.warehouseId,
        positiveOnly: true,
        limit: 100,
      });
      setBatches(res.items);
    } catch {
      setBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  };

  const toggleExpand = () => {
    if (!expanded && line.allocationMode === 'manual') {
      void loadBatches();
    }
    setExpanded(!expanded);
  };

  const handleQuantityChange = (valStr: string) => {
    const { quantity, quantityError } = validateQuantityInput(valStr);
    onChange({
      ...line,
      quantity,
      quantityRaw: valStr,
      quantityError,
    });
  };

  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-sm)',
        marginBottom: '8px',
        backgroundColor: readOnly ? 'var(--bg-surface-subtle)' : 'var(--bg-surface)',
        overflow: 'hidden',
      }}
    >
      {/* Desktop Table Row */}
      <div
        className="hide-mobile"
        style={{
          display: 'grid',
          gridTemplateColumns: '40px 1.5fr 1.2fr 1fr 1fr 1.2fr 1.2fr 90px',
          padding: '10px 12px',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
        }}
      >
        {/* Index & Expand Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={toggleExpand}
            className="btn btn-ghost btn-sm"
            style={{ padding: '2px', minHeight: 'unset', color: 'var(--text-muted)' }}
            title={expanded ? '收起配置' : '展开批次配置'}
          >
            {expanded ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
          </button>
          <span style={{ color: 'var(--text-subtle)', fontSize: '11px' }}>{index + 1}</span>
        </div>

        {/* Product Name & Spec */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {line.productName}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {line.specification || '标准规格'}
            {readOnly && (
              <span className="badge badge-default" style={{ marginLeft: '4px', fontSize: '10px' }}>
                {line.readOnlyBadgeText || '已退只读'}
              </span>
            )}
          </div>
        </div>

        {/* Warehouse */}
        <div>
          {readOnly ? (
            <span style={{ fontSize: '12px' }}>
              {warehouses.find(w => w.id === line.warehouseId)?.name || '默认仓'}
            </span>
          ) : (
            <select
              className="select"
              value={line.warehouseId}
              onChange={e => {
                const newWh = e.target.value;
                setBatches([]);
                onChange({ ...line, warehouseId: newWh, batchSelections: [] });
              }}
              style={{ fontSize: '12px', height: '30px', padding: '4px 6px' }}
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Unit */}
        <div>
          {readOnly ? (
            <span style={{ fontSize: '12px' }}>{currentUnit?.name || '件'}</span>
          ) : (
            <select
              className="select"
              value={line.unitId}
              onChange={e => onChange({ ...line, unitId: e.target.value })}
              style={{ fontSize: '12px', height: '30px', padding: '4px 6px' }}
            >
              {line.units.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.multiplierBase > 1 ? `(${u.multiplierBase})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Quantity (Strict positive integer validation) */}
        <div>
          {readOnly ? (
            <span className="tabular-nums" style={{ fontSize: '12px', fontWeight: 600 }}>{line.quantity}</span>
          ) : (
            <div>
              <input
                type="text"
                className="input tabular-nums"
                value={line.quantityRaw}
                onChange={e => handleQuantityChange(e.target.value)}
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
          )}
        </div>

        {/* Unit Price */}
        <div>
          {readOnly ? (
            <div>
              <span className="tabular-nums" style={{ fontSize: '12px' }}>¥{line.unitPrice}</span>
              {line.priceNote && (
                <div style={{ fontSize: '10px', color: 'var(--text-subtle)', marginTop: '2px', lineHeight: '1.2' }}>
                  {line.priceNote}
                </div>
              )}
            </div>
          ) : (
            <div>
              <input
                type="text"
                className="input tabular-nums"
                value={line.unitPrice}
                placeholder={line.priceNote ? '沿用原价' : '0.00'}
                onChange={e => onChange({
                  ...line,
                  unitPrice: e.target.value,
                  priceEdited: e.target.value.trim() !== '',
                  priceSource: e.target.value.trim() !== '' ? '手动修改' : undefined,
                })}
                style={{ fontSize: '12px', height: '30px', padding: '4px 6px' }}
              />
              {line.priceNote && (
                <div style={{ fontSize: '10px', color: 'var(--text-subtle)', marginTop: '2px', lineHeight: '1.2' }}>
                  {line.priceNote}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Server Calculated Net Amount & Profit */}
        <div className="tabular-nums text-right">
          {calculatedLine ? (
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)' }}>
                ¥{calculatedLine.netAmount}
              </div>
              {isAdmin && calculatedLine.grossProfit && (
                <div style={{ fontSize: '11px', color: Number(calculatedLine.grossProfit) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  毛利: ¥{calculatedLine.grossProfit}
                </div>
              )}
            </div>
          ) : (
            <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>待报价</span>
          )}
        </div>

        {/* Row Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={onDuplicate}
                className="btn btn-ghost btn-sm"
                title="拆行/同商品不同仓"
                style={{ padding: '4px', minHeight: 'unset' }}
              >
                <PlusIcon size={14} />
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--danger)', padding: '4px', minHeight: 'unset' }}
                title="删除该行"
              >
                <TrashIcon size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile Card Row */}
      <div className="hide-desktop" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <button
              type="button"
              onClick={toggleExpand}
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px', minHeight: 'unset', color: 'var(--text-muted)' }}
              title={expanded ? '收起配置' : '展开批次配置'}
            >
              {expanded ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
            </button>
            <span className="badge badge-default font-mono">#{index + 1}</span>
            <span style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {line.productName}
            </span>
            {line.specification && (
              <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>({line.specification})</span>
            )}
            {readOnly && (
              <span className="badge badge-default" style={{ marginLeft: '4px', fontSize: '10px' }}>
                {line.readOnlyBadgeText || '已退只读'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={onDuplicate}
                  className="btn btn-ghost btn-sm"
                  title="拆行/同商品不同仓"
                  style={{ padding: '4px', minHeight: 'unset' }}
                >
                  <PlusIcon size={14} />
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--danger)', padding: '4px', minHeight: 'unset' }}
                  title="删除该行"
                >
                  <TrashIcon size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-subtle)', display: 'block', marginBottom: '2px' }}>出货仓库</label>
            {readOnly ? (
              <span style={{ fontSize: '12px' }}>{warehouses.find(w => w.id === line.warehouseId)?.name || '默认仓'}</span>
            ) : (
              <select
                className="select"
                value={line.warehouseId}
                onChange={e => {
                  setBatches([]);
                  onChange({ ...line, warehouseId: e.target.value, batchSelections: [] });
                }}
                style={{ fontSize: '12px', height: '30px', padding: '4px 6px', width: '100%' }}
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-subtle)', display: 'block', marginBottom: '2px' }}>销售单位</label>
            {readOnly ? (
              <span style={{ fontSize: '12px' }}>{currentUnit?.name || '件'}</span>
            ) : (
              <select
                className="select"
                value={line.unitId}
                onChange={e => onChange({ ...line, unitId: e.target.value })}
                style={{ fontSize: '12px', height: '30px', padding: '4px 6px', width: '100%' }}
              >
                {line.units.map(u => (
                  <option key={u.id} value={u.id}>{u.name} {u.multiplierBase > 1 ? `(${u.multiplierBase})` : ''}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: '8px', alignItems: 'flex-start' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-subtle)', display: 'block', marginBottom: '2px' }}>销售数量</label>
            {readOnly ? (
              <span className="tabular-nums" style={{ fontSize: '12px', fontWeight: 600 }}>{line.quantity}</span>
            ) : (
              <div>
                <input
                  type="text"
                  className="input tabular-nums"
                  style={{
                    height: '30px',
                    fontSize: '12px',
                    width: '100%',
                    borderColor: line.quantityError ? 'var(--danger)' : undefined,
                    backgroundColor: line.quantityError ? 'var(--danger-bg)' : undefined,
                  }}
                  value={line.quantityRaw}
                  onChange={e => handleQuantityChange(e.target.value)}
                />
                {line.quantityError && (
                  <span style={{ fontSize: '10px', color: 'var(--danger)', display: 'block', marginTop: '2px' }}>
                    {line.quantityError}
                  </span>
                )}
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-subtle)', display: 'block', marginBottom: '2px' }}>单价 (元)</label>
            {readOnly ? (
              <div>
                <span className="tabular-nums" style={{ fontSize: '12px' }}>¥{line.unitPrice}</span>
                {line.priceNote && (
                  <div style={{ fontSize: '10px', color: 'var(--text-subtle)', marginTop: '2px', lineHeight: '1.2' }}>
                    {line.priceNote}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  className="input tabular-nums"
                  style={{ height: '30px', fontSize: '12px', width: '100%' }}
                  value={line.unitPrice}
                  placeholder={line.priceNote ? '沿用原价' : '0.00'}
                  onChange={e => onChange({
                    ...line,
                    unitPrice: e.target.value,
                    priceEdited: e.target.value.trim() !== '',
                    priceSource: e.target.value.trim() !== '' ? '手动修改' : undefined,
                  })}
                />
                {line.priceNote && (
                  <div style={{ fontSize: '10px', color: 'var(--text-subtle)', marginTop: '2px', lineHeight: '1.2' }}>
                    {line.priceNote}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'right' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-subtle)', display: 'block', marginBottom: '2px' }}>小计</label>
            <span className="tabular-nums" style={{ fontWeight: 600, fontSize: '13px', display: 'block', paddingTop: '6px' }}>
              {calculatedLine ? `¥${calculatedLine.netAmount}` : '待报价'}
            </span>
            {isAdmin && calculatedLine?.grossProfit && (
              <span style={{ fontSize: '10px', color: Number(calculatedLine.grossProfit) >= 0 ? 'var(--success)' : 'var(--danger)', display: 'block' }}>
                毛利: ¥{calculatedLine.grossProfit}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expandable Configuration Drawer (Allocation & Remark) */}
      {expanded && (
        <div style={{ padding: '12px 16px', background: 'var(--bg-surface-subtle)', borderTop: '1px solid var(--border-default)', fontSize: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontWeight: 600 }}>出库批次规则:</span>
              {readOnly ? (
                <span className="badge badge-default">{line.allocationMode === 'auto' ? '自动 (FIFO)' : '手动批次'}</span>
              ) : (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={`alloc-${line.clientLineId}`}
                      checked={line.allocationMode === 'auto'}
                      onChange={() => onChange(switchAllocationMode(line, 'auto'))}
                    />
                    <span>先进先出自动分配 (FIFO)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={`alloc-${line.clientLineId}`}
                      checked={line.allocationMode === 'manual'}
                      onChange={() => {
                        onChange(switchAllocationMode(line, 'manual'));
                        void loadBatches();
                      }}
                    />
                    <span>手动指定批次</span>
                  </label>
                </div>
              )}
            </div>

            {line.allocationMode === 'manual' && isShortage && (
              <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                <AlertCircleIcon size={14} />
                需分配 {targetBaseQty} 基础单位，当前已选 {allocatedBaseQty}，还需补选 {targetBaseQty - allocatedBaseQty}
              </span>
            )}
            {line.allocationMode === 'manual' && isOverAllocated && (
              <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                <AlertCircleIcon size={14} />
                已超配 {allocatedBaseQty - targetBaseQty} 基础单位
              </span>
            )}
          </div>

          {/* Manual batch selection items */}
          {line.allocationMode === 'manual' && !readOnly && (
            <div style={{ marginTop: '8px', padding: '8px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }}>
              {loadingBatches ? (
                <div style={{ padding: '8px', color: 'var(--text-subtle)' }}>加载批次中...</div>
              ) : batches.length === 0 ? (
                <div style={{ padding: '8px', color: 'var(--warning)' }}>当前仓库暂无可用批次余量</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {batches.map(b => {
                    const sel = line.batchSelections.find(s => s.batchId === b.id);
                    const curQty = sel?.quantityBase || 0;
                    return (
                      <div
                        key={b.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          border: '1px solid var(--border-light)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 600 }}>批次 #{b.id.substring(0, 8)}</span>
                          <span style={{ color: 'var(--text-muted)', marginLeft: '10px' }}>
                            入库: {b.receivedAt ? b.receivedAt.substring(0, 10) : '—'}
                          </span>
                          <span style={{ color: 'var(--text-muted)', marginLeft: '10px' }}>
                            可用余量: {b.quantityBase}
                          </span>
                          {isAdmin && (
                            <span style={{ color: 'var(--text-subtle)', marginLeft: '10px' }}>
                              单位成本: ¥{b.unitCost}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: 'var(--text-subtle)', fontSize: '11px' }}>分配量:</span>
                            <input
                              type="text"
                              disabled={readOnly}
                              className="input tabular-nums"
                              style={{
                                width: '80px',
                                height: '26px',
                                fontSize: '11px',
                                padding: '2px 6px',
                                borderColor: line.batchSelectionErrors?.[b.id] ? 'var(--danger)' : undefined,
                                backgroundColor: line.batchSelectionErrors?.[b.id] ? 'var(--danger-bg)' : undefined,
                              }}
                              value={line.batchSelectionsRaw?.[b.id] ?? (curQty ? String(curQty) : '')}
                              onChange={e => {
                                onChange(updateBatchAllocation(line, b.id, e.target.value, b.quantityBase));
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

          {/* Remark for line */}
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--text-subtle)' }}>单行备注:</span>
            {readOnly ? (
              <span>{line.remark || '无'}</span>
            ) : (
              <input
                type="text"
                className="input"
                placeholder="填写本行特殊要求或说明..."
                value={line.remark || ''}
                onChange={e => onChange({ ...line, remark: e.target.value })}
                style={{ flex: 1, height: '28px', fontSize: '12px' }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
