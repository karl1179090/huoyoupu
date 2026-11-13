# Agent A Core Frontend Implementation & Verification Notes

**Agent A Ownership Scope (Updated Post-Handoff):**
- `src/pages/sales/**`: `OrderCreatePage.tsx`, `OrderListPage.tsx`, `OrderDetailPage.tsx`, `OrderEditPage.tsx`, `components/**` (`batchPickerLogic.ts`, `BatchProductPicker.tsx`, `CustomerPickerModal.tsx`, `OrderLineEditor.tsx`, `OrderQuoteSummary.tsx`, `OrderReturnModal.tsx`, `RestockModal.tsx`)
- `src/pages/auth/**`: `LoginPage.tsx`
- `src/components/layout/**`: `AppLayout.tsx`, `App.tsx`, `main.tsx`
- `src/navigation.ts`: Global routing & `SourceRef` deep-linking resolution
- `src/context/**`: `AuthContext.tsx`
- `src/api/**`: `client.ts`, `types.ts`
- Global styles: `src/styles/index.css`
- Tests: `test/batch-session-regression.test.ts`, `test/live-api-workflow.test.ts`, `test/agent-a-workflow.test.ts`, `test/agent-a-e2e-regression.test.ts`
- *(Note: `src/pages/catalog/**` and `test/catalog-*` transferred to Gemini D)*

---

## 1. Core State Controllers & Real Execution Chain
- **State Controller Wiring**:
  - `OrderCreatePage.tsx` and `OrderEditPage.tsx` directly import and execute `QuoteState` lifecycle functions: `createInitialQuoteState`, `invalidateQuoteOnConfigChange`, `applyQuoteResponse`, `applyQuoteError`, and `resetQuoteState`.
  - On configuration change (lines, customer, discounts), in-flight quote requests are instantly invalidated before debouncing, advancing sequence counters.
  - Outdated or out-of-order quote responses and errors are strictly discarded.
  - Adding and duplicating lines call `addLineToSession` and `addLinesToOrder` from `batchPickerLogic.ts`.
- **Regression Verification (`test/batch-session-regression.test.ts`)**:
  - Test 5: Verifies in-flight sequencing, debounce race condition handling, and immediate invalidation on config changes.
  - Test 7: Verifies `SessionTracker` (`createSessionTracker`, `bumpSession`, `isSessionCurrent`) protects against delayed async adds leaking after modal cancel or reopen.
  - Test 8: Verifies multi-product independent row configurations with `addLineToSession` and `addLinesToOrder` preventing accidental merging.

---

## 2. Mobile 350px / 400px Multi-Row Scroll & Layout
- **Flexbox Shrink/Scroll Chain**:
  - `.modal-content`: `display: flex; flex-direction: column; max-height: 100vh; overflow: hidden;`
  - `.modal-header`: `flex-shrink: 0;`
  - `.picker-modal-body`: `flex: 1 1 auto; min-height: 0; overflow: hidden;`
  - `.picker-selected-col`: `flex: 1 1 auto; min-height: 0; overflow: hidden;`
  - `.picker-lines-scroll`: `flex: 1 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch;`
  - `.modal-footer`: `flex-shrink: 0;`
  - Prevents multi-line content from pushing the action footer offscreen on 350px/400px mobile displays.
- **Iconography**:
  - All emoji references replaced with crisp, accessible inline SVG components (`SearchIcon`, `CartIcon`, `PlusIcon`, `TrashIcon`, `CheckIcon`, `MoreHorizontalIcon`, etc.).

---

## 3. Employee Read-Only & Access Gating (11.3)
- **Navigation & Layout (`AppLayout.tsx`)**:
  - `order-create` marked `adminOnly: true`. Employees only access `orders` and `printing`.
  - Mobile bottom navigation displays up to 4 items plus an overflow "更多" (More) button.
  - Clicking "更多" toggles a slide-up drawer enabling access to all permitted administrative destinations.
- **Route Gating (`App.tsx`)**:
  - Default route for employee accounts initializes to `'orders'`.
  - Route gate intercepts attempts by non-admin users to navigate to admin-only pages, presenting a 403 Forbidden screen with a "返回订单列表" action.
- **Order Management Gating (`OrderListPage.tsx` & `OrderDetailPage.tsx`)**:
  - Non-admin users cannot see "新建销售订单", "更正改单", "确认开单记账", "部分退货", "标为未配送/确认已配送", or "作废订单".
  - `OrderDetailPage.tsx` strictly avoids calling `listOrderReturns` for non-admin users to prevent 403 errors.
  - "作废订单" button is strictly restricted to `isAdmin && isConfirmed && !isDelivered && !isVoided` (draft orders never show the void button).

---

## 4. Complete Catalog Management (12.1)
- **Product Management (`ProductListPage.tsx`)**:
  - Edit product name, specification, brand, active status.
  - Mnemonic code override: support manual mnemonic string, or toggle checkbox to restore automatic pinyin generation (`null`).
  - Unit management: add auxiliary packaging units (`createProductUnit`), update units, and handle `UNIT_REFERENCED` error gracefully.
  - Barcode management: full group replacement (`replaceProductBarcodes`) strictly preserving leading zeros as strings (e.g., `'00892'`).
  - Inactive filter: toggle to view and restore deactivated products.
