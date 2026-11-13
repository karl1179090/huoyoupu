# 后端交付索引

归档入口（2026-11-13）：`build-web-inventory-v1` 已归档；[任务快照](../openspec/changes/archive/2026-11-13-build-web-inventory-v1/tasks.md)、[当前业务规格](../openspec/specs/)、[活接口说明](contracts/api-contract.md)、[活机器契约](contracts/api-contract.openapi.json)。下文保留各次交付检查当时的状态与边界，不作为当前完成度结论。

当前变更为build-web-inventory-v1。2026-11-10后端冻结检查不包含前端；2026-11-11已按用户指令由Antigravity Gemini3.8FlashHigh开始apps/web重设计与实现，当前尚未验收。新工作区入口见 [工作区运行说明](workspace-development.md)。本文不宣称页面、生产容器或公网HTTPS已完成；任务历史快照见[归档任务清单](../openspec/changes/archive/2026-11-13-build-web-inventory-v1/tasks.md)，各次验收状态以相应独立报告为准。

## 工程与模块

| 位置 | 职责 | 运行和边界说明 |
| --- | --- | --- |
| packages/contracts | 唯一规划OpenAPI的生成类型、运行时结构/角色校验 | [契约说明](contracts.md) |
| packages/database | PG客户端、事务、checksum迁移、隔离数据库夹具 | [开发说明](backend-development.md) |
| packages/money | bigint分/单价微元、基础数量安全整数、有理换算与来源尾差 | [精度约定](backend-development.md) |
| apps/api/src/modules/auth + lib | Cookie/CSRF、账号权限、幂等lease/失败缓存、审计 | [安全与初始化](security-operations.md) |
| apps/api/src/modules/catalog | 商品/单位/条码/客户/地址/价格/仓库 | [接口说明](contracts.md)，历史价见销售验收 |
| apps/api/src/modules/inventory | 分仓批次、不可变流水、FIFO/手选、盘点损益 | [库存边界](inventory.md) |
| apps/api/src/modules/sales | 草稿/只读报价、确认、改单、配送、作废、退货及实际返库 | [销售事务](sales-transactions.md) |
| apps/api/src/modules/finance | 逐笔商业来源、客户账户、实收实退、核销/月结 | [资金说明](finance.md) |
| apps/api/src/modules/reporting | 统一查询、来源、固定结果快照和分页 | [报表口径](reporting.md) |
| apps/api/src/modules/printing | 模板/打印数据、版本化作业及当前版状态 | [打印边界](printing.md) |
| apps/api/src/modules/ai | 模型适配、实体澄清、白名单查询及精确证据解释 | [AI独立验收](verification/build-web-inventory-v1/ai-independent.md) |

迁移按001_security、002_catalog、003_inventory、004_sales、005_finance、006_reporting、007_printing、008_ai执行。业务写操作同PoolClient，锁序及错误码见各模块说明。现有API统一装配入口为apps/api/src/app.ts，HTTP入口为server.ts。

## 安装与实际启动

`npm ci --ignore-scripts`，随后 `npm run build`。本机会话已核对npm lock完整性并成功重装；本机默认缓存存在旧目录权限问题，可用开发说明中的隔离cache。无需改TLS安全配置。

配置DATABASE_URL与PUBLIC_ORIGIN，运行 `npm run db:migrate`；首次管理员使用0600密码文件和 `npm run admin:init`，过程见security-operations.md。编译后可用Node的--env-file传入私密环境文件，运行packages/database/dist/cli.js及apps/api/dist/server.js。生产准备见 [部署/备份恢复](deployment.md)。

已实际spawn编译后的runtime进行迁移、真实TCP health、匿名拒绝、CSRF挑战/登录和保护接口访问，并验证SIGTERM退出。2026-11-11已在Mini实际构建Linux/arm64后端镜像，验证隔离Compose、内部CA HTTPS和备份恢复/切库；公网HTTPS及真实生产宿主仍待验证，不把隔离测试当作已上线。

## 检查与验收

```sh
npm run check:generated -w @huoyoupu/contracts
npm run typecheck
npm test
npm run build
```

根test先build，再跑纯测试和真实PostgreSQL。test:db发现apps/api/test与docs/verification中的*.db.test.ts及packages/database/test；可在末尾传明确文件做定向验收。默认新建私有socket临时PG，测试库逐个隔离，不使用内存/SQLite替代，不操作真实客户库。server-smoke需要先build，根test已包含该前置步骤。

2026-11-10后端最终冻结检查全部通过：根typecheck、四workspace构建、契约生成校对、OpenSpec严格验证；根npm test的纯测试37/37、真实PostgreSQL测试107/107，均无失败或跳过。79个规划API操作逐项核对实际Fastify路由。完整命令与边界见 [后端最终检查](verification/build-web-inventory-v1/backend-final.md)。2026-11-11的Drizzle安全修补也通过后端构建、定向类型检查与同样37/107项回归。这些结果均不代表当前前端类型检查、构建或页面验收已通过；根build现包含web，须待其源码稳定后执行。

独立证据索引：

- [身份与账号](verification/build-web-inventory-v1/auth-result.md)、[连接清理竞态](verification/build-web-inventory-v1/database-lifecycle-result.md)
- [资料HTTP](verification/build-web-inventory-v1/catalog-result.md)、[库存](verification/build-web-inventory-v1/inventory-result.md)
- [销售/退货/历史价及优惠分值修复](verification/build-web-inventory-v1/sales-independent.md)
- [财务](verification/build-web-inventory-v1/finance-independent.md)、[报表](verification/build-web-inventory-v1/reporting-independent.md)
- [打印及订单状态](verification/build-web-inventory-v1/printing-independent.md)、[AI适配与解释](verification/build-web-inventory-v1/ai-independent.md)
- [完整HTTP业务闭环](verification/build-web-inventory-v1/business-loop-result.md)、[最终全局检查](verification/build-web-inventory-v1/backend-final.md)
- [Drizzle安全修补与后端回归](verification/build-web-inventory-v1/drizzle-patch.md)、[工作区运行说明](workspace-development.md)
- [部署已验与待验](deployment.md)、[Mini容器/HTTPS/恢复实际验收](verification/build-web-inventory-v1/deployment-container.md)，本机PG恢复测试另见packages/database/test/backup.test.ts
- [全栈部署配置准备](verification/build-web-inventory-v1/fullstack-deployment-preparation.md)：新增React静态镜像和SPA/API分流已静态校验，新增全栈镜像与HTTPS页面验收待前端源码稳定后执行。

## 明确未完成项

前端页面/交互与视觉已恢复实施，尚待类型检查、构建、页面交互与浏览器打印验收；真实客户期初资料和实际规模查询计划未取得，任务14.4没有以虚构小夹具代替。Mini上的Linux容器、内部CA HTTPS及恢复切换已验；真实Linux生产宿主、公网DNS/证书签发和发布仍待执行。AI与打印后端已独立验收；本轮未使用真实外部模型账户，不代表真实模型问题集质量、费用或生产凭证验证。真实浏览器预览、打印设备及前后端联调仍待后续执行。
