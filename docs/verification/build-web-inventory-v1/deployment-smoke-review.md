# 部署 smoke 入口独立源码复核

2026-11-11。只读复核 C 的 `apps/web/test/deployment-browser-smoke.test.ts` / `apps/web/DEPLOYMENT_SMOKE_NOTES.md` 与后端 ops 夹具脚本 `scripts/prepare-deployment-smoke-fixture.py`。快照见 [SHA256](deployment-smoke-review-hashes.json)。没有运行前端测试、浏览器、Mini、构建或业务 API；Python 夹具此前仅 AST 语法检查，不能写成已联调通过。本轮不修改前端文件。

## 兼容性与已具备的验证

| 范围 | 源码事实 / 边界 |
| --- | --- |
| 环境与凭据 | C 实际使用 HYP_DEPLOY_ORIGIN / HYP_DEPLOY_CREDENTIALS_FILE / HYP_DEPLOY_TLS_SPKI，Node CA 使用 NODE_EXTRA_CA_CERTS。Python输出 admin/employee 各 loginName/password，以及 orderId/revisionId/productId/warehouseId/batchId/customerId/ledgerEntryId 七 ids，完全对应。Python严格要求自有私密输入、仓库外0700父目录、0600独占新文件；C只校字段/文件存在，不自行核权限，执行前应核私有文件权限。 |
| 未配置行为 | origin/creds都没有时是明确 skip，不是假 pass；两者只提供其一会 fail。SPKI目前可选且缺时单独skip TLS检查，不能将此算 pin 验证完成。仅设置 SPKI 而没 origin/creds也会整体skip，不能据此宣称已检查“任何不完整配置”。本次执行会明确同时提供origin/creds/CA/leaf pin。 |
| Node TLS / 静态资源 | fetch不传不安全dispatcher，拒 NODE_TLS_REJECT_UNAUTHORIZED=0；严格正常验证health、HTML、真实引用JS/CSS及缺失assets404。内部CA由启动环境加载，脚本不会改系统信任。必须先按部署准备说明做curl/openssl链/IP SAN gate。 |
| Chromium | 只传SPKI列表，没有ignoreHTTPSErrors或全局ignore flag；launch各自新临时profile。错误pin浏览器与正确pin浏览器分开，finally关闭；主smoke的context/browser亦finally关闭。正确pin需要200。负向错误识别有下方P2，当前无独立无pin负向分支。 |
| 无mock / 业务写 | 不含page.route、route.fulfill或构造业务响应，访问真实构建包及API。脚本自身只GET与真实auth表单登录/退出；请求监听记录其它POST/PATCH/PUT/DELETE并最终断言为空。它是检测器，不是写请求拦截器，若页面回归会先发生请求再fail，故只能运行在明确虚构的可丢弃项目。 |
| 历史确认版本 | Python走确认→改单，输出更正前confirmed UUID，后端GET核旧版非current、10元，当前12元；浏览器深链等精确旧revision API200及历史横幅，检查确认/作废按钮不存在。测试没有单独断言“修改”按钮，不能将notes的全部动作禁止都说成已独证。 |
| 角色切换 / 不刷新 | 真实表单输入及点击退出/登录，不伪造AuthContext。admin→employee→admin全程在监听main-frame导航后断言0次；员工打印入口可见、403页面及返回按钮存在。首次历史深链显式page.goto在监听之前，故零刷新结论仅角色切换生命周期。 |
| 来源导航证据 | batch和/settings是page.evaluate派发生产huoyoupu:navigate事件，App确有该listener；不是mock，也不是点击真实来源行。旧revision是page.goto原生深链。customerId/ledgerEntryId虽由Python真实API生成并被C检查非空，当前browser未用它们验证ledger来源。 |
| 会话清理 | Python两角色准备会话正常路径退出；浏览器最后再次登录admin后仅关闭context/browser，服务器会话不显式logout；可丢弃项目清理即销毁，无需因此加框架。Python失败可留部分虚构实体，按项目整体销毁，不向共享库清理数据。 |

## 三个最小必要修正（均为测试证据缺口，P2）

1. **错误 pin 必须确因证书被拒绝。** `deployment-browser-smoke.test.ts:175` 的 `/ERR_CERT|certificate|SSL|TLS|net::ERR_/i` 会接受 `net::ERR_CONNECTION_REFUSED`、`net::ERR_NAME_NOT_RESOLVED` 等任何网络错误，故短暂连接故障可能被当成pin负向成功。收窄到明确 `net::ERR_CERT_*` 证书错误，普通超时/断网必须失败；不要靠统一net::ERR_通过。无pin负向尚未执行/实现，不在notes写已覆盖。
2. **批次query/fragment未被真正断言。** `:277–283` 派发含productId/warehouseId/#batchId的真实事件后只等“库存余量、批次与入库台账”标题；即使导航丢失两个过滤ID或fragment也会通过。最少等真实GET /inventory/batches并核productId/warehouseId，再核目标batchId的行/来源定位反馈，而不是仅库存页面标题。生产InventoryListPage已有initialBatchId目标行逻辑，可据实际UI定位，不新建测试组件/伪数据。
3. **管理接口监听未覆盖实际设置页面接口。** `:315–319` 只监听`/api/v1/settings`和`/api/v1/users`，但CompanySettingsPage首次挂载实际请求`/api/v1/company`，模板管理用`/api/v1/print-templates`；不存在的settings路径不能证明未挂载管理页。按真实端点补最小监听，保留403页面和零刷新断言，不扩成新权限测试框架。

以上不改变夹具schema，不要求新业务功能，也不指控当前App的批次导航/角色gate已经失败；是现有断言不能证明自己声称的条件。C生产源码仍按另一个AI复核GET窄修队列执行，不在本报告重开已关闭项。

## 执行边界

当前只完成入口对接准备。真正的14.3新增全栈镜像构建、API迁移、严格CA/IP SAN、leaf pin正反向、构建包只读角色/深链验证均待协调者明确freeze后执行。不得把作者未配置skip/类型检查或本次源码审查写成Mini HTTPS浏览器通过。原后端容器实测事实仍保留，生产域名/ACME、真实安卓与针式设备验收仍待实际环境。