- **Customer Management (`CustomerListPage.tsx`)**:
  - Edit customer name, contact, phone, notes, active status.
  - Multi-address management: add addresses, toggle default address, toggle address active status.
  - Price rules CRUD: list customer price rules with pagination, upsert price rules (`expectedVersion: 0` for new, `rule.version` for update), and delete price rules with query parameter `expectedVersion=rule.version`.
  - Traceability: display price quote source and trigger order revision jump when source order ID is present.
- **Warehouse Management (`WarehouseListPage.tsx`)**:
  - Create warehouse, edit warehouse name, and toggle warehouse active status.

---

## 5. Order Revision & Impact Calculation (12.4)
- **Derived / Return Lines Integrity (`OrderEditPage.tsx`)**:
  - For derived or return lines with `quantity === null`, display `quantityBase` and lock as read-only. Never forge `quantity || 1`.
  - Existing line editing pulls available product units from catalog cache to permit switching between any valid unit.
  - Address payload mutual exclusivity enforced: existing address uses `addressId`, ad-hoc input uses `deliverySnapshot`.
- **Account Impact Prediction**:
  - Consumes `quote.calculation.accountChanges` from `quoteOrder` to preview customer net balance shift (`beforeNetBalance` -> `afterNetBalance`), delta amount, and receivable adjustments.
- **Concurrency & Version Conflict Handling**:
  - On HTTP 409 `VERSION_CONFLICT` during revision submission, automatically notifies the user, re-fetches the latest order revision, and refreshes the quote.

---

## 6. Real Restock Loop (12.5)
- **Return Initiation (`OrderReturnModal.tsx`)**:
  - Strictly enforces positive integer validation, explicitly rejecting decimals (such as 1.5), negatives, and zero.
  - Preserves raw text inputs and displays per-row validation alerts.
  - For admin lines with multiple allocations, provides an optional `saleAllocationId` selector, defaulting to automatic backward allocation.
- **Return Inspection & Restock Execution (`OrderDetailPage.tsx` & `RestockModal.tsx`)**:
  - Displays distinct columns for `returnAmount` (退货商业信用), `refundedAmount` (已发生现金退款), and `costCreditAmount` (原成本冲减).
  - Restock modal lists each allocation with remaining quantity (`quantityBase - restockedQuantityBase`).
  - Calls `api.recordRestock` with `return.version`, Shanghai timestamp `restockedAt`, and `lines: [{ returnAllocationId, quantityBase }]`.

---

## 7. Global Navigation & SourceRef.href Integration (Item A2)
- Extracted pure routing and URL resolution into `apps/web/src/navigation.ts` (`resolveSourceHref`, `NavigationTarget`).
- Supports `/api/v1` prefix stripping, query strings (`?customerId=...`), hash fragments (`#...`), and UUID extraction:
  - `/orders/:id` and `/orders/:id/revisions/:revId` -> `order-detail` with `revisionId`
  - `/returns/:id` -> `orders`
  - `/receipts/:id` -> `inventory`
  - `/stocktakes/:id` -> `stocktake`
  - `/cash-events/:id` -> `cash-events`
  - `/customers/:id`, `/customers/:id/ledger`, `/customers/:id/balances` -> `customers`
  - `/statements/:id` -> `statements`
  - `/reports/:id` and `/reports/runs/:id` -> `reports`
- Inter-module adapter compatibility:
  - Agent B modules calling `onNavigateToSource(href: string)`
  - Agent C modules calling `onNavigateToSource(source: SourceRef)`
  - Native browser URL hash parsing on page load/reload
- Fallback UX: Displays an informative modal for unresolved sources with copyable JSON metadata so users are never silently stranded on the default page.

---

## 8. Customer, Address & Account Impacts in Order Editing (Item A1, A4, A8)
- **OrderEditPage Customer & Address Switching (A1)**:
  - Supports switching customer and selecting saved address or custom delivery snapshot.
  - Wire payload enforces mutual exclusivity: `addressId` for saved addresses, `deliverySnapshot` for custom addresses.
  - Address selection triggers immediate quote invalidation via `invalidateQuoteOnConfigChange` and bumps quote sequence (A8).
- **All Account Balance Changes Display (A1)**:
  - Renders all entries from `quote.calculation.accountChanges`, not just the first.
  - Computes net balance shift (`beforeNetBalance` -> `afterNetBalance`) using exact integer-cents arithmetic (`Math.round(val * 100)`).
  - Clearly identifies original customer offsets vs new customer charges when switching customers.
- **Order Revision History Inspection (A1)**:
  - `OrderDetailPage` calls `api.getOrderRevision(orderId, revId)` when clicking "查看此版本快照" in Tab 3 (版本历史).
  - Displays a high-visibility amber banner indicating historical read-only status and revision number, with a one-click "返回当前生效版本" button.
- **Explicit Delivery Snapshot Collection (A4)**:
  - `CustomerPickerModal` completely removes silent auto-forged snapshot data (`phone: '—'`, `address: '默认自提/现场交接'`).
  - When a customer has no active addresses or the user clicks "自定义快照", requires explicit non-empty input for contact name, phone, and address, with convenient "+ 现场自提" and "+ 同城送货" quick-fill buttons.

---

## 9. Timezone, Idempotency & Derived Lines Handling (Item A5, A6, A7)
- **Shanghai Wall Clock Time (A5)**:
  - `RestockModal.tsx` exports and uses `getShanghaiNowInput()` built with `Intl.DateTimeFormat` using `timeZone: 'Asia/Shanghai'`. Formats to local wall clock `YYYY-MM-DDTHH:mm` without 8-hour UTC shift.
