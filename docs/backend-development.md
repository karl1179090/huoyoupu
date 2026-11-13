# 后端开发与验证

使用 Node.js 22 及以上、npm workspaces；当前已核查运行环境为 Node.js 26.13.0 / npm 11.20.0。

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm run dev:api
```

`test:unit` 运行 API 入口、契约、金额测试；`test:db` 运行真实 PostgreSQL 测试。测试脚本优先使用 `PG_BIN`，其次查 Homebrew PostgreSQL 18、Linux `/usr/lib/postgresql/*/bin`、`pg_config`。Mac 可用 `brew install postgresql@18`，Linux 安装 PostgreSQL 服务端工具。脚本 `initdb` 创建临时 cluster，仅打开私有 Unix socket，不监听 TCP；测试结束停止并删除该临时实例。不能以 root 执行 initdb。

也可显式指定 `TEST_DATABASE_URL`，该连接角色需有 CREATEDB 权限；每个夹具只创建并删除自己带随机 UUID 的新数据库，从不清空传入连接的数据库。不要使用生产账号运行测试。夹具 `createTestDatabase()` 返回 `pool/name/url/cleanup()`；默认应用项目 SQL 迁移，可用 `migrate:false` 测试空库升级，或 `migrationsDirectory` 使用独立测试 SQL。

```sh
DATABASE_URL='postgresql://user@localhost/huoyoupu' npm run db:migrate
```

迁移位于 `packages/database/migrations`，文件名为数字编号加名称，例如 `001_security.sql`。每次升级在一个 PostgreSQL 事务执行所有待应用文件，以 advisory lock 排他；保存 SHA-256，拒绝已应用文件变更、缺失或插入旧序号。失败全部回滚。迁移是向前追加，禁止在文件内自行控制事务。`createDatabase` 同时提供 node-postgres Pool 和 Drizzle 客户端，事务必须把同一个 PoolClient 传给所有操作。

各包 ESM 输出至 `dist`，源码测试通过 `--conditions=development` 导入 workspace；发布/启动编译结果使用默认导出。根 build 固定 contracts → money → database → api 顺序。业务模块导出注册函数并由 API 单一入口装配。

## 精度与尾差

- 金额为 `bigint` 分，输入固定两位非负十进制字符串，上限 `999999999999999999.99`（numeric(20,2)）；往来/毛利显示可负。
- 单价为 `bigint` 百万分之一元，最多六位小数，上限 `99999999999999.999999`（numeric(20,6)）。不把输入成本先除成两位基础单价。
- 数量与倍率均为正安全整数，基础数量乘法先转 bigint 后检查 `9007199254740991`；计数器可以为零。
- `amountForBaseQuantity` 直接使用原单位价、倍率及基础数量的整数有理数，以 half-up 结算到分。对一个来源分批扣减时使用 `allocateFromSource` 的累计比例金额之差，末批自动承接全部余分。来源计数器须在业务同事务持久化，不能每次重新初始化。
- `returnFromSource` 使用原已分摊来源的数量/净额或成本额，同样累计回退；销售净额和成本各保留自己的来源。退回不可依据商品当前价重新估算。禁止累计超出来源数量、金额或使用不一致计数器。
- 整单减免使用最大余数法，余数相同按原明细稳定顺序优先；零金额行不分优惠，合计严格等于总减免。

已加入 10 元/24 瓶逐瓶售完、逐瓶全退，以及随机拆分来源/随机多行减免性质测试。10/24 的基础成本不预先舍入，24 次成本合计恰好 1000 分；独立交易各自成交价仍按其合法单价计算，不能把来源成本分摊算法误作销售定价。

## 依赖核查依据

实施时查询 npm 官方 registry `version/engines` 并精确锁定（含保留的 Playwright）。API 工厂及注入测试参考 [Fastify 官方入门](https://fastify.dev/docs/latest/Guides/Getting-Started/)；事务同连接规则参考 [node-postgres 官方事务说明](https://node-postgres.com/features/transactions)；Drizzle 使用官方 [PostgreSQL/node-postgres 适配](https://orm.drizzle.team/docs/get-started-postgresql)；临时实例使用 [PostgreSQL initdb](https://www.postgresql.org/docs/current/app-initdb.html)。采用稳定版本标签，不安装 Drizzle 文档示例中的 RC。

2026-11-10 安装核查：131 个远程 lock 条目的 integrity 已逐一与 npm 官方元数据比较（126 个官方缓存、5 个官方精确端点）；锁文件 resolved 全部使用官方 tarball URL。网络异常时仅以可信镜像传输同一包，npm 验证其字节完整性。最终 TypeScript 5.9.3 满足 openapi-typescript 7.13.0 的 `^5.x` peer；未强行使用不兼容的最新 TypeScript。

本机用户 npm 缓存有既存 root 所有目录，使用 `--cache=/tmp/huoyoupu-npm-cache` 绕开，未改动原缓存权限。依赖不需要本地生命周期编译；使用 `--ignore-scripts` 可避免可选 fsevents 在当前 Node 26 下为 node-gyp 下载头文件。tsx/esbuild 使用已安装的平台预编译包，后续构建和测试实际验证其可用。Mac/Linux 可按上述命令安装，不依赖该临时缓存路径。

## 隔离 API 供本机 UI 联调

仓库根运行下列独立命令（使用已经安装的 Node、npm 依赖和 PostgreSQL 18，无须 Docker）：

```sh
node --conditions=development --import tsx scripts/dev-api.ts
```

该脚本固定监听 `http://127.0.0.1:3000`，Origin 固定为 `http://localhost:5173`。启动前检查3000；占用时报告并退出，绝不终止已有进程。不使用 `DATABASE_URL` 或 `TEST_DATABASE_URL`，始终在 `/tmp/huoyoupu-dev-*` 创建自己拥有的私有PG18 cluster（仅Unix socket、不监听数据库TCP），再复用 `createTestDatabase({adminUrl:本次私有socket})` 创建随机数据库并迁移。不会清空已有库。`PG_BIN`可显式指定已安装PG18的bin目录，缺少18时报错，不自动安装或改变系统服务。

种子使用既有API及初始化管理员服务：两商品（酱油瓶/件12、汽水罐/箱24）、两仓、四批入库、一个虚构客户及两个配送地址、一张跨两仓已确认订单、一张草稿、默认A4配送模板和虚构公司资料。提供admin与employee账户；员工可读取订单和打印，访问商品管理仍403。模型默认未配置，AI接口如实返回服务不可用；不伪造统计响应。

启动输出只包含ready状态、URL、PID、随机库名称、验证数量和 `credentialsFile` 路径。凭证保存在该仓库外临时目录的 `credentials.json`：目录0700、文件0600，含本次随机密码、角色账号及种子ID；不得复制进仓库、截图、日志或测试报告。工具/浏览器联调仅本地读取该文件，不在聊天中展开密码。新启动会生成新的库和凭证；正常退出会删除临时文件，无须新增仓库忽略路径。

前端开发服务器使用 `localhost:5173`，浏览器通过相对 `/api/v1/...` 请求交给开发代理转发至 `127.0.0.1:3000`；后端未开放跨源直连。CSRF Origin仍必须精确匹配。Cookie保留原 `__Host-`、Secure、HttpOnly、SameSite保护，未添加HTTP测试后门，也没有改OS信任或TLS。真实浏览器是否正常保存/发送该Cookie由前端联调实际确认；若浏览器要求额外可信HTTPS环境，应报告具体问题，不自行放宽Cookie或安装信任证书。

脚本保持前台运行。按Ctrl-C或向启动输出的本次PID发送SIGTERM后，先关闭HTTP，再等待池的物理连接关闭、删除本次随机库，然后停止自己的PG cluster并删除临时目录。数据库清理复用已验证的fixture生命周期逻辑；若cluster停止失败会保留目录供恢复，避免删掉仍运行实例的数据。不得把其他PostgreSQL服务当成本次实例清理。

本次定向实测（2026-11-11）：脚本严格类型检查通过；实际HTTP `/health` 200，admin/employee登录200、退出204，admin读取商品2/仓库2/批次4/客户地址2，employee管理商品403；Cookie仍有Secure及`__Host-`前缀、凭证权限0600。3000占用时第二次启动报错退出且原health仍200。仅验证启动、认证和种子，不重跑已通过的全部后端测试。
