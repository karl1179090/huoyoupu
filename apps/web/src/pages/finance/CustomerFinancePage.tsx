import React, { useState, useEffect, useRef } from 'react';
import type {
  Customer,
  CustomerBalance,
  LedgerEntry,
  OrderSummaryAny,
  PaymentAllocation,
  CashInput,
  ApplyCustomerBalanceInput,
  OpeningBalanceInput,
} from '../../api/types.js';
import * as api from '../../api/client.js';
import {
  DollarIcon,
  PlusIcon,
  CheckIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  SearchIcon,
  ClipboardIcon,
} from '../../components/icons/index.js';
import {
  validateMoney,
  validateAllocations,
  formatShanghaiDisplay,
  formatSourceVersionTag,
  parseLedgerKind,
  formatShanghaiPeriod,
  formatSignedMoney,
  locateTargetAcrossPages,
  type AllocationDraft,
} from './financeLogic.js';
import {
  getCurrentShanghaiDateTime,
  formatShanghaiDateTime,
} from '../inventory/inventoryLogic.js';
import { StatementsPage } from './StatementsPage.js';
import { CashEventsPage } from './CashEventsPage.js';
import './finance.css';

export interface CustomerFinancePageProps {
  onNavigateToStatements?: () => void;
  onNavigateToSource?: (href: string) => void;
  initialCustomerId?: string;
  initialLedgerEntryId?: string;
}