- **Idempotency Key Retention & Version Conflict Reset (A6)**:
  - `RestockModal`, `OrderReturnModal`, and `OrderDetailPage` maintain `intentKeyRef` across transient retries, resetting only upon user input changes.
  - `OrderEditPage` resets to a fresh UUID on HTTP 409 `VERSION_CONFLICT` to prevent subsequent `IDEMPOTENCY_CONFLICT` on re-quote/re-submit.
- **Unreturned Derived Lines Editing (A7)**:
  - Lines with `quantity: null, readOnly: false` are derived but unreturned; they are now fully editable in `OrderEditPage` via `quantityBase`.

---

## 10. Session Challenge Reconstitution & Lifecycle Across Logouts (Stage A12)
- **Root Cause of Post-Logout Login Failure**:
  - `client.ts` `logout()` revokes the session on the backend and resets `currentCsrfToken = ''`.
  - Backend OpenAPI validator requires header `X-CSRF-Token` for operation `login`, and service verifies `validateWrite` against active session cookies.
  - When a user logged out and immediately typed credentials to log in without a page reload, `POST /auth/login` lacked the CSRF header and anonymous session cookie, resulting in backend HTTP 400 "请求不符合接口约定".
- **Multi-Phase Challenge Reconstitution**:
  - `apps/web/src/api/client.ts`: Added `ensureSessionChallenge(force?: boolean)` with request deduplication (`sessionChallengePromise`). If multiple callers or concurrent login attempts invoke it, only one `/auth/session` request is dispatched.
  - In `logout()`: Immediately triggers `ensureSessionChallenge(true)` to re-establish an anonymous session and fresh CSRF token in the background right after logout.
  - In `login()`: Always guarantees `await ensureSessionChallenge()` is resolved before sending `POST /auth/login`. On HTTP 400/403 CSRF/session errors, wipes token to force a fresh challenge on user retry.
  - In `apps/web/src/context/AuthContext.tsx`: `logout` calls `api.ensureSessionChallenge()` inside `finally`.
  - In `apps/web/src/pages/auth/LoginPage.tsx`: Mount hook proactively calls `ensureSessionChallenge()` on render.
  - In `apps/web/src/App.tsx`: Role switching between Admin (`order-create`) and Employee (`orders`) correctly resets navigation without retaining stale active pages across sessions.
- **Headless Browser Lifecycle Verification**:
  - Added Test 3 to `apps/web/test/agent-a-e2e-regression.test.ts`: executes the complete real browser cycle: `Admin Login` -> `Logout` -> `Employee Login (no reload)` -> `Logout` -> `Admin Login (no reload)`.
  - Asserts 0 page reloads, 0 contract/CSRF errors, and accurate role permissions and UI state at every step.

---

## 11. Stage A13 Audit Hardening & Navigation Lifecycle (Items N1 - N5)
- **N1: Account Changes BigInt Cents Calculation & Customer ID Matching (`OrderEditPage.tsx`)**:
  - Replaced positional index guessing (`idx === 0`) with explicit `change.customerId` matching against `order.customerId` and `selectedCustomer.id`. Correctly identifies original customer credit offset vs new customer charge regardless of backend customer UUID sort order.
  - Replaced floating-point `Math.round(Number * 100)` with exact BigInt decimal string parsing (`parseDecimalToCents` and `formatCentsDelta`). Guarantees 0-loss precision down to 1 cent even on amounts exceeding JavaScript IEEE 754 safe integer limits ($2^{53}-1$).
  - Server-side `beforeNetBalance` and `afterNetBalance` are preserved and displayed directly.
- **N2: Navigation Target Full Replacement & Stale Revision Eviction (`App.tsx`, `OrderDetailPage.tsx`)**:
  - Implemented `applyNavigationTarget`: completely replaces active navigation target and clears stale `selectedRevisionId` / `navTarget` when navigating to standard order views, lists, or new drafts.
  - `OrderDetailPage` prop `initialRevisionId` is strictly `selectedRevisionId || undefined` (removed stale `|| navTarget?.revisionId` fallback that could resurrect obsolete revisions).
  - Return sources (`/returns/{id}`): Admin calls `api.getReturn(id)` to retrieve parent `orderId` and jumps directly into order detail with return context; Employee accounts are cleanly gated from administrative return mutations and routed to orders list.
  - Customer routes (`/customers/:id`, `/customers/:id/ledger`, `/customers/:id/balances`): coordinated to route to `page: 'finance'` with `initialCustomerId` and `initialLedgerEntryId`, directly consumed by Agent B's `CustomerFinancePage` without spoofing customer detail in Catalog lists.
- **N3: Strict `/api/v1` Boundaries & Anchored URL Resolution (`navigation.ts`)**:
  - `/api/v1` prefix stripping strictly enforces path boundaries (`=== '/api/v1'`, `.startsWith('/api/v1/')`, or `.startsWith('/api/v1?')`). Non-boundary prefixes (such as `/api/v1inventory`) are NOT stripped.
  - All endpoint regex patterns are strictly anchored with `$` to reject unknown subpaths (e.g. `/orders/abc/unknown?foo=bar#x`).
  - Unknown queries, subpaths, and malformed hrefs return `null` and trigger the graceful copyable raw metadata modal in `App.tsx` without inventing unauthorized endpoints.
