import React, { useState, useRef } from 'react';
import type { SalesReturn, ReturnAllocationRead } from '../../../api/types.js';
import * as api from '../../../api/client.js';
import { XIcon, CheckIcon, AlertCircleIcon } from '../../../components/icons/index.js';

export function getShanghaiNowInput(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

interface RestockModalProps {
  isOpen: boolean;
  onClose: () => void;
  salesReturn: SalesReturn;
  onRestockSuccess: () => void;
}

export function RestockModal({
  isOpen,
  onClose,
  salesReturn,
  onRestockSuccess,
}: RestockModalProps) {
  const [reason, setReason] = useState('');
  const [restockedAt, setRestockedAt] = useState(() => getShanghaiNowInput());
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});
  const [allocErrors, setAllocErrors] = useState<Record<string, string>>({});
  const [allocSelections, setAllocSelections] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Business intent idempotency key across retry
  const intentKeyRef = useRef<string>(api.generateIdempotencyKey());
  const resetIntentKey = () => {
    intentKeyRef.current = api.generateIdempotencyKey();
  };

  if (!isOpen) return null;

  // Flatten allocations from all return lines that still have remaining restockable quantity
  const restockableAllocations: { lineId: string; allocation: ReturnAllocationRead }[] = [];
  for (const line of salesReturn.lines) {
    if (line.restockDisposition === 'not_returning') continue;
    for (const alloc of line.allocations) {
      const remaining = alloc.quantityBase - alloc.restockedQuantityBase;
      if (remaining > 0) {
        restockableAllocations.push({ lineId: line.id, allocation: alloc });
      }
    }
  }

  const handleRawChange = (allocId: string, val: string, maxQty: number) => {
    resetIntentKey();
    const trimmed = val.trim();
    setRawInputs(prev => ({ ...prev, [allocId]: val }));

    if (trimmed === '') {
      setAllocErrors(prev => {
        const copy = { ...prev };
        delete copy[allocId];
        return copy;
      });
      setAllocSelections(prev => {
        const copy = { ...prev };
        delete copy[allocId];
        return copy;
      });
      return;
    }

    if (!/^[1-9]\d*$/.test(trimmed)) {
      setAllocErrors(prev => ({ ...prev, [allocId]: '返库数量必须为正整数' }));
      setAllocSelections(prev => {
        const copy = { ...prev };
        delete copy[allocId];
        return copy;
      });
      return;
    }

    const num = Number(trimmed);
    if (!Number.isSafeInteger(num)) {
      setAllocErrors(prev => ({ ...prev, [allocId]: '数值超出范围' }));
      setAllocSelections(prev => {
        const copy = { ...prev };
        delete copy[allocId];
        return copy;
      });
      return;
    }

    if (num > maxQty) {
      setAllocErrors(prev => ({ ...prev, [allocId]: `超出可返库余量(${maxQty})` }));
      setAllocSelections(prev => {
        const copy = { ...prev };
        delete copy[allocId];
        return copy;
      });
      return;
    }

    setAllocErrors(prev => {
      const copy = { ...prev };
      delete copy[allocId];
      return copy;
    });
    setAllocSelections(prev => ({ ...prev, [allocId]: num }));
  };

  const hasValidationErrors = Object.keys(allocErrors).length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasValidationErrors) {
      setError('存在数量错误，返库量必须为正整数');
      return;
    }

    const lines = Object.entries(allocSelections)
      .filter(([_, qty]) => qty > 0)
      .map(([returnAllocationId, quantityBase]) => ({
        returnAllocationId,
        quantityBase,
      }));

    if (lines.length === 0) {
      setError('请至少填写一个批次分配的返库正整数数量');
      return;
    }

    // Format Shanghai ISO timestamp: YYYY-MM-DDTHH:mm:00+08:00
    const timeFormatted = restockedAt.length === 16 ? `${restockedAt}:00+08:00` : new Date().toISOString();

    setSubmitting(true);
    setError(null);
    try {
      await api.recordRestock(
        salesReturn.id,
        {
          expectedVersion: salesReturn.version,
          restockedAt: timeFormatted,
          reason: reason.trim() || undefined,
          lines,
        },
        intentKeyRef.current
      );
      onRestockSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '记录返库入库失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-wide">
        <div className="modal-header">
          <div>
            <span style={{ fontWeight: 600, fontSize: '16px' }}>
              办理商品返库入库 - 退货单 {salesReturn.returnNo}
            </span>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              原仓原批精确回补库存；支持分次提交，每次不可超过各批次可返库余量
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: '4px' }}>
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px' }}>
                <AlertCircleIcon size={16} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                  实际返库入库时间
                </label>
                <input
                  type="datetime-local"
                  className="input"
                  value={restockedAt}
                  onChange={e => {
                    resetIntentKey();
                    setRestockedAt(e.target.value);
                  }}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                  返库原因 / 仓管备注说明
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="例如：验货合格入库、重新归位上架..."
                  value={reason}
                  onChange={e => {
                    resetIntentKey();
                    setReason(e.target.value);
                  }}
                />
              </div>
            </div>

            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                各退货批次返库分配明细 (原仓原批锁定)
              </div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>退货分配ID</th>
                      <th>所属仓库ID</th>
                      <th>批次ID</th>
                      <th>退货量</th>
                      <th>已返库量</th>
                      <th>可返库余量</th>
                      <th>本次返库数量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restockableAllocations.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-subtle)' }}>
                          当前退货单所有可返库明细均已全量返库或被作废吸收
                        </td>
                      </tr>
                    ) : (
                      restockableAllocations.map(({ allocation: alloc }) => {
                        const remaining = alloc.quantityBase - alloc.restockedQuantityBase;
                        const rawVal = rawInputs[alloc.id] ?? '';
                        const allocErr = allocErrors[alloc.id];

                        return (
                          <tr key={alloc.id}>
                            <td style={{ fontSize: '11px', fontFamily: 'monospace' }}>{alloc.id.substring(0, 8)}...</td>
                            <td style={{ fontSize: '11px', fontFamily: 'monospace' }}>{alloc.warehouseId.substring(0, 8)}...</td>
                            <td style={{ fontSize: '11px', fontFamily: 'monospace' }}>{alloc.batchId.substring(0, 8)}...</td>
                            <td className="tabular-nums">{alloc.quantityBase}</td>
                            <td className="tabular-nums">{alloc.restockedQuantityBase}</td>
                            <td className="tabular-nums" style={{ fontWeight: 600, color: 'var(--accent)' }}>
                              {remaining}
                            </td>
                            <td>
                              <input
                                type="text"
                                className="input tabular-nums"
                                style={{
                                  width: '90px',
                                  height: '28px',
                                  fontSize: '12px',
                                  borderColor: allocErr ? 'var(--danger)' : undefined,
                                  backgroundColor: allocErr ? 'var(--danger-bg)' : undefined,
                                }}
                                value={rawVal}
                                placeholder={`最多${remaining}`}
                                onChange={e => handleRawChange(alloc.id, e.target.value, remaining)}
                              />
                              {allocErr && (
                                <div style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '2px' }}>
                                  {allocErr}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={submitting}>
              取 消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || restockableAllocations.length === 0}
            >
              <CheckIcon size={16} />
              <span>{submitting ? '正在登记返库...' : '确认返库入库'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
