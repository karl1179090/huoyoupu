# 全栈部署配置独立复核

2026-11-11；非作者静态复核。实际准备报告为 [fullstack-deployment-preparation.md](fullstack-deployment-preparation.md)，Compose 文件是 `infra/compose.yaml`，不是 compose.yml。

**结论：本次具体源码核查未发现新增部署配置阻挡缺陷；新增 runtime/web 双镜像完整构建与运行尚未执行，不能据此宣布全栈部署通过。** 本轮仅阅读配置/依赖/现有脚本并写本报告，没有调用 Docker、启动服务、读 secret 内容或运行业务测试，开发 API 保持运行。先查 CodeGraph，部署文件未索引，随后直接核实下列文件。

14.3 因新增必需 HYP_WEB_IMAGE 的 Web 路径尚待双镜像构建及 HTTPS 联调而重开；旧 API 镜像、迁移和 47 表备份恢复验收的历史事实仍然有效，完整新路径通过非作者验收后再勾回。

| 核查项 | 实际源码事实 | 结论 |
| --- | --- | --- |
| 默认 API 镜像目标 | Dockerfile 最后阶段仍为 `runtime`，CMD `node infra/runtime.mjs serve`；backend build 调独立 build:backend，不依赖 web 编译成功 | 保持原 API 默认构建行为；web 须显式 `--target web` |
| web 依赖与 contracts | dependencies 复制根 manifest/lock/tsconfig 及五个 workspace manifest 后 npm ci；web-build 复制完整 contracts 和 apps/web，先编 contracts，再 build:web | types export 指向 contracts/dist/index.d.ts，先构建顺序正确；web 源码仅 type-import contracts，不依赖未构建的 money/database/API；生成契约 JSON 已在源码中，无需读取被 dockerignore 排除的 OpenSpec |
| 构建工具 | 根 devDependencies 含 TypeScript、Node/PG 类型和 Playwright，web workspace 含 Vite/React 插件；web-build 在未 prune 的 dependencies 上运行 | 当前 web tsconfig 同时包含 src/test，相关编译依赖有安装路径；完整 Linux web 构建仍待执行，不以宿主机 types/build 通过替代 |
| web 最终镜像内容 | web 阶段从 Caddy 镜像开始，只 COPY web/dist 至 /srv 与 Caddyfile | 最终 web 不复制 Node依赖、测试源码或后端秘密；API runtime 另自 backend build 复制 |
| Compose 镜像选择 | proxy.image 必填 HYP_WEB_IMAGE，示例提供 huoyoupu-web:local；API 镜像独立 HYP_API_IMAGE；proxy 仍从宿主挂载当前 Caddyfile | 不会仅运行没有 /srv 的裸 Caddy；构建版本与部署配置需一同交付，准备报告未声称已构建 |
| API / health | Caddy @backend 精确匹配 /api、/api/*、/health、/health/*，handle 内 reverse_proxy api:3000，无 strip_prefix；Compose API 健康检查请求 /health，proxy 依赖 API healthy | API 路径保留，未知 API 不会进入 SPA；服务仅 proxy 发布端口 |
| assets / SPA | 独占 assets handler 先 file_server；兜底 route 中 try_files 改写 /index.html，再 file_server | 缺 hash assets 返回404；普通页面找不到文件时返回应用壳。后者不证明 React 已解析业务深链，准备报告已明确保留此边界 |
| 缓存 | SPA route 将重写后的 /index.html 设置 `Cache-Control: public, max-age=0, must-revalidate` | 静态配置避免入口长期陈旧；assets 当前没有显式 immutable 长缓存，不能写成已配置一年缓存。实际 HEAD/GET、条件请求和缺资源响应待双镜像测试 |
| 秘密排除与注入 | .dockerignore 排除 .env*、infra/secrets、backups、docs 等；Dockerfile 只显式复制 runtime.mjs/Caddyfile，未 COPY infra/secrets；web 源码未引用后端密钥 | Compose DB密码只经 secret 给对应服务；AI变量仅 API环境，proxy仅HYP_DOMAIN。临时UI凭据在仓库外，无内容进入本次检查/报告；未打开任何实际私密文件 |
| 迁移与数据库文件 | backend build 复制 packages 全目录，SQL migrations 保留；编译 migrate.js 用 ../migrations/ 找 SQL；runtime migrate 动态导入 database/dist/cli.js | 产物路径与8个现有SQL迁移匹配；API 与 initialize-admin 仍等待 migrate completed_successfully，迁移错误不放行 API |
| 备份恢复 | infra/database.sh 仍使用当前 compose.yaml/.env；备份从 db 内 pg_dump 读取 HYP_BACKUP_DB，与 API DB_NAME 同取 HYP_DB_NAME；restore 仅新建 hyp_restore_*，不覆盖旧库 | 新 web 镜像不改变数据库容器/secret/角色/卷/备份路径；脚本因 Compose新增必填 HYP_WEB_IMAGE 需使用已更新示例/实际.env，部署说明已要求双镜像变量 |
| 普通客户端备份 | scripts/database-backup.mjs 仍由本机 PG 工具+私密DATABASE_URL_FILE执行，归档排他发布、恢复只空库且single-transaction | 不依赖 web 镜像，不受本次阶段拆分影响；原先备份恢复真实验证记录仍只代表原验证环境 |

后续冻结后验证范围按作者准备报告执行即可：两个新目标实际构建、Compose空库迁移、HTTPS入口、真实hash JS/CSS、缺assets404、API JSON404、health、登录及CSRF；业务深链除服务器回退外还须页面自己识别。本次不重复作者已记录的 Compose config/Caddy adapt 运行结论，不将其算成本代理实跑。


## C部署browser smoke三项断言只读复核（2026-11-11）

只读apps/web/test/deployment-browser-smoke.test.ts，不运行浏览器/网络/镜像，不与dev串行验收争用；此节不是Mini全栈验收结果。

- 证书负向：无SPKI和bogus SPKI分别建立独立browser/context，goto失败仅在Error消息匹配ERR_CERT_时认定证书拒绝；连接拒绝/timeout等普通失败不再误算证书保护。有效pin另有实际打开流程；当前源码三者不混用，不开启ignoreHTTPSErrors或全局TLS绕过。
- batch来源导航：先挂真实waitForResponse，再派发完整/api/v1/inventory/batches?productId=...&warehouseId=...#batchId；匹配路径/两过滤/200，解析响应items断言目标batchId，接着断言#batch-ID行可见与短ID展示，并监听无API主文档导航。该路径对应现有GET接口，不再只看页面标题当定位成功；最终是否通过仍须实际运行。
- 员工管理请求监听：只在员工试图进入/settings的窗口挂request监听，覆盖真实/api/v1/company、/print-templates、/users（也保留/settings别名）；必须403且计数为0，之后卸载监听，不阻止员工合法打印时读取允许模板。已修只监听不存在/settings后台API的盲点。

这三处指定源码问题已关闭。没有凭作者claim宣布证书/接口/页面实跑成功，后续交foundation/acceptance在隔离Mini环境按同一脚本执行。

固定测试入口：`apps/web/test/deployment-browser-smoke.test.ts`，mtime UTC `2026-11-11T04:20:14.556908+00:00`，SHA-256 `bb07501ff496674c7018b27da9c1920ef26f6a48ce6c91e64cbbeed99154e3fd`。