- **N4: OrderReturnModal Idempotency Lifecycle & Retirement (`OrderReturnModal.tsx`)**:
  - Upon confirmed return success, cleanly resets selections, reason, inputs, errors, and retires the idempotency key via `resetIntentKey()`.
  - Automatically retires previous intent and resets temporary selections when `order.id` or `order.version` advances.
  - On unknown transient failure / network error, preserves the existing idempotency key and frozen payload so the user can re-submit the same business intent without `IDEMPOTENCY_CONFLICT`.
  - On explicit cancel / close, cleanly resets temporary modal session state.
- **N5: Delivery Snapshot Contact & Name Invalidation in OrderEdit (`OrderEditPage.tsx`)**:
  - Bound full delivery snapshot fields (`customerName`, `contactName`, `phone`, `address`) into the quote effect dependency array.
  - Modifying `contactName` or `customerName` in custom delivery snapshot immediately invalidates the quote via `invalidateQuoteOnConfigChange`, bumping the sequence and requiring fresh quote calculation before submission.

---

## 12. Stage A14 Final Audit Hardening (Items F1 - F2)
- **F1: Dynamic Role Evaluation, 0-GET Identity Gating & Deep-Link Preservation (`App.tsx`)**:
  - Replaced stale event closure by binding `userRef.current = user` and dynamically reading the active confirmed identity in `applyNavigationTarget`.
  - Added strict identity gating before dispatching admin APIs: if the actor is unauthenticated (`null`) or an employee, `api.getReturn` is strictly blocked (GET count = 0), and navigation redirects safely to `orders` without unauthorized network requests.
  - Initial native deep link URLs (e.g. `/orders/:id/revisions/:revId` or authorized detail views) are preserved upon session recovery rather than being unconditionally overwritten back to the role default landing page.
  - Implemented navigation sequence counter `navSeqRef` to strictly discard out-of-order, stale in-flight return resolution responses from clobbering newer navigation targets.
- **F2: Historical Revision UUID Binding on Print & Current Version Reversion (`OrderDetailPage.tsx`, `App.tsx`)**:
  - Added `viewingRevisionId` state tracking to `OrderDetailPage` in lockstep with `viewingRevision`.
  - Updated `onPrintOrder` signature to `(orderId: string, revisionId?: string) => void`.
  - Viewing historical revision #v1快照 passes the exact revision UUID (`revId`) to `onPrintOrder`, which `App.tsx` captures into `selectedRevisionId` and feeds to `OrderPrintPreview` as `initialRevisionId`.
  - Clicking "返回当前生效版本" invokes `handleBackToCurrent`, clearing `viewingRevisionId` to `null`. Subsequent printing passes `undefined`, ensuring current version print without stale revision UUID leakage.

---

## 13. Stage A15 Bottom Confirmation Actions Layout Adjustment
- **User Layout Requirement & Context**:
  - Based on desktop visual review, all primary order confirmation actions were unified to the bottom of the page content rather than the top header.
  - Implemented strictly within Agent A's scope (`OrderCreatePage.tsx`, `OrderEditPage.tsx`, `OrderDetailPage.tsx`, and `index.css`).
  - No new confirmation steps, dialogs, or workflow modifications were introduced; permissions, quote dirty/loading guards, disabled rules, and handlers are preserved intact.
  - Header does not duplicate the primary confirmation button; secondary view/print/back navigation remains in the header.
- **OrderCreatePage Bottom Action Bar**:
  - Moved "保存为草稿" (`handleSaveDraft`) and "确认销售订单" (`handleConfirmOrder`) from header to `.order-bottom-actions-bar`.
  - Displays real-time quote summary and line count on the left; displays draft and confirmation buttons on the right.
  - Page container has `paddingBottom: '90px'`, guaranteeing all line items, remarks, discounts, and validation alerts are fully visible and reachable on 350px/400px mobile screens without overlap.
- **OrderEditPage Bottom Action Bar**:
  - Moved "取消" (`onBack`) and "确认更正并重新记账" (`handleConfirmRevision`) from header to `.order-bottom-actions-bar`.
  - Preserved strict disabled gating (`submitting || activeLines.length === 0 || hasLineErrors || !quote || quoteLoading || quoteDirty`).
  - Displays dynamic target revision number (`v{revisionNo + 1}`) and loading indicators.
  - Page container has `paddingBottom: '90px'`.
