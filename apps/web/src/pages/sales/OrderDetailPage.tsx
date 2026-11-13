import React, { useState, useEffect, useRef } from 'react';
import type { OrderAny, OrderAdmin, SalesReturn, OrderRevisionSummary, OrderLineAdmin } from '../../api/types.js';
import * as api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import { OrderReturnModal } from './components/OrderReturnModal.js';
import { RestockModal } from './components/RestockModal.js';
import { formatShanghaiInstant, formatShanghaiDate } from '../reports/reportHelpers.js';
import {
  ClipboardIcon,
  TruckIcon,
  PrinterIcon,
  EditIcon,
  TrashIcon,
  AlertCircleIcon,
  CheckIcon,
} from '../../components/icons/index.js';

interface OrderDetailPageProps {
  orderId: string;
  initialRevisionId?: string;
  onBack: () => void;
  onEditOrder: (orderId: string) => void;
  onPrintOrder: (orderId: string, revisionId?: string) => void;
}

export function OrderDetailPage({
  orderId,
  initialRevisionId,
  onBack,
  onEditOrder,
  onPrintOrder,
}: OrderDetailPageProps) {
  const { isAdmin } = useAuth();
  const [order, setOrder] = useState<OrderAny | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'lines' | 'returns' | 'revisions'>('lines');
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [revisions, setRevisions] = useState<OrderRevisionSummary[]>([]);
  const [viewingRevision, setViewingRevision] = useState<OrderAny | null>(null);
  const [viewingRevisionId, setViewingRevisionId] = useState<string | null>(initialRevisionId || null);
  const [loadingRevision, setLoadingRevision] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [selectedReturnForRestock, setSelectedReturnForRestock] = useState<SalesReturn | null>(null);
  const [restockModalOpen, setRestockModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Business intent idempotency keys for mutations
  const confirmKeyRef = useRef<string>(api.generateIdempotencyKey());
  const deliveryKeyRef = useRef<string>(api.generateIdempotencyKey());
  const voidKeyRef = useRef<string>(api.generateIdempotencyKey());

  // Void modal state
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [submittingVoid, setSubmittingVoid] = useState(false);

  useEffect(() => {
    void loadOrder();
    if (initialRevisionId) {
      void handleViewRevision(initialRevisionId);
    } else {
      setViewingRevision(null);
      setViewingRevisionId(null);
    }
  }, [orderId, initialRevisionId]);

  const loadOrder = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await api.getOrder(orderId);
      setOrder(res);
      // Load secondary tabs: non-admin (employee) MUST NOT call listOrderReturns to avoid 403
      if (isAdmin) {
        void api.listOrderReturns(orderId).then(r => setReturns(r.items)).catch(() => {});
      }
      void api.listOrderRevisions(orderId).then(r => setRevisions(r.items)).catch(() => {});
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : '加载订单详情失败');
    } finally {
      setLoading(false);
    }
  };

  const handleViewRevision = async (revId: string) => {
    setLoadingRevision(true);
    setActionError(null);
    try {
      const rev = await api.getOrderRevision(orderId, revId);
      setViewingRevision(rev);
      setViewingRevisionId(revId);
      setActiveTab('lines');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : '获取历史更正版本快照失败');
    } finally {
      setLoadingRevision(false);
    }
  };

  const handleBackToCurrent = () => {
    setViewingRevision(null);
    setViewingRevisionId(null);
  };

  const handleToggleDelivery = async () => {
    if (!order || viewingRevision) return;
    const newStatus = order.deliveryStatus === 'delivered' ? 'not_delivered' : 'delivered';
    try {
      const updated = await api.setDeliveryStatus(
        order.id,
        {
          expectedVersion: order.version,
          deliveryStatus: newStatus,
        },
        deliveryKeyRef.current
      );
      setOrder(updated);
      deliveryKeyRef.current = api.generateIdempotencyKey(); // Advance key on success
      setActionSuccess(`配送状态已更新为：${newStatus === 'delivered' ? '已配送' : '未配送'}`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : '更新配送状态失败');
    }
  };

  const handleConfirmOrder = async () => {
    if (!order || viewingRevision) return;
    try {
      const confirmed = await api.confirmOrder(
        order.id,
        { expectedVersion: order.version },
        confirmKeyRef.current
      );
      setOrder(confirmed);
      confirmKeyRef.current = api.generateIdempotencyKey(); // Advance key on success
      setActionSuccess(`订单 ${confirmed.orderNo} 确认成功！`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : '确认订单失败');
    }
  };

  const handleVoidOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || viewingRevision || !voidReason.trim()) return;
    setSubmittingVoid(true);
    try {
      const voided = await api.voidOrder(
        order.id,
        {
          expectedVersion: order.version,
          reason: voidReason.trim(),
        },
        voidKeyRef.current
      );
      setOrder(voided);
      voidKeyRef.current = api.generateIdempotencyKey(); // Advance key on success
      setVoidModalOpen(false);
      setActionSuccess('订单已作废并成功恢复库存');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : '作废订单失败');
    } finally {
      setSubmittingVoid(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-subtle)' }}>
        加载订单详情中...
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ color: 'var(--danger)', marginBottom: '16px' }}>订单不存在或已被删除</div>
        <button onClick={onBack} className="btn btn-secondary">返回订单列表</button>
      </div>
    );
  }

  const activeOrder = viewingRevision || order;
  const isHistoricalView = !!viewingRevision;

  const isDraft = activeOrder.status === 'draft';
  const isConfirmed = activeOrder.status === 'confirmed';
  const isVoided = activeOrder.status === 'voided';
  const isDelivered = activeOrder.deliveryStatus === 'delivered';

  // Separate normal lines and return history lines
  const normalLines = activeOrder.lines.filter(l => l.kind !== 'return_history');
  const returnHistoryLines = activeOrder.lines.filter(l => l.kind === 'return_history');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: isAdmin && isDraft && !isHistoricalView ? '90px' : '24px' }}>
      {/* Historical Revision Snapshot Banner */}
      {isHistoricalView && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', background: 'var(--accent-subtle)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)', color: 'var(--accent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardIcon size={20} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>
                【历史版本只读快照 - 版本号 #v{viewingRevision.revisionNo}】
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                更新时间: {formatShanghaiInstant(viewingRevision.updatedAt)} · 变更原因: {revisions.find(r => r.revisionId === viewingRevision.revisionId)?.changeReason || '历史更正记录'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleBackToCurrent}
            className="btn btn-primary btn-sm"
          >
            ← 返回当前生效版本 (v{order.revisionNo})
          </button>
        </div>
      )}

      {/* Top Header & Actions */}
      <div className="page-header-responsive order-detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div className="order-detail-header-main" style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <button onClick={onBack} className="btn btn-secondary btn-sm">
            ← 返回列表
          </button>
          <div className="order-detail-title-block" style={{ minWidth: 0 }}>
            <div className="order-detail-title-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
              <h1 className="order-detail-order-no" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.3px', minWidth: 0, overflowWrap: 'anywhere' }}>
                订单 {activeOrder.orderNo}
              </h1>
              {isDraft && <span className="badge badge-warning">草稿</span>}
              {isConfirmed && <span className="badge badge-success">已确认</span>}
              {isVoided && <span className="badge badge-danger">已作废</span>}
              <span className="badge badge-default">版本 v{activeOrder.revisionNo}</span>
              {isHistoricalView && <span className="badge badge-accent">历史只读</span>}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              创建时间: {formatShanghaiInstant(activeOrder.createdAt)}
            </div>
          </div>
        </div>

        {/* Action Buttons with strict role-based and status gating */}
        <div className="page-header-actions order-detail-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
          {isHistoricalView ? (
            <button onClick={handleBackToCurrent} className="btn btn-primary btn-sm">
              ← 返回当前生效版本 (v{order.revisionNo})
            </button>
          ) : (
            <>
              {isAdmin && isConfirmed && (
                <>
                  <button onClick={() => onEditOrder(order.id)} className="btn btn-secondary">
                    <EditIcon size={16} />
                    <span>更正改单</span>
                  </button>
                  <button onClick={() => setReturnModalOpen(true)} className="btn btn-secondary">
                    <span>部分退货</span>
                  </button>
                  <button onClick={handleToggleDelivery} className="btn btn-secondary">
                    <TruckIcon size={16} />
                    <span>{isDelivered ? '标为未配送' : '确认已配送'}</span>
                  </button>
                </>
              )}

              {/* Void allowed strictly for confirmed & not_delivered orders. Drafts must NEVER show void. */}
              {isAdmin && isConfirmed && !isDelivered && !isVoided && (
                <button onClick={() => setVoidModalOpen(true)} className="btn btn-danger btn-sm">
                  <TrashIcon size={14} />
                  <span>作废订单</span>
                </button>
              )}
            </>
          )}

          <button onClick={() => onPrintOrder(order.id, viewingRevisionId || undefined)} className="btn btn-accent">
            <PrinterIcon size={16} />
            <span>打印配送单</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px' }}>
          <AlertCircleIcon size={16} />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '13px' }}>
          <CheckIcon size={16} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Overview Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        {/* Customer & Address */}
        <div className="card">
          <div className="card-body" style={{ padding: '14px 16px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-subtle)', display: 'block' }}>配送客户</span>
            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-main)', marginTop: '2px' }}>
              {activeOrder.deliverySnapshot?.customerName || '客户门店'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              联系人: {activeOrder.deliverySnapshot?.contactName || '无'} ({activeOrder.deliverySnapshot?.phone || '—'})
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              地址: {activeOrder.deliverySnapshot?.address || '自提'}
            </div>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="card">
          <div className="card-body" style={{ padding: '14px 16px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-subtle)', display: 'block' }}>订单金额</span>
            <div className="tabular-nums" style={{ fontWeight: 700, fontSize: '18px', color: 'var(--accent)', marginTop: '2px' }}>
              ¥{activeOrder.totalAmount}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              商品小计: ¥{activeOrder.subtotalAmount} · 优惠: ¥{activeOrder.discountAmount} · 抹零: ¥{activeOrder.roundOffAmount}
            </div>
            {Number(activeOrder.returnAmount) > 0 && (
              <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '2px' }}>
                累计退货冲减: -¥{activeOrder.returnAmount}
              </div>
            )}
          </div>
        </div>

        {/* Operational Status */}
        <div className="card">
          <div className="card-body" style={{ padding: '14px 16px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-subtle)', display: 'block' }}>履约与打印状态</span>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              {isDelivered ? (
                <span className="badge badge-info">已配送 ({activeOrder.deliveredAt ? formatShanghaiDate(activeOrder.deliveredAt) : ''})</span>
              ) : (
                <span className="badge badge-default">未配送</span>
              )}
              {activeOrder.currentRevisionPrintStatus === 'user_confirmed' ? (
                <span className="badge badge-success">出纸已确认</span>
              ) : (
                <span className="badge badge-default">未出纸</span>
              )}
            </div>
            {activeOrder.remark && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                备注: {activeOrder.remark}
              </div>
            )}
          </div>
        </div>

        {/* Admin Only: Cost & Profit */}
        {isAdmin && 'costAmount' in activeOrder && (
          <div className="card">
            <div className="card-body" style={{ padding: '14px 16px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-subtle)', display: 'block' }}>核算成本与毛利 (管理员)</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '2px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>成本: </span>
                  <strong className="tabular-nums">¥{(activeOrder as OrderAdmin).costAmount}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>毛利: </span>
                  <strong className="tabular-nums" style={{ color: Number((activeOrder as OrderAdmin).grossProfit) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    ¥{(activeOrder as OrderAdmin).grossProfit}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-default)', paddingBottom: '2px' }}>
        {[
          { id: 'lines' as const, label: `商品明细 (${order.lines.length})` },
          ...(isAdmin ? [{ id: 'returns' as const, label: `退货与返库记录 (${returns.length})` }] : []),
          { id: 'revisions' as const, label: `版本历史 (${revisions.length})` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`btn btn-sm ${activeTab === t.id ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Product Lines Table */}
      {activeTab === 'lines' && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>商品名称 / 规格</th>
                <th>出货仓</th>
                <th>销售单位</th>
                <th className="text-right">销售数量</th>
                <th className="text-right">基础数量</th>
                <th className="text-right">成交单价</th>
                <th className="text-right">小计金额</th>
                <th className="text-right">已退基础量</th>
                {isAdmin && 'costAmount' in order && <th className="text-right">批次成本</th>}
                {isAdmin && 'grossProfit' in order && <th className="text-right">毛利</th>}
              </tr>
            </thead>
            <tbody>
              {normalLines.map((line, idx) => (
                <tr key={line.id}>
                  <td>{idx + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{line.productName}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{line.specification}</div>
                  </td>
                  <td>{line.warehouseName}</td>
                  <td>{line.unitName}</td>
                  <td className="tabular-nums text-right">{line.quantity ?? '—'}</td>
                  <td className="tabular-nums text-right">{line.quantityBase}</td>
                  <td className="tabular-nums text-right">¥{line.unitPrice}</td>
                  <td className="tabular-nums text-right" style={{ fontWeight: 600 }}>¥{line.netAmount}</td>
                  <td className="tabular-nums text-right" style={{ color: (line.returnedQuantityBase || 0) > 0 ? 'var(--danger)' : 'var(--text-subtle)' }}>
                    {line.returnedQuantityBase || 0}
                  </td>
                  {isAdmin && 'costAmount' in line && (
                    <td className="tabular-nums text-right">¥{(line as OrderLineAdmin).costAmount}</td>
                  )}
                  {isAdmin && 'grossProfit' in line && (
                    <td className="tabular-nums text-right" style={{ color: Number((line as OrderLineAdmin).grossProfit) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      ¥{(line as OrderLineAdmin).grossProfit}
                    </td>
                  )}
                </tr>
              ))}

              {/* Read-only Return History Lines */}
              {returnHistoryLines.length > 0 && (
                <>
                  <tr style={{ background: 'var(--bg-surface-subtle)' }}>
                    <td colSpan={11} style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-muted)' }}>
                      —— 已退货历史段（严格只读） ——
                    </td>
                  </tr>
                  {returnHistoryLines.map((line, idx) => (
                    <tr key={line.id} style={{ opacity: 0.75, backgroundColor: 'var(--bg-surface-subtle)' }}>
                      <td>{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{line.productName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--danger)' }}>已退部分段 (只读)</div>
                      </td>
                      <td>{line.warehouseName}</td>
                      <td>{line.unitName}</td>
                      <td className="tabular-nums text-right">{line.quantity ?? '—'}</td>
                      <td className="tabular-nums text-right">{line.quantityBase}</td>
                      <td className="tabular-nums text-right">¥{line.unitPrice}</td>
                      <td className="tabular-nums text-right">¥{line.netAmount}</td>
                      <td className="tabular-nums text-right">{line.returnedQuantityBase || line.quantityBase}</td>
                      {isAdmin && 'costAmount' in line && <td className="tabular-nums text-right">¥{(line as OrderLineAdmin).costAmount}</td>}
                      {isAdmin && 'grossProfit' in line && <td className="tabular-nums text-right">¥{(line as OrderLineAdmin).grossProfit}</td>}
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Returns & Restocks History (Admin Only) */}
      {activeTab === 'returns' && isAdmin && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>退货单号</th>
                <th>退货商业信用</th>
                <th>已发生现金退款</th>
                <th>原成本冲减</th>
                <th>返库状态</th>
                <th>登记时间</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {returns.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-subtle)' }}>
                    暂无退货记录
                  </td>
                </tr>
              ) : (
                returns.map(ret => {
                  let totalBase = 0;
                  let restockedBase = 0;
                  let hasPendingRestock = false;

                  for (const l of ret.lines) {
                    if (l.restockDisposition !== 'not_returning') {
                      for (const a of l.allocations) {
                        totalBase += a.quantityBase;
                        restockedBase += a.restockedQuantityBase;
                        if (a.quantityBase > a.restockedQuantityBase) {
                          hasPendingRestock = true;
                        }
                      }
                    }
                  }

                  const canRestock = ret.status === 'confirmed' && hasPendingRestock;

                  return (
                    <tr key={ret.id}>
                      <td style={{ fontWeight: 600 }}>{ret.returnNo}</td>
                      <td className="tabular-nums" style={{ color: 'var(--danger)', fontWeight: 600 }}>
                        ¥{ret.returnAmount}
                      </td>
                      <td className="tabular-nums">
                        ¥{ret.refundedAmount}
                      </td>
                      <td className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        ¥{ret.costCreditAmount}
                      </td>
                      <td>
                        {ret.status === 'absorbed_by_void' ? (
                          <span className="badge badge-default">作废吸收 (不再返库)</span>
                        ) : totalBase === 0 ? (
                          <span className="badge badge-default">明确报损 (免返库)</span>
                        ) : restockedBase >= totalBase ? (
                          <span className="badge badge-success">已全量返库 ({restockedBase}/{totalBase})</span>
                        ) : (
                          <span className="badge badge-warning">待返库 ({restockedBase}/{totalBase})</span>
                        )}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {formatShanghaiInstant(ret.confirmedAt)}
                      </td>
                      <td className="text-right">
                        {canRestock && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedReturnForRestock(ret);
                              setRestockModalOpen(true);
                            }}
                            className="btn btn-secondary btn-sm"
                          >
                            办理返库
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Revisions History */}
      {activeTab === 'revisions' && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>版本号</th>
                <th>变更原因</th>
                <th>变更时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {revisions.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-subtle)' }}>
                    暂无历史更正版本
                  </td>
                </tr>
              ) : (
                revisions.map(rev => {
                  const isCurrent = rev.isCurrent || rev.revisionNo === order.revisionNo;
                  const isViewingThis = viewingRevision && viewingRevision.revisionId === rev.revisionId;

                  return (
                    <tr key={rev.revisionId}>
                      <td style={{ fontWeight: 600 }}>
                        v{rev.revisionNo}
                        {isCurrent && <span className="badge badge-success" style={{ marginLeft: '6px', fontSize: '10px' }}>当前生效</span>}
                      </td>
                      <td>{rev.changeReason}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {formatShanghaiInstant(rev.createdAt)}
                      </td>
                      <td>
                        {isViewingThis ? (
                          <span className="badge badge-accent" style={{ fontSize: '11px' }}>正在查看此快照</span>
                        ) : isCurrent && !isHistoricalView ? (
                          <span style={{ fontSize: '12px', color: 'var(--text-subtle)' }}>当前版本</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleViewRevision(rev.revisionId)}
                            className="btn btn-secondary btn-sm"
                            disabled={loadingRevision}
                          >
                            查看此版本快照
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom Sticky Action Bar for Draft Confirmation */}
      {isAdmin && isDraft && !isHistoricalView && (
        <div className="order-bottom-actions-bar">
          <div className="order-bottom-actions-inner">
            <div className="order-bottom-summary-text">
              <span>草稿状态 · 合计金额: <strong>¥{activeOrder.totalAmount}</strong></span>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleConfirmOrder}
                className="btn btn-primary"
              >
                <CheckIcon size={16} />
                <span>确认开单记账</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Modal */}
      {voidModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 600 }}>作废未配送订单</span>
              <button onClick={() => setVoidModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <form onSubmit={handleVoidOrder}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  作废将自动回补未配送的库存锁定量，冲销本单未结算应收账款。已发生的现金实收将作为客户余额予以保留。
                </p>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                    作废原因 <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    required
                    placeholder="请输入作废原因..."
                    value={voidReason}
                    onChange={e => {
                      voidKeyRef.current = api.generateIdempotencyKey();
                      setVoidReason(e.target.value);
                    }}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setVoidModalOpen(false)} className="btn btn-secondary">
                  取 消
                </button>
                <button type="submit" className="btn btn-danger" disabled={submittingVoid}>
                  {submittingVoid ? '正在作废...' : '确认作废'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Modal */}
      <OrderReturnModal
        isOpen={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        order={order}
        onReturnSuccess={() => {
          setActionSuccess('退货已办理成功！');
          void loadOrder();
        }}
      />

      {/* Restock Modal */}
      {selectedReturnForRestock && (
        <RestockModal
          isOpen={restockModalOpen}
          onClose={() => {
            setRestockModalOpen(false);
            setSelectedReturnForRestock(null);
          }}
          salesReturn={selectedReturnForRestock}
          onRestockSuccess={() => {
            setActionSuccess('商品返库入库已成功登记！');
            void loadOrder();
          }}
        />
      )}
    </div>
  );
}
