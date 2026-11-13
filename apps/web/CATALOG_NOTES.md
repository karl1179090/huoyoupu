# HuoYouPu 前端D组 (Catalog Maintenance) 交接与实施记录

本文档由前端D组（独占目录：`apps/web/src/pages/catalog/**` 与 `apps/web/test/catalog-*`）维护，记录 Task 12.1 及 A3 缺口关闭的实施细节、D2 修复、验收用例扩充、对外接口 Props、API 契约注意事项、实跑命令及截图证明。

**本组状态宣言**：**用例与笔记补齐完成，生产代码保持冻结，测试与截图待后续统一串行执行，已明确停止修改。**

---

## 1. 任务完成情况概要 (Task 12.1 & 验收补强)

> [!NOTE]
> 按照协作规则，Task 12.1 的复选框留待非作者（主协调者/评审者）验收后勾选，本组不自行修改 `tasks.md` 复选框。

### 1.1 CustomerList 分页续页与请求 Scope 隔离 (A3 缺口 & D2 增强)
- **分页穷举与续页**:
  - `listCustomerPriceRules` 与 `listProducts` 不再受限于固定 `limit: 100`。
  - 在 `CustomerListPage.tsx` 中实现了 `fetchAllCustomerPriceRules` 与 `fetchAllProductsForRules` 循环游标续页，完整加载第 101 条及更多记录。
  - 彻底消除了因第 101+ 条在客户端不可见而误用 `expectedVersion: 0` 提交新增导致的乐观锁冲突错误。
- **请求 Scope 隔离与同客商品报价竞态消除**:
  - 引入 `priceRulesScopeRef`、`customerListSeqRef` 以及 `quoteScopeRef`（绑定 `customerId`、`modalSeq`、`productId`、`unitId`、`quoteGen`）。
  - 用户切换商品或单位时，**立即清空旧预览**（`setPriceQuotePreview(null)`）并进入加载态，旧来源订单查看按钮被销毁，不可点击。
  - 递增 `quoteGen` 代次计数器；慢 A（80ms）与快 B（20ms）并发时，快 B 立即成功落地代次 2 的报价，慢 A 随后返回时因其代次 1 已失效被直接丢弃（返回 `null`），彻底杜绝覆写。

### 1.2 单位多维度编辑与规则校验 (UnitPatch)
- **字段编辑**: 在 `ProductListPage.tsx` 的单位管理弹窗中支持对既有单位进行编辑（名称 `name`、默认售价 `defaultSalePrice`、默认进价 `defaultReceiptCost`）。
- **倍率不可变**: 遵循后端规则，归一倍率（`multiplierBase`）严格设为只读并附带提示，禁止前端篡改。
- **版本控制与约束处理**: 支持传 `expectedVersion` 乐观锁版本校验；对 `UNIT_REFERENCED` 等后端异常在表单顶部清晰展示提示。

### 1.3 客户配送地址完整维护与清空支持 (AddressPatch & 清空修复)
- **地址多字段编辑与明确清空**: 在 `CustomerListPage.tsx` 的地址管理弹窗中支持对既有地址进行编辑（联系人 `contactName`、联系电话 `phone`、详细地址 `address`、地址标签 `label`）。
- **明确清空支持**: 移除了原 `trim() || undefined` 逻辑，显式传回已去除两端空白的字符串（清空时为 `""`），后端据此将数据库中的电话和标签重置为空值，并在读取时正确呈现为已清空；联系人与详细地址保持必填。
- **默认与状态一致性**: 保持首选默认地址单选机制、启用/停用切换及 `expectedVersion` 版本控制。
- **隔离性**: 严格不触碰 Sales 模块的 `CustomerPickerModal.tsx`（由 A 组维护快照逻辑）。

### 1.4 仓库列表检索与 API 对齐
- **支持检索与游标**: `WarehouseListPage.tsx` 完整支持 A 组补充的 `listWarehouses({ q, cursor, limit })`，支持回车/按钮直接触发检索和游标续页。
- **绝不发送 includeInactive**: 契约中 `listWarehouses` 与 `listCustomers` 均无 `includeInactive` 参数，前端严格不传递多余参数。
- **入口集成**: 在 `CustomerListPage.tsx` 顶部提供二级 Tab（`客户档案与专属价` / `仓库管理`），方便一键切换到仓库管理。

