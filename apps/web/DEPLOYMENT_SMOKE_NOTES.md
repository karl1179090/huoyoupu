# Mini HTTPS 前端部署验证入口说明（Task 14.3）

本文档说明 14.3 双容器部署（Caddy + API）在 Mini HTTPS 环境下的前端只读冒烟验证入口 `apps/web/test/deployment-browser-smoke.test.ts` 的配置约定、测试内容与执行规范。

生产源码 `apps/web/src/**` 持续保持 100% 冻结停写，本次仅新增测试入口与本说明文件。

---

## 1. 环境变量规范

入口测试仅在明确提供部署环境变量时激活执行；未配置时整项测试明确 `skip` 并提示跳过原因，配置已存在而缺少必要字段时严格断言失败（fail），绝不静默跳过。

| 环境变量 | 必选/可选 | 说明与示例 |
| --- | --- | --- |
| `HYP_DEPLOY_ORIGIN` | **必选** | 部署目标的完整 HTTPS 根地址（含独占端口），必须以 `https://` 开头。<br>示例：`https://192.168.1.100:8443` |
| `HYP_DEPLOY_CREDENTIALS_FILE` | **必选** | 私有凭证 JSON 文件的路径（建议权限 `0600`，绝不输出到日志/终端）。<br>示例：`/path/to/private-credentials.json` |
| `NODE_EXTRA_CA_CERTS` | **内部 CA 必选** | 传给 Node 进程的测试根证书路径，用于 Node fetch 建立 TLS 信任。<br>示例：`/path/to/root.crt`。<br>**严禁** `NODE_TLS_REJECT_UNAUTHORIZED=0`。 |
| `HYP_DEPLOY_TLS_SPKI` | 可选 | 本次部署叶证书的 Base64 SHA-256 SPKI digest（不带 `sha256/` 前缀），用于 Chromium 临时 profile 证书 pinning 校验。 |

> [!IMPORTANT]
> **安全要求**：
> 1. 严格禁止 `NODE_TLS_REJECT_UNAUTHORIZED=0`，测试中包含硬性断言，若检测到该设置立即报错拒绝。
> 2. 严格禁止在浏览器中设置 `ignoreHTTPSErrors: true` 或参数 `--ignore-certificate-errors`。
> 3. 凭据仅从私有文件读取，代码与日志中绝对不打印任何密码、Token 或 Cookie。

---

## 2. 凭证 JSON 结构规范（虚拟值示例）

私有凭证文件必须为合法 JSON 且包含以下全部字段：

```json
{
  "admin": {
    "loginName": "deploy_admin",
    "password": "DUMMY_ADMIN_PASSWORD_NOT_A_SECRET"
  },
  "employee": {
    "loginName": "deploy_employee",
    "password": "DUMMY_EMPLOYEE_PASSWORD_NOT_A_SECRET"
  },
  "ids": {
    "orderId": "00000000-0000-0000-0000-000000000001",
    "revisionId": "00000000-0000-0000-0000-000000000002",
    "productId": "00000000-0000-0000-0000-000000000003",
    "warehouseId": "00000000-0000-0000-0000-000000000004",
    "batchId": "00000000-0000-0000-0000-000000000005",
    "customerId": "00000000-0000-0000-0000-000000000006",
    "ledgerEntryId": "00000000-0000-0000-0000-000000000007"
  }
}
```

---

## 3. 测试断言与验证流程

测试包含 4 个核心断言段：

### 断言 1: 环境变量与凭据完整性
- 校验 `HYP_DEPLOY_ORIGIN` 必须为有效 `https://` 地址。
- 校验 `HYP_DEPLOY_CREDENTIALS_FILE` 文件存在且 JSON 合法。
- 严格校验 `admin`、`employee`、`ids` 下全部 11 个字段均非空，否则立即终止并报错。
- 严格断言 `process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'`。

### 断言 2: Node.js 严格 HTTPS 网络与静态资源校验
- `GET ${ORIGIN}/health`：返回 200 OK。
- `GET ${ORIGIN}/`：返回 200 OK，Content-Type 包含 `text/html`，包含挂载根容器。
- 从首页解析出构建生成的 hash JS 与 CSS 资源：
  - JS 资源返回 200 OK，Content-Type 包含 `javascript`，且非 fallback HTML。
  - CSS 资源返回 200 OK，Content-Type 包含 `text/css`，且非 fallback HTML。
