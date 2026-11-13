import type { PageId } from './components/layout/AppLayout.js';
import type { SourceRef, ReportQuery, User } from './api/types.js';

export const ADMIN_ONLY_PAGES = new Set<string>([
  'order-create',
  'order-edit',
  'products',
  'customers',
  'warehouses',
  'inventory',
  'receipt-create',
  'stocktake',
  'finance',
  'cash-events',
  'statements',
  'reports',
  'ai-reports',
  'settings-company',
  'settings-users',
]);

export interface NavigationTarget {
  page: PageId | 'order-detail' | 'order-edit';
  orderId?: string;
  revisionId?: string;
  returnId?: string;
  receiptId?: string;
  stocktakeId?: string;
  cashEventId?: string;
  customerId?: string;
  ledgerEntryId?: string;
  statementId?: string;
  reportRunId?: string;
  reportQuery?: ReportQuery;
  productId?: string;
  warehouseId?: string;
  batchId?: string;
  rawHref?: string;
  rawSourceRef?: SourceRef;
}

export function resolveSourceHref(rawHref: string, rawSource?: SourceRef): NavigationTarget | null {
  if (!rawHref || typeof rawHref !== 'string') return null;

  // Clean /api/v1 prefix strictly on path boundaries ('/api/v1', '/api/v1/', '/api/v1?')
  let href = rawHref.trim();
  if (href === '/api/v1' || href.startsWith('/api/v1/') || href.startsWith('/api/v1?')) {
    href = href.substring('/api/v1'.length);
  }
  if (!href.startsWith('/')) {
    href = '/' + href;
  }

  const [pathAndQuery, hash] = href.split('#');
  const parts = (pathAndQuery || '').split('?');
  const path = parts[0] || '/';
  const queryStr = parts[1] || '';
  const query = new URLSearchParams(queryStr);

  // 1. Order revision: /orders/{orderId}/revisions/{revisionId}
  const revMatch = path.match(/^\/orders\/([A-Za-z0-9_-]+)\/revisions\/([A-Za-z0-9_-]+)$/);
  if (revMatch) {
    if (queryStr) return null; // Reject unexpected query parameters to preserve raw semantics
    return {
      page: 'order-detail',
      orderId: revMatch[1],
      revisionId: revMatch[2],
      rawHref,
      rawSourceRef: rawSource,
    };
  }

  // 2. Order detail: /orders/{orderId}
  const ordMatch = path.match(/^\/orders\/([A-Za-z0-9_-]+)$/);
  if (ordMatch) {
    if (queryStr) return null; // Reject unexpected subpaths/queries like /orders/abc/unknown
    return {
      page: 'order-detail',
      orderId: ordMatch[1],
      rawHref,
      rawSourceRef: rawSource,
    };
  }

  // 3. Return: /returns/{returnId}
  const retMatch = path.match(/^\/returns\/([A-Za-z0-9_-]+)$/);
  if (retMatch) {
    if (queryStr) return null;
    return {
      page: 'orders',
      returnId: retMatch[1],
      rawHref,
      rawSourceRef: rawSource,
    };
  }

  // 4. Cash event: /cash-events/{cashEventId}
  const cashMatch = path.match(/^\/cash-events\/([A-Za-z0-9_-]+)$/);
  if (cashMatch) {
    if (queryStr) return null;
    return {
      page: 'cash-events',
      cashEventId: cashMatch[1],
      rawHref,
      rawSourceRef: rawSource,
    };
  }

  // 5. Inventory batches/balances: /inventory/batches?productId=...&warehouseId=...#batchId
  if (path === '/inventory/batches' || path === '/inventory/balances') {
    const allowedKeys = new Set(['productId', 'warehouseId', 'batchId', 'cursor', 'limit']);
    for (const key of query.keys()) {
      if (!allowedKeys.has(key)) return null;
    }
    return {
      page: 'inventory',
      productId: query.get('productId') || undefined,
      warehouseId: query.get('warehouseId') || undefined,
      batchId: hash || query.get('batchId') || undefined,
      rawHref,
      rawSourceRef: rawSource,
    };
  }

  // 6. Purchase Receipt: /receipts/{receiptId}
  const rcptMatch = path.match(/^\/receipts\/([A-Za-z0-9_-]+)$/);
  if (rcptMatch) {
    if (queryStr) return null;
    return {
      page: 'inventory',
      receiptId: rcptMatch[1],
      rawHref,
      rawSourceRef: rawSource,
    };
  }

  // 7. Stocktake: /stocktakes/{stocktakeId}
  const stkMatch = path.match(/^\/stocktakes\/([A-Za-z0-9_-]+)$/);
  if (stkMatch) {
    if (queryStr) return null;
    return {
      page: 'stocktake',
      stocktakeId: stkMatch[1],
      rawHref,
      rawSourceRef: rawSource,
    };
  }

  // 8. Customer Ledger: /customers/{customerId}/ledger#{entryId}
  const ledgerMatch = path.match(/^\/customers\/([A-Za-z0-9_-]+)\/ledger$/);
  if (ledgerMatch) {
    if (queryStr) return null;
    return {
      page: 'finance',
      customerId: ledgerMatch[1],
      ledgerEntryId: hash || undefined,
      rawHref,
      rawSourceRef: rawSource,
    };
  }

  // 9. Customer Balances: /customers/{customerId}/balances
  const balanceMatch = path.match(/^\/customers\/([A-Za-z0-9_-]+)\/balances$/);
  if (balanceMatch) {
    if (queryStr) return null;
    return {
      page: 'finance',
      customerId: balanceMatch[1],
      rawHref,
      rawSourceRef: rawSource,
    };
  }

  // 10. Customer Direct: /customers/{customerId}
  const custMatch = path.match(/^\/customers\/([A-Za-z0-9_-]+)$/);
  if (custMatch) {
    if (queryStr) return null;
    return {
      page: 'finance',
      customerId: custMatch[1],
      rawHref,
      rawSourceRef: rawSource,
    };
  }

  // 11. Statement: /statements/{statementId}
  const stmtMatch = path.match(/^\/statements\/([A-Za-z0-9_-]+)$/);
  if (stmtMatch) {
    if (queryStr) return null;
    return {
      page: 'statements',
      statementId: stmtMatch[1],
      rawHref,
      rawSourceRef: rawSource,
    };
  }

  // 12. Report Run: /reports/runs/{reportRunId} or /report-runs/{reportRunId} or /reports/{reportId}
  const reportRunMatch = path.match(/^\/reports\/runs\/([A-Za-z0-9_-]+)$/) || path.match(/^\/report-runs\/([A-Za-z0-9_-]+)$/);
  if (reportRunMatch) {
    if (queryStr) return null;
    return {
      page: 'reports',
      reportRunId: reportRunMatch[1],
      rawHref,
      rawSourceRef: rawSource,
    };
  }

  const reportMatch = path.match(/^\/reports\/([A-Za-z0-9_-]+)$/);
  if (reportMatch) {
    if (queryStr) return null;
    return {
      page: 'reports',
      reportRunId: reportMatch[1],
      rawHref,
      rawSourceRef: rawSource,
    };
  }

  return null;
}

