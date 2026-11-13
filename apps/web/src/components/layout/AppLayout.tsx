import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import {
  CartIcon,
  ClipboardIcon,
  WarehouseIcon,
  BoxIcon,
  UsersIcon,
  DollarIcon,
  ChartIcon,
  PrinterIcon,
  SparklesIcon,
  SettingsIcon,
  LogoutIcon,
  MoreHorizontalIcon,
  XIcon,
} from '../icons/index.js';

export type PageId =
  | 'order-create'
  | 'orders'
  | 'products'
  | 'inventory'
  | 'receipt-create'
  | 'stocktake'
  | 'customers'
  | 'warehouses'
  | 'finance'
  | 'cash-events'
  | 'statements'
  | 'reports'
  | 'ai-reports'
  | 'printing'
  | 'settings-company'
  | 'settings-users';

interface AppLayoutProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  children: React.ReactNode;
}

export function AppLayout({ activePage, onNavigate, children }: AppLayoutProps) {
  const { user, isAdmin, isEmployee, logout } = useAuth();
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);

  // Gating based on server-backed role: Employees have read-only access to orders and printing
  const navItems = [
    { id: 'order-create' as PageId, label: '销售开单', icon: CartIcon, adminOnly: true },
    { id: 'orders' as PageId, label: '订单管理', icon: ClipboardIcon, publicAccess: true },
    { id: 'printing' as PageId, label: '打印单据', icon: PrinterIcon, publicAccess: true },
    { id: 'products' as PageId, label: '商品资料', icon: BoxIcon, adminOnly: true },
    { id: 'inventory' as PageId, label: '库存与批次', icon: WarehouseIcon, adminOnly: true },
    { id: 'customers' as PageId, label: '客户与价格', icon: UsersIcon, adminOnly: true },
    { id: 'finance' as PageId, label: '往来与结算', icon: DollarIcon, adminOnly: true },
    { id: 'reports' as PageId, label: '经营报表', icon: ChartIcon, adminOnly: true },
    { id: 'ai-reports' as PageId, label: 'AI 智能统计', icon: SparklesIcon, adminOnly: true },
    { id: 'settings-company' as PageId, label: '系统设置', icon: SettingsIcon, adminOnly: true },
  ].filter(item => {
    if (isEmployee) return item.publicAccess;
    return true;
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', background: 'var(--bg-app)' }}>
      {/* Desktop Sidebar */}
      <aside
        className="hide-mobile"
        style={{
          width: 'var(--sidebar-width)',
          borderRight: '1px solid var(--border-default)',
          background: 'var(--bg-surface)',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 100,
        }}
      >
        {/* Brand Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <BoxIcon size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '-0.2px', color: 'var(--text-main)' }}>货友铺</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>在线进销存系统</div>
          </div>
        </div>

        {/* Navigation list */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activePage === item.id ||
              (item.id === 'inventory' && (activePage === 'receipt-create' || activePage === 'stocktake')) ||
              (item.id === 'customers' && activePage === 'warehouses') ||
              (item.id === 'finance' && (activePage === 'cash-events' || activePage === 'statements')) ||
              (item.id === 'settings-company' && activePage === 'settings-users');

            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#0f172a' : 'var(--text-muted)',
                  backgroundColor: isActive ? '#f1f5f9' : 'transparent',
                  textAlign: 'left',
                  transition: 'background-color 0.15s, color 0.15s',
                  width: '100%',
                }}
              >
                <Icon size={18} style={{ color: isActive ? '#2563eb' : 'inherit' }} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Card & Logout */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {user?.loginName}
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                <span className={`badge ${isAdmin ? 'badge-info' : 'badge-default'}`}>
                  {isAdmin ? '管理员' : '员工'}
                </span>
                {isEmployee && (
                  <span style={{ fontSize: '10px', color: 'var(--text-subtle)' }}>成本已隐藏</span>
                )}
              </div>
            </div>
            <button
              onClick={() => void logout()}
              title="退出登录"
              className="btn btn-ghost btn-sm"
              style={{ padding: '6px', minHeight: 'unset' }}
            >
              <LogoutIcon size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto', maxHeight: '100vh' }}>
        {/* Mobile Header */}
        <header
          className="hide-desktop"
          style={{
            height: 'var(--header-height)',
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            position: 'sticky',
            top: 0,
            zIndex: 90,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <BoxIcon size={16} />
            </div>
            <span style={{ fontWeight: 700, fontSize: '15px' }}>货友铺</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className={`badge ${isAdmin ? 'badge-info' : 'badge-default'}`}>
              {isAdmin ? '管理员' : '员工'}
            </span>
            <button onClick={() => void logout()} title="退出登录" className="btn btn-ghost btn-sm" style={{ padding: '4px' }}>
              <LogoutIcon size={16} />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main style={{ flex: 1, padding: '20px 24px', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <nav
          className="hide-desktop"
          style={{
            height: 'var(--mobile-nav-height)',
            background: 'var(--bg-surface)',
            borderTop: '1px solid var(--border-default)',
            display: 'flex',
            position: 'sticky',
            bottom: 0,
            zIndex: 90,
          }}
        >
          {(navItems.length <= 4 ? navItems : navItems.slice(0, 4)).map(item => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setMoreDrawerOpen(false);
                  onNavigate(item.id);
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                  color: isActive ? '#2563eb' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: isActive ? 600 : 500,
                  padding: '6px 0',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}

          {/* More Drawer Button for Admin Items 5-10 */}
          {navItems.length > 4 && (
            <button
              type="button"
              onClick={() => setMoreDrawerOpen(prev => !prev)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                color: moreDrawerOpen ? '#2563eb' : 'var(--text-muted)',
                fontSize: '11px',
                fontWeight: moreDrawerOpen ? 600 : 500,
                padding: '6px 0',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <MoreHorizontalIcon size={18} />
              <span>更多</span>
            </button>
          )}
        </nav>

        {/* Mobile Overflow Drawer for Admin Routes */}
        {moreDrawerOpen && (
          <div
            className="modal-overlay hide-desktop"
            style={{
              zIndex: 95,
              alignItems: 'flex-end',
              padding: 0,
            }}
            onClick={() => setMoreDrawerOpen(false)}
          >
            <div
              className="modal-content"
              style={{
                width: '100vw',
                maxHeight: '75vh',
                borderTopLeftRadius: 'var(--radius-lg)',
                borderTopRightRadius: 'var(--radius-lg)',
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
                background: 'var(--bg-surface)',
                padding: '16px',
                animation: 'slideUp 0.2s ease-out',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
                <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-main)' }}>
                  管理功能导航
                </span>
                <button
                  type="button"
                  onClick={() => setMoreDrawerOpen(false)}
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '4px' }}
                >
                  <XIcon size={18} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', overflowY: 'auto' }}>
                {navItems.map(item => {
                  const Icon = item.icon;
                  const isActive = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onNavigate(item.id);
                        setMoreDrawerOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '12px 8px',
                        borderRadius: 'var(--radius-md)',
                        background: isActive ? 'var(--accent-subtle)' : 'var(--bg-surface-subtle)',
                        border: isActive ? '1px solid var(--accent)' : '1px solid var(--border-default)',
                        color: isActive ? 'var(--accent)' : 'var(--text-main)',
                        gap: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      <Icon size={20} />
                      <span style={{ fontSize: '12px', fontWeight: 500 }}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