- 缺失静态资源探测：请求不存在的 `/assets/probe-non-existent-*.js`，断言返回 **404 Not Found**（确保 Caddy 的 SPA fallback 不会错误覆盖 `/assets/*`）。

### 断言 3: Chromium TLS SPKI Pinning 正反向校验（提供 SPKI 时）
- **错误收窄要求**：负向校验中的证书错误判定严格收窄为 `net::ERR_CERT_*` 或 `ERR_CERT_*` 证书错误；严禁将普通网络断连（如 `net::ERR_CONNECTION_REFUSED`）或超时泛化当成证书 pin 拒绝。
- **负向校验 1（独立无 PIN Profile）**：使用全新独立的浏览器 profile，不带 `--ignore-certificate-errors-spki-list` 参数，访问目标 HTTPS origin，断言因内部 CA 未加入系统信任库而触发明确的 `ERR_CERT_*` 证书错误拒绝。
- **负向校验 2（独立错误 PIN Profile）**：使用全新独立的浏览器 profile，携带错误的 SPKI pin（`AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`），访问目标 HTTPS origin，断言因公钥散列不匹配触发明确的 `ERR_CERT_*` 证书错误拒绝。
- **正向校验（独立正确叶 PIN Profile）**：使用全新独立的浏览器 profile，携带正确的本次部署叶证书 Base64 SPKI pin，访问目标 HTTPS origin，断言成功建立安全 TLS 连接并返回 200 OK。
- *说明*：当前测试代码已包含上述三分支及隔离 profile 管理，未注入部署环境变量时整项跳过；若配置已注入但少字段则在 `before` 阶段硬性失败。本轮不宣称已在真实 Mini 跨机环境完成无 PIN 负向实测。

### 断言 4: 业务只读浏览器 Smoke（全过程零业务写入）
- **请求监控机制**：监听页面全部网络请求，除 `POST /api/v1/auth/login` 与 `POST /api/v1/auth/logout` 外，严禁任何业务写请求（`POST`/`PATCH`/`PUT`/`DELETE` 订单、批次、公司、模板、用户等），如有立即 fail。
- **匿名会话挑战**：首次访问出现登录界面（表单及提交按钮可见），输入管理员账号密码登录，确认落地管理员开单工作台。
- **历史订单版本深链直达（原生深链）**：直接通过 `page.goto` 访问前端 SPA 深链 `${ORIGIN}/orders/${orderId}/revisions/${revisionId}`（路径绝对不含 `/api/v1` 前缀），等待并断言底层触发真实 `GET /api/v1/orders/.../revisions/...` 200 响应；页面显示【历史版本只读快照】横幅，修改、作废与确认按钮均不可见/被禁用，保持严格只读。
- **批次查询与 fragment 来源别名跳转（生产自定义事件）**：
  - **诚实测试边界**：通过 `page.evaluate` 派发生产自定义事件 `window.dispatchEvent(new CustomEvent('huoyoupu:navigate', { detail: { href } }))`，测试 App 对来源别名路由的解析分发能力，而非用户在 UI 中物理点击来源行。
  - **真实 API 与数据断言**：等待并严格断言底层触发真实 `GET /api/v1/inventory/batches?productId=...&warehouseId=...` 返回 200 OK；断言返回数组包含 fixture 给出的确切目标 `batchId`（失踪则直接报错，不用 `if` 掩盖）。
  - **页面与目标行定位断言**：断言不仅包含“库存余量、批次与入库台账”页面标题，更进一步断言 DOM 中目标批次行 `#batch-${batchId}` 成功渲染可见，且包含短哈希 `#{batchId.substring(0, 8)}`。