export interface NavigationState {
  activePage: PageId | 'order-detail' | 'order-edit';
  selectedOrderId: string | null;
  selectedRevisionId: string | null;
  navTarget: NavigationTarget | null;
  pendingTarget: NavigationTarget | null;
}

export function createInitialNavigationState(initialRole?: 'admin' | 'employee' | null): NavigationState {
  return {
    activePage: initialRole === 'employee' ? 'orders' : 'order-create',
    selectedOrderId: null,
    selectedRevisionId: null,
    navTarget: null,
    pendingTarget: null,
  };
}

export interface NavigationContext {
  user: User | { role: 'admin' | 'employee' } | null;
  loading: boolean;
  getReturn: (returnId: string) => Promise<{ orderId?: string } | null>;
  getSeq?: () => number;
  currentSeq?: number;
}

export async function applyNavigationIntent(
  state: NavigationState,
  target: NavigationTarget,
  context: NavigationContext
): Promise<NavigationState> {
  // If session is still loading or user identity is unknown (anonymous):
  // Identity is unconfirmed! Do NOT issue admin APIs; do NOT permanently discard valid target!
  // Stage it into pendingTarget to consume once identity is confirmed.
  if (context.loading || !context.user) {
    return {
      ...state,
      pendingTarget: target,
    };
  }

  const role = context.user.role;

  // 1. If target is return: /returns/{id}
  if (target.returnId) {
    if (role !== 'admin') {
      // Employee: strictly forbidden to execute return lookup. 0 GET requests!
      // Sets activePage to admin-only order-edit to render 403 Forbidden screen
      return {
        ...state,
        activePage: 'order-edit',
        selectedOrderId: null,
        selectedRevisionId: null,
        navTarget: target,
        pendingTarget: null,
      };
    }

    // Admin: resolve parent order
    try {
      const ret = await context.getReturn(target.returnId);
      if (context.getSeq && context.currentSeq !== undefined && context.getSeq() !== context.currentSeq) {
        return state; // Stale async return resolution discarded!
      }
      if (ret?.orderId) {
        return {
          ...state,
          activePage: 'order-detail',
          selectedOrderId: ret.orderId,
          selectedRevisionId: null,
          navTarget: target,
          pendingTarget: null,
        };
      }
    } catch {
      if (context.getSeq && context.currentSeq !== undefined && context.getSeq() !== context.currentSeq) {
        return state;
      }
      return {
        ...state,
        activePage: 'orders',
        selectedOrderId: null,
        selectedRevisionId: null,
        navTarget: null,
        pendingTarget: null,
      };
    }
  }

  if (role === 'employee' && ADMIN_ONLY_PAGES.has(target.page)) {
    // Retain target.page so UI renders 403 Forbidden screen without mounting admin components
    return {
      ...state,
      activePage: target.page,
      selectedOrderId: null,
      selectedRevisionId: null,
      navTarget: target,
      pendingTarget: null,
    };
  }

  return {
    ...state,
    activePage: target.page,
    selectedOrderId: target.orderId || null,
    selectedRevisionId: target.revisionId || null,
    navTarget: target,
    pendingTarget: null,
  };
}

export async function syncNavigationOnAuth(
  state: NavigationState,
  context: NavigationContext
): Promise<NavigationState> {
  if (context.loading) {
    return state;
  }

  if (!context.user) {
    // Anonymous state: LoginPage shown.
    // Preserve pendingTarget for pending admin login!
    return {
      ...state,
      activePage: 'order-create',
      selectedOrderId: null,
      selectedRevisionId: null,
      navTarget: null,
    };
  }

  const role = context.user.role;

  // 1. Consume pending navigation target if one is waiting for authentication
  if (state.pendingTarget) {
    const pending = state.pendingTarget;
    const clearedState = { ...state, pendingTarget: null };
    return applyNavigationIntent(clearedState, pending, context);
  }

  // 2. Deep link already established (e.g. from prior navigation)
  if (state.selectedOrderId || state.navTarget) {
    return state;
  }

  // 3. No active deep link & no pending target: apply role-based default landing page
  return {
    ...state,
    activePage: role === 'employee' ? 'orders' : 'order-create',
  };
}
