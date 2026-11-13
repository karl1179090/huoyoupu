import type {
  Session,
  LoginInput,
  User,
  UserCreate,
  UserPatch,
  Product,
  ProductCreate,
  ProductPatch,
  Unit,
  UnitCreate,
  UnitPatch,
  BarcodeUpdate,
  Customer,
  CustomerInput,
  CustomerPatch,
  Address,
  AddressInput,
  AddressPatch,
  PriceQuote,
  PriceRule,
  PriceRuleInput,
  Warehouse,
  WarehouseInput,
  WarehousePatch,
  Batch,
  StockBalance,
  Receipt,
  ReceiptInput,
  Stocktake,
  StocktakeCreate,
  StocktakePatch,
  OrderAny,
  OrderAdmin,
  OrderSummaryAny,
  OrderQuote,
  OrderQuoteInput,
  OrderDraftInput,
  OrderDraftPatch,
  OrderReviseInput,
  VersionInput,
  ReasonInput,
  DeliveryInput,
  OrderRevisionPage,
  SalesReturn,
  ReturnInput,
  ReturnPage,
  Restock,
  RestockInput,
  CustomerBalance,
  LedgerEntry,
  LedgerPage,
  OpeningBalanceInput,
  BalanceApplyInput,
  CashEvent,
  CashInput,
  Statement,
  StatementInput,
  StatementPage,
  PrintTemplate,
  PrintTemplateVersion,
  TemplateCreate,
  TemplatePatch,
  TemplateVersionInput,
  TemplatePage,
  TemplateVersionPage,
  PrintData,
  PrintJob,
  PrintJobInput,
  PrintJobPage,
  PrintStatusInput,
  Company,
  CompanyPatch,
  ReportQuery,
  ReportResult,
  SourcePage,
  PriceRulePage,
  WarehousePage,
  StockBalancePage,
  AiInput,
  AiResult,
  ApiError,
} from './types.js';

let currentCsrfToken = '';
let sessionChallengePromise: Promise<string> | null = null;

export function setCsrfToken(token: string) {
  currentCsrfToken = token;
}

export function getCsrfToken(): string {
  return currentCsrfToken;
}

export async function ensureSessionChallenge(force = false): Promise<string> {
  if (!force && currentCsrfToken) {
    return currentCsrfToken;
  }
  if (force) {
    sessionChallengePromise = null;
  }
  if (!sessionChallengePromise) {
    sessionChallengePromise = (async () => {
      try {
        const session = await getSession();
        return session.csrfToken || currentCsrfToken;
      } finally {
        sessionChallengePromise = null;
      }
    })();
  }
  return sessionChallengePromise;
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'idem-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();
}

export class ClientError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  retryAfterMs?: number;

  constructor(status: number, message: string, code = 'ERROR', details?: Record<string, unknown>, retryAfterMs?: number) {
    super(message);
    this.name = 'ClientError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterMs = retryAfterMs;
  }
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    query?: Record<string, unknown>;
    body?: unknown;
    headers?: Record<string, string>;
    idempotencyKey?: string;
  } = {}
): Promise<T> {
  const { method = 'GET', query, body, headers = {}, idempotencyKey } = options;

  let url = path.startsWith('/api') ? path : `/api/v1${path.startsWith('/') ? path : '/' + path}`;

  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') {
        params.append(k, String(v));
      }
    }
    const qStr = params.toString();
    if (qStr) url += `?${qStr}`;
  }

  const reqHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };

  const isWrite = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method.toUpperCase());
  if (isWrite && currentCsrfToken) {
    reqHeaders['X-CSRF-Token'] = currentCsrfToken;
  }
  if (idempotencyKey) {
    reqHeaders['Idempotency-Key'] = idempotencyKey;
  }

  let reqBody: string | undefined = undefined;
  if (body !== undefined) {
    reqHeaders['Content-Type'] = 'application/json';
    reqBody = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: reqBody,
    credentials: 'include',
  });

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  let data: unknown;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err = data as ApiError | undefined;
    const msg = err?.message || `请求失败 (${res.status})`;
    const code = err?.code || 'HTTP_' + res.status;
    throw new ClientError(res.status, msg, code, err?.details, err?.details?.retryAfterMs as number | undefined);
  }

  return data as T;
}

// -------------------------------------------------------------
// Auth & Users
// -------------------------------------------------------------
export async function getSession(): Promise<Session> {
  const session = await request<Session>('/auth/session');
  if (session.csrfToken) {
    setCsrfToken(session.csrfToken);
  }
  return session;
}

