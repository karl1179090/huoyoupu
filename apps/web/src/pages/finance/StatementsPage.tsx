import React, { useState, useEffect, useRef } from 'react';
import type { Statement, Customer } from '../../api/types.js';
import * as api from '../../api/client.js';
import {
  DollarIcon,
  PlusIcon,
  ClipboardIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  CheckIcon,
} from '../../components/icons/index.js';
import {
  formatShanghaiPeriod,
  formatShanghaiDisplay,
  parseLedgerKind,
  isStaleStatement,
  formatSourceVersionTag,
  formatSignedMoney,
  resolveStatementCustomer,
} from './financeLogic.js';
import type { LedgerEntry } from '../../api/types.js';
import './finance.css';

export interface StatementsPageProps {
  onBack?: () => void;
  onNavigateToSource?: (href: string) => void;
  initialStatementId?: string;
  initialCustomerId?: string;
}

export function StatementsPage({
  onBack,
  onNavigateToSource,
  initialStatementId,
  initialCustomerId,
}: StatementsPageProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId || '');
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');
  const [creating, setCreating] = useState(false);

  // Idempotency for statement creation (P1: frozen on retry, rotated on modification)
  const createIntentKeyRef = useRef<string>(crypto.randomUUID());
  const frozenCreatePayloadRef = useRef<{ customerId: string; periodStart: string; periodEnd: string } | null>(null);

  const rotateCreateKey = () => {
    createIntentKeyRef.current = crypto.randomUUID();
    frozenCreatePayloadRef.current = null;
  };

  // Scope & Generation guards (P2: statement list & detail pagination)
  const listScopeRef = useRef<{ customerId: string; generation: number }>({ customerId: '', generation: 0 });
  const detailScopeRef = useRef<{ statementId: string; generation: number }>({ statementId: '', generation: 0 });

  // References to coordinate statement target customer vs default customer initialization (B6 P2)
  const statementTargetCustomerIdRef = useRef<string>('');
  const initialStatementFailedRef = useRef(false);
  const customersRef = useRef<Customer[]>([]);
  customersRef.current = customers;

  // Active Statement Detail (loads full statement with rows from getStatement)
  const [activeStatement, setActiveStatement] = useState<Statement | null>(null);
  const [activeStatementRows, setActiveStatementRows] = useState<LedgerEntry[]>([]);
  const [activeStatementRowsNextCursor, setActiveStatementRowsNextCursor] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingMoreRows, setLoadingMoreRows] = useState(false);

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
          customersRef.current = all;
          setSelectedCustomerId(prev => {
            return resolveStatementCustomer({
              currentSelected: prev,
              statementCustomerId: statementTargetCustomerIdRef.current,
              initialCustomerId,
              availableCustomers: all,
              isTargetingStatement: Boolean(initialStatementId),
              statementFailed: initialStatementFailedRef.current,
            });
          });
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
    if (initialStatementId) {
      void handleOpenDetail(initialStatementId);
    }
  }, [initialStatementId]);

  useEffect(() => {
    if (selectedCustomerId) {
      void loadStatements(selectedCustomerId, true);
    }
  }, [selectedCustomerId]);

  const loadStatements = async (cid: string, reset: boolean) => {
    const gen = ++listScopeRef.current.generation;
    listScopeRef.current.customerId = cid;

    if (reset) {
      setStatements([]);
      setNextCursor(null);
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const cursor = reset ? undefined : (nextCursor || undefined);
      const res = await api.listStatements(cid, { limit: 50, cursor });
      if (listScopeRef.current.generation !== gen || listScopeRef.current.customerId !== cid) {
        return; // Discard stale response
      }
      if (reset) {
        setStatements(res.items);
      } else {
        setStatements(prev => [...prev, ...res.items]);
      }
      setNextCursor(res.nextCursor);
    } catch (err: unknown) {
      if (listScopeRef.current.generation !== gen || listScopeRef.current.customerId !== cid) {
        return;
      }
      setError(err instanceof Error ? err.message : '加载对账单列表失败');
    } finally {
      if (listScopeRef.current.generation === gen && listScopeRef.current.customerId === cid) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  const handleOpenDetail = async (statementId: string) => {
    const gen = ++detailScopeRef.current.generation;
    detailScopeRef.current.statementId = statementId;

    // Reset detail state immediately so old rows never bleed into a new snapshot
    setActiveStatement(null);
    setActiveStatementRows([]);
    setActiveStatementRowsNextCursor(null);
    setLoadingDetail(true);
    setError(null);

    try {
      // Re-fetch from server to obtain fixed snapshot rows, latest stale status, rowCount, nextCursor
      const full = await api.getStatement(statementId, { limit: 50 });
      if (detailScopeRef.current.generation !== gen || detailScopeRef.current.statementId !== statementId) {
        return; // Discard stale response
      }
      setActiveStatement(full);
      setActiveStatementRows(full.rows || []);
      setActiveStatementRowsNextCursor(full.nextCursor || null);

      // Synchronize customer context to the statement's true customer
      if (full.customerId) {
        statementTargetCustomerIdRef.current = full.customerId;
        if (full.customerId !== selectedCustomerId) {
          listScopeRef.current.customerId = full.customerId;
          setSelectedCustomerId(full.customerId);
        }
      }
    } catch (err: unknown) {
      if (detailScopeRef.current.generation !== gen || detailScopeRef.current.statementId !== statementId) {
        return;
      }
      initialStatementFailedRef.current = true;
      setError(err instanceof Error ? err.message : '获取对账单明细失败');
      setSelectedCustomerId(prev => {
        if (prev) return prev;
        return customersRef.current.length > 0 ? customersRef.current[0]!.id : '';
      });
    } finally {
      if (detailScopeRef.current.generation === gen && detailScopeRef.current.statementId === statementId) {
        setLoadingDetail(false);
      }
    }
  };

  const handleLoadMoreRows = async () => {
    if (!activeStatement || !activeStatementRowsNextCursor) return;
    const currentGen = detailScopeRef.current.generation;
    const targetStatementId = activeStatement.id;

    setLoadingMoreRows(true);
    try {
      const more = await api.getStatement(targetStatementId, {
        limit: 50,
        cursor: activeStatementRowsNextCursor,
      });
      if (detailScopeRef.current.generation !== currentGen || detailScopeRef.current.statementId !== targetStatementId) {
        return; // Discard stale response from old scope
      }
      setActiveStatementRows(prev => [...prev, ...(more.rows || [])]);
      setActiveStatementRowsNextCursor(more.nextCursor || null);
    } catch (err: unknown) {
      if (detailScopeRef.current.generation !== currentGen || detailScopeRef.current.statementId !== targetStatementId) {
        return;
      }
      setError(err instanceof Error ? err.message : '加载更多分录失败');
    } finally {
      if (detailScopeRef.current.generation === currentGen && detailScopeRef.current.statementId === targetStatementId) {
        setLoadingMoreRows(false);
      }
    }
  };

  const handleCloseDetail = () => {
    detailScopeRef.current.generation++;
    detailScopeRef.current.statementId = '';
    setActiveStatement(null);
    setActiveStatementRows([]);
    setActiveStatementRowsNextCursor(null);
  };

  const handleCustomerChange = (newCid: string) => {
    if (newCid === selectedCustomerId) return;
    // If the user genuinely changes to a different customer, cancel any pending statement request and close active statement
    if (activeStatement && activeStatement.customerId !== newCid) {
      handleCloseDetail();
    } else if (!activeStatement) {
      detailScopeRef.current.generation++;
      setLoadingDetail(false);
    }
    setSelectedCustomerId(newCid);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;

    let payload: { periodStart: string; periodEnd: string };
    if (frozenCreatePayloadRef.current && frozenCreatePayloadRef.current.customerId === selectedCustomerId) {
      payload = {
        periodStart: frozenCreatePayloadRef.current.periodStart,
        periodEnd: frozenCreatePayloadRef.current.periodEnd,
      };
    } else {
      const periodCheck = formatShanghaiPeriod(periodStartDate, periodEndDate);
      if (!periodCheck.valid) {
        setError(periodCheck.error || '周期日期无效');
        return;
      }
      payload = {
        periodStart: periodCheck.periodStart!,
        periodEnd: periodCheck.periodEnd!,
      };
      frozenCreatePayloadRef.current = { customerId: selectedCustomerId, ...payload };
    }

    setCreating(true);
    setError(null);
    try {
      const newStmt = await api.createStatement(
        selectedCustomerId,
        payload,
        createIntentKeyRef.current
      );

      rotateCreateKey();
      setCreateModalOpen(false);
      setPeriodStartDate('');
      setPeriodEndDate('');
      setSuccessMsg(`期间对账快照已生成！快照标识 #${newStmt.id.substring(0, 8)}。旧快照已安全保留。`);
      void loadStatements(selectedCustomerId, true);

      // Automatically open detail with isolated scope
      handleOpenDetail(newStmt.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '生成对账单失败');
    } finally {
      setCreating(false);
    }
  };

  const currentCustomer = customers.find(c => c.id === selectedCustomerId);

  return (
    <div className="fin-container">
      {/* Header */}
      <div className="fin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onBack && (
            <button onClick={onBack} className="btn btn-secondary btn-sm">← 返回</button>
          )}
          <div className="fin-header-title">
            <h1>客户往来月结对账单</h1>
            <p>
              按明确期间封存销售、退货、实收与期末应收对账快照。新旧快照独立追溯，自动感知原单据更正（stale）。
            </p>
          </div>
        </div>

        <div className="fin-header-actions">
          <button
            onClick={() => setCreateModalOpen(true)}
            disabled={!selectedCustomerId}
            className="btn btn-primary"
          >
            <PlusIcon size={16} />
            <span>生成期间对账快照</span>
          </button>
        </div>
      </div>

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

      {/* Customer Select */}
      <div className="card">
        <div className="card-body" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>目标核算客户:</span>
            <select
              className="select"
              style={{ width: '260px' }}
              value={selectedCustomerId}
              onChange={e => handleCustomerChange(e.target.value)}
            >
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code}) {!c.active ? '[已停用]' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => void loadStatements(selectedCustomerId, true)}
              className="btn btn-ghost btn-sm"
              title="刷新列表"
            >
              <RefreshCwIcon size={16} />
            </button>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            周期规范：采用 Asia/Shanghai [起始日 00:00, 截止日 00:00) 右开区间
          </div>
        </div>
      </div>

      {/* Statements Table */}
      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>对账周期 (上海时间右开区间)</th>
                <th>封存时点 (asOf)</th>
                <th className="text-right">期初应收 (元)</th>
                <th className="text-right">本期销售</th>
                <th className="text-right">本期退货</th>
                <th className="text-right">本期实收</th>
                <th className="text-right">本期退款</th>
                <th className="text-right">期末应收净额</th>
                <th>快照状态</th>
                <th style={{ textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && statements.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-subtle)' }}>正在加载对账单...</td></tr>
              ) : statements.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-subtle)' }}>该客户暂无对账快照记录</td></tr>
              ) : (
                statements.map(s => {
                  const isStale = isStaleStatement(s);
                  return (
                    <tr key={s.id} style={{ background: isStale ? '#fffdf7' : undefined }}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)' }}>
                          {formatShanghaiDisplay(s.periodStart).substring(0, 10)} 至 {formatShanghaiDisplay(s.periodEnd).substring(0, 10)}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-subtle)' }} className="font-mono">
                          ID: #{s.id.substring(0, 8)}
                        </div>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {formatShanghaiDisplay(s.asOf)}
                      </td>
                      <td className="tabular-nums text-right">
                        ¥{s.openingBalance}
                      </td>
                      <td className="tabular-nums text-right" style={{ color: 'var(--accent)' }}>
                        +¥{s.salesAmount}
                      </td>
                      <td className="tabular-nums text-right" style={{ color: 'var(--danger)' }}>
                        -¥{s.returnAmount}
                      </td>
                      <td className="tabular-nums text-right" style={{ color: 'var(--success)' }}>
                        ¥{s.receiptAmount}
                      </td>
                      <td className="tabular-nums text-right">
                        ¥{s.refundAmount}
                      </td>
                      <td className="tabular-nums text-right" style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                        ¥{s.closingBalance}
                      </td>
                      <td>
                        {isStale ? (
                          <span className="badge badge-warning" title="原业务单据发生过更正/冲正">
                            已过期 (原单据已修改)
                          </span>
                        ) : (
                          <span className="badge badge-success">
                            有效快照
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => void handleOpenDetail(s.id)}
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '12px' }}
                        >
                          查看明细
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="inv-table-footer">
            <span>已加载 {statements.length} 张快照</span>
            {nextCursor && (
              <button
                onClick={() => void loadStatements(selectedCustomerId, false)}
                disabled={loadingMore}
                className="btn btn-secondary btn-sm"
              >
                {loadingMore ? '正在加载更多...' : '加载更多对账单 (游标分页)'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {createModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>生成客户期间对账快照 - {currentCustomer?.name}</span>
              <button onClick={() => setCreateModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ background: 'var(--bg-surface-subtle)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-muted)' }}>
                  对账期间按 Asia/Shanghai 自然日 <strong>[起始日 00:00:00, 截止日 00:00:00)</strong> 右开区间核算。
                  例如生成 2 月份对账单，起始填 2026-02-01，截止填 2026-03-01。
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                      周期起始日期 (包含 00:00) *
                    </label>
                    <input
                      type="date"
                      required
                      className="input"
                      value={periodStartDate}
                      onChange={e => {
                        rotateCreateKey();
                        setPeriodStartDate(e.target.value);
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                      周期截止日期 (不包含 00:00) *
                    </label>
                    <input
                      type="date"
                      required
                      className="input"
                      value={periodEndDate}
                      onChange={e => {
                        rotateCreateKey();
                        setPeriodEndDate(e.target.value);
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setCreateModalOpen(false)} className="btn btn-secondary">
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating || !periodStartDate || !periodEndDate}
                  className="btn btn-primary"
                >
                  {creating ? '正在生成快照...' : '确认生成快照'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Statement Detail Modal (Fixed snapshot details & rows) */}
      {activeStatement && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '820px', width: '94%' }}>
            <div className="modal-header">
              <div>
                <span style={{ fontWeight: 700, fontSize: '16px' }}>
                  对账快照明细: #{activeStatement.id.substring(0, 8)}
                </span>
                <span className={`badge ${activeStatement.stale ? 'badge-warning' : 'badge-success'}`} style={{ marginLeft: '8px' }}>
                  {activeStatement.stale ? '已过期 (原业务单据已变动)' : '有效快照'}
                </span>
              </div>
              <button onClick={handleCloseDetail} className="btn btn-ghost btn-sm">✕</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Stale warning in detail */}
              {activeStatement.stale && (
                <div className="fin-stale-alert">
                  <div className="fin-stale-alert-title">
                    <AlertCircleIcon size={16} />
                    <span>该快照生成后原来源已变化 (stale: true)</span>
                  </div>
                  <div>
                    原单据可能已被修改、退货或冲正。旧快照金额与明细保持不可篡改历史记录，如需最新结算请为该期间重新生成对账单。
                  </div>
                </div>
              )}

              {/* Meta Stats Bar: Direct display of backend amounts */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', background: 'var(--bg-surface-subtle)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>期初应收</span>
                  <div className="tabular-nums" style={{ fontSize: '15px', fontWeight: 600 }}>¥{activeStatement.openingBalance}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>本期销售</span>
                  <div className="tabular-nums" style={{ fontSize: '15px', fontWeight: 600, color: 'var(--accent)' }}>+¥{activeStatement.salesAmount}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>本期退货</span>
                  <div className="tabular-nums" style={{ fontSize: '15px', fontWeight: 600, color: 'var(--danger)' }}>-¥{activeStatement.returnAmount}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>本期实收</span>
                  <div className="tabular-nums" style={{ fontSize: '15px', fontWeight: 600, color: 'var(--success)' }}>¥{activeStatement.receiptAmount}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>本期退款</span>
                  <div className="tabular-nums" style={{ fontSize: '15px', fontWeight: 600 }}>¥{activeStatement.refundAmount}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>期末应收净额</span>
                  <div className="tabular-nums" style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>¥{activeStatement.closingBalance}</div>
                </div>
              </div>

              {/* Rows Table */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px' }}>
                    快照固定明细分录 ({activeStatementRows.length} / 总计 {activeStatement.rowCount} 行)
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    封存水印: {activeStatement.sourceWatermark}
                  </span>
                </div>

                <div style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)' }}>
                  <table className="table" style={{ fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>分录编号</th>
                        <th>业务变动类型</th>
                        <th className="text-right">变动金额 (元)</th>
                        <th>关联来源单据</th>
                        <th>实际生效时间</th>
                        <th>系统登记时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeStatementRows.length === 0 ? (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-subtle)' }}>本期间无分录明细</td></tr>
                      ) : (
                        activeStatementRows.map((row, idx) => {
                          const meta = parseLedgerKind(row.kind);
                          const isReversal = Boolean(row.reversesId) || row.kind === 'reversal';
                          let href: string | null = null;
                          if (row.sourceType === 'order') {
                            href = `/api/v1/orders/${row.sourceId}`;
                          } else if (row.sourceType === 'sales_return' || row.sourceType === 'return') {
                            href = `/api/v1/returns/${row.sourceId}`;
                          } else if (row.sourceType === 'cash_event') {
                            if (!isReversal) {
                              href = `/api/v1/cash-events/${row.sourceId}`;
                            }
                          }
                          const versionTag = formatSourceVersionTag(row.sourceVersion);
                          return (
                            <tr key={row.id}>
                              <td>{idx + 1}</td>
                              <td className="font-mono">#{row.id.substring(0, 8)}</td>
                              <td>
                                <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
                              </td>
                              <td className="tabular-nums text-right" style={{ fontWeight: 700, color: row.amount.startsWith('-') ? 'var(--success)' : 'var(--danger)' }}>
                                {formatSignedMoney(row.amount, true)}
                              </td>
                              <td>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  {href && onNavigateToSource ? (
                                    <button
                                      type="button"
                                      onClick={() => onNavigateToSource(href)}
                                      className="btn-link"
                                      style={{ color: 'var(--accent)', fontWeight: 500, padding: 0, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                      title={`查看 ${row.sourceType} 详情: ${row.sourceId}`}
                                    >
                                      {row.sourceType} #{row.sourceId}
                                    </button>
                                  ) : (
                                    <span style={{ color: 'var(--accent)', fontWeight: 500 }} title={row.sourceId}>
                                      {row.sourceType} #{row.sourceId}
                                    </span>
                                  )}
                                  {versionTag && (
                                    <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>
                                      {versionTag}
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td style={{ fontSize: '11px' }}>{formatShanghaiDisplay(row.effectiveAt)}</td>
                              <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatShanghaiDisplay(row.recordedAt)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {activeStatementRowsNextCursor && (
                  <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={() => void handleLoadMoreRows()}
                      disabled={loadingMoreRows}
                      className="btn btn-secondary btn-sm"
                    >
                      {loadingMoreRows ? '正在加载明细...' : '加载更多明细 (游标分页)'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={handleCloseDetail} className="btn btn-secondary">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
