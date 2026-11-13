import type { components } from '@huoyoupu/contracts';

export type Schemas = components['schemas'];

// Auth & Users
export type User = Schemas['User'];
export type UserCreate = Schemas['UserCreate'];
export type UserPatch = Schemas['UserPatch'];
export type Session = Schemas['Session'];
export type LoginInput = Schemas['LoginInput'];
export type Role = User['role'];

// Catalog
export type Product = Schemas['Product'];
export type ProductCreate = Schemas['ProductCreate'];
export type ProductPatch = Schemas['ProductPatch'];
export type Unit = Schemas['Unit'];
export type UnitCreate = Schemas['UnitCreate'];
export type UnitPatch = Schemas['UnitPatch'];
export type Barcode = Schemas['Barcode'];
export type BarcodeUpdate = Schemas['BarcodeUpdate'];
export type Customer = Schemas['Customer'];
export type CustomerInput = Schemas['CustomerInput'];
export type CustomerPatch = Schemas['CustomerPatch'];
export type Address = Schemas['Address'];
export type AddressInput = Schemas['AddressInput'];
export type AddressPatch = Schemas['AddressPatch'];
export type AddressSnapshot = Schemas['AddressSnapshot'];
export type PriceQuote = Schemas['PriceQuote'];
export type PriceRule = Schemas['PriceRule'];
export type PriceRuleInput = Schemas['PriceRuleInput'];
export type Warehouse = Schemas['Warehouse'];
export type WarehouseInput = Schemas['WarehouseInput'];
export type WarehousePatch = Schemas['WarehousePatch'];

// Inventory & Batches
export type Batch = Schemas['Batch'];
export type StockBalance = Schemas['StockBalance'];
export type StockMovement = Schemas['StockMovement'];
export type Receipt = Schemas['Receipt'];
export type ReceiptInput = Schemas['ReceiptInput'];
export type ReceiptLineInput = Schemas['ReceiptLineInput'];
export type Stocktake = Schemas['Stocktake'];
export type StocktakeLine = Schemas['StocktakeLine'];
export type StocktakeCreate = Schemas['StocktakeCreate'];
export type StocktakePatch = Schemas['StocktakePatch'];

// Orders & Sales
export type OrderAdmin = Schemas['OrderAdmin'];
export type OrderPublic = Schemas['OrderPublic'];
export type OrderAny = OrderAdmin | OrderPublic;
export type OrderSummary = Schemas['OrderSummary'];
export type OrderSummaryAdmin = Schemas['OrderSummaryAdmin'];
export type OrderSummaryPublic = Schemas['OrderSummaryPublic'];
export type OrderSummaryAny = OrderSummaryAdmin | OrderSummaryPublic;
export type OrderPageAdmin = Schemas['OrderPageAdmin'];
export type OrderPagePublic = Schemas['OrderPagePublic'];

export type OrderLineAdmin = Schemas['OrderLineAdmin'];
export type OrderLinePublic = Schemas['OrderLinePublic'];
export type OrderLineAny = OrderLineAdmin | OrderLinePublic;
export type OrderQuote = Schemas['OrderQuote'];
export type OrderCalculation = Schemas['OrderCalculation'];
export type CalculatedLine = Schemas['CalculatedLine'];
export type NewOrderLine = Schemas['NewOrderLine'];
export type OrderDraftInput = Schemas['OrderDraftInput'];
export type OrderDraftPatch = Schemas['OrderDraftPatch'];
export type OrderReviseInput = Schemas['OrderReviseInput'];
export type OrderQuoteInput = Schemas['OrderQuoteInput'];
export type VersionInput = Schemas['VersionInput'];
export type ReasonInput = Schemas['ReasonInput'];
export type DeliveryInput = Schemas['DeliveryInput'];
export type LineAddCommand = Schemas['LineAddCommand'];
export type LineSetCommand = Schemas['LineSetCommand'];
export type LineRemoveCommand = Schemas['LineRemoveCommand'];
export type OrderRevisionSummary = Schemas['OrderRevisionSummary'];
export type OrderRevisionPage = Schemas['OrderRevisionPage'];
export type SalesReturn = Schemas['SalesReturn'];
export type ReturnInput = Schemas['ReturnInput'];
export type ReturnPage = Schemas['ReturnPage'];
export type ReturnAllocationRead = Schemas['ReturnAllocationRead'];
export type ReturnLineRead = Schemas['ReturnLineRead'];
export type Restock = Schemas['Restock'];
export type RestockInput = Schemas['RestockInput'];

// Finance & Settlements
export type CustomerBalance = Schemas['CustomerBalance'];
export type LedgerEntry = Schemas['LedgerEntry'];
export type LedgerPage = Schemas['LedgerPage'];
export type CashEvent = Schemas['CashEvent'];
export type CashEventPage = Schemas['CashEventPage'];
export type CashInput = Schemas['CashInput'];
export type ReceiptCashInput = Schemas['ReceiptCashInput'];
export type RefundCashInput = Schemas['RefundCashInput'];
export type PaymentAllocation = Schemas['PaymentAllocation'];
export type AllocationPage = Schemas['AllocationPage'];
export type OpeningBalanceInput = Schemas['OpeningBalanceInput'];
export type BalanceApplyInput = Schemas['BalanceApplyInput'];
export type ApplyCustomerBalanceInput = BalanceApplyInput;
export type Statement = Schemas['Statement'];
export type StatementInput = Schemas['StatementInput'];
export type StatementPage = Schemas['StatementPage'];

// Printing & Company
export type PrintTemplate = Schemas['PrintTemplate'];
export type PrintTemplateVersion = Schemas['PrintTemplateVersion'];
export type TemplateCreate = Schemas['TemplateCreate'];
export type TemplatePatch = Schemas['TemplatePatch'];
export type TemplateVersionInput = Schemas['TemplateVersionInput'];
export type TemplatePage = Schemas['TemplatePage'];
export type TemplateVersionPage = Schemas['TemplateVersionPage'];
export type PrintConfig = Schemas['PrintConfig'];
export type PrintData = Schemas['PrintData'];
export type PrintJob = Schemas['PrintJob'];
export type PrintJobInput = Schemas['PrintJobInput'];
export type PrintJobPage = Schemas['PrintJobPage'];
export type PrintStatusInput = Schemas['PrintStatusInput'];
export type Company = Schemas['Company'];
export type CompanyPatch = Schemas['CompanyPatch'];

// Catalog Pages
export type UserPage = Schemas['UserPage'];
export type ProductPage = Schemas['ProductPage'];
export type CustomerPage = Schemas['CustomerPage'];
export type WarehousePage = Schemas['WarehousePage'];
export type PriceRulePage = Schemas['PriceRulePage'];
export type BatchPage = Schemas['BatchPage'];
export type StockBalancePage = Schemas['StockBalancePage'];
export type StockMovementPage = Schemas['StockMovementPage'];
export type StocktakePage = Schemas['StocktakePage'];

// Reporting & AI
export type ReportQuery = Schemas['ReportQuery'];
export type ReportResult = Schemas['ReportResult'];
export type SourcePage = Schemas['SourcePage'];
export type SourceRef = SourcePage['items'][number];
export type AiInput = Schemas['AiInput'];
export type AiAnswer = Schemas['AiAnswer'];
export type AiClarification = Schemas['AiClarification'];
export type AiResult = Schemas['AiResult'];

// Common
export type ApiError = Schemas['ApiError'];