export async function login(input: LoginInput): Promise<Session> {
  // Always guarantee an active session challenge token is present before login
  await ensureSessionChallenge();
  try {
    const session = await request<Session>('/auth/login', {
      method: 'POST',
      body: input,
    });
    if (session.csrfToken) {
      setCsrfToken(session.csrfToken);
    }
    return session;
  } catch (err) {
    // If login fails with CSRF mismatch or expired session (HTTP 400/403),
    // clear local token so subsequent retry attempts will fetch a fresh challenge.
    if (err instanceof ClientError && (err.status === 400 || err.status === 403)) {
      currentCsrfToken = '';
    }
    throw err;
  }
}

export async function logout(): Promise<void> {
  try {
    await request<void>('/auth/logout', { method: 'POST' });
  } finally {
    currentCsrfToken = '';
    // Immediately rebuild anonymous CSRF challenge in the background
    try {
      await ensureSessionChallenge(true);
    } catch {
      // Graceful fallback: LoginPage mount or subsequent login attempt will retry
    }
  }
}

export async function listUsers(query?: { limit?: number; cursor?: string }): Promise<{ items: User[]; nextCursor: string | null }> {
  return request('/users', { query });
}

export async function createUser(body: UserCreate, idempotencyKey?: string): Promise<User> {
  return request('/users', {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function updateUser(id: string, body: UserPatch, idempotencyKey?: string): Promise<User> {
  return request(`/users/${id}`, {
    method: 'PATCH',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

// -------------------------------------------------------------
// Catalog (Products, Customers, Warehouses)
// -------------------------------------------------------------
export async function listProducts(query?: { q?: string; includeInactive?: boolean; limit?: number; cursor?: string }): Promise<{ items: Product[]; nextCursor: string | null }> {
  return request('/products', { query });
}

export async function getProduct(id: string): Promise<Product> {
  return request(`/products/${id}`);
}

export async function createProduct(body: ProductCreate, idempotencyKey?: string): Promise<Product> {
  return request('/products', {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function updateProduct(id: string, body: ProductPatch, idempotencyKey?: string): Promise<Product> {
  return request(`/products/${id}`, {
    method: 'PATCH',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function createProductUnit(productId: string, body: UnitCreate, idempotencyKey?: string): Promise<Unit> {
  return request(`/products/${productId}/units`, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function updateProductUnit(productId: string, unitId: string, body: UnitPatch, idempotencyKey?: string): Promise<Unit> {
  return request(`/products/${productId}/units/${unitId}`, {
    method: 'PATCH',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function replaceProductBarcodes(productId: string, body: BarcodeUpdate, idempotencyKey?: string): Promise<Product> {
  return request(`/products/${productId}/barcodes`, {
    method: 'PUT',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function listCustomers(query?: { q?: string; includeInactive?: boolean; limit?: number; cursor?: string }): Promise<{ items: Customer[]; nextCursor: string | null }> {
  return request('/customers', { query });
}

export async function getCustomer(id: string): Promise<Customer> {
  return request(`/customers/${id}`);
}

export async function createCustomer(body: CustomerInput, idempotencyKey?: string): Promise<Customer> {
  return request('/customers', {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function updateCustomer(id: string, body: CustomerPatch, idempotencyKey?: string): Promise<Customer> {
  return request(`/customers/${id}`, {
    method: 'PATCH',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function createCustomerAddress(customerId: string, body: AddressInput, idempotencyKey?: string): Promise<Address> {
  return request(`/customers/${customerId}/addresses`, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function updateCustomerAddress(customerId: string, addressId: string, body: AddressPatch, idempotencyKey?: string): Promise<Address> {
  return request(`/customers/${customerId}/addresses/${addressId}`, {
    method: 'PATCH',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function getCustomerPriceQuote(customerId: string, query: { productId: string; unitId: string }): Promise<PriceQuote> {
  return request(`/customers/${customerId}/price-quote`, { query });
}

export async function listCustomerPriceRules(customerId: string, query?: { cursor?: string; limit?: number }): Promise<PriceRulePage> {
  return request(`/customers/${customerId}/price-rules`, { query });
}

export async function upsertCustomerPriceRule(customerId: string, productId: string, unitId: string, body: PriceRuleInput, idempotencyKey?: string): Promise<PriceRule> {
  return request(`/customers/${customerId}/price-rules/${productId}/${unitId}`, {
    method: 'PUT',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function deleteCustomerPriceRule(
  customerId: string,
  productId: string,
  unitId: string,
  query: { expectedVersion: number },
  idempotencyKey?: string
): Promise<void> {
  return request(`/customers/${customerId}/price-rules/${productId}/${unitId}`, {
    method: 'DELETE',
    query,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function listWarehouses(query?: { q?: string; cursor?: string; limit?: number }): Promise<WarehousePage> {
  return request('/warehouses', { query });
}

export async function listAllWarehouses(query?: { q?: string }): Promise<Warehouse[]> {
  let items: Warehouse[] = [];
  let cursor: string | undefined = undefined;
  do {
    const page: WarehousePage = await listWarehouses({ ...query, cursor, limit: 100 });
    items = items.concat(page.items);
    cursor = page.nextCursor || undefined;
  } while (cursor);
  return items;
}

export async function createWarehouse(body: WarehouseInput, idempotencyKey?: string): Promise<Warehouse> {
  return request('/warehouses', {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function updateWarehouse(id: string, body: WarehousePatch, idempotencyKey?: string): Promise<Warehouse> {
  return request(`/warehouses/${id}`, {
    method: 'PATCH',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

// -------------------------------------------------------------
// Inventory & Batches
// -------------------------------------------------------------
export async function getStockBalances(
  query?: { warehouseId?: string; productId?: string; cursor?: string; limit?: number }
): Promise<StockBalancePage> {
  return request('/inventory/balances', { query });
}

export async function listBatches(query: { productId?: string; warehouseId?: string; positiveOnly?: boolean; limit?: number; cursor?: string }): Promise<{ items: Batch[]; nextCursor: string | null }> {
  return request('/inventory/batches', { query });
}

export async function listReceipts(query?: { warehouseId?: string; limit?: number; cursor?: string }): Promise<{ items: Receipt[]; nextCursor: string | null }> {
  return request('/receipts', { query });
}

export async function confirmReceipt(body: ReceiptInput, idempotencyKey?: string): Promise<Receipt> {
  return request('/receipts', {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function getReceipt(id: string): Promise<Receipt> {
  return request(`/receipts/${id}`);
}

export async function listStocktakes(query?: { warehouseId?: string; limit?: number; cursor?: string }): Promise<{ items: Stocktake[]; nextCursor: string | null }> {
  return request('/stocktakes', { query });
}

export async function createStocktake(body: StocktakeCreate, idempotencyKey?: string): Promise<Stocktake> {
  return request('/stocktakes', {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function getStocktake(id: string): Promise<Stocktake> {
  return request(`/stocktakes/${id}`);
}

export async function updateStocktake(id: string, body: StocktakePatch, idempotencyKey?: string): Promise<Stocktake> {
  return request(`/stocktakes/${id}`, {
    method: 'PATCH',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function confirmStocktake(id: string, body: VersionInput, idempotencyKey?: string): Promise<Stocktake> {
  return request(`/stocktakes/${id}/confirm`, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

// -------------------------------------------------------------
// Sales & Orders
// -------------------------------------------------------------
export async function listOrders(query?: {
  q?: string;
  status?: 'draft' | 'confirmed' | 'voided';
  customerId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ items: OrderSummaryAny[]; nextCursor: string | null }> {
  return request('/orders', { query });
}

export async function getOrder(id: string): Promise<OrderAny> {
  return request(`/orders/${id}`);
}

export async function quoteOrder(body: OrderQuoteInput): Promise<OrderQuote> {
  return request('/orders/quote', { method: 'POST', body });
}

export async function createOrderDraft(body: OrderDraftInput, idempotencyKey?: string): Promise<OrderAny> {
  return request('/orders', {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function updateOrderDraft(id: string, body: OrderDraftPatch, idempotencyKey?: string): Promise<OrderAny> {
  return request(`/orders/${id}`, {
    method: 'PATCH',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function confirmOrder(id: string, body: VersionInput, idempotencyKey?: string): Promise<OrderAdmin> {
  return request(`/orders/${id}/confirm`, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function reviseOrder(id: string, body: OrderReviseInput, idempotencyKey?: string): Promise<OrderAny> {
  return request(`/orders/${id}/revisions`, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function listOrderRevisions(orderId: string, query?: { limit?: number; cursor?: string }): Promise<OrderRevisionPage> {
  return request(`/orders/${orderId}/revisions`, { query });
}

export async function getOrderRevision(orderId: string, revId: string): Promise<OrderAny> {
  return request(`/orders/${orderId}/revisions/${revId}`);
}

export async function voidOrder(id: string, body: ReasonInput, idempotencyKey?: string): Promise<OrderAny> {
  return request(`/orders/${id}/void`, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function setDeliveryStatus(id: string, body: DeliveryInput, idempotencyKey?: string): Promise<OrderAny> {
  return request(`/orders/${id}/delivery`, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function listOrderReturns(orderId: string, query?: { cursor?: string; limit?: number }): Promise<ReturnPage> {
  return request(`/orders/${orderId}/returns`, { query });
}

export async function confirmReturn(orderId: string, body: ReturnInput, idempotencyKey?: string): Promise<SalesReturn> {
  return request(`/orders/${orderId}/returns`, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function getReturn(id: string): Promise<SalesReturn> {
  return request(`/returns/${id}`);
}

export async function recordRestock(returnId: string, body: RestockInput, idempotencyKey?: string): Promise<Restock> {
  return request(`/returns/${returnId}/restocks`, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

// -------------------------------------------------------------
// Finance & Settlements
// -------------------------------------------------------------
export async function getCustomerBalance(customerId: string): Promise<CustomerBalance> {
  return request(`/customers/${customerId}/balance`);
}

export async function getCustomerLedger(customerId: string, query?: { limit?: number; cursor?: string; from?: string; to?: string }): Promise<LedgerPage> {
  return request(`/customers/${customerId}/ledger`, { query });
}

export async function recordOpeningBalance(customerId: string, body: OpeningBalanceInput, idempotencyKey?: string): Promise<CustomerBalance> {
  return request(`/customers/${customerId}/opening-balance`, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function applyCustomerBalance(customerId: string, body: BalanceApplyInput, idempotencyKey?: string): Promise<CustomerBalance> {
  return request(`/customers/${customerId}/balance-applications`, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function listCashEvents(query?: { customerId?: string; from?: string; to?: string; limit?: number; cursor?: string }): Promise<{ items: CashEvent[]; nextCursor: string | null }> {
  return request('/cash-events', { query });
}

export async function recordCashEvent(body: CashInput, idempotencyKey?: string): Promise<CashEvent> {
  return request('/cash-events', {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function getCashEvent(id: string): Promise<CashEvent> {
  return request(`/cash-events/${id}`);
}

export async function reverseCashEvent(id: string, body: ReasonInput, idempotencyKey?: string): Promise<CashEvent> {
  return request(`/cash-events/${id}/reverse`, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function createStatement(customerId: string, body: StatementInput, idempotencyKey?: string): Promise<Statement> {
  return request(`/customers/${customerId}/statements`, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function listStatements(customerId: string, query?: { limit?: number; cursor?: string }): Promise<StatementPage> {
  return request(`/customers/${customerId}/statements`, { query });
}

export async function getStatement(id: string, query?: { limit?: number; cursor?: string }): Promise<Statement> {
  return request(`/statements/${id}`, { query });
}

// -------------------------------------------------------------
// Printing & Company
// -------------------------------------------------------------
export async function getCompany(): Promise<Company> {
  return request('/company');
}

export async function updateCompany(body: CompanyPatch, idempotencyKey?: string): Promise<Company> {
  return request('/company', {
    method: 'PATCH',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function listPrintTemplates(query?: { limit?: number; cursor?: string }): Promise<TemplatePage> {
  return request('/print-templates', { query });
}

export async function createPrintTemplate(body: TemplateCreate, idempotencyKey?: string): Promise<PrintTemplate> {
  return request('/print-templates', {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function updatePrintTemplate(id: string, body: TemplatePatch, idempotencyKey?: string): Promise<PrintTemplate> {
  return request(`/print-templates/${id}`, {
    method: 'PATCH',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function createPrintTemplateVersion(id: string, body: TemplateVersionInput, idempotencyKey?: string): Promise<PrintTemplate> {
  return request(`/print-templates/${id}/versions`, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function listPrintTemplateVersions(id: string, query?: { limit?: number; cursor?: string }): Promise<TemplateVersionPage> {
  return request(`/print-templates/${id}/versions`, { query });
}

export async function getPrintTemplateVersion(templateId: string, templateVersionId: string): Promise<PrintTemplateVersion> {
  return request(`/print-templates/${templateId}/versions/${templateVersionId}`);
}

export async function getPrintData(orderId: string, query?: { revisionId?: string; templateVersionId?: string }): Promise<PrintData> {
  return request(`/orders/${orderId}/print-data`, { query });
}

export async function listPrintJobs(orderId: string, query?: { limit?: number; cursor?: string }): Promise<PrintJobPage> {
  return request(`/orders/${orderId}/print-jobs`, { query });
}

export async function createPrintJob(orderId: string, body: PrintJobInput, idempotencyKey?: string): Promise<PrintJob> {
  return request(`/orders/${orderId}/print-jobs`, {
    method: 'POST',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

export async function setPrintJobStatus(jobId: string, body: PrintStatusInput, idempotencyKey?: string): Promise<PrintJob> {
  return request(`/print-jobs/${jobId}/status`, {
    method: 'PATCH',
    body,
    idempotencyKey: idempotencyKey || generateIdempotencyKey(),
  });
}

// -------------------------------------------------------------
// Reporting & AI
// -------------------------------------------------------------
export async function queryReport(body: ReportQuery): Promise<ReportResult> {
  return request('/reports/query', { method: 'POST', body });
}

export async function getReportRun(id: string, query?: { limit?: number; cursor?: string }): Promise<ReportResult> {
  return request(`/report-runs/${id}`, { query });
}

export async function getReportSources(id: string, query?: { limit?: number; cursor?: string }): Promise<SourcePage> {
  return request(`/report-runs/${id}/sources`, { query });
}

export async function askReport(body: AiInput): Promise<AiResult> {
  return request('/ai/queries', { method: 'POST', body });
}