- **角色切换与 403 权限隔离（零页面重载）**：
  - 管理员点击退出登录 -> 员工就地登录，断言全过程发生 **0 次页面重载**（`reloadCount === 0`）。
  - 员工进入默认销售订单管理页，确认订单列表中的打印入口（`button[title="打印单据"]`）可见。
  - 员工尝试访问财务往来账簿页（派发真实客户 ledger 来源事件 `/api/v1/customers/${customerId}/ledger#${ledgerEntryId}`）：
    - **来源映射与 403 拦截**：`resolveSourceHref` 将该真实来源解析为 `{ page: 'finance', customerId, ledgerEntryId }`。因 `finance` 属于 `ADMIN_ONLY_PAGES`，App 严格拦截并展示 `403 访问权限受限` 页面，绝不挂载 `CustomerFinancePage` 组件。
    - **请求监控精准限定**：在派发事件前动态挂载 `request` 监听器，按 pathname 严格匹配 `/api/v1/customers`（及子路径如 ledger/balance）、`/api/v1/cash-events`、`/api/v1/statements` 以及管理端点 `/api/v1/company`、`/api/v1/print-templates`、`/api/v1/users`、`/api/v1/settings`。断言在此拦截窗口内这些受限端点产生 **0 次调用**。
    - **及时卸载避免污染**：完成 403 界面与 0 违规请求断言后立即卸载该 listener，不影响合法 auth/session 与员工订单/打印读取，更不让后续管理员重新登录污染该局部计数器。
    - 断言全过程零页面重载（`pageReloadCount === 0`）。
  - 点击“返回订单列表”返回，员工退出登录 -> 管理员重新登录，确认全生命周期零页面重载（A12 验证通过）。
  - 最终断言：整个测试生命周期中 `forbiddenWrites` 数量严格为 0。
- **凭据字段使用范围诚实声明**：
  - 凭据文件中的 `customerId` 与 `ledgerEntryId` 在断言 1 中已进行严格存在性与非空校验。
  - 在断言 4.5 中，`customerId` 与 `ledgerEntryId` 实际用于构造员工 403 权限拒绝的目标来源路由（`/api/v1/customers/${customerId}/ledger#${ledgerEntryId}`），在此明确记录：该用例验证的是员工访问该受限来源时的权限拒绝行为与零 API 泄露，**不能声称已成功以管理员身份打开账簿内容**。
- **资源清理**：浏览器 Context 与 Browser 实例在 `finally` 块中始终安全关闭。

---

## 4. 执行命令

### 本地未配置验证（默认行为，干净跳过）：
```bash
node --import tsx --test --test-concurrency=1 apps/web/test/deployment-browser-smoke.test.ts
```
**输出**：
```
﹣ 部署专用入口验证 (0.24ms) # 部署专用入口未配置: HYP_DEPLOY_ORIGIN 或 HYP_DEPLOY_CREDENTIALS_FILE 未设置
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
```
退出码：`0`。

### 部署环境完整执行：
```bash
NODE_EXTRA_CA_CERTS=/path/to/root.crt \
HYP_DEPLOY_ORIGIN=https://192.168.1.100:8443 \
HYP_DEPLOY_CREDENTIALS_FILE=/path/to/private-credentials.json \
HYP_DEPLOY_TLS_SPKI=<leaf-spki-base64> \
node --import tsx --test --test-concurrency=1 apps/web/test/deployment-browser-smoke.test.ts
```

---

## 5. 当前执行状态记录

1. **源码边界**：`apps/web/src/**` 保持冻结，零修改。未改动 package.json、lockfile 或任何后端/基础设施配置。
2. **定向类型检查**：`npm run --prefix apps/web typecheck`（`tsc --noEmit`）严格通过，0 错误。
3. **未配置跳过验证**：在未注入部署环境变量时执行该测试，确认返回退出码 0，且明确输出跳过原因。
4. **不完整配置拦截验证**：注入 `HYP_DEPLOY_ORIGIN` 但不提供凭据文件时，确认测试在 `before` 阶段立即断言失败（fail），不静默跳过。注入 `NODE_TLS_REJECT_UNAUTHORIZED=0` 时，确认立即触发安全异常拒绝。
5. **部署实际运行**：本轮不启动浏览器、不进行跨机连接、不执行实际 capture；等待协调者按串行验收方案统一部署并调度执行。