### 1.5 价格来源层级追溯与开单跳转 (验收用例 4)
- **价格层级试算**: 在专属价规则维护弹窗中呈现明确的计价层级：`历史成交价 > 客户专属价 > 单位默认售价`。
- **来源订单追溯**: 试算命中 `history` 时展示来源订单 ID，并绑定 `handleJumpToOrder` 动作。
- **跳转契约与解耦**: 组件提供 `onNavigateToSource?(href: string)` Prop，并兜底通过 `window.dispatchEvent(new CustomEvent('huoyoupu:navigate', { detail: { href } }))` 派发全局导航，派发精确路径 `/orders/${orderId}/revisions/${revisionId}`。
- **浏览器用例 4 追加**: 已在 `catalog-browser.test.ts` 中实现完整链条测试（准备真实已成交订单、在页面选择商品、触发试算、点击“查看来源订单”按钮、捕获并校验导航事件目标、验证订单与修订版本接口可读）。

### 1.6 资料停用生命周期与引用完整性 (验收用例 5)
- **实际页面停用**: 在商品/客户资料编辑弹窗中，取消勾选“启用状态”并保存修改。
- **状态徽章变更**: 列表即时刷新并呈现 `已停用` / `停用` 徽章。
- **历史记录可读**: 停用前生成的已确认订单（`status: 'confirmed'`）依然可通过详情接口完整读取，明细中停用商品行无损保留。
- **新开单安全拦截**: 停用后的客户尝试创建新交易被后端 409 `RELATED_RECORD_CONFLICT` 安全拒绝。
- **浏览器用例 5 追加**: 已在 `catalog-browser.test.ts` 中编写真实页面停用动作及后续引用验证。

### 1.7 测试 Fixture 隔离
- **完全隔离**: 彻底移除了从前针对固定条码 `00892` 搜索并释放其他未知产品的跨 fixture 修改。
- **动态前导零条码**: 使用本组独立虚构商品 + 动态 `00`-前缀唯一条码（如 `00${Math.floor(100000 + Math.random() * 900000)}`），既完全证明了条码整组替换与前导零字符串保留，又绝对不污染或修改共享演示数据。

---

## 2. 导出 Props 与共享契约交接 (给 A 核心组)

### 2.1 CustomerListPage 导出 Props 与生产 Helper 函数
```typescript
export interface CustomerListPageProps {
  /**
   * 当用户在专属价格来源试算卡片中点击“查看来源订单”时触发
   * 格式如: /orders/0f27c8f9-b981-4d18-ac1f-51a99d6d2966#rev-1
   */
  onNavigateToSource?: (href: string) => void;
}

export interface PriceQuoteScope {
  customerId: string;
  modalSeq: number;
  productId: string;
  unitId: string;
  quoteGen: number;
}

// 生产环境分页穷举辅助函数（对外导出供测试与复用）
export async function fetchAllCustomerPriceRules(...): Promise<PriceRule[] | null>;
export async function fetchAllProductsForRules(...): Promise<Product[] | null>;
export async function resolvePriceQuoteWithScope(...): Promise<PriceQuote | null>;
```
*实现保证*：若父级（如 `App.tsx`）未传入 `onNavigateToSource`，组件会自动派发 `'huoyoupu:navigate'` 自定义事件，由全局路由监听器接管。

### 2.2 给 A 组的 API Client 缺口与契约提醒
1. **`GET /customers` 参数规范**:
   - `apps/web/src/api/client.ts` 中的 `listCustomers` 类型声明包含 `includeInactive?: boolean`。
   - 但是后端 OpenAPI 规范（`packages/contracts/src/generated/types.ts` 第 2863 行）及 ajv 校验器中，`listCustomers` 的 query 参数**只有 `q`、`limit`、`cursor`**，没有 `includeInactive`。
   - 若向后端发送 `?includeInactive=false`，后端将抛出 400 `INVALID_REQUEST: 请求不符合接口约定`。
   - Catalog 维护页面已在内部排除该参数，建议 A 组后续在 `client.ts` 中移除此字段或在发起请求前过滤掉未定义的 query 参数。
2. **`PUT /products/{id}/barcodes`**:
   - 后端条码保存为全量覆盖模式，且在全库具有全局唯一性约束。更新前需连同当前商品的 `expectedVersion` 一起提交。

---

## 3. 测试与验证状态

### 3.1 真实业务逻辑与生产链回归测试 (9/9 全部通过)
```bash
node --import tsx --test apps/web/test/catalog-logic-workflow.test.ts
```
**运行结果**:
- ✔ 0. Setup: Authenticate Admin using local credentials (239.7ms)
- ✔ 1. Product Creation & 500mljy Mnemonic Search Rule (13.3ms)
- ✔ 2. Mnemonic Code Override: Manual setting and Clearing with null (6.7ms)
- ✔ 3. Barcode string leading zeroes preservation on independent fixture (4.5ms)
- ✔ 4. Unit Creation & Editing (UnitPatch) with Version Check (13.9ms)
- ✔ 5. Customer Multi-Address Management & AddressPatch Editing (包含清空 phone/label 读回验证) (11.1ms)
- ✔ 6. Customer Price Rules (Upsert, Delete, Hierarchy & Source Tracing) (9.6ms)
- ✔ 7. Production CustomerListPage Helpers: >100 Continuation & Slow A / Fast B Quote Scope Regression (80.8ms)
- ✔ 8. Warehouse List Pagination & Filtering (No includeInactive parameter) (3.4ms)
- **状态：9 passed, 0 failed, 耗时 ~386ms**

