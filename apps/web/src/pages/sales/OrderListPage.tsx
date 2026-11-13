import React, { useState, useEffect } from 'react';
import type { OrderSummaryAny } from '../../api/types.js';
import * as api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import {
  SearchIcon,
  PlusIcon,
  RefreshCwIcon,
  TruckIcon,
  PrinterIcon,
} from '../../components/icons/index.js';

interface OrderListPageProps {
  onSelectOrder: (orderId: string) => void;
  onNewOrder: () => void;
  onEditOrder: (orderId: string) => void;
  onPrintOrder: (orderId: string) => void;
}

export function OrderListPage({
  onSelectOrder,
  onNewOrder,
  onEditOrder,
  onPrintOrder,
}: OrderListPageProps) {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState<OrderSummaryAny[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'draft' | 'confirmed' | 'voided' | ''>('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  useEffect(() => {
    void loadOrders();
  }, [statusFilter]);

  const loadOrders = async (cursor?: string) => {
    setLoading(true);
    try {
      const res = await api.listOrders({
        q: searchQuery.trim() || undefined,
        status: statusFilter || undefined,
        limit: 50,
        cursor,
      });
      if (cursor) {
        setOrders(prev => [...prev, ...res.items]);
      } else {
        setOrders(res.items);
      }
      setNextCursor(res.nextCursor);
    } catch {
      if (!cursor) setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadOrders();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>
            销售订单管理
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            查看销售订单生命周期、版本记录、配送与打印状态
          </p>
        </div>

        {isAdmin && (
          <button type="button" onClick={onNewOrder} className="btn btn-primary">
            <PlusIcon size={16} />
            <span>新建销售订单</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="card">
        <div className="card-body" style={{ padding: '12px 16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '240px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <SearchIcon size={16} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-subtle)' }} />
              <input
                type="text"
                className="input"
                style={{ paddingLeft: '32px' }}
                placeholder="搜索订单号、关键词..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-secondary">
              搜索
            </button>
          </form>

          {/* Status Filter */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { id: '' as const, label: '全部状态' },
              { id: 'draft' as const, label: '草稿' },
              { id: 'confirmed' as const, label: '已确认' },
              { id: 'voided' as const, label: '已作废' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`btn btn-sm ${statusFilter === tab.id ? 'btn-primary' : 'btn-ghost'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void loadOrders()}
            className="btn btn-ghost btn-sm"
            title="刷新数据"
            style={{ padding: '6px' }}
          >
            <RefreshCwIcon size={16} />
          </button>
        </div>
      </div>

      {/* Orders Table Card */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>订单单号</th>
              <th>下单客户</th>
              <th>订单状态</th>
              <th>配送状态</th>
              <th>版本</th>
              <th className="text-right">订单金额 (元)</th>
              <th>打印状态</th>
              <th>更新时间</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && orders.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-subtle)' }}>
                  加载订单列表中...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-subtle)' }}>
                  未找到相关订单数据
                </td>
              </tr>
            ) : (
              orders.map(order => {
                const isDraft = order.status === 'draft';
                const isConfirmed = order.status === 'confirmed';
                const isVoided = order.status === 'voided';
                const isDelivered = order.deliveryStatus === 'delivered';

                return (
                  <tr key={order.id} style={{ cursor: 'pointer' }} onClick={() => onSelectOrder(order.id)}>
                    <td style={{ fontWeight: 600 }}>
                      <span style={{ color: 'var(--accent)' }}>{order.orderNo}</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 500 }}>{order.customerName}</span>
                    </td>
                    <td>
                      {isDraft && <span className="badge badge-warning">草稿</span>}
                      {isConfirmed && <span className="badge badge-success">已确认</span>}
                      {isVoided && <span className="badge badge-danger">已作废</span>}
                    </td>
                    <td>
                      {isDelivered ? (
                        <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <TruckIcon size={12} /> 已配送
                        </span>
                      ) : (
                        <span className="badge badge-default">未配送</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-default" style={{ fontSize: '11px' }}>
                        v{order.revisionNo}
                      </span>
                    </td>
                    <td className="tabular-nums text-right" style={{ fontWeight: 600 }}>
                      ¥{order.totalAmount}
                    </td>
                    <td>
                      {order.currentRevisionPrintStatus === 'user_confirmed' ? (
                        <span className="badge badge-success" style={{ fontSize: '11px' }}>已确认出纸</span>
                      ) : order.currentRevisionPrintStatus === 'requested' ? (
                        <span className="badge badge-info" style={{ fontSize: '11px' }}>已请求打印</span>
                      ) : order.currentRevisionPrintStatus === 'client_error' ? (
                        <span className="badge badge-danger" style={{ fontSize: '11px' }}>打印失败</span>
                      ) : (
                        <span className="badge badge-default" style={{ fontSize: '11px' }}>未打印</span>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {order.updatedAt ? order.updatedAt.substring(0, 16).replace('T', ' ') : '—'}
                    </td>
                    <td className="text-right" onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => onSelectOrder(order.id)}
                          className="btn btn-secondary btn-sm"
                        >
                          详情
                        </button>
                        {isAdmin && isConfirmed && (
                          <button
                            type="button"
                            onClick={() => onEditOrder(order.id)}
                            className="btn btn-ghost btn-sm"
                          >
                            改单
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onPrintOrder(order.id)}
                          className="btn btn-ghost btn-sm"
                          title="打印单据"
                        >
                          <PrinterIcon size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Load More */}
      {nextCursor && (
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <button
            type="button"
            onClick={() => void loadOrders(nextCursor)}
            className="btn btn-secondary btn-sm"
            disabled={loading}
          >
            {loading ? '加载中...' : '加载更多订单'}
          </button>
        </div>
      )}
    </div>
  );
}
