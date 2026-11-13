# 后端运行、迁移与恢复

当前验证环境是Apple Silicon Mac、Node26.13.0、PostgreSQL18.6。当前开发Mac不安装Docker。2026-11-11已在局域网Mac mini的Docker Desktop实际完成Linux/arm64镜像构建、Compose空库迁移、内部CA HTTPS、虚构业务及备份恢复/切库，详见 [容器实际验收](verification/build-web-inventory-v1/deployment-container.md)。连接方案见 [Mac mini远程Docker](remote-docker-mac-mini.md)。真实Linux生产宿主、公网DNS/ACME签发与发布仍未执行，不能将隔离测试描述成生产上线。

2026-11-10后端冻结验证不含前端。2026-11-11已按用户指令由Antigravity Gemini3.8FlashHigh开始apps/web重设计与实现，当前未验收；新增工作区与开发命令见 [工作区运行说明](workspace-development.md)。后端冻结及Drizzle修补回归的37项纯测试/107项真实PG结果不代表前端已通过。后端单独构建使用 `npm run build:backend`；根 `npm run build` 现会继续构建web，待其源码稳定后验证。

## Mac本地开发

安装Node22+、npm及PostgreSQL18；Apple Silicon的PG工具可设置 `PG_BIN=/opt/homebrew/opt/postgresql@18/bin`。`npm ci --ignore-scripts` 后执行 `npm run build`；esbuild使用平台预编译包。复制根 `.env.example` 到本地私密文件，填独立开发库及HTTPS访问origin。Node不自动读取.env，可使用 `node --env-file=.env packages/database/dist/cli.js` 迁移，`node --env-file=.env apps/api/dist/server.js` 启动。开发热重载可由环境注入后 `npm run dev:api`。Secure Cookie需要真实HTTPS本地代理，纯HTTP只适用于无登录的health探测。

`npm run test:db` 自动起私有Unix socket临时PG，不监听TCP、不触碰开发/生产库；或显式设置专门具备CREATEDB的TEST_DATABASE_URL。不要指向真实业务库。初始化管理员按docs/security-operations.md使用0600密码文件，禁止把明文密码写进命令参数或提交仓库。

## 容器与Linux生产操作步骤

在具备Docker Engine/Compose插件的Mac或Linux执行。构建前运行现有类型检查、契约生成一致性和测试。Dockerfile默认runtime目标构建API；新增web目标构建React静态资源并复制到Caddy的/srv。Compose的proxy使用HYP_WEB_IMAGE，不能再仅提供无静态资源的原始Caddy镜像。此全栈路径已在Mini独占Linux/arm64容器完成实际双镜像构建、内部CA/IP严格HTTPS、新静态资源及完整只读浏览器业务段验证，见 [实际全栈验收](verification/build-web-inventory-v1/fullstack-container.md)。此前后端47表备份恢复事实继续适用；真实生产域名/ACME发布与实物设备仍待环境验收，不能将隔离结果称为生产上线。

```sh
cp infra/.env.example infra/.env
mkdir -p infra/secrets
chmod 700 infra/secrets
umask 077
openssl rand -hex 32 > infra/secrets/postgres_password
openssl rand -hex 32 > infra/secrets/db_password
openssl rand -hex 32 > infra/secrets/admin_password
chmod 444 infra/secrets/postgres_password infra/secrets/db_password infra/secrets/admin_password
docker build --target runtime -t huoyoupu-api:local .
docker build --target web -t huoyoupu-web:local .
docker compose --env-file infra/.env -f infra/compose.yaml config --quiet
docker compose --env-file infra/.env -f infra/compose.yaml up -d db migrate
docker compose --env-file infra/.env -f infra/compose.yaml --profile setup run --rm initialize-admin
docker compose --env-file infra/.env -f infra/compose.yaml up -d api proxy
```

将HYP_DOMAIN改为实际域名，HYP_API_IMAGE和HYP_WEB_IMAGE指向各自构建产物。生产发布前把Node构建基础、Caddy构建基础、PostgreSQL及两个应用镜像固定到审查过的digest；构建基础分别通过--build-arg NODE_IMAGE和--build-arg CADDY_IMAGE传入。示例major tag用于准备，前次Mini后端隔离构建的实际摘要已记录在容器验收报告中。

