import React, { useState, useEffect, useRef } from 'react';
import type { SourceRef, ReportQuery } from './api/types.js';
import * as api from './api/client.js';
import { useAuth } from './context/AuthContext.js';
import { AppLayout, type PageId } from './components/layout/AppLayout.js';
import { LoginPage } from './pages/auth/LoginPage.js';
import { OrderCreatePage } from './pages/sales/OrderCreatePage.js';
import { OrderListPage } from './pages/sales/OrderListPage.js';
import { OrderDetailPage } from './pages/sales/OrderDetailPage.js';
import { OrderEditPage } from './pages/sales/OrderEditPage.js';
import { OrderPrintPreview } from './pages/printing/OrderPrintPreview.js';
import { ProductListPage } from './pages/catalog/ProductListPage.js';
import { CustomerListPage } from './pages/catalog/CustomerListPage.js';
import { WarehouseListPage } from './pages/catalog/WarehouseListPage.js';
import { InventoryListPage } from './pages/inventory/InventoryListPage.js';
import { ReceiptCreatePage } from './pages/inventory/ReceiptCreatePage.js';
import { StocktakePage } from './pages/inventory/StocktakePage.js';
import { CustomerFinancePage } from './pages/finance/CustomerFinancePage.js';
import { CashEventsPage } from './pages/finance/CashEventsPage.js';
import { StatementsPage } from './pages/finance/StatementsPage.js';
import { ReportsPage } from './pages/reports/ReportsPage.js';
import { AiReportPage } from './pages/reports/AiReportPage.js';
import { CompanySettingsPage } from './pages/settings/CompanySettingsPage.js';
import { UsersPage } from './pages/settings/UsersPage.js';
import { AlertCircleIcon } from './components/icons/index.js';

import {
  type NavigationTarget,
  resolveSourceHref,
  ADMIN_ONLY_PAGES,
} from './navigation.js';

export { NavigationTarget, resolveSourceHref, ADMIN_ONLY_PAGES };