export function CustomerFinancePage({
  onNavigateToStatements,
  onNavigateToSource,
  initialCustomerId,
  initialLedgerEntryId,
}: CustomerFinancePageProps) {
  const [subView, setSubView] = useState<'finance' | 'statements' | 'cash-events'>('finance');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId || '');
  const [balance, setBalance] = useState<CustomerBalance | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerNextCursor, setLedgerNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMoreLedger, setLoadingMoreLedger] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Target Ledger Entry deep pagination lookup (P2)
  const [targetLedgerNotFoundError, setTargetLedgerNotFoundError] = useState<string | null>(null);
  const [locatingTargetLedger, setLocatingTargetLedger] = useState(false);

  // Customer Orders (for manual allocation and balance apply)
  const [customerOrders, setCustomerOrders] = useState<OrderSummaryAny[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Cash Receipt / Refund Modal
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [cashKind, setCashKind] = useState<'receipt' | 'refund'>('receipt');
  const [cashAmount, setCashAmount] = useState('100.00');
  const [cashMethod, setCashMethod] = useState<'cash' | 'bank_transfer' | 'wechat' | 'alipay' | 'other'>('wechat');
  const [cashRef, setCashRef] = useState('');
  const [cashNote, setCashNote] = useState('');
  const [relatedReturnId, setRelatedReturnId] = useState('');

  // Occurrence datetime (Shanghai, retroactively editable)
  const initialShTime = getCurrentShanghaiDateTime();
  const [occurredDate, setOccurredDate] = useState(initialShTime.date);
  const [occurredTime, setOccurredTime] = useState(initialShTime.time);

  // Allocation Mode: auto vs manual
  const [allocationMode, setAllocationMode] = useState<'auto' | 'manual'>('auto');
  const [manualAllocations, setManualAllocations] = useState<AllocationDraft[]>([]);
  const [allocationValidation, setAllocationValidation] = useState<{
    valid: boolean;
    totalAllocated: string;
    remainingUnallocated: string;
    error?: string;
    lineErrors?: Record<number, string>;
  }>({ valid: true, totalAllocated: '0.00', remainingUnallocated: '0.00' });

  const [submittingCash, setSubmittingCash] = useState(false);

  // Balance Application Modal (applyCustomerBalance)
  const [balanceApplyModalOpen, setBalanceApplyModalOpen] = useState(false);
  const [balanceAllocations, setBalanceAllocations] = useState<AllocationDraft[]>([]);
  const [balanceApplyReason, setBalanceApplyReason] = useState('使用客户未分配实收款核销订单');
  const [submittingBalanceApply, setSubmittingBalanceApply] = useState(false);

  // Opening Balance Modal
  const [openingModalOpen, setOpeningModalOpen] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('500.00');
  const [openingDate, setOpeningDate] = useState(initialShTime.date);
  const [openingTime, setOpeningTime] = useState(initialShTime.time);
  const [openingReason, setOpeningReason] = useState('期初往来账款对账录入');
  const [submittingOpening, setSubmittingOpening] = useState(false);

  // Idempotency keys & frozen payloads per user intention (P1: frozen on retry, rotated on modification)
  const cashIntentKeyRef = useRef<string>(crypto.randomUUID());
  const frozenCashPayloadRef = useRef<{ customerId: string; kind: 'receipt' | 'refund'; payload: CashInput } | null>(null);

  const balanceApplyKeyRef = useRef<string>(crypto.randomUUID());
  const frozenBalanceApplyPayloadRef = useRef<{ customerId: string; payload: ApplyCustomerBalanceInput } | null>(null);

  const openingKeyRef = useRef<string>(crypto.randomUUID());
  const frozenOpeningPayloadRef = useRef<{ customerId: string; payload: OpeningBalanceInput } | null>(null);

  const rotateCashKey = () => {
    cashIntentKeyRef.current = crypto.randomUUID();
    frozenCashPayloadRef.current = null;
  };
  const rotateBalanceApplyKey = () => {
    balanceApplyKeyRef.current = crypto.randomUUID();
    frozenBalanceApplyPayloadRef.current = null;
  };
  const rotateOpeningKey = () => {
    openingKeyRef.current = crypto.randomUUID();
    frozenOpeningPayloadRef.current = null;
  };

  useEffect(() => {
    if (initialCustomerId && initialCustomerId !== selectedCustomerId) {
      rotateCashKey();
      rotateBalanceApplyKey();
      rotateOpeningKey();
      setSelectedCustomerId(initialCustomerId);
    }
  }, [initialCustomerId]);

  // Scope & Generation guard for Customer Finance async requests (P2)
  const financeScopeRef = useRef<{ customerId: string; generation: number }>({ customerId: '', generation: 0 });
  const ordersScopeRef = useRef<{ customerId: string; generation: number }>({ customerId: '', generation: 0 });

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
          if (all.length > 0 && !selectedCustomerId) {
            setSelectedCustomerId(all[0]!.id);
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
    if (selectedCustomerId) {
      void loadCustomerFinance(selectedCustomerId, true);
      void loadCustomerOrders(selectedCustomerId);
    }
  }, [selectedCustomerId]);

  const loadCustomerFinance = async (cid: string, reset: boolean) => {
    const thisGen = ++financeScopeRef.current.generation;
    financeScopeRef.current.customerId = cid;

    if (reset) {
      setLoading(true);
      setError(null);
      setLedger([]);
      setLedgerNextCursor(null);
      setBalance(null);
    } else {
      setLoadingMoreLedger(true);
    }
    try {
      const cursor = reset ? undefined : (ledgerNextCursor || undefined);
      const [bal, ledRes] = await Promise.all([
        api.getCustomerBalance(cid),
        api.getCustomerLedger(cid, { limit: 50, cursor }),
      ]);

      // Guard: discard stale responses if customer or generation changed
      if (financeScopeRef.current.generation !== thisGen || financeScopeRef.current.customerId !== cid) {
        return;
      }

      setBalance(bal);
      if (reset) {
        setLedger(ledRes.items);
        ledgerRef.current = ledRes.items;
      } else {
        setLedger(prev => [...prev, ...ledRes.items]);
        ledgerRef.current = [...ledgerRef.current, ...ledRes.items];
      }
      setLedgerNextCursor(ledRes.nextCursor);
      ledgerNextCursorRef.current = ledRes.nextCursor;
    } catch (err: unknown) {
      if (financeScopeRef.current.generation === thisGen && financeScopeRef.current.customerId === cid) {
        setError(err instanceof Error ? err.message : '加载资金往来失败');
      }
    } finally {
      if (financeScopeRef.current.generation === thisGen && financeScopeRef.current.customerId === cid) {
        setLoading(false);
        setLoadingMoreLedger(false);
      }
    }
  };

  // Cross-page search to locate target initialLedgerEntryId (B6 P2: resilient against self-cancellation)
  const locateLedgerGenRef = useRef(0);
  const ledgerRef = useRef<LedgerEntry[]>([]);
  ledgerRef.current = ledger;
  const ledgerNextCursorRef = useRef<string | null>(null);
  ledgerNextCursorRef.current = ledgerNextCursor;

  useEffect(() => {
    if (!initialLedgerEntryId || !selectedCustomerId) {
      setTargetLedgerNotFoundError(null);
      return;
    }

    if (loading) {
      return; // Wait for initial page 1 load to finish
    }

    const currentLedger = ledgerRef.current.length > 0 ? ledgerRef.current : ledger;
    const currentCursor = ledgerNextCursorRef.current ?? ledgerNextCursor;

    if (currentLedger.some(e => e.id === initialLedgerEntryId)) {
      setTargetLedgerNotFoundError(null);
      return;
    }

    if (!currentCursor) {
      if (currentLedger.length > 0) {
        setTargetLedgerNotFoundError(`未在当前客户账簿中找到指定来源分录: #${initialLedgerEntryId}`);
      }
      return;
    }

    let cancelled = false;
    const currentGen = ++locateLedgerGenRef.current;
    const cid = selectedCustomerId;
    const targetId = initialLedgerEntryId;

    async function runLocate() {
      setLocatingTargetLedger(true);
      setTargetLedgerNotFoundError(null);
      try {
        const result = await locateTargetAcrossPages({
          targetId,
          initialCursor: currentCursor,
          fetchPage: async (cursor) => {
            return api.getCustomerLedger(cid, { limit: 50, cursor });
          },
          matchesTarget: (item, tid) => item.id === tid,
          maxPages: 10,
          isCancelled: () => cancelled || locateLedgerGenRef.current !== currentGen || financeScopeRef.current.customerId !== cid,
          onPageFetched: (items, nextCursor) => {
            ledgerRef.current = [...ledgerRef.current, ...items];
            ledgerNextCursorRef.current = nextCursor;
            setLedger(prev => [...prev, ...items]);
            setLedgerNextCursor(nextCursor);
          },
        });

        if (cancelled || locateLedgerGenRef.current !== currentGen || financeScopeRef.current.customerId !== cid) {
          return;
        }

        if (!result.found && !result.finalNextCursor) {
          setTargetLedgerNotFoundError(`未在当前客户账簿中找到指定来源分录: #${targetId}`);
        }
      } catch (err: unknown) {
        if (!cancelled && locateLedgerGenRef.current === currentGen) {
          setTargetLedgerNotFoundError(`定位目标分录失败: #${targetId}`);
        }
      } finally {
        if (locateLedgerGenRef.current === currentGen) {
          setLocatingTargetLedger(false);
        }
      }
    }

    void runLocate();

    return () => {
      cancelled = true;
    };
  }, [initialLedgerEntryId, selectedCustomerId, loading]);

  const loadCustomerOrders = async (cid: string) => {
    const thisGen = ++ordersScopeRef.current.generation;
    ordersScopeRef.current.customerId = cid;
    setLoadingOrders(true);
    try {
      // Exhaustively retrieve customer orders via nextCursor (P2: prevents 50-order cutoff)
      const allOrders: OrderSummaryAny[] = [];
      let cursor: string | undefined = undefined;
      do {
        const res = await api.listOrders({ customerId: cid, limit: 100, cursor });
        allOrders.push(...res.items);
        cursor = res.nextCursor || undefined;
      } while (cursor);

      if (ordersScopeRef.current.generation !== thisGen || ordersScopeRef.current.customerId !== cid) {
        return;
      }
      setCustomerOrders(allOrders);
    } catch {
      if (ordersScopeRef.current.generation === thisGen && ordersScopeRef.current.customerId === cid) {
        setCustomerOrders([]);
      }
    } finally {
      if (ordersScopeRef.current.generation === thisGen && ordersScopeRef.current.customerId === cid) {
        setLoadingOrders(false);
      }
    }
  };

  // Real-time allocation validation
  useEffect(() => {
    if (cashKind === 'receipt' && allocationMode === 'manual') {
      const v = validateAllocations(manualAllocations, cashAmount);
      setAllocationValidation(v);
    }
  }, [manualAllocations, cashAmount, cashKind, allocationMode]);

  const addManualAllocation = () => {
    rotateCashKey();
    if (customerOrders.length === 0) return;
    const availableOrder = customerOrders.find(
      o => !manualAllocations.some(a => a.orderId === o.id)
    );
    const orderId = availableOrder ? availableOrder.id : customerOrders[0]!.id;
    setManualAllocations(prev => [...prev, { orderId, amount: '50.00' }]);
  };

  const updateManualAllocation = (idx: number, patch: Partial<AllocationDraft>) => {
    rotateCashKey();
    setManualAllocations(prev =>
      prev.map((a, i) => (i === idx ? { ...a, ...patch } : a))
    );
  };

  const removeManualAllocation = (idx: number) => {
    rotateCashKey();
    setManualAllocations(prev => prev.filter((_, i) => i !== idx));
  };

  const handleRecordCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;

    let payload: CashInput;
    if (
      frozenCashPayloadRef.current &&
      frozenCashPayloadRef.current.customerId === selectedCustomerId &&
      frozenCashPayloadRef.current.kind === cashKind
    ) {
      payload = frozenCashPayloadRef.current.payload;
    } else {
      const amountCheck = validateMoney(cashAmount);
      if (!amountCheck.valid) {
        setError(`金额格式错误: ${amountCheck.error}`);
        return;
      }

      const shanghaiOccurredAt = formatShanghaiDateTime(occurredDate, occurredTime);

      if (cashKind === 'receipt') {
        let allocationsPayload: PaymentAllocation[] | undefined = undefined;
        if (allocationMode === 'manual') {
          if (!allocationValidation.valid) {
            setError(allocationValidation.error || '多单分摊校验未通过');
            return;
          }
          allocationsPayload = manualAllocations.map(a => ({
            orderId: a.orderId,
            amount: validateMoney(a.amount).value!,
          }));
        }

        payload = {
          kind: 'receipt',
          customerId: selectedCustomerId,
          amount: amountCheck.value!,
          occurredAt: shanghaiOccurredAt,
          method: cashMethod,
          allocationMode,
          allocations: allocationsPayload,
          reference: cashRef.trim() || undefined,
          note: cashNote.trim() || undefined,
        };
      } else {
        payload = {
          kind: 'refund',
          customerId: selectedCustomerId,
          amount: amountCheck.value!,
          occurredAt: shanghaiOccurredAt,
          method: cashMethod,
          reference: cashRef.trim() || undefined,
          note: cashNote.trim() || undefined,
          relatedReturnId: relatedReturnId.trim() || undefined,
        };
      }
      frozenCashPayloadRef.current = { customerId: selectedCustomerId, kind: cashKind, payload };
    }

    setSubmittingCash(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api.recordCashEvent(payload, cashIntentKeyRef.current);

      // Success: rotate key and clear frozen payload
      rotateCashKey();

      const prefix = res.kind === 'refund' ? '退款成功登记！' : '收款成功登记！';
      setSuccessMsg(
        `${prefix}单据 #${res.id.substring(0, 8)}。` +
        (res.kind === 'receipt'
          ? (payload.kind === 'receipt' && payload.allocationMode === 'manual'
            ? `已手动分配至 ${res.allocations?.length || 0} 张订单，剩余 ¥${allocationValidation.remainingUnallocated} 留存账户未分配预存。`
            : `系统已自动核销最早欠款。`)
          : `实退资金已按服务端规则冲减对应资金来源。`)
      );

      setCashModalOpen(false);
      setManualAllocations([]);
      void loadCustomerFinance(selectedCustomerId, true);
    } catch (err: unknown) {
      setError(err instanceof Error ? `登记资金流水失败: ${err.message}` : '登记资金流水失败');
    } finally {
      setSubmittingCash(false);
    }
  };

  const handleApplyBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !balance) return;

    let payload: ApplyCustomerBalanceInput;
    if (frozenBalanceApplyPayloadRef.current && frozenBalanceApplyPayloadRef.current.customerId === selectedCustomerId) {
      payload = frozenBalanceApplyPayloadRef.current.payload;
    } else {
      if (balanceAllocations.length === 0) {
        setError('请至少添加一行需要核销的订单');
        return;
      }

      // P2 Fix: Balance application verifies available funds against unallocatedAmount (real cash funds)
      const check = validateAllocations(balanceAllocations, balance.unallocatedAmount);
      if (!check.valid) {
        setError(check.error || '余额核销分配校验未通过（不能超出当前未分配实收款）');
        return;
      }

      payload = {
        expectedVersion: balance.version,
        reason: balanceApplyReason.trim() || undefined,
        allocations: balanceAllocations.map(a => ({
          orderId: a.orderId,
          amount: validateMoney(a.amount).value!,
        })),
      };
      frozenBalanceApplyPayloadRef.current = { customerId: selectedCustomerId, payload };
    }

    setSubmittingBalanceApply(true);
    setError(null);
    try {
      const updatedBalance = await api.applyCustomerBalance(
        selectedCustomerId,
        payload,
        balanceApplyKeyRef.current
      );

      rotateBalanceApplyKey();
      setBalance(updatedBalance);
      setBalanceApplyModalOpen(false);
      setBalanceAllocations([]);
      setSuccessMsg('已成功使用未分配实收款抵扣核销订单！');
      void loadCustomerFinance(selectedCustomerId, true);
      void loadCustomerOrders(selectedCustomerId);
    } catch (err: unknown) {
      setError(err instanceof Error ? `余额核销订单失败: ${err.message}` : '余额核销订单失败');
    } finally {
      setSubmittingBalanceApply(false);
    }
  };

  const handleRecordOpening = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;

    let payload: OpeningBalanceInput;
    if (frozenOpeningPayloadRef.current && frozenOpeningPayloadRef.current.customerId === selectedCustomerId) {
      payload = frozenOpeningPayloadRef.current.payload;
    } else {
      const amountCheck = validateMoney(openingAmount, true);
      if (!amountCheck.valid) {
        setError(`期初金额格式错误: ${amountCheck.error}`);
        return;
      }

      const shanghaiEffectiveAt = formatShanghaiDateTime(openingDate, openingTime);
      payload = {
        amount: amountCheck.value!,
        effectiveAt: shanghaiEffectiveAt,
        reason: openingReason.trim(),
      };
      frozenOpeningPayloadRef.current = { customerId: selectedCustomerId, payload };
    }

    setSubmittingOpening(true);
    setError(null);
    try {
      const updatedBalance = await api.recordOpeningBalance(
        selectedCustomerId,
        payload,
        openingKeyRef.current
      );
      rotateOpeningKey();
      setBalance(updatedBalance);
      setOpeningModalOpen(false);
      setSuccessMsg('期初对账往来已成功录入！');
      void loadCustomerFinance(selectedCustomerId, true);
    } catch (err: unknown) {
      setError(err instanceof Error ? `录入期初往来失败: ${err.message}` : '录入期初往来失败');
    } finally {
      setSubmittingOpening(false);
    }
  };

  const currentCustomer = customers.find(c => c.id === selectedCustomerId);

  if (subView === 'statements') {
    return (
      <StatementsPage
        onBack={() => setSubView('finance')}
        onNavigateToSource={onNavigateToSource}
        initialCustomerId={selectedCustomerId}
      />
    );
  }

  if (subView === 'cash-events') {
    return (
      <CashEventsPage
        onNavigateToCustomerFinance={() => setSubView('finance')}
        onNavigateToSource={onNavigateToSource}
        initialCustomerId={selectedCustomerId}
      />
    );
  }

  return (
    <div className="fin-container">
      {/* Header */}
      <div className="fin-header">
        <div className="fin-header-title">
          <h1>客户往来对账与收退结算</h1>
          <p>
            统一客户账户与多地址共享体系，分别表达商业应收与实际资金流，支持自动/手动多单分摊与余额抵扣
          </p>
        </div>

        <div className="fin-header-actions">
          <button
            onClick={() => {
              if (onNavigateToStatements) onNavigateToStatements();
              else setSubView('statements');
            }}
            className="btn btn-secondary"
          >
            <ClipboardIcon size={16} />
            <span>月结对账单快照</span>
          </button>
          <button
            onClick={() => setSubView('cash-events')}
            className="btn btn-secondary"
          >
            <DollarIcon size={16} />
            <span>收退款流水</span>
          </button>
          <button onClick={() => setOpeningModalOpen(true)} className="btn btn-secondary">
            录入期初往来
          </button>
          <button
            onClick={() => {
              setBalanceAllocations([]);
              balanceApplyKeyRef.current = crypto.randomUUID();
              setBalanceApplyModalOpen(true);
            }}
            className="btn btn-secondary"
            disabled={!balance || parseFloat(balance.unallocatedAmount) <= 0}
            title={parseFloat(balance?.unallocatedAmount || '0') <= 0 ? '当前无可用未分配实收款' : '使用既有未分配实收款抵扣订单'}
          >
            <span>余额核销订单</span>
          </button>
          <button
            onClick={() => {
              if (cashKind !== 'receipt') {
                rotateCashKey();
                setCashKind('receipt');
              }
              setAllocationMode('auto');
              setManualAllocations([]);
              setCashModalOpen(true);
            }}
            className="btn btn-primary"
          >
            <PlusIcon size={16} />
            <span>登记收款</span>
          </button>
          <button
            onClick={() => {
              if (cashKind !== 'refund') {
                rotateCashKey();
                setCashKind('refund');
              }
              setCashModalOpen(true);
            }}
            className="btn btn-secondary"
          >
            办理实际退款
          </button>
        </div>
      </div>

      {targetLedgerNotFoundError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px' }}>
          <AlertCircleIcon size={16} />
          <span>{targetLedgerNotFoundError}</span>
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

      {/* Customer Selector Toolbar */}
      <div className="card">
        <div className="card-body" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>选择往来客户:</span>
            <select
              className="select"
              style={{ width: '260px' }}
              value={selectedCustomerId}
              onChange={e => {
                const nextId = e.target.value;
                if (nextId !== selectedCustomerId) {
                  rotateCashKey();
                  rotateBalanceApplyKey();
                  rotateOpeningKey();
                  setSelectedCustomerId(nextId);
                }
              }}
            >
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code}) {!c.active ? '[已停用]' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => void loadCustomerFinance(selectedCustomerId, true)}
              className="btn btn-ghost btn-sm"
              title="刷新客户账户"
            >
              <RefreshCwIcon size={16} />
            </button>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            数据时点 (asOf): {formatShanghaiDisplay(balance?.asOf)} | 账户版本: v{balance?.version ?? 0}
          </div>
        </div>
      </div>

      {/* Balances Grid: Strict direct display of backend values */}
      <div className="fin-stats-grid">
        <div className="fin-stat-card">
          <span className="fin-stat-label">客户应收欠款 (元)</span>
          <div className="fin-stat-value tabular-nums" style={{ color: 'var(--danger)' }}>
            ¥{balance?.receivableBalance || '0.00'}
          </div>
          <span className="fin-stat-desc">待收销售账款及未核销费用</span>
        </div>

        <div className="fin-stat-card">
          <span className="fin-stat-label">客户预存 / 抵扣余额 (元)</span>
          <div className="fin-stat-value tabular-nums" style={{ color: 'var(--success)' }}>
            ¥{balance?.creditBalance || '0.00'}
          </div>
          <span className="fin-stat-desc">可用于抵扣新订单或办理实际退款</span>
        </div>

        <div className="fin-stat-card">
          <span className="fin-stat-label">未分配实收款 (元)</span>
          <div className="fin-stat-value tabular-nums" style={{ color: 'var(--text-main)' }}>
            ¥{balance?.unallocatedAmount || '0.00'}
          </div>
          <span className="fin-stat-desc">已收款但未关联指定订单明细</span>
        </div>

        <div className="fin-stat-card">
          <span className="fin-stat-label">净往来结余 (应收 - 预存)</span>
          <div className="fin-stat-value tabular-nums" style={{ color: 'var(--accent)' }}>
            ¥{balance?.netBalance || '0.00'}
          </div>
          <span className="fin-stat-desc">正数表示客户欠款，负数表示客户多存</span>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>往来明细账簿 ({ledger.length} 笔分录)</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
              记录商业应收、退货冲减、实收实退及余额核销流水
            </span>
          </div>
          <button
            onClick={() => void loadCustomerFinance(selectedCustomerId, true)}
            className="btn btn-ghost btn-sm"
          >
            <RefreshCwIcon size={14} />
          </button>
        </div>

        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>分录编号</th>
                <th>业务变动类型</th>
                <th className="text-right">变动金额 (元)</th>
                <th>关联单据来源</th>
                <th>实际业务生效时间</th>
                <th>系统登记时间</th>
                <th>冲正关联</th>
              </tr>
            </thead>
            <tbody>
              {loading && ledger.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-subtle)' }}>正在加载分录明细...</td></tr>
              ) : ledger.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-subtle)' }}>该客户暂无资金往来流水记录</td></tr>
              ) : (
                ledger.map(entry => {
                  const meta = parseLedgerKind(entry.kind);
                  const isHighlighted = entry.id === initialLedgerEntryId;
                  const isReversal = Boolean(entry.reversesId) || entry.kind === 'reversal';
                  let href: string | null = null;
                  if (entry.sourceType === 'order') {
                    href = `/api/v1/orders/${entry.sourceId}`;
                  } else if (entry.sourceType === 'sales_return' || entry.sourceType === 'return') {
                    href = `/api/v1/returns/${entry.sourceId}`;
                  } else if (entry.sourceType === 'cash_event') {
                    if (!isReversal) {
                      href = `/api/v1/cash-events/${entry.sourceId}`;
                    }
                  }

                  return (
                    <tr
                      key={entry.id}
                      id={`ledger-entry-${entry.id}`}
                      style={{
                        background: isHighlighted ? 'var(--primary-bg, #eff6ff)' : undefined,
                        outline: isHighlighted ? '2px solid var(--primary, #2563eb)' : undefined,
                      }}
                    >
                      <td style={{ fontWeight: 600 }} className="font-mono">#{entry.id.substring(0, 8)}</td>
                      <td>
                        <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
                      </td>
                      <td className="tabular-nums text-right" style={{ fontWeight: 700, color: entry.amount.startsWith('-') ? 'var(--success)' : 'var(--danger)' }}>
                        {formatSignedMoney(entry.amount, true)}
                      </td>
                      <td>
                        {(() => {
                          const versionTag = formatSourceVersionTag(entry.sourceVersion);
                          return (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {href && onNavigateToSource ? (
                                <button
                                  type="button"
                                  onClick={() => onNavigateToSource(href!)}
                                  className="btn-link"
                                  style={{ color: 'var(--accent)', fontWeight: 500, padding: 0, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                  title={`查看 ${entry.sourceType} 详情: ${entry.sourceId}`}
                                >
                                  {entry.sourceType} #{entry.sourceId}
                                </button>
                              ) : (
                                <span style={{ color: 'var(--accent)', fontWeight: 500 }} title={entry.sourceId}>
                                  {entry.sourceType} #{entry.sourceId}
                                </span>
                              )}
                              {versionTag && (
                                <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>
                                  {versionTag}
                                </span>
                              )}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ fontSize: '12px' }}>{formatShanghaiDisplay(entry.effectiveAt)}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatShanghaiDisplay(entry.recordedAt)}</td>
                      <td style={{ fontSize: '12px' }}>
                        {entry.reversesId ? (
                          <span style={{ color: 'var(--danger)' }}>冲正 #{entry.reversesId.substring(0, 8)}</span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Ledger Pagination */}
          <div className="inv-table-footer">
            <span>已加载 {ledger.length} 笔流水分录</span>
            {ledgerNextCursor && (
              <button
                onClick={() => void loadCustomerFinance(selectedCustomerId, false)}
                disabled={loadingMoreLedger}
                className="btn btn-secondary btn-sm"
              >
                {loadingMoreLedger ? '正在加载更多...' : '加载更多分录 (游标分页)'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cash Event Modal (Receipt or Refund) */}
      {cashModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>
                {cashKind === 'receipt' ? '登记客户收款' : '办理实际客户退款'} - {currentCustomer?.name}
              </span>
              <button onClick={() => setCashModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>

            <form onSubmit={handleRecordCash}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px' }}>
                    <AlertCircleIcon size={14} />
                    <span>{error}</span>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                      {cashKind === 'receipt' ? '实收金额 (元) *' : '退款金额 (元) *'}
                    </label>
                    <input
                      type="text"
                      className="input tabular-nums"
                      required
                      placeholder="如 100.00"
                      value={cashAmount}
                      onChange={e => {
                        rotateCashKey();
                        setCashAmount(e.target.value);
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                      结算支付方式 *
                    </label>
                    <select
                      className="select"
                      value={cashMethod}
                      onChange={e => {
                        rotateCashKey();
                        setCashMethod(e.target.value as any);
                      }}
                    >
                      <option value="wechat">微信支付</option>
                      <option value="alipay">支付宝</option>
                      <option value="bank_transfer">银行转账</option>
                      <option value="cash">现金现收</option>
                      <option value="other">其他方式</option>
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

                {cashKind === 'receipt' ? (
                  /* Allocation Mode Selection */
                  <div style={{ border: '1px solid var(--border-default)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                      欠款分摊模式 *
                    </label>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="allocMode"
                          value="auto"
                          checked={allocationMode === 'auto'}
                          onChange={() => {
                            rotateCashKey();
                            setAllocationMode('auto');
                          }}
                        />
                        <span>自动核销最早欠款 (auto)</span>
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="allocMode"
                          value="manual"
                          checked={allocationMode === 'manual'}
                          onChange={() => {
                            rotateCashKey();
                            setAllocationMode('manual');
                            if (manualAllocations.length === 0 && customerOrders.length > 0) {
                              setManualAllocations([{ orderId: customerOrders[0]!.id, amount: cashAmount }]);
                            }
                          }}
                        />
                        <span>手动指定多单分摊 (manual)</span>
                      </label>
                    </div>

                    {allocationMode === 'manual' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>指定分摊订单与核销金额:</span>
                          <button
                            type="button"
                            onClick={addManualAllocation}
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
                                onChange={e => updateManualAllocation(idx, { orderId: e.target.value })}
                              >
                                {customerOrders.map(o => (
                                  <option key={o.id} value={o.id}>
                                    单号: {o.orderNo} (应收: ¥{o.totalAmount})
                                  </option>
                                ))}
                              </select>

                              <input
                                type="text"
                                className="input tabular-nums"
                                placeholder="分摊金额"
                                style={{ fontSize: '12px', height: '30px' }}
                                value={alloc.amount}
                                onChange={e => updateManualAllocation(idx, { amount: e.target.value })}
                              />

                              <button
                                type="button"
                                onClick={() => removeManualAllocation(idx)}
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--danger)', padding: '2px' }}
                              >
                                ✕
                              </button>
                            </div>
                          ))
                        )}

                        <div className="fin-alloc-summary">
                          <span>已分摊合计: <strong>¥{allocationValidation.totalAllocated}</strong></span>
                          <span>留存账户预存: <strong>¥{allocationValidation.remainingUnallocated}</strong></span>
                        </div>

                        {allocationValidation.error && (
                          <span style={{ fontSize: '11px', color: 'var(--danger)' }}>
                            {allocationValidation.error}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Refund: related return */
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                      关联退货单 ID (可选)
                    </label>
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
                    <span style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '2px', display: 'block' }}>
                      退款将从客户可用预存余额扣减，并与退货单建立追溯关联
                    </span>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                      业务凭证单号 (流水号)
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="如银行流水号或微信支付单号"
                      value={cashRef}
                      onChange={e => {
                        rotateCashKey();
                        setCashRef(e.target.value);
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                      经办备注说明
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="备注说明..."
                      value={cashNote}
                      onChange={e => {
                        rotateCashKey();
                        setCashNote(e.target.value);
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setCashModalOpen(false)} className="btn btn-secondary">
                  取消
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingCash || (cashKind === 'receipt' && allocationMode === 'manual' && !allocationValidation.valid)}
                >
                  {submittingCash ? '正在登记入账...' : '确认登记入账'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Balance Application Modal (applyCustomerBalance) */}
      {balanceApplyModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>使用未分配实收款抵扣订单 - {currentCustomer?.name}</span>
              <button onClick={() => setBalanceApplyModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>

            <form onSubmit={handleApplyBalance}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px' }}>
                    <AlertCircleIcon size={14} />
                    <span>{error}</span>
                  </div>
                )}
                <div style={{ background: 'var(--bg-surface-subtle)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '13px' }}>
                  当前客户可用未分配实收款: <strong style={{ color: 'var(--success)' }}>¥{balance?.unallocatedAmount || '0.00'}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>需抵扣的订单及金额 *</label>
                  <button
                    type="button"
                    onClick={() => {
                      rotateBalanceApplyKey();
                      if (customerOrders.length > 0) {
                        setBalanceAllocations(prev => [...prev, { orderId: customerOrders[0]!.id, amount: '50.00' }]);
                      }
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                  >
                    + 添加抵扣订单
                  </button>
                </div>

                {balanceAllocations.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-subtle)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-sm)', fontSize: '12px' }}>
                    请点击上方按钮添加要使用余额抵扣的订单
                  </div>
                ) : (
                  balanceAllocations.map((alloc, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 30px', gap: '6px', alignItems: 'center' }}>
                      <select
                        className="select"
                        style={{ fontSize: '12px', height: '30px' }}
                        value={alloc.orderId}
                        onChange={e => {
                          rotateBalanceApplyKey();
                          const val = e.target.value;
                          setBalanceAllocations(prev => prev.map((a, i) => (i === idx ? { ...a, orderId: val } : a)));
                        }}
                      >
                        {customerOrders.map(o => (
                          <option key={o.id} value={o.id}>
                            单号: {o.orderNo} (应收: ¥{o.totalAmount})
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        className="input tabular-nums"
                        placeholder="抵扣金额"
                        style={{ fontSize: '12px', height: '30px' }}
                        value={alloc.amount}
                        onChange={e => {
                          rotateBalanceApplyKey();
                          const val = e.target.value;
                          setBalanceAllocations(prev => prev.map((a, i) => (i === idx ? { ...a, amount: val } : a)));
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => {
                          rotateBalanceApplyKey();
                          setBalanceAllocations(prev => prev.filter((_, i) => i !== idx));
                        }}
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)', padding: '2px' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    抵扣核销说明
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={balanceApplyReason}
                    onChange={e => {
                      rotateBalanceApplyKey();
                      setBalanceApplyReason(e.target.value);
                    }}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setBalanceApplyModalOpen(false)} className="btn btn-secondary">
                  取消
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingBalanceApply || balanceAllocations.length === 0}
                >
                  {submittingBalanceApply ? '正在核销...' : '确认使用余额抵扣'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Opening Balance Modal */}
      {openingModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>录入期初往来账款</span>
              <button onClick={() => setOpeningModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <form onSubmit={handleRecordOpening}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px' }}>
                    <AlertCircleIcon size={14} />
                    <span>{error}</span>
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    期初金额 (元，正数表示客户欠款，负数表示客户预存) *
                  </label>
                  <input
                    type="text"
                    className="input tabular-nums"
                    required
                    placeholder="如 500.00 或 -200.00"
                    value={openingAmount}
                    onChange={e => {
                      rotateOpeningKey();
                      setOpeningAmount(e.target.value);
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    实际生效时间 (上海业务时间，可补录) *
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="date"
                      className="input"
                      style={{ flex: 1.2 }}
                      value={openingDate}
                      onChange={e => {
                        rotateOpeningKey();
                        setOpeningDate(e.target.value);
                      }}
                    />
                    <input
                      type="time"
                      className="input"
                      style={{ flex: 1 }}
                      value={openingTime}
                      onChange={e => {
                        rotateOpeningKey();
                        setOpeningTime(e.target.value);
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    对账核对说明 *
                  </label>
                  <input
                    type="text"
                    className="input"
                    required
                    value={openingReason}
                    onChange={e => {
                      rotateOpeningKey();
                      setOpeningReason(e.target.value);
                    }}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setOpeningModalOpen(false)} className="btn btn-secondary">
                  取消
                </button>
                <button type="submit" className="btn btn-primary" disabled={submittingOpening}>
                  {submittingOpening ? '正在录入...' : '确认录入期初'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