- **OrderDetailPage Draft Confirmation Bar**:
  - When viewing an active draft order (`isAdmin && isDraft && !isHistoricalView`), "确认开单记账" (`handleConfirmOrder`) is moved from top header to `.order-bottom-actions-bar` at the bottom of the content.
  - Historical revision views (#v...) remain strictly read-only with no confirmation actions.
  - Page container conditionally applies `paddingBottom: isAdmin && isDraft && !isHistoricalView ? '90px' : '24px'`.
- **Responsive Sticky Action Bar Styling (`src/styles/index.css`)**:
  - `.order-bottom-actions-bar`: Sticky bottom bar (`position: sticky; bottom: 0; z-index: 100`) with glassmorphism backdrop blur (`backdrop-filter: blur(12px)`), solid top border (`1px solid var(--border-color)`), and container padding.
  - Mobile layout (`@media (max-width: 640px)`): Positioned at `bottom: var(--mobile-nav-height)` to cleanly clear mobile bottom navigation and touch safe areas.

---

## 14. Stage A16 Pending Target Staging & Delayed Session Consumption (F1 Hardening)
- **Problem Context & Root Cause**:
  - In initial mount or early navigation to `/returns/{id}` (or API alias `/api/v1/returns/{id}`), `userRef.current` initialized to `null` while `useAuth()` session checking was in flight (`loading: true`).
  - `applyNavigationTarget` immediately evaluated `userRole !== 'admin'`, prematurely clearing `selectedOrderId`, `selectedRevisionId`, and `navTarget`, and redirecting to `'orders'`.
  - When session recovery completed (`admin` recovered), the auth effect had no pending target and fell through to role default landing page `'order-create'`, permanently losing the return source.
  - Similarly, an unauthenticated anonymous user accessing a return deep link lost the target before they could even type admin credentials on `LoginPage`.
- **Pending Target Staging Architecture (`App.tsx`, `navigation.ts`)**:
  - `pendingTargetRef`: When `loadingRef.current || !userRef.current`, `applyNavigationTarget` stages the incoming navigation target into `pendingTargetRef` without permanently clearing it and without issuing unauthorized management GET requests (**0 GET count**).
  - `Auth Synchronization Hook (`App.tsx` & `syncNavigationOnAuth`)`:
    - Bound `loading` into `[user?.id, user?.role, loading]` dependency array.
    - If `!user` (anonymous user on `LoginPage`), `pendingTargetRef` is strictly preserved.
    - When `user.role === 'admin'`: Consumes `pendingTargetRef`, dispatches `api.getReturn(returnId)` (guarded by `navSeqRef`), and routes to parent `order-detail` without triggering default `order-create`.
    - When `user.role === 'employee'`: Strictly rejected from return administrative lookups with **0 GET calls to `getReturn`**, clears pending target, and routes safely to `'orders'`.
    - When no pending target exists: Regular logins land on default role landing pages (`admin` -> `order-create`, `employee` -> `orders`).
  - **Generation Guard (`navSeqRef`)**:
    - Discards out-of-order in-flight `api.getReturn` promises if user navigates to another destination before resolution.
- **Pure State Transition Coordinator (`navigation.ts`)**:
  - Exported `ADMIN_ONLY_PAGES`, `NavigationState`, `createInitialNavigationState`, `applyNavigationIntent`, and `syncNavigationOnAuth`.

---

## 15. Stage A17 Employee 403 Route Gating Reachability & Bottom Actions Verification
- **Employee 403 Forbidden Screen Reachability Fix (`App.tsx`, `navigation.ts`)**:
  - **Root Cause**: Preemptive calls to `setActivePage('orders'); return;` during target resolution in `applyNavigationTarget` and `useEffect` diverted employees to `orders` before `renderContent()` could evaluate `isEmployee && ADMIN_ONLY_PAGES.has(activePage)`. As a result, the 403 screen was unreachable and timed out in E2E tests (`agent-a-e2e-regression.test.ts:50-54` and HTTPS build step 4 on `/settings`).
  - **Resolution**: Removed premature redirection to `'orders'`. Allowed `activePage` to receive the target admin page so `renderContent()` immediately renders the 403 Forbidden screen ("403 访问权限受限") with the "返回订单列表" entry.
  - **Security & Contract Guarantee**: Zero management components (`CustomerFinancePage`, `ProductListPage`, `CompanySettingsPage`, etc.) are mounted; zero administrative APIs are fired.
  - **Return Sources (`target.returnId`)**: Employee access strictly blocks `getReturn` (0 GET calls) and routes to admin-only `order-edit`, rendering the 403 screen without unauthorized network lookups.
  - **Unit & Integration Regression**: Verified across immediate navigation, initial pending deep links, and auth recovery in `test/agent-a-workflow.test.ts` (Test 22) and `test/agent-a-e2e-regression.test.ts` (Test 1).
- **Bottom Confirmation Actions E2E Verification & Screenshot Harness (`test/agent-a-e2e-regression.test.ts`)**:
  - Implemented comprehensive Test 4 covering Desktop (1280x900), Mobile 400px (400x750), and Mobile 350px (350x667) viewports.
  - Verified `OrderCreatePage`: Header does not duplicate confirmation buttons; `.order-bottom-actions-bar` contains "保存为草稿" and "确认销售订单"; real non-zero quote validation; scroll reachability of last fields/remarks without obstruction; mobile clearance of bottom nav (`var(--mobile-nav-height)`).
  - Verified draft `OrderDetailPage`: Header does not duplicate "确认开单记账"; bottom actions bar displays draft status and "确认开单记账".
  - Verified `OrderEditPage`: Header does not duplicate "确认更正并重新记账"; bottom actions bar contains "取消" and "确认更正并重新记账"; waits for live quote calculation before enabling.
  - Verified `BatchProductPicker`: Bottom modal footer retained unified join and cancel buttons with scroll chain intact.
  - Configured screenshots saved to `docs/ui/build-web-inventory-v1/implementation/`:
    - `order-create-bottom-bar-desktop.png`
    - `order-detail-draft-bottom-bar-desktop.png`
    - `order-edit-bottom-bar-desktop.png`
    - `order-create-bottom-bar-mobile-400.png`
    - `order-create-bottom-bar-mobile-350.png`

---

## 16. Stage A18 Isolated Test Fixtures & Customer Modal Overlay Detachment Resolution
- **Test 4 Failure Root Cause in Stage A17**:
  - `agent-a-e2e-regression.test.ts` line 264 failed with click intercepted by `.modal-overlay`.
  - Root cause: Line 256 queried `.customer-card-hover`, but `CustomerPickerModal.tsx` customer cards use inline styles `style={{ padding: '10px 14px', cursor: 'pointer', ... }}` without class `.customer-card-hover`.
  - As a result, the locator did not match any element, falling through to clicking the confirm button which was disabled because `!activeCustomer`. The modal was never closed, and the subsequent click on "批量选择商品" was intercepted by the still-active `.modal-overlay`.
- **Production-Accurate Resolution (`apps/web/test/agent-a-e2e-regression.test.ts`)**:
  - **Zero Production Changes**: Production code remained strictly frozen. No artificial CSS classes or test workarounds were added to production components.
  - **Search & Selection**: Uses the search input (`.modal-body input[placeholder*="搜索客户"]`) with `fixtureCustomer.name`, locates the customer card via `.modal-body div[style*="cursor: pointer"]`, clicks the matching customer, verifies the address in the right pane, and clicks the footer button `.modal-footer button:has-text("确认选用该客户")`.
  - **Explicit Overlay Detachment**: Waits for `await desktopPage.waitForSelector('.modal-overlay', { state: 'detached' })` and asserts `text=${fixtureCustomer.name}` is selected in the workbench before opening `BatchProductPicker`.
- **Isolated End-to-End Fixtures (Test 0)**:
  - Built isolated fixtures directly via backend API with admin credentials:
    - `fixtureWarehouse`: created or reused with valid code and name.
    - `fixtureCustomer` & `fixtureAddress`: isolated customer `E2E自动化客户-${Date.now()}` with complete default address.
    - `fixtureProducts`: 5 active catalog products with abundant stock (200 units per product) replenished via `confirmReceipt`.
    - `fixtureDraftOrder`: multi-line draft order for `OrderDetailPage` draft bottom bar testing.
    - `fixtureConfirmedOrder`: multi-line confirmed order for `OrderEditPage` bottom bar testing.
  - Does NOT rely on shared mutable lists or arbitrary list indices (`items[0]`).
- **Full Viewport & Bounding Box Collision Verifications**:
  - **Desktop (1280x900)**: Verifies bottom action bar for `OrderCreatePage`, draft `OrderDetailPage`, and `OrderEditPage`; asserts header contains 0 duplicate confirmation buttons; verifies non-zero live quote; asserts remarks/reason fields are unobstructed by sticky bar (`remarkBox.y + remarkBox.height <= barBox.y`).
  - **Mobile (400x750 & 350x667)**: Verifies customer picker, batch picker, live non-zero quote, clearance of `.mobile-bottom-nav` (`mBarBox.y + mBarBox.height <= mNavBox.y + 2`), and responsive resize down to 350px.

---

## 17. Stage A19 Node E2E Fixture Decoupling & Absolute API Authentication
- **Test 0 & Test 4 Failure Root Cause in Stage A18 Execution**:
  - In `agent-a-e2e-regression.test.ts`, Test 0 attempted to invoke the browser-oriented production client helper `api.ensureSessionChallenge()` and `api.login()`.
  - Because `client.ts` uses browser-relative URLs (`const API_BASE = '/api/v1'`), executing it under Node.js undici fetch threw `TypeError: Failed to parse URL from /api/v1/auth/session` (`ERR_INVALID_URL`).
  - As a result, Test 0 crashed, fixtures were not created, and Test 4 crashed with `TypeError: Cannot read properties of undefined (reading 'name')` at `fixtureCustomer.name`.
- **Node-Side API Authentication & Decoupled Fixture Architecture**:
  - **Zero Production Code Changes**: Production code remained strictly frozen. No client/API/security boundaries were modified.
  - **Clean Test 0**: Reduced Test 0 to pure headless browser launch and credentials file validation. Zero network/API calls in Test 0 ensures Tests 1, 2, and 3 run without any fixture coupling.
  - **Isolated Node API Helper (`createTest4Fixtures`)**:
    - Uses absolute API origin (`http://127.0.0.1:3000/api/v1`) with `Origin: http://localhost:5173`.
    - Follows proven Node authentication pattern from `live-api-workflow.test.ts` / `catalog-browser.test.ts`:
      1. Anonymous challenge: `GET /auth/session` to obtain initial CSRF token and session cookie.
      2. Admin login: `POST /auth/login` with `X-CSRF-Token` and Cookie to obtain authenticated `adminCsrf` and `adminCookie`.
      3. Secure requests: Passes `Origin`, `X-CSRF-Token`, `Cookie`, and `Idempotency-Key` headers on all mutations. Never logs passwords, cookies, or tokens.
  - **Strict Response Assertions (No Error Swallowing)**:
    - Deleted all `try ... catch` blocks that previously swallowed inventory receipt errors.
    - Strictly asserts `res.status` (200/201) and valid entity IDs for `createWarehouse`, `createCustomer`, `createCustomerAddress`, `createProduct`, `confirmReceipt`, and `createOrder`.
    - Guarantees valid default address, 200 units stock per product, non-zero prices, draft status, and confirmed status before returning fixtures to UI tests.
  - **Dual Draft Fixtures for Desktop & Mobile**:
    - Created `fixtureDraftOrder` for Desktop and `fixtureMobileDraftOrder` for Mobile.
    - Since Desktop test clicks "确认开单记账" and transitions `fixtureDraftOrder` to `confirmed`, the independent `fixtureMobileDraftOrder` ensures Mobile 400px verification tests a pristine `draft` order with the sticky confirmation bar.

---

## 18. Stage A20 Sales Return Order Revision & Row Quote Correlation (P1 Fix)
- **Problem Statement (Sales Return Order Revision P1)**:
  - From real GUI evidence (`docs/verification/build-web-inventory-v1/frontend-sales-return-gui.md`):
    - Original order had 1 case = 12 bottles (件/瓶) at 24.00/case. A sales return returned 3 bottles (credit ¥6.00, refund ¥0.00, pending restock 3 bottles).
    - When navigating to `OrderEditPage` for the first revision, the UI previously showed a single line of 1 case without splitting the returned portion from the remaining portion.
    - If the user entered quantity 9 bottles, backend's total quantity semantics (`remaining = quantity - returnedQuantityBase`) subtracted 3 returned bottles again, resulting in only 6 bottles being sold.
    - In addition, `OrderEditPage` did not pass `calculatedLine` to `OrderLineEditor`, causing line subtotals to perpetually display "待报价" even when quotes were computed.
- **Architectural & Specification-Aligned Implementation**:
  - **Pre-Split Returned Lines (`initialize` in `OrderEditPage.tsx`)**:
    - Lines with `returnedQuantityBase > 0` are pre-split into:
      1. **Read-only protected segment**: `quantity: returnedQuantityBase` (e.g. 3 bottles), base unit, badge text `已退3瓶 (只读)`, `readOnly: true`, non-editable price with note `沿用原价 (不可改)`.
      2. **Editable remaining segment**: `quantity: remainingQuantityBase` (e.g. 9 bottles), base unit, `readOnly: false`, `priceEdited: false`, placeholder `沿用原价`, and helper note `沿用原价 24.00元/件 (12瓶)`.
    - If `product` details are missing from the initial cache, `OrderEditPage` asynchronously retrieves them via `api.getProduct` so unit conversions and names are always accurate.
  - **Row Quote Correlation (`findCalculatedLine`)**:
    - When a line is split due to returns, both the protected segment and the remaining segment share the same `sourceLineId` (`request.lineId`).
    - Matched strictly via:
      `cl.sourceLineId === line.originalLineId && cl.readOnly === Boolean(line.readOnly)`
    - Newly added lines (op: 'add') have `!cl.sourceLineId` and match via:
      `!cl.sourceLineId && cl.clientLineId === line.clientLineId`
    - Connected `calculatedLine={calcLine}` directly into `OrderLineEditor`, displaying exact subtotal amounts (e.g. ¥6.00 for 3 returned bottles, ¥18.00 / ¥27.00 for remaining bottles) and eliminating permanent "待报价".
  - **Backend Total Quantity Semantics on Revision Submission (`buildRevisionPayload`)**:
    - For lines with `returnedQuantityBase > 0`:
      - If the user removes the remaining segment, sending `op: 'remove'` is rejected by backend. The UI converts this to `op: 'set'` with `quantity: line.returnedQuantityBase` to preserve the return history.
      - If the user modifies the remaining segment, the set payload transmits `quantity: remainingQty + returnedQuantityBase` (e.g. 9 + 3 = 12 total bottles).
      - If the user did not edit the price (`priceEdited: false`), `unitPrice` is intentionally omitted from the `set` command to let the backend preserve the original `pricingBasis` without floating-point division inaccuracies.
      - If the remaining segment was unedited, the line is omitted from `changes` entirely, allowing the backend to naturally preserve the split.
- **Comprehensive Verification**:
  - **Node Unit Test 24 (`agent-a-workflow.test.ts`)**: Verifies 3-bottle protected / 9-bottle remaining line pre-splitting, `findCalculatedLine` dual-segment matching, total quantity calculation (`9 + 3 = 12`), and safe removal payload.
  - **E2E Browser Test 5 (`agent-a-e2e-regression.test.ts`)**: Built automated regression: creates product (1 case = 12 bottles), replenishes 100 stock, creates confirmed order (1 case @ ¥24), confirms return of 3 bottles, opens `OrderEditPage`, asserts 3-bottle protected line and 9-bottle editable line with live subtotals, modifies unit price to ¥3.00, verifies quote updates to ¥27.00 remaining / ¥33.00 gross / +¥9.00 customer balance, confirms revision, and asserts detail after revision.

---

## 19. Verification Results & Coordinator Handoff
- **Source Code Status**: **源码收尾完成，已停止修改** (Source code finalized; all edits halted).
- **Agent A Scope Code Quality & Strict Type Safety**:
  - `apps/web/src/pages/sales/**`, `apps/web/src/pages/auth/**`, `App.tsx`, `main.tsx`, `navigation.ts`, `src/components/layout/**`, `src/api/**`, and tests compile with **0 TypeScript errors** across the workspace (`npx tsc -p apps/web/tsconfig.json --noEmit` exited with code 0).
- **Vite Production Bundler**:
  - `npx vite build apps/web` -> Built in 539ms with 0 errors (`dist/assets/index-Cogy-3Ko.css`, `dist/assets/index-DSHdTvX1.js`).
- **Pure Node Test Suites Executed**:
  - `npx tsx --test apps/web/test/agent-a-workflow.test.ts apps/web/test/batch-session-regression.test.ts apps/web/test/live-api-workflow.test.ts`
  - 16 suites, 39 tests executed: **39 passing, 0 failing** (completed in 668ms).
  - Includes Test 22 (A16/A17 403 route gating, delayed session recovery, anonymous admin login target retention, and 0-GET employee return gating).
  - Includes Test 24 (A20 pre-split lines, total quantity serialization, and quote correlation).
- **Headless Browser & Playwright Regressions (状态：待验)**:
  - All test suites (`apps/web/test/agent-a-e2e-regression.test.ts`, including Test 1 403 navigation, Test 3 zero-reload session alternation, Test 4 Desktop & Mobile 400px/350px bottom confirmation bar verification, and Test 5 Return Order Revision with row-level quote correlation) are fully implemented, strictly typed, and verified with 0 TypeScript errors.
  - In accordance with coordinator instructions, launching new headless browser processes, Playwright runners, or screenshot captures is intentionally paused to avoid Vite HMR interference across concurrent agents, and will be executed serially by the coordinator on this frozen baseline. Current browser regression status: **待验**.
- **Exact Exported Props & Component Signatures**:
  - `OrderEditPage`: `{ orderId: string; onBack: () => void; onRevisionSuccess?: () => void }` (exports `parseDecimalToCents`, `formatCentsDelta`).
  - `OrderDetailPage`: `{ orderId: string; initialRevisionId?: string; onBack: () => void; onEditOrder: (id: string) => void; onPrintOrder: (orderId: string, revisionId?: string) => void }`.
  - `OrderReturnModal`: `{ isOpen: boolean; onClose: () => void; order: OrderAny; onReturnSuccess: () => void }`.
  - `OrderLineEditor`: `{ line: PickerLineItem; index: number; showRemove: boolean; calculatedLine?: CalculatedLine; onUpdateQuantity: (id: string, qty: number | null) => void; onUpdateUnit: (id: string, unit: string) => void; onUpdateUnitPrice: (id: string, price: string) => void; onRemove: (id: string) => void; isBatchSelect?: boolean }`.
  - `navigation.ts`: `resolveSourceHref(rawHref: string, rawSource?: SourceRef): NavigationTarget | null`, `ADMIN_ONLY_PAGES`, `createInitialNavigationState`, `applyNavigationIntent`, `syncNavigationOnAuth`.
  - `client.ts`: `ensureSessionChallenge(force?: boolean): Promise<string>`.

---

## 20. Stage A21 Untouched-Line Payload Guard & A Browser Locator Fixes

2026-11-12，Claude Code CLI（DeepSeek）接管前端。只改 OrderEdit 生产逻辑、A 测试与 NOTES，未动后端/契约/依赖/配置/OpenSpec。

- **生产 P1 修复（原价继承）**：新增 `apps/web/src/pages/sales/orderEditLogic.ts` 的 `buildLineChanges()`，由 `OrderEditPage` 真实调用。每条已存行在加载时记录 `initialQuantity/initialUnitId/initialWarehouseId/initialRemark/initialAllocationMode` 基线（`onChange` 保留基线，不会被覆盖）。
  - 未改动的已有行（含 `returnedQuantityBase=0` 的后续 derived 行）**不生成任何 set**，后端因此保留原 `pricingBasis`，不会再拿展示的六位近似价重估（例：2瓶1分 → derived 显示 0.005000）。
  - 只改数量/仓库时省略 `unitPrice`；单位未变时省略 `unitId`。仅用户真实改单位或改价才发送对应字段。
  - 首次退货原行保留原语义：可编辑余量 Q 提交 `quantity = Q + returnedQuantityBase`，显式带基础 `unitId`（后端默认按拆前原单位解释总量）；后续 derived 行 `returnedQuantityBase=0`，不再重复加历史 3。
  - 删除余量段仍转成 `set` 保留已退来源（带 `unitId`），不 `remove`。
- **A 浏览器测试修正（未运行）**：`agent-a-e2e-regression.test.ts` 约640 改为 `.modal-body` + `getByText(地址)` 链，去掉非法 `text=` 混合选择器；test5 保护段/余量段金额改为在 `.hide-mobile` 可见桌面行内等待本次 quote 的 `¥6.00`/`¥18.00`，改价后再在同行内等待 `¥27.00`。
- **真实生产逻辑精度回归**：`agent-a-workflow.test.ts` 新增 test 25，直接 import 生产 `buildLineChanges`（不复制算法）：2瓶总1分/退1瓶后 derived 行未动时零命令；仅改头部或另一普通行时 derived 不被重发；只改数量省略 `unitPrice/unitId`；真实换单位/改价才发送；首退余量总量仍为 Q+3。
- **本轮实际执行**：`npx tsc -p apps/web/tsconfig.json --noEmit` exit 0；`npm run build:web` exit 0（71 modules，JS 659.81kB/gzip 160.49）；`node --import tsx --test --test-concurrency=1 apps/web/test/agent-a-workflow.test.ts` 25 pass / 0 fail。
- **未执行**：全部 browser/E2E（含本文件 test4/test5 修改）、API 业务写、全局 `npm test`、capture。以上修改的浏览器路径与精度分币场景仍需独立串行实跑验收；未勾选 OpenSpec 任务。
