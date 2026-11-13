import React, { useState, useRef, useEffect } from 'react';
import type { OrderAny, OrderLineAdmin } from '../../../api/types.js';
import * as api from '../../../api/client.js';
import { XIcon, CheckIcon, AlertCircleIcon } from '../../../components/icons/index.js';

interface OrderReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderAny;
  onReturnSuccess: () => void;
}

export function OrderReturnModal({
  isOpen,
  onClose,
  order,
  onReturnSuccess,
}: OrderReturnModalProps) {
  const [reason, setReason] = useState('');
  const intentKeyRef = useRef<string>(api.generateIdempotencyKey());
  const resetIntentKey = () => {
    intentKeyRef.current = api.generateIdempotencyKey();
  };
  const [returnSelections, setReturnSelections] = useState<
    Record<
      string,
      {
        quantityBase: number;
        disposition: 'pending' | 'not_returning';
        saleAllocationId?: string;
      }
    >
  >({});
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});
  const [quantityErrors, setQuantityErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetSession = () => {
    setReason('');
    setReturnSelections({});
    setRawInputs({});
    setQuantityErrors({});
    setError(null);
    resetIntentKey();
  };

  // Retire previous intent and clean temporary selections when order version or ID changes
  const prevOrderRef = useRef({ id: order.id, version: order.version });
  useEffect(() => {
    if (prevOrderRef.current.id !== order.id || prevOrderRef.current.version !== order.version) {
      prevOrderRef.current = { id: order.id, version: order.version };
      resetSession();
    }
  }, [order.id, order.version]);

  const handleClose = () => {
    resetSession();
    onClose();
  };

  if (!isOpen) return null;

  // Filter lines that are normal/derived and have remaining refundable base quantity
  const returnableLines = order.lines.filter(l => {
    if (l.readOnly || l.kind === 'return_history') return false;
    const returned = l.returnedQuantityBase || 0;
    return l.quantityBase > returned;
  });

  const handleRawQuantityChange = (lineId: string, rawVal: string, maxQty: number) => {
    resetIntentKey();
    const trimmed = rawVal.trim();
    setRawInputs(prev => ({ ...prev, [lineId]: rawVal }));

    if (trimmed === '') {
      setQuantityErrors(prev => {
        const copy = { ...prev };
        delete copy[lineId];
        return copy;
      });
      setReturnSelections(prev => {
        const copy = { ...prev };
        delete copy[lineId];
        return copy;
      });
      return;
    }

    // Strict positive integer validation: reject decimals (e.g. 1.5)
    if (!/^[1-9]\d*$/.test(trimmed)) {
      setQuantityErrors(prev => ({
        ...prev,
        [lineId]: '退货数量必须为正整数，不支持小数或负数',
      }));
      setReturnSelections(prev => {
        const copy = { ...prev };
        delete copy[lineId];
        return copy;
      });
      return;
    }

    const num = Number(trimmed);
    if (!Number.isSafeInteger(num)) {
      setQuantityErrors(prev => ({
        ...prev,
        [lineId]: '数值超出安全整数范围',
      }));
      setReturnSelections(prev => {
        const copy = { ...prev };
        delete copy[lineId];
        return copy;
      });
      return;
    }

    if (num > maxQty) {
      setQuantityErrors(prev => ({
        ...prev,
        [lineId]: `超出最大可退数量(${maxQty})`,
      }));
      setReturnSelections(prev => {
        const copy = { ...prev };
        delete copy[lineId];
        return copy;
      });
      return;
    }

    // Valid positive integer within range
    setQuantityErrors(prev => {
      const copy = { ...prev };
      delete copy[lineId];
      return copy;
    });

    setReturnSelections(prev => ({
      ...prev,
      [lineId]: {
        quantityBase: num,
        disposition: prev[lineId]?.disposition || 'pending',
        saleAllocationId: prev[lineId]?.saleAllocationId,
      },
    }));
  };

  const handleDispositionChange = (lineId: string, disp: 'pending' | 'not_returning') => {
    resetIntentKey();
    setReturnSelections(prev => {
      if (!prev[lineId]) return prev;
      return {
        ...prev,
        [lineId]: { ...prev[lineId]!, disposition: disp },
      };
    });
  };

  const handleSaleAllocationChange = (lineId: string, allocId: string) => {
    resetIntentKey();
    setReturnSelections(prev => {
      if (!prev[lineId]) return prev;
      return {
        ...prev,
        [lineId]: {
          ...prev[lineId]!,
          saleAllocationId: allocId || undefined,
        },
      };
    });
  };

  const hasValidationErrors = Object.keys(quantityErrors).length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('请填写退货原因');
      return;
    }

    if (hasValidationErrors) {
      setError('存在数量不合法项，退货数量必须为正整数');
      return;
    }

    const linesToReturn = Object.entries(returnSelections).map(([lineId, item]) => {
      const payloadLine: {
        lineId: string;
        quantityBase: number;
        restockDisposition: 'pending' | 'not_returning';
        allocationSelections?: { saleAllocationId: string; quantityBase: number }[];
      } = {
        lineId,
        quantityBase: item.quantityBase,
        restockDisposition: item.disposition,
      };

      if (item.saleAllocationId) {
        payloadLine.allocationSelections = [
          {
            saleAllocationId: item.saleAllocationId,
            quantityBase: item.quantityBase,
          },
        ];
      }

      return payloadLine;
    });

    if (linesToReturn.length === 0) {
      setError('请至少选择一件商品的有效正整数退货基础数量');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.confirmReturn(
        order.id,
        {
          expectedVersion: order.version,
          reason: reason.trim(),
          lines: linesToReturn,
        },
        intentKeyRef.current
      );
      resetSession();
      onReturnSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '确认退货失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-wide">
        <div className="modal-header">
          <div>
            <span style={{ fontWeight: 600, fontSize: '16px' }}>办理部分退货 - 订单 {order.orderNo}</span>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              按原单销售行及批次来源办理退货信用，退货不超可退余量
            </div>
          </div>
          <button onClick={handleClose} className="btn btn-ghost btn-sm" style={{ padding: '4px' }}>
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

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                退货原因说明 <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                className="input"
                required
                placeholder="例如：客户少收破损、商品保质期临近或规格选错..."
                value={reason}
                onChange={e => {
                  resetIntentKey();
                  setReason(e.target.value);
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                选择退货明细与数量 (按基础单位换算)
              </div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>商品名称</th>
                      <th>出货仓</th>
                      <th>原销总量</th>
                      <th>已退余量</th>
                      <th>本次退货量 (基础单位)</th>
                      <th>返库处置</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnableLines.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-subtle)' }}>
                          本单无可用可退明细
                        </td>
                      </tr>
                    ) : (
                      returnableLines.map(line => {
                        const returned = line.returnedQuantityBase || 0;
                        const maxReturnable = line.quantityBase - returned;
                        const curDisp = returnSelections[line.id]?.disposition || 'pending';
                        const rawVal = rawInputs[line.id] ?? '';
                        const inputErr = quantityErrors[line.id];
                        const adminLine = 'allocations' in line ? (line as OrderLineAdmin) : null;
                        const allocations = adminLine?.allocations || [];

                        return (
                          <tr key={line.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{line.productName}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{line.specification}</div>
                              {allocations.length > 1 && (
                                <div style={{ marginTop: '4px' }}>
                                  <label style={{ fontSize: '10px', color: 'var(--text-subtle)', display: 'block' }}>指定原出库批次来源 (可选)</label>
                                  <select
                                    className="select"
                                    style={{ height: '24px', fontSize: '10px', padding: '1px 4px', maxWidth: '200px' }}
                                    value={returnSelections[line.id]?.saleAllocationId || ''}
                                    onChange={e => handleSaleAllocationChange(line.id, e.target.value)}
                                  >
                                    <option value="">系统自动分配 (后扣先退)</option>
                                    {allocations.map(al => (
                                      <option key={al.id} value={al.id}>
                                        原批次量: {al.quantityBase}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </td>
                            <td>{line.warehouseName}</td>
                            <td className="tabular-nums">{line.quantityBase}</td>
                            <td className="tabular-nums">{returned}</td>
                            <td>
                              <input
                                type="text"
                                className="input tabular-nums"
                                style={{
                                  width: '90px',
                                  height: '28px',
                                  fontSize: '12px',
                                  borderColor: inputErr ? 'var(--danger)' : undefined,
                                  backgroundColor: inputErr ? 'var(--danger-bg)' : undefined,
                                }}
                                value={rawVal}
                                placeholder={`最多${maxReturnable}`}
                                onChange={e => handleRawQuantityChange(line.id, e.target.value, maxReturnable)}
                              />
                              {inputErr && (
                                <div style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '2px' }}>
                                  {inputErr}
                                </div>
                              )}
                            </td>
                            <td>
                              <select
                                className="select"
                                style={{ height: '28px', fontSize: '11px', padding: '2px 6px' }}
                                value={curDisp}
                                onChange={e => handleDispositionChange(line.id, e.target.value as 'pending' | 'not_returning')}
                                disabled={!returnSelections[line.id] || returnSelections[line.id]!.quantityBase === 0}
                              >
                                <option value="pending">待返库 (后续回补入库)</option>
                                <option value="not_returning">明确报损 (不返库)</option>
                              </select>
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
            <button type="button" onClick={handleClose} className="btn btn-secondary" disabled={submitting}>
              取 消
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || returnableLines.length === 0}>
              <CheckIcon size={16} />
              <span>{submitting ? '正在确认退货...' : '确认办理退货'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