HTTPS同源入口优先将/api、/api/*、/health及/health/*原路径转发至API，未知API仍返回服务端错误，不能回退为HTML。/assets/*按静态资源处理，缺失返回404；其他页面路径查找实际文件，找不到时回退index.html，入口页要求重新验证缓存。服务端SPA回退仅保证应用壳可加载，具体业务深链仍需前端路由识别。Caddy只读取web构建产物，不接收AI密钥或数据库secret；PUBLIC_ORIGIN、Secure Cookie、Origin/CSRF策略保持原规则。[官方SPA/API独占路由模式](https://caddyserver.com/docs/caddyfile/patterns#single-page-apps-spas)。

Compose file-backed secret实际使用bind mount，不能依赖uid/gid/mode重映射；因此上例秘密目录0700限制宿主访问，文件0444允许容器内被授予该secret的非root用户读取。管理员CLI再复制为当前容器用户拥有的0600临时文件。本轮已在Mini容器实际验证这些挂载和复制权限，其他生产宿主仍需复核。[官方secret文件权限说明](https://docs.docker.com/reference/compose-file/services/#secrets)。

首次空数据卷由官方PG入口创建无superuser/createdb/createrole权限的huoyoupu数据库所有者；该角色兼作迁移账号，仍具自身schema的DDL权限，未拆分纯运行角色。secret读取显式去除常见行尾空白，与运行时trim一致；应用只读其独立db_password，postgres管理员密码不进入API容器。迁移先于API和管理员初始化，失败不放行；管理员CLI只用于空账号库。更新时保留数据卷，先备份，再用新镜像运行migrate并启动API；迁移有checksum，不能修改已应用SQL。失败先停新版本检查，不自动执行破坏性回滚或删卷。

只有Caddy发布80/443；API/PG不发布主机端口。配置匹配域名触发自动HTTPS，需DNS正确指向服务器、80/443可达并持久化Caddy证书卷。PUBLIC_ORIGIN固定为https域名，服务端Origin/CSRF校验不依赖转发Header。上线后需实测health、HTTPS证书、Cookie安全属性、登录/角色拒绝、写入与幂等重放，不能用本地inject测试替代公网验证。

## 备份与恢复

普通数据库客户端脚本：`node scripts/database-backup.mjs backup backups/时间.dump`，连接通过0600的DATABASE_URL_FILE或进程环境提供；PG_BIN指定与服务器兼容的工具。自定义归档不覆盖同名文件，临时文件成功后以排他硬链接原子发布（并发同名归档只允许一个成功），权限0600。`restore`只允许另建的空目标库，执行single-transaction/exit-on-error，不使用clean/drop。连接密码不出现在进程参数或日志。

Compose环境使用：

```sh
sh infra/database.sh backup backups/2026-11-10T120000.dump
sh infra/database.sh restore backups/2026-11-10T120000.dump hyp_restore_20261110
```

恢复脚本先createdb，目标存在即失败，绝不覆盖旧库；失败保留新库供检查。业务核对通过后才人工切换infra/.env的HYP_DB_NAME到新库，并以新数据库配置重跑migrate/API；旧库保留，必要时通过原配置回切。不要运行compose down -v。

备份包含客户/账号哈希等敏感业务信息：按实际运营要求保存加密的异机副本，限制访问，明确频率/保留周期与恢复目标，并定期恢复演练。数据库归档不包含角色密码、HTTPS证书、环境配置和AI密钥，这些须独立管理，不能以单个dump代替完整灾备。

## 已实际执行

`npm run test:db -- packages/database/test/backup.test.ts`：真实私有PG18，1/1通过。使用虚构客户、商品、入库、真实确认销售、收款/核销和月结；pg_dump自定义归档后pg_restore到第二个新空库，全部public表逐行JSON稳定hash完全一致。恢复后库存8瓶/16.00、客户净余额-2.00；迁移再次运行无待应用项。重复备份拒绝覆盖，恢复到已存在业务表的库拒绝且数据不变，备份权限0600。

此前JS语法检查、shell `sh -n`、Compose YAML语法解析、API/database类型检查已通过。2026-11-11另完成实际Compose配置、镜像构建、Linux容器与内部CA HTTPS验证；完整命令、两项部署修复、47表恢复核对与清理见 [容器实际验收](verification/build-web-inventory-v1/deployment-container.md)。公网TLS和真实生产发布仍未执行。

参考官方行为：[PG自定义归档恢复](https://www.postgresql.org/docs/18/app-pgrestore.html)、[Compose健康依赖与启动顺序](https://docs.docker.com/compose/how-tos/startup-order/)、[Caddy自动HTTPS](https://caddyserver.com/docs/automatic-https/)。

补充真实启动验证：API build成功后，`npm run test:db -- apps/api/test/server-smoke.db.test.ts` 1/1通过。实际spawn编译后的infra/runtime.mjs migrate/serve，使用真实临时PG与TCP HTTP服务；health、匿名401、CSRF挑战及Cookie登录、已登录账户列表成功，SIGTERM优雅退出并确认端口关闭。没有用inject代替这项启动测试。测试HTTP地址仅作后端进程验证，不声称浏览器Secure Cookie或TLS已实机验证。
