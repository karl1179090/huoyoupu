import React, { useState, useEffect, useRef } from 'react';
import type { CashEvent, Customer, OrderSummaryAny, PaymentAllocation, CashInput, ReasonInput } from '../../api/types.js';
import * as api from '../../api/client.js';
import {
  DollarIcon,
  PlusIcon,
  SearchIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  CheckIcon,
} from '../../components/icons/index.js';
import {
  validateMoney,
  validateAllocations,
  formatShanghaiDisplay,
  formatSignedMoney,
  type AllocationDraft,
} from './financeLogic.js';
import {
  getCurrentShanghaiDateTime,
  formatShanghaiDateTime,
} from '../inventory/inventoryLogic.js';
import './finance.css';

export interface CashEventsPageProps {
  onNavigateToCustomerFinance?: () => void;
  onNavigateToSource?: (href: string) => void;
  initialCashEventId?: string;
  initialCustomerId?: string;
}

export function CashEventsPage({
  onNavigateToCustomerFinance,
  onNavigateToSource,
  initialCashEventId,
  initialCustomerId,
}: CashEventsPageProps) {
  const [events, setEvents] = useState<CashEvent[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId || '');

  // Target Cash Event for initialCashEventId deep navigation (P2)
  const [targetCashEvent, setTargetCashEvent] = useState<CashEvent | null>(null);
  const [targetNotFoundError, setTargetNotFoundError] = useState<string | null>(null);
  const cashDetailScopeRef = useRef<{ id: string; generation: number }>({ id: '', generation: 0 });

  // Create Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [kind, setKind] = useState<'receipt' | 'refund'>('receipt');
  const [targetCustomerId, setTargetCustomerId] = useState('');
  const [amount, setAmount] = useState('100.00');
  const [method, setMethod] = useState<'cash' | 'bank_transfer' | 'wechat' | 'alipay' | 'other'>('bank_transfer');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [relatedReturnId, setRelatedReturnId] = useState('');

  // Shanghai datetime
  const initialShTime = getCurrentShanghaiDateTime();
  const [occurredDate, setOccurredDate] = useState(initialShTime.date);
  const [occurredTime, setOccurredTime] = useState(initialShTime.time);

  // Allocation mode
  const [allocationMode, setAllocationMode] = useState<'auto' | 'manual'>('auto');
  const [manualAllocations, setManualAllocations] = useState<AllocationDraft[]>([]);
  const [targetCustomerOrders, setTargetCustomerOrders] = useState<OrderSummaryAny[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Reverse Modal
  const [reverseModalOpen, setReverseModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CashEvent | null>(null);
  const [reverseReason, setReverseReason] = useState('登记错误红字冲正');
  const [reversing, setReversing] = useState(false);

  // Idempotency Intent Key & Frozen Payload Management (P1: Freeze on retry, rotate on edit)
  const cashIntentKeyRef = useRef<string>(crypto.randomUUID());
  const frozenCashPayloadRef = useRef<{ customerId: string; payload: CashInput } | null>(null);

  const reverseIntentKeyRef = useRef<string>(crypto.randomUUID());
  const frozenReversePayloadRef = useRef<{ eventId: string; expectedVersion: number; reason: string } | null>(null);

  const rotateCashKey = () => {
    cashIntentKeyRef.current = crypto.randomUUID();
    frozenCashPayloadRef.current = null;
  };
  const rotateReverseKey = () => {
    reverseIntentKeyRef.current = crypto.randomUUID();
    frozenReversePayloadRef.current = null;
  };

  // Scope & Generation guard for cash events list pagination (P2)
  const eventsScopeRef = useRef<{ customerId: string; generation: number }>({ customerId: '', generation: 0 });

  useEffect(() => {
    let cancelled = false;
    async function fetchAllCustomers() {
      try {
        const all: Customer[] = [];
        let cursor: string | undefined = undefined;
        do {
          const res = await api.listCustomers({ limit: 100, cursor });
          all.push(...res.items);
          cursor = res.nextCursor || undefined;
        } while (cursor);
        if (!cancelled) {
          setCustomers(all);
          if (all.length > 0 && !targetCustomerId) {
            setTargetCustomerId(all[0]!.id);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载客户列表失败');
        }
      }
    }
    void fetchAllCustomers();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (initialCustomerId && initialCustomerId !== selectedCustomerId) {
      setSelectedCustomerId(initialCustomerId);
    }
  }, [initialCustomerId]);

  useEffect(() => {
    if (!initialCashEventId) {
      setTargetCashEvent(null);
      setTargetNotFoundError(null);
      return;
    }
    const gen = ++cashDetailScopeRef.current.generation;
    cashDetailScopeRef.current.id = initialCashEventId;

    async function fetchTargetCashEvent() {
      try {
        const ev = await api.getCashEvent(initialCashEventId!);
        if (
          cashDetailScopeRef.current.generation !== gen ||
          cashDetailScopeRef.current.id !== initialCashEventId
        ) {
          return;
        }
        setTargetCashEvent(ev);
        setTargetNotFoundError(null);
        if (ev.customerId && ev.customerId !== selectedCustomerId) {
          eventsScopeRef.current.customerId = ev.customerId;
          setSelectedCustomerId(ev.customerId);
        }
      } catch (err: unknown) {
        if (
          cashDetailScopeRef.current.generation !== gen ||
          cashDetailScopeRef.current.id !== initialCashEventId
        ) {
          return;
        }
        setTargetCashEvent(null);
        setTargetNotFoundError(`未找到指定的收退款流水来源: #${initialCashEventId} (${err instanceof Error ? err.message : '404'})`);
      }
    }
    void fetchTargetCashEvent();
  }, [initialCashEventId]);

  const displayedEvents = React.useMemo(() => {
    if (!targetCashEvent) return events;
    if (events.some(e => e.id === targetCashEvent.id)) return events;
    if (!selectedCustomerId || targetCashEvent.customerId === selectedCustomerId) {
      return [targetCashEvent, ...events];
    }
    return events;
  }, [events, targetCashEvent, selectedCustomerId]);

  useEffect(() => {
    void loadEvents(true);
  }, [selectedCustomerId]);

  const loadTargetCustomerOrders = async (cid: string) => {
    try {
      const allOrders: OrderSummaryAny[] = [];
      let cursor: string | undefined = undefined;
      do {
        const res = await api.listOrders({ customerId: cid, limit: 100, cursor });
        allOrders.push(...res.items);
        cursor = res.nextCursor || undefined;
      } while (cursor);
      setTargetCustomerOrders(allOrders);
    } catch {
      setTargetCustomerOrders([]);
    }
  };

  useEffect(() => {
    if (targetCustomerId) {
      void loadTargetCustomerOrders(targetCustomerId);
    }
  }, [targetCustomerId]);

  const loadEvents = async (reset: boolean) => {
    const gen = ++eventsScopeRef.current.generation;
    eventsScopeRef.current.customerId = selectedCustomerId;

    if (reset) {
      setEvents([]);
      setNextCursor(null);
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const cursor = reset ? undefined : (nextCursor || undefined);
      const res = await api.listCashEvents({
        customerId: selectedCustomerId || undefined,
        limit: 50,
        cursor,
      });
      if (eventsScopeRef.current.generation !== gen || eventsScopeRef.current.customerId !== selectedCustomerId) {
        return; // Discard stale response
      }
      if (reset) {
        setEvents(res.items);
      } else {
        setEvents(prev => [...prev, ...res.items]);
      }
      setNextCursor(res.nextCursor);
    } catch (err: unknown) {
      if (eventsScopeRef.current.generation !== gen || eventsScopeRef.current.customerId !== selectedCustomerId) {
        return;
      }
      setError(err instanceof Error ? err.message : '加载收退款流水失败');
    } finally {
      if (eventsScopeRef.current.generation === gen && eventsScopeRef.current.customerId === selectedCustomerId) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCustomerId) return;

    let payload: CashInput;
    if (frozenCashPayloadRef.current && frozenCashPayloadRef.current.customerId === targetCustomerId) {
      payload = frozenCashPayloadRef.current.payload;
    } else {
      const amountCheck = validateMoney(amount);
      if (!amountCheck.valid) {
        setError(`金额格式错误: ${amountCheck.error}`);
        return;
      }

      const shanghaiOccurredAt = formatShanghaiDateTime(occurredDate, occurredTime);

      if (kind === 'receipt') {
        let allocationsPayload: PaymentAllocation[] | undefined = undefined;
        if (allocationMode === 'manual') {
          const v = validateAllocations(manualAllocations, amountCheck.value!);
          if (!v.valid) {
            setError(v.error || '多单分摊校验未通过');
            return;
          }
          allocationsPayload = manualAllocations.map(a => ({
            orderId: a.orderId,
            amount: validateMoney(a.amount).value!,
          }));
        }

        payload = {
          kind: 'receipt',
          customerId: targetCustomerId,
          amount: amountCheck.value!,
          occurredAt: shanghaiOccurredAt,
          method,
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
          allocationMode,
          allocations: allocationsPayload,
        };
      } else {
        payload = {
          kind: 'refund',
          customerId: targetCustomerId,
          amount: amountCheck.value!,
          occurredAt: shanghaiOccurredAt,
          method,
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
          relatedReturnId: relatedReturnId.trim() || undefined,
        };
      }
      frozenCashPayloadRef.current = { customerId: targetCustomerId, payload };
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.recordCashEvent(payload, cashIntentKeyRef.current);

      rotateCashKey();
      setCreateModalOpen(false);
      setReference('');
      setNote('');
      setManualAllocations([]);
      setSuccessMsg('资金流水已成功登记！');
      void loadEvents(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '记录收退款失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent || !reverseReason.trim()) return;

    let payload: { eventId: string; expectedVersion: number; reason: string };
    if (frozenReversePayloadRef.current && frozenReversePayloadRef.current.eventId === selectedEvent.id) {
      payload = frozenReversePayloadRef.current;
    } else {
      payload = {
        eventId: selectedEvent.id,
        expectedVersion: selectedEvent.version,
        reason: reverseReason.trim(),
      };
      frozenReversePayloadRef.current = payload;
    }

    setReversing(true);
    setError(null);
    try {
      await api.reverseCashEvent(
        payload.eventId,
        {
          expectedVersion: payload.expectedVersion,
          reason: payload.reason,
        },
        reverseIntentKeyRef.current
      );
      rotateReverseKey();
      setReverseModalOpen(false);
      setSelectedEvent(null);
      setReverseReason('');
      setSuccessMsg(`流水 #${payload.eventId.substring(0, 8)} 已成功执行红字冲正！`);
      void loadEvents(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '红字冲销失败');
    } finally {
      setReversing(false);
    }
  };

  return (
    <div className="fin-container">
      {/* Header */}
      <div className="fin-header">
        <div className="fin-header-title">
          <h1>收退款流水台账</h1>
          <p>
            记录客户直接收款、退款事件与往来款红字冲销，保留不可篡改审计事实与冲正追溯
          </p>
        </div>

        <div className="fin-header-actions">
          {onNavigateToCustomerFinance && (
            <button onClick={onNavigateToCustomerFinance} className="btn btn-secondary">
              <DollarIcon size={16} />
              <span>客户往来明细</span>
            </button>
          )}
          <button onClick={() => setCreateModalOpen(true)} className="btn btn-primary">
            <PlusIcon size={16} />
            <span>登记收退款</span>
          </button>
        </div>
      </div>

      {targetNotFoundError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px' }}>
          <AlertCircleIcon size={16} />
          <span>{targetNotFoundError}</span>
        </div>
      )}

      {error && (
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

      {/* Filter Bar */}
      <div className="card">
        <div className="card-body" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>筛选客户:</span>
            <select
              className="select"
              style={{ width: '240px' }}
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
            >
              <option value="">全部客户</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <button onClick={() => void loadEvents(true)} className="btn btn-ghost btn-sm">
            <RefreshCwIcon size={16} />
          </button>
        </div>
      </div>

      {/* Events Table */}
      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>流水编号</th>
                <th>客户名称</th>
                <th>资金类型</th>
                <th className="text-right">发生金额 (元)</th>
                <th>结算方式</th>
                <th>实际发生时间</th>
                <th>系统登账时间</th>
                <th>凭证 / 备注</th>
                <th>流水状态</th>
                <th style={{ textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && displayedEvents.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-subtle)' }}>正在加载流水记录...</td></tr>
              ) : displayedEvents.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-subtle)' }}>暂无匹配的收退款流水</td></tr>
              ) : (
                displayedEvents.map(ev => {
                  const isReversed = ev.status === 'reversed';
                  const isTarget = ev.id === initialCashEventId;
                  return (
                    <tr
                      key={ev.id}
                      id={`cash-event-${ev.id}`}
                      style={{
                        background: isTarget ? 'var(--primary-bg, #eff6ff)' : undefined,
                        outline: isTarget ? '2px solid var(--primary, #2563eb)' : undefined,
                        opacity: isReversed && !isTarget ? 0.7 : 1,
                      }}
                    >
                      <td style={{ fontWeight: 600 }} className="font-mono">#{ev.id.substring(0, 8)}</td>
                      <td style={{ fontWeight: 600 }}>{ev.customerName || ev.customerId.substring(0, 8)}</td>
                      <td>
                        <span className={`badge ${ev.kind === 'receipt' ? 'badge-success' : 'badge-info'}`}>
                          {ev.kind === 'receipt' ? '实际收款' : '实际退款'}
                        </span>
                      </td>
                      <td className="tabular-nums text-right" style={{ fontWeight: 700, color: ev.kind === 'receipt' ? 'var(--success)' : 'var(--danger)' }}>
                        {formatSignedMoney(ev.kind === 'refund' ? `-${ev.amount.replace(/^-/, '')}` : ev.amount, true)}
                      </td>
                      <td>
                        <span style={{ fontSize: '12px' }}>
                          {ev.method === 'wechat' ? '微信支付' :
                           ev.method === 'alipay' ? '支付宝' :
                           ev.method === 'bank_transfer' ? '银行转账' :
                           ev.method === 'cash' ? '现金现收' : ev.method}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px' }}>{formatShanghaiDisplay(ev.occurredAt)}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatShanghaiDisplay(ev.recordedAt)}</td>
                      <td style={{ fontSize: '12px' }}>
                        {ev.reference && <div className="font-mono">单号: {ev.reference}</div>}
                        {ev.note && <div style={{ color: 'var(--text-muted)' }}>{ev.note}</div>}
                        {!ev.reference && !ev.note && <span style={{ color: 'var(--text-subtle)' }}>—</span>}
                      </td>
                      <td>
                        <span className={`badge ${isReversed ? 'badge-danger' : 'badge-default'}`}>
                          {isReversed ? '已红字冲正' : '有效登账'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {!isReversed && (
                          <button
                            onClick={() => {
                              rotateReverseKey();
                              setSelectedEvent(ev);
                              setReverseReason('业务凭证录入有误，红字冲销');
                              setReverseModalOpen(true);
                            }}
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger)', fontSize: '12px' }}
                          >
                            红字冲销
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="inv-table-footer">
            <span>已加载 {events.length} 笔流水</span>
            {nextCursor && (
              <button
                onClick={() => void loadEvents(false)}
                disabled={loadingMore}
                className="btn btn-secondary btn-sm"
              >
                {loadingMore ? '正在加载更多...' : '加载更多流水 (游标分页)'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {createModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>登记客户收退款流水</span>
              <button onClick={() => setCreateModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>资金流向类型 *</label>
                    <select
                      className="select"
                      value={kind}
                      onChange={e => {
                        rotateCashKey();
                        setKind(e.target.value as any);
                      }}
                    >
                      <option value="receipt">实际收款 (增加现金与核销)</option>
                      <option value="refund">实际退款 (退还客户预存)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>目标结算客户 *</label>
                    <select
                      className="select"
                      value={targetCustomerId}
                      onChange={e => {
                        rotateCashKey();
                        setTargetCustomerId(e.target.value);
                      }}
                    >
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>金额 (元) *</label>
                    <input
                      type="text"
                      className="input tabular-nums"
                      required
                      value={amount}
                      onChange={e => {
                        rotateCashKey();
                        setAmount(e.target.value);
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>结算方式 *</label>
                    <select
                      className="select"
                      value={method}
                      onChange={e => {
                        rotateCashKey();
                        setMethod(e.target.value as any);
                      }}
                    >
                      <option value="bank_transfer">银行转账</option>
                      <option value="wechat">微信支付</option>
                      <option value="alipay">支付宝</option>
                      <option value="cash">现金现收</option>
                      <option value="other">其他</option>
                    </select>
                  </div>
                </div>

                {/* Occurrence datetime (Shanghai, retroactive) */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    实际发生时间 (上海业务时间，可补录) *
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="date"
                      className="input"
                      style={{ flex: 1.2 }}
                      value={occurredDate}
                      onChange={e => {
                        rotateCashKey();
                        setOccurredDate(e.target.value);
                      }}
                    />
                    <input
                      type="time"
                      className="input"
                      style={{ flex: 1 }}
                      value={occurredTime}
                      onChange={e => {
                        rotateCashKey();
                        setOccurredTime(e.target.value);
                      }}
                    />
                  </div>
                </div>

                {kind === 'receipt' ? (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>核销分摊方式</label>
                    <select
                      className="select"
                      value={allocationMode}
                      onChange={e => {
                        const m = e.target.value as any;
                        setAllocationMode(m);
                        rotateCashKey();
                        if (m === 'manual' && manualAllocations.length === 0 && targetCustomerOrders.length > 0) {
                          setManualAllocations([{ orderId: targetCustomerOrders[0]!.id, amount }]);
                        }
                      }}
                    >
                      <option value="auto">自动核销最早欠款 (auto)</option>
                      <option value="manual">手动指定多单分摊 (manual)</option>
                    </select>

                    {allocationMode === 'manual' && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--border-default)', padding: '10px', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>指定分摊订单与核销金额:</span>
                          <button
                            type="button"
                            onClick={() => {
                              rotateCashKey();
                              if (targetCustomerOrders.length === 0) return;
                              const available = targetCustomerOrders.find(o => !manualAllocations.some(a => a.orderId === o.id));
                              const orderId = available ? available.id : targetCustomerOrders[0]!.id;
                              setManualAllocations(prev => [...prev, { orderId, amount: '50.00' }]);
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '11px', padding: '2px 8px' }}
                          >
                            + 增加订单分摊
                          </button>
                        </div>

                        {manualAllocations.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-subtle)', fontSize: '12px' }}>
                            点击上方按钮添加要分摊的客户订单
                          </div>
                        ) : (
                          manualAllocations.map((alloc, idx) => (
                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 30px', gap: '6px', alignItems: 'center' }}>
                              <select
                                className="select"
                                style={{ fontSize: '12px', height: '30px' }}
                                value={alloc.orderId}
                                onChange={e => {
                                  rotateCashKey();
                                  const val = e.target.value;
                                  setManualAllocations(prev => prev.map((a, i) => (i === idx ? { ...a, orderId: val } : a)));
                                }}
                              >
                                {targetCustomerOrders.map(o => (
                                  <option key={o.id} value={o.id}>
                                    单号: {o.orderNo} (应收: ¥{o.totalAmount})
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                className="input tabular-nums"
                                style={{ fontSize: '12px', height: '30px' }}
                                placeholder="分摊金额"
                                value={alloc.amount}
                                onChange={e => {
                                  rotateCashKey();
                                  const val = e.target.value;
                                  setManualAllocations(prev => prev.map((a, i) => (i === idx ? { ...a, amount: val } : a)));
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  rotateCashKey();
                                  setManualAllocations(prev => prev.filter((_, i) => i !== idx));
                                }}
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--danger)', padding: '2px' }}
                              >
                                ✕
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>关联退货单 ID (可选)</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="关联的 SalesReturn ID"
                      value={relatedReturnId}
                      onChange={e => {
                        rotateCashKey();
                        setRelatedReturnId(e.target.value);
                      }}
                    />
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>业务单号 / 凭据</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="如银行单号..."
                      value={reference}
                      onChange={e => {
                        rotateCashKey();
                        setReference(e.target.value);
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>备注说明</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="经办备注..."
                      value={note}
                      onChange={e => {
                        rotateCashKey();
                        setNote(e.target.value);
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setCreateModalOpen(false)} className="btn btn-secondary">
                  取消
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? '正在登记...' : '确认登记入账'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reverse Modal */}
      {reverseModalOpen && selectedEvent && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>红字冲销流水 #{selectedEvent.id.substring(0, 8)}</span>
              <button onClick={() => setReverseModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <form onSubmit={handleReverse}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--danger)' }}>
                  红字冲销将保留原业务流水事实，并生成红字冲正分录予以冲减。此操作不可逆。
                </div>

                <div style={{ fontSize: '13px' }}>
                  冲销客户: <strong>{selectedEvent.customerName}</strong> | 金额: <strong>¥{selectedEvent.amount}</strong>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    冲正原因说明 *
                  </label>
                  <input
                    type="text"
                    className="input"
                    required
                    value={reverseReason}
                    onChange={e => {
                      rotateReverseKey();
                      setReverseReason(e.target.value);
                    }}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setReverseModalOpen(false)} className="btn btn-secondary">
                  取消
                </button>
                <button type="submit" className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} disabled={reversing}>
                  {reversing ? '正在冲销...' : '确认红字冲正'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