### 3.2 独立无头浏览器 E2E 测试套件 (`apps/web/test/catalog-browser.test.ts`)
套件包含全部 7 个测试阶段：
- **测试 0**: Browser Setup & Isolated Headless Launch (已验证通过)
- **测试 1**: Product Page: 500mljy Search, Mnemonic Override/Clear, Unit Editing, Barcode 00892 (已验证通过)
- **测试 2**: Customer Page: Address Editing (含清空 phone), Price Rules Hierarchy & Quote Inspection (已验证通过)
- **测试 3**: Warehouse Page: Search q, Pagination Support, Edit & Toggle Active (已验证通过)
- **测试 4 (新补)**: Price Quote History Source: Click Real Source Order Button & Resolution to orderId+revisionId (已编写，类型检查 0 错误，待串行执行)
- **测试 5 (新补)**: Lifecycle Inactivity: Deactivate Product & Customer in Real UI, Old Reference Readability & New Order Saleability (已编写，类型检查 0 错误，待串行执行)
- **测试 6**: Teardown

> [!IMPORTANT]
> **调度与执行状态**：
> 因 A 组正在进行首次退货后 OrderEdit P1 修复，遵照协调者统一调度指示：
> 本组**不提前启动浏览器或进行并发 API 写入**。
> 测试 4 与测试 5 代码已编写完毕并通过严格类型校验，待 Sol medium 子代理在后续无冲突的统一批次中串行执行并归档最终截图。
> **诚实记录：测试 4 与 5 尚未执行，不提前标注为通过。**

### 3.3 TypeScript 类型检查
```bash
npx tsc --noEmit --project apps/web/tsconfig.json
```
- 全局及 Catalog 模块与测试文件：**0 错误 (严格类型合规)**。

---

## 4. 关键状态截图证明与待捕获清单

存放目录：`apps/web/src/pages/catalog/screenshots/`

| 截图文件名 | 视口 | 证明内容 | 状态 |
|---|---|---|---|
| `product-list-desktop.png` | 1280x800 桌面端 | 商品列表、500mljy 拼音助记码、条码与单位入口 | 已生成 |
| `product-unit-edit-desktop.png` | 1280x800 桌面端 | 包装单位 UnitPatch 编辑表单、只读倍率与售价维护 | 已生成 |
| `product-list-mobile.png` | 390x844 移动端 | 商品档案移动端自适应布局，无横向溢出 | 已生成 |
| `customer-list-desktop.png` | 1280x800 桌面端 | 客户列表、多地址清单、专属价入口 | 已生成 |
| `customer-address-edit-desktop.png` | 1280x800 桌面端 | 客户多地址 AddressPatch 编辑表单与默认地址设置 | 已生成 |
| `customer-price-rules-desktop.png` | 1280x800 桌面端 | 客户专属价列表、规则编辑、价格来源层级试算卡片 | 已生成 |
| `customer-price-rules-mobile.png` | 390x844 移动端 | 客户专属价格规则移动端全屏弹窗与触控保存 | 已生成 |
| `warehouse-list-desktop.png` | 1280x800 桌面端 | 仓库管理列表、q 编码/名称检索过滤、状态启停切换 | 已生成 |
| `warehouse-list-mobile.png` | 390x844 移动端 | 仓库管理移动端适配与无横溢展示 | 已生成 |
| `customer-price-quote-history-source.png` | 1280x800 桌面端 | 历史成交价来源试算卡片、来源订单 ID 显式呈现与跳转按钮 | 用例已就绪，待串行跑出 |
| `product-deactivated.png` | 1280x800 桌面端 | 实际页面取消启用商品后的列表状态（已停用徽章） | 用例已就绪，待串行跑出 |
| `customer-deactivated.png` | 1280x800 桌面端 | 实际页面取消启用客户后的列表状态（停用徽章） | 用例已就绪，待串行跑出 |

---

## 5. 验收与交接说明
- **停写状态**：本组所有补增用例与笔记已全部就绪，没有启动任何后台常驻浏览器或写入进程，生产源码保持冻结，**已停止修改**。
- **12.1 验收**：本组按规保持 `tasks.md` 复选框未勾选，待后续统一串行验证完成由非作者核验打勾。