export function App() {
  const { user, loading, isAdmin, isEmployee } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  const [activePage, setActivePage] = useState<PageId | 'order-detail' | 'order-edit'>(() => {
    return user?.role === 'employee' ? 'orders' : 'order-create';
  });
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [navTarget, setNavTarget] = useState<NavigationTarget | null>(null);
  const [unresolvedSource, setUnresolvedSource] = useState<SourceRef | { href: string } | null>(null);
  const pendingTargetRef = useRef<NavigationTarget | null>(null);
  const navSeqRef = useRef(0);

  // Synchronize route and session state on user login / logout / role change / session recovery
  useEffect(() => {
    if (loading) {
      return; // Wait until session checking finishes
    }

    if (!user) {
      // Anonymous state: LoginPage will be shown.
      // Do NOT wipe pendingTargetRef! ("匿名需登录时仍保留该目标以待合法admin登录")
      setActivePage('order-create');
      setSelectedOrderId(null);
      setSelectedRevisionId(null);
      setNavTarget(null);
      setUnresolvedSource(null);
      return;
    }

    const currentRole = user.role;

    // 1. Consume pending navigation target if one is waiting for authentication
    if (pendingTargetRef.current) {
      const pending = pendingTargetRef.current;
      pendingTargetRef.current = null;

      if (pending.returnId) {
        if (currentRole !== 'admin') {
          // Employee: strictly forbidden to execute return lookup. 0 GET requests!
          // Directs to 403 Forbidden screen in renderContent
          setSelectedOrderId(null);
          setSelectedRevisionId(null);
          setNavTarget(pending);
          setActivePage('order-edit');
          return;
        }

        // Admin: resolve parent order
        void applyNavigationTarget(pending);
        return;
      }

      // Other pending targets: set target so renderContent can display 403 for employee
      void applyNavigationTarget(pending);
      return;
    }

    // 2. If an explicit deep-link target is already established (e.g. from prior navigation)
    if (selectedOrderId || navTarget) {
      return;
    }

    // 3. No active deep link & no pending target: apply role-based default landing page
    if (currentRole === 'employee') {
      setActivePage('orders');
    } else {
      setActivePage('order-create');
    }
  }, [user?.id, user?.role, loading]);

  // Complete target replacement handler: ensures stale revisionId/orderId are not retained
  const applyNavigationTarget = async (target: NavigationTarget) => {
    const seq = ++navSeqRef.current;

    // If session is still loading or user identity is unknown (anonymous):
    // Identity is unconfirmed! Do NOT issue admin APIs; do NOT permanently discard valid target!
    // Stage it into pendingTargetRef to consume once identity is confirmed.
    if (loadingRef.current || !userRef.current) {
      pendingTargetRef.current = target;
      return;
    }

    const currentRole = userRef.current.role;

    // 1. If target is return: /returns/{id}
    if (target.returnId) {
      // Identity check: must be confirmed admin!
      // If employee, NEVER issue admin API requests! (0 GET requests)
      // Route to admin-only order-edit to display 403 Forbidden screen
      if (currentRole !== 'admin') {
        setSelectedOrderId(null);
        setSelectedRevisionId(null);
        setNavTarget(target);
        setActivePage('order-edit');
        return;
      }

      // For confirmed admin, resolve parent order ID
      try {
        const ret = await api.getReturn(target.returnId);
        if (navSeqRef.current !== seq) return; // Stale async return resolution discarded!
        if (ret?.orderId) {
          setSelectedOrderId(ret.orderId);
          setSelectedRevisionId(null);
          setNavTarget(target);
          setActivePage('order-detail');
          return;
        }
      } catch {
        if (navSeqRef.current !== seq) return;
        // Fallback to orders
        setSelectedOrderId(null);
        setSelectedRevisionId(null);
        setNavTarget(null);
        setActivePage('orders');
        return;
      }
    }

    if (navSeqRef.current !== seq) return;

    // Complete replacement: clear revisionId if target does not specify one
    // Notice: For employee accessing admin-only pages, activePage is set to target.page,
    // which triggers the 403 Forbidden gate in renderContent() without mounting admin components!
    setNavTarget(target);
    setSelectedOrderId(target.orderId || null);
    setSelectedRevisionId(target.revisionId || null);
    setActivePage(target.page);
  };

  // Global SourceRef.href navigation handler
  const handleNavigateToHref = (href: string) => {
    if (!href) return;
    const target = resolveSourceHref(href);
    if (target) {
      void applyNavigationTarget(target);
    } else {
      setUnresolvedSource({ href });
    }
  };

  const handleNavigateToSourceRef = (source: SourceRef) => {
    if (!source) return;
    if (source.href) {
      const target = resolveSourceHref(source.href, source);
      if (target) {
        void applyNavigationTarget(target);
        return;
      }
    }
    setUnresolvedSource(source);
  };

  useEffect(() => {
    // Initial native URL resolution on page load/reload
    if (typeof window !== 'undefined') {
      const initialPath = window.location.pathname + window.location.search + window.location.hash;
      if (initialPath && initialPath !== '/') {
        const target = resolveSourceHref(initialPath);
        if (target) {
          void applyNavigationTarget(target);
        }
      }
    }

    const handleNavEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ href: string }>;
      if (customEvent.detail?.href) {
        handleNavigateToHref(customEvent.detail.href);
      }
    };
    window.addEventListener('huoyoupu:navigate', handleNavEvent);
    return () => window.removeEventListener('huoyoupu:navigate', handleNavEvent);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>正在同步登录会话...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Handle page rendering with strict role-based route gating (403 screen for employees accessing admin-only pages)
  const renderContent = () => {
    if (isEmployee && ADMIN_ONLY_PAGES.has(activePage)) {
      return (
        <div style={{ padding: '60px 20px', textAlign: 'center', maxWidth: '480px', margin: '0 auto' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--danger-bg)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <AlertCircleIcon size={28} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
            403 访问权限受限
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '20px' }}>
            当前操作员为【员工】角色，仅支持订单查询与单据打印。如需进行开单、改单或系统管理，请联系系统管理员。
          </p>
          <button
            onClick={() => {
              setActivePage('orders');
              setNavTarget(null);
              setSelectedOrderId(null);
              setSelectedRevisionId(null);
            }}
            className="btn btn-primary"
          >
            返回订单列表
          </button>
        </div>
      );
    }

    switch (activePage) {
      case 'order-create':
        return (
          <OrderCreatePage
            onOrderCreated={id => {
              setSelectedOrderId(id);
              setSelectedRevisionId(null);
              setNavTarget(null);
              setActivePage('order-detail');
            }}
          />
        );

      case 'orders':
        return (
          <OrderListPage
            onSelectOrder={id => {
              setSelectedOrderId(id);
              setSelectedRevisionId(null);
              setNavTarget(null);
              setActivePage('order-detail');
            }}
            onNewOrder={() => {
              setSelectedOrderId(null);
              setSelectedRevisionId(null);
              setNavTarget(null);
              setActivePage('order-create');
            }}
            onEditOrder={id => {
              setSelectedOrderId(id);
              setSelectedRevisionId(null);
              setNavTarget(null);
              setActivePage('order-edit');
            }}
            onPrintOrder={id => {
              setSelectedOrderId(id);
              setSelectedRevisionId(null);
              setNavTarget(null);
              setActivePage('printing');
            }}
          />
        );

      case 'order-detail':
        if (!selectedOrderId) {
          return (
            <OrderListPage
              onSelectOrder={id => {
                setSelectedOrderId(id);
                setSelectedRevisionId(null);
                setNavTarget(null);
                setActivePage('order-detail');
              }}
              onNewOrder={() => {
                setSelectedOrderId(null);
                setSelectedRevisionId(null);
                setNavTarget(null);
                setActivePage('order-create');
              }}
              onEditOrder={id => {
                setSelectedOrderId(id);
                setSelectedRevisionId(null);
                setNavTarget(null);
                setActivePage('order-edit');
              }}
              onPrintOrder={id => {
                setSelectedOrderId(id);
                setSelectedRevisionId(null);
                setNavTarget(null);
                setActivePage('printing');
              }}
            />
          );
        }
        return (
          <OrderDetailPage
            orderId={selectedOrderId}
            initialRevisionId={selectedRevisionId || undefined}
            onBack={() => {
              setSelectedRevisionId(null);
              setNavTarget(null);
              setActivePage('orders');
            }}
            onEditOrder={id => {
              setSelectedOrderId(id);
              setSelectedRevisionId(null);
              setNavTarget(null);
              setActivePage('order-edit');
            }}
            onPrintOrder={(id, revisionId) => {
              setSelectedOrderId(id);
              setSelectedRevisionId(revisionId || null);
              if (navTarget) {
                setNavTarget({
                  ...navTarget,
                  revisionId: revisionId || undefined,
                });
              }
              setActivePage('printing');
            }}
          />
        );

      case 'order-edit':
        if (!selectedOrderId) {
          return (
            <OrderListPage
              onSelectOrder={id => {
                setSelectedOrderId(id);
                setSelectedRevisionId(null);
                setNavTarget(null);
                setActivePage('order-detail');
              }}
              onNewOrder={() => {
                setSelectedOrderId(null);
                setSelectedRevisionId(null);
                setNavTarget(null);
                setActivePage('order-create');
              }}
              onEditOrder={id => {
                setSelectedOrderId(id);
                setSelectedRevisionId(null);
                setNavTarget(null);
                setActivePage('order-edit');
              }}
              onPrintOrder={id => {
                setSelectedOrderId(id);
                setSelectedRevisionId(null);
                setNavTarget(null);
                setActivePage('printing');
              }}
            />
          );
        }
        return (
          <OrderEditPage
            orderId={selectedOrderId}
            onBack={() => setActivePage('order-detail')}
            onRevisionSuccess={id => {
              setSelectedOrderId(id);
              setSelectedRevisionId(null);
              setActivePage('order-detail');
            }}
          />
        );

      case 'printing':
        if (!selectedOrderId) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ padding: '12px 16px', background: 'var(--accent-subtle)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)', color: 'var(--accent)', fontSize: '13px' }}>
                请选择需要打印单据的订单进行预览与打印
              </div>
              <OrderListPage
                onSelectOrder={id => {
                  setSelectedOrderId(id);
                  setSelectedRevisionId(null);
                  setActivePage('printing');
                }}
                onNewOrder={() => setActivePage('order-create')}
                onEditOrder={id => {
                  setSelectedOrderId(id);
                  setActivePage('order-edit');
                }}
                onPrintOrder={id => {
                  setSelectedOrderId(id);
                  setActivePage('printing');
                }}
              />
            </div>
          );
        }
        return (
          <OrderPrintPreview
            orderId={selectedOrderId}
            onBack={() => setActivePage('orders')}
            {...({
              initialRevisionId: selectedRevisionId || navTarget?.revisionId,
            } as Record<string, unknown>)}
          />
        );

      case 'products':
        return <ProductListPage />;

      case 'customers':
        return <CustomerListPage />;

      case 'warehouses':
        return <WarehouseListPage />;

      case 'inventory':
        return (
          <InventoryListPage
            onNavigateToReceipt={() => setActivePage('receipt-create')}
            onNavigateToStocktake={() => setActivePage('stocktake')}
            {...({
              initialReceiptId: navTarget?.receiptId,
              initialWarehouseId: navTarget?.warehouseId,
              initialProductId: navTarget?.productId,
              initialBatchId: navTarget?.batchId,
            } as Record<string, unknown>)}
          />
        );

      case 'receipt-create':
        return (
          <ReceiptCreatePage
            onBack={() => setActivePage('inventory')}
            onReceiptCreated={() => setActivePage('inventory')}
          />
        );

      case 'stocktake':
        return (
          <StocktakePage
            onBack={() => setActivePage('inventory')}
            {...({
              initialStocktakeId: navTarget?.stocktakeId,
            } as Record<string, unknown>)}
          />
        );

      case 'finance':
        return (
          <CustomerFinancePage
            onNavigateToStatements={() => setActivePage('statements')}
            onNavigateToSource={handleNavigateToHref}
            {...({
              initialCustomerId: navTarget?.customerId,
              initialLedgerEntryId: navTarget?.ledgerEntryId,
            } as Record<string, unknown>)}
          />
        );

      case 'cash-events':
        return (
          <CashEventsPage
            onNavigateToCustomerFinance={() => setActivePage('finance')}
            onNavigateToSource={handleNavigateToHref}
            {...({
              initialCashEventId: navTarget?.cashEventId,
              initialCustomerId: navTarget?.customerId,
            } as Record<string, unknown>)}
          />
        );

      case 'statements':
        return (
          <StatementsPage
            onBack={() => setActivePage('finance')}
            onNavigateToSource={handleNavigateToHref}
            {...({
              initialStatementId: navTarget?.statementId,
              initialCustomerId: navTarget?.customerId,
            } as Record<string, unknown>)}
          />
        );

      case 'reports':
        return (
          <ReportsPage
            initialQuery={navTarget?.reportQuery}
            onNavigateToSource={handleNavigateToSourceRef}
            onBackToAi={() => setActivePage('ai-reports')}
            {...({
              initialReportRunId: navTarget?.reportRunId,
            } as Record<string, unknown>)}
          />
        );

      case 'ai-reports':
        return (
          <AiReportPage
            onOpenReports={query => {
              setNavTarget({ page: 'reports', reportQuery: query });
              setActivePage('reports');
            }}
            onNavigateToSource={handleNavigateToSourceRef}
            {...({
              onOpenReportRun: (reportRunId: string) => {
                setNavTarget({ page: 'reports', reportRunId });
                setActivePage('reports');
              },
            } as Record<string, unknown>)}
          />
        );

      case 'settings-company':
        return <CompanySettingsPage />;

      case 'settings-users':
        return <UsersPage />;

      default:
        return <OrderCreatePage onOrderCreated={id => { setSelectedOrderId(id); setActivePage('order-detail'); }} />;
    }
  };

  const navPageId: PageId = (activePage === 'order-detail' || activePage === 'order-edit') ? 'orders' : activePage;

  return (
    <>
      <AppLayout
        activePage={navPageId}
        onNavigate={p => {
          setActivePage(p);
        }}
      >
        {renderContent()}
      </AppLayout>

      {/* Unresolved Source Fallback Modal with Copyable Metadata */}
      {unresolvedSource && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 600 }}>来源定位快照详情</span>
              <button onClick={() => setUnresolvedSource(null)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <p style={{ color: 'var(--text-muted)', lineHeight: '1.5' }}>
                当前来源路径尚未建立直接的前端页面跳转，已为您提取并显示该来源的完整元数据快照供核对与复制：
              </p>
              <pre style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: 'var(--radius-sm)', fontSize: '12px', overflowX: 'auto', border: '1px solid var(--border-light)' }}>
                {JSON.stringify(unresolvedSource, null, 2)}
              </pre>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                onClick={() => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    void navigator.clipboard.writeText(JSON.stringify(unresolvedSource, null, 2));
                  }
                }}
                className="btn btn-secondary btn-sm"
              >
                复制快照信息
              </button>
              <button type="button" onClick={() => setUnresolvedSource(null)} className="btn btn-primary btn-sm">
                关 闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
