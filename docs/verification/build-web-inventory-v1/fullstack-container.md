# Mini 隔离全栈容器验证

2026-11-11，当前最新为文末v3：含后端quote metadata的新API/web双镜像、严格HTTPS、独立只读报价无业务写、静态资源及完整ledger浏览器2/2均实证通过，独占服务已停止。原失败历史保留；已知前端derived单位/原价继承P1仍未修，不能将部署smoke称为前端全部完成。真实生产发布/设备边界仍保留，任务勾选由协调者/非作者复核决定。目标是 Linux/arm64 API runtime + React 构建产物 Caddy 镜像，不是生产发布。协调者在 frontend-stable-baseline.json 的类型/构建门槛通过后授权同步；61份源码哈希全部匹配。后续发现的 App adminOnly gate 窄修会另记差异，不能把旧镜像冒称已含修复。

## 已实际完成

- 设备 mac-mini.local，Docker Engine29.4.0 linux/aarch64、Compose5.1.2；独占项目 huoyoupu-test-fullstack-2sm3fc3d，临时目录 `/tmp/huoyoupu-test-fullstack-2Sm3Fc3D`。只发布 Mini 私有IP192.0.2.10:49543→Caddy443，不占80/443，API/PG不发布宿主端口，不更改系统CA或公网DNS。
- [同步白名单与哈希](fullstack-source-manifest.json)：145文件、333072字节gzip，SHA256 `01ed9adf1a0aef214d1189ddbc55b7cf67ae94604293cb18e8c6bf17c57c9285`，远端复算一致。无env、secret、credentials、node_modules、.git、dist或截图。secret在远端唯一0700目录内另生，未上传真实资料。
- `docker build --platform linux/arm64 --target runtime ...` 与 `--target web ...` 均exit0（复用本机既有构建缓存）；API镜像 `sha256:4aa7cee709251a4d471518f2568ba2e5d145bd4ecf37ccb880c4c0673755500d`，web镜像 `sha256:f793a7e839aa3f589a96617fff2c9cd086013e59747e4404728964cb62c2d1c8`。实际容器Node24.22.2 linux/arm64、Caddy2.11.9。
- 原Compose经config解析后仅在临时JSON替换proxy高端口与Caddy测试文件。测试Caddy tls internal + skip_install_trust + default_sni IP，保留API/assets/SPA路由；production配置未改。Compose配置静态检查通过，db/api健康，migrate退出0、实际应用001–008；初始化管理员成功。public共有47 BASE TABLE及11 VIEW，不把58个relation写成58张业务表。
- Mini与当前Mac均 `curl --cacert root.crt https://192.0.2.10:49543/health` 得200；OpenSSL `-noservername -CAfile root.crt -verify_return_error -verify_ip 192.0.2.10` 成功，SAN明确为该IP。Mini系统LibreSSL最初不支持verify_ip，命令停止；改用其既有Homebrew OpenSSL3.6.4后完成，未关闭任何证书检查。当前Mac用既有OpenSSL4.1.0。CA仅从授权远程通道复制公开证书，未安装系统root或复制CA私钥。
- 真实运行 `scripts/prepare-deployment-smoke-fixture.py`，只用该隔离origin与虚构实体。随机员工、客户/地址、商品/仓库、10瓶成本20元入库；确认销售2瓶10元，再改单12元；旧confirmed revision GET非current且仍10元，批次余8瓶/16元、真实商业ledger存在，员工可读取旧版本。两角色准备会话退出。私有JSON权限0600，仓库外私有目录0700；密码/Token/Cookie未记录在本报告或stdout。[脱敏夹具证据](fullstack-fixture-evidence.json)仅含虚构ids/预期数值，无凭据。
- 在当前Mac已实际执行 C 交付入口的前三段（按test-name-pattern选择Environment variables/Node fetch/Chromium TLS）：**3/3、fail0、skip0、exit0**。验证真实health、HTML、首页hash JS/CSS、缺失assets404；全新临时Edge浏览器无pin和错误pin均按明确ERR_CERT拒绝，正确叶SPKI连接200。没有page.route/伪响应、ignoreHTTPSErrors或全局ignore证书，Node仅使用NODE_EXTRA_CA_CERTS。只有已严格CA/IP验证的叶公钥加入该测试进程例外，不能称为浏览器系统CA信任测试。

## 第4段实际运行与停止交接

按协调者指令，仅另跑一次 C 入口 `--test-name-pattern='Read-only Browser Smoke'`，没有重复前三段。实际 **0/1、fail1、exit1**，统一执行 session67440已结束。失败为 `deployment-browser-smoke.test.ts:404` 等待 `text=403 访问权限受限` 的15000ms超时，对应已知App员工adminOnly来源被静默转回订单列表的问题，交A窄修，不能通过改测试或TLS设置绕过。

按本次测试串行断言顺序，失败前已完成：admin真实表单登录、原生旧confirmed revision深链及真实GET200、历史只读横幅与禁止动作断言；批次生产导航event、真实GET的productId/warehouseId和payload目标及DOM定位；管理员退出→员工登录、员工打印入口以及此阶段零整页刷新。未到达403后的返回、员工退出再admin登录和末尾全程zero-business-write汇总断言，故不能报告第4段全过。该入口无mock响应，来源批次用生产CustomEvent而非真实来源行点击。TAP记录第4段913652.0495ms、总duration913947.367208ms（约913.95秒）；保留实际wall时间，不把它改写为正常15秒测试，也未额外排查耗时。测试finally完成后进程exit1，未留下进行中的测试会话。

随后只执行本项目 `docker compose ... stop --timeout 15`：proxy/api/migrate/db均返回Stopped。没有down、删除卷、删除镜像、清全局cache或碰其它项目。为下次复验保留Mini独占0700目录 `/tmp/huoyoupu-test-fullstack-2Sm3Fc3D` 及数据库/Caddy卷；其中 `browser-credentials.json`、`admin-input.json` 与secret均保持私有，凭据内容不入仓库。当前Mac公开CA及私有browser凭据保存在本次仓库外私有临时目录，不是日常开发凭据。

Mini续启命令（仅恢复旧测试镜像，**不会自动修复A问题或算复验通过**）：

```bash
/usr/local/bin/docker compose -p huoyoupu-test-fullstack-2sm3fc3d \
  -f /tmp/huoyoupu-test-fullstack-2Sm3Fc3D/compose.test.json \
  up -d --wait db api proxy
```

下回需协调者确认A稳定修复后，仅同步有界稳定源码差异并重建web/替换本项目proxy，重新验证证书及第4段；不得上传施工源。前三段3/3保持已有事实，14.3新增全栈整项**未通过**，真实GUI阻塞与A窄修待完成。

原 [后端容器验收](deployment-container.md)的47表备份→独立库恢复、数据manifest一致、API切库/迁移失败阻断等事实仍按原样有效；不将其冒称本次新增web已经通过。真实生产宿主、域名/ACME、运营备份调度及安卓/针式纸张出纸仍待真实环境。后续最终清理只针对本项目标签容器、网络、卷、专有镜像标签与本次临时目录，不清全局cache或共有镜像；本轮按协调者要求只stop并保留续验资料。

## 稳定源码 v2 实际复验（后续记录，当前结论）

收到协调者确认 A17/B7/C 最终停写、独立types/build exit0及A workflow+batch pure31/31后，比较完整构建输入：[v2白名单/哈希](fullstack-source-manifest-v2.json)记录5个生产差异：App.tsx、navigation.ts、CustomerFinancePage.tsx、OrderPrintPreview.tsx、printing.css；无后端/lock/部署配置差异。受影响测试与部署入口亦纳入白名单。162文件gzip414083字节，SHA256 `964751fb92493a329a7320b7acd8a4f3e9edde2da051efe2e0bac49f1dec8a84`，Mini复算一致；targeted-baseline的5份源码/相关测试匹配。

只重建web目标，exit0，实际linux/arm64镜像为 `sha256:8a3bb1ecc63c52c5664f3c4c8f9bbb9a240d1327721d257adf39f53877066d5a`。原API镜像/PG与Caddy卷复用；compose up --wait成功，db/api健康、migrate exit0。未重跑后端纯测/数据库全套、规模或备份恢复。

当前Mac再次严格curl CA与OpenSSL无SNI链/IP SAN验证成功；叶SPKI确已变化，从新认证叶证书重算并用于本次浏览器，不复用旧pin。未安装系统根证书、未放宽TLS。旧无pin/错误pin负向事实保留，本轮按协调者范围未重复；新正确pin通过实际构建页面登录及前半业务断言。

实际命令仍使用仓库外私密文件及NODE_EXTRA_CA_CERTS/HYP_DEPLOY_*，仅选择 `--test-name-pattern='Node fetch|Read-only Browser Smoke'`，并设120000ms总测试上限。结果 **1pass / 1fail / exit1**，总18345.921375ms（18.35秒）：

- Node静态段成功：真实index200，新JS `/assets/index-DfF1-4y5.js` 与CSS `/assets/index-Cogy-3Ko.css` 均200、正确MIME，缺失assets404。实际内容SHA256及index哈希见 [脱敏证据](fullstack-fixture-evidence.json)。
- 第4段再于 `deployment-browser-smoke.test.ts:404` 等待“403 访问权限受限”15000ms超时。此前管理员真实登录、旧confirmed revision深链/只读、批次query/payload/DOM定位、admin退出→employee登录/打印入口及此前零刷新均已达；403后的末段与最终zero-business-write总断言未达。原始脱敏 [TAP](fullstack-browser-v2.tap.txt)保留，不报告整段通过。

本次窄定位与旧A gate失败不同：新App已保留target.page让adminOnly gate可达，但C部署脚本派发`href:'/settings'`；当前resolveSourceHref没有该别名分支，settings-company/settings-users仅是内部page枚举，因此它走unknown-source fallback。协调者需裁决使用现有受支持adminOnly目标来检验gate，或明确增加别名；本报告不擅改前端/测试，也不把未知来源行为误称TLS/容器故障。

测试进程已exit1并完成finally，随后再次仅 `stop --timeout 15` 本项目，proxy/api/migrate/db全部Stopped。继续保留原0700目录、0600凭据和卷供后续窄复验；上方resume命令仍适用，不会自动更新镜像。未动任何其它项目、共有镜像或全局cache。本次尚不具备“完整第4段+最终zero-write通过”的证据，**14.3仍不能整项通过**；非作者审查应据此明确缺口，等待协调者裁决后再推进。


## 最终 ledger 目标窄修后的完整业务段通过

C仅修改部署测试及NOTES，将未支持的`/settings`替换为真实虚构来源 `/api/v1/customers/{customerId}/ledger#{ledgerEntryId}`；没有增加生产别名、改App/契约或放宽权限。test与NOTES两次SHA256稳定，分别为 `d966e42018fd8791ffb235379121a597ca3a79276b158726ecbe6be9cf98e1e7`、`f0b1b9a21738692861622fc0ac26fa647adeef0321ff4f7472f9c9cdee148157`；源码归档及摘要见 [版本记录](deployment-smoke-ledger-version.json)，[两文件归档](deployment-smoke-ledger-fixture.tar.gz)。对v2所有production输入核drift=[]，测试前后哈希亦未变；镜像仍为上述v2，未重建API或web。

复启原独占项目成功；再次以公开测试CA严格验证当前IP/no-SNI TLS，提取当次已认证叶证书公钥作为SPKI，不依赖旧pin或系统CA安装。仅运行最后第4段，不重复静态资源、旧no/wrong pin负向或后端测试。实际命令形态（私有路径由执行者本地注入，未在仓库存凭据）：

```bash
NODE_EXTRA_CA_CERTS="$PRIVATE_DIR/root.crt" \
HYP_DEPLOY_ORIGIN=https://192.0.2.10:49543 \
HYP_DEPLOY_CREDENTIALS_FILE="$PRIVATE_DIR/credentials.json" \
HYP_DEPLOY_TLS_SPKI="$(cat "$PRIVATE_DIR/leaf-v3.spki")" \
node --import tsx --test --test-timeout=120000 --test-concurrency=1 \
  --test-name-pattern='Read-only Browser Smoke' \
  apps/web/test/deployment-browser-smoke.test.ts
```

**实际1/1 pass、fail0、skip0、exit0；case10008.7705ms，总10316.328583ms。** [原始脱敏TAP](fullstack-browser-ledger-final.tap.txt)与[结构化证据](fullstack-fixture-evidence.json)保留。全部串行断言到达：

- 管理员通过真实构建包表单登录；原生旧confirmed revision深链触发真实GET200，渲染历史只读横幅/禁止动作。
- 批次生产CustomEvent来源导航，真实GET两个过滤参数、返回目标batchId与DOM定位通过；这是生产event入口证据，不冒称真实点击报表来源行。
- admin退出→employee登录→403拒绝→返回订单→employee退出→admin登录，整个角色生命周期main-frame reload计数0。
- 员工打印入口可见；真实客户ledger来源被403 gate阻止，限定员工尝试窗口内customers（含ledger/balance）、cash-events、statements、company、print-templates、users等接口计数0；监听随后卸载，不把管理员合法请求计为泄露。
- 最后`forbiddenWrites.length===0`总断言**实际经过且通过**：除auth/login、auth/logout外无业务写，不创建PrintJob或伪数据。不是因提前超时仅通过前半段。

成功后finally关闭浏览器/context，测试进程exit0；仅对本项目执行stop --timeout15，proxy/api/migrate/db全部Stopped。原0700目录、0600凭据及卷仍保留可续验，未down或清理任何共享资源/cache。累计证据是首轮TLS/no-pin/wrong-pin3/3、v2新构建静态资源通过、最终业务1/1；各阶段来源/版本明确，不伪称一次完整4/4运行。

隔离Linux/arm64双镜像、真实迁移/初始化、严格内部CA/IP、构建资源与浏览器登录/深链/权限只读验证现已具备完整证据。旧47表备份恢复/切库回滚继续引用此前独立后端容器事实，未无意义重跑。此仍不是生产公网DNS/ACME上线、系统CA信任、安卓实机或针式241×93物理走纸验收；最终由非作者按OpenSpec14.3边界审查，不由本报告自行勾任务。

## v3 当前后端 metadata 的必要双镜像复验

协调者确认当前GLM CLI网关连续524、0工具执行且无额外前端漂移，全部作者已退出后，授权验证**当前已有源码**。这不是等待中的前端P1已修完成：A20 derived单位/原价继承P1仍明确未修，B9文案及已有A20源码按现状构建；本次只覆盖部署入口列出的路径，不覆盖首次退货后编辑表单的单位/价格交互或未完成视觉验收。

[v3完整manifest](fullstack-source-manifest-v3.json)相对v2固定全部输入差异：后端仅sales/revisions.ts的quoteSourceLineId metadata；前端CustomerFinancePage、OrderEditPage、OrderLineEditor、batchPickerLogic及相关测试/已修ledger部署入口。未改前端、模型配置、密钥、依赖或部署配置。162文件白名单gzip431085字节，SHA256 `20cb5ef68e5649b5533e2845fc48a464e68635dc49b19926c4d750d7472deb19`，Mini复算一致；剔除旧归档误纳的generated tsbuildinfo，仅删除临时源码副本的该文件。执行结束全manifest再次核对drift=[]。

两目标均真实重新build，exit0，Linux/arm64：

- API runtime：`sha256:396b979111706257521878430d13d52319df85be5219b5ddc5bae3bd11d48233`，实际纳入本轮后端关联修补。
- web：`sha256:4bc68dcd58b3702296ddc32ec1808d7cef44af22812f7c45797122d3910c0a14`。

原项目/数据库/Caddy卷与固定虚构fixture全部复用，没有重新seed或真实业务资料。Compose up --wait exit0，db/api/proxy健康、migrate退出0。当前Mac严格curl CA与OpenSSL -noservername/-verify_return_error/-verify_ip链和IP SAN再次通过，从当前已认证叶证书重算pin。没有安装系统root、全局TLS忽略或公网发布；旧no/wrong-pin负向已具备证据，本轮不为绿重复。

### 独立后端只读报价窗口

此窗口与下面browser零业务写窗口**明确分离**：管理员认证后真实HTTPS POST `/orders/quote` 对原确认行set相同单价，返回sourceLineId `03142472-054e-4fcf-88a8-8290025089ed`精确匹配请求原行，readOnly=false、quantityBase2、total12.00、stockReserved=false；随后退出本次认证会话。[脱敏HTTP结果](fullstack-quote-v3.json)保留，不含cookie/password/CSRF。

报价前后对该独立库public全部BASE TABLE（仅排sessions）逐表比较行数与有序JSON内容digest，46表全部不变，聚合fingerprint均 `c31ff89065abd9aacafa11acb9ce51771314aa44ba7ace7d5385218fc0755dd4`。[前后指纹](fullstack-quote-v3-fingerprints.json)只保存表名/计数/digest，不保存业务行或secret。覆盖订单/revision、库存/来源、账户/ledger、operations/audit；证明新镜像实际服务source metadata且quote无业务持久化副作用，不以单纯health代替。

### 最新静态资源与完整ledger浏览器窗口

之后才启动C的真实部署入口，仅选择 `Node fetch|Read-only Browser Smoke`，120000ms上限；使用相同私密凭据、Node额外CA、当前叶SPKI与全新临时浏览器profile。实际 **2/2 pass、fail0、skip0、exit0，总11087.450958ms**；静态段92.139833ms、完整业务段10665.834125ms。[脱敏TAP](fullstack-browser-v3.tap.txt)与[静态内容/新镜像/结果hash](fullstack-v3-result.json)保留。

新首页、实际hash JS/CSS及MIME/缺失assets404成功。正确pin下真实表单登录、原生旧confirmed revision只读深链、batch生产event真实query/payload/DOM、admin→employee→真实客户ledger403→返回→admin全过程通过；最终forbiddenWrites.length===0真正经过，角色切换reload0、员工限定窗口受限API0。该window内除了auth/login和auth/logout没有POST/PATCH/PUT/DELETE业务写；不要将上方独立只读quote POST隐瞒混算为浏览器窗口的零写。

测试finally和进程已退出0。收齐证据后再次只stop本项目proxy/api/migrate/db，四服务均Stopped；原0700目录、0600凭据与卷继续保留，未down、删共有镜像、清共享cache或动别项目。原resume命令仍可续启，但不会替代未来源码变更后的新验收。

本轮后端容器关联修补与既定部署smoke已实证通过；27项订单/报价PG及类型/构建证据另见 [quote-line-correlation.md](quote-line-correlation.md)。未重跑旧37/107、规模或47表恢复，旧恢复证据仍按原版本/范围保留。**前端已知P1及未完成视觉/真实设备仍未完成**；容器2/2不是完整前端验收，生产域名/ACME上线与实际运营环境不在此隔离验证结论内。

## 后续 v4 仅构建候选（未启服务/未smoke）

2026-11-12的最新shipping候选含orderEditLogic/printingLoaders和最终打印guard，见 [v4构建记录](fullstack-v4-build.md)；145文件白名单、生产源码前后哈希稳定，API复用原digest、新web Linux/arm64构建exit0。v4使用独立tag/空source-v4上下文，排除全部tests/support/factory与秘密，不覆盖v3已验镜像或报告。原四服务仍Exited(0)，等待订单边界独验后统一smoke；此段不将v3通过结果迁移成v4最终部署通过。

## 后续 v5 Money 源修构建候选（仍未 smoke）

Root冻结Money生产源后已仅构建web-v5，API输入无变复用396b979，详见 [v5构建记录](fullstack-v5-build.md)。新web Linux/arm64 image f9a7a050...，146文件shipping前后hash稳定，排除全部测试/support/秘密；原四服务仍Exited(0)，未切v5 Compose或运行smoke。旧v3/v4事实按原范围保留，此候选仍等待订单边界独验后的Root启动通知。

## v5 后续实际定向部署已通过并停止

Root授权后已真正启用v5专用Compose，并inspect确认api396b979/webf9a7a050实际运行；严格CA/IP/currentleaf后，Node静态与真实Edge role/ledger两项2/2通过、3.44秒，最终zero-write/0reload/0受限API均到达。146 shipping前后无漂移，独立90文件后端/共享保护完整枚举90→90新增删改[]；四服务已全部Stopped，浏览器运行时已交回Root。详见 [v5最终定向报告](fullstack-v5-final.md)，其中精确区分Node HTTP与真实浏览器动作，保留历史build-only/失败及真实生产设备未验边界。

## v6 最终 Detail 修补定向部署通过并停止

最终冻结源码相对v5 shipping146仅Detail/CSS两变、其余144稳，API输入无变复用396b979。首次Docker Hub auth reset已记录；原Dockerfile受控重试exit0，实际v6 web f60f3158已启动并inspect。严格CA/IP/currentleafpin后，Node静态与真实浏览器role/ledger **2/2、exit0、9.09秒**，最终zero-write/0reload/员工0受限API均到达；146前后drift=[]。四服务已finally stop/exited。详见 [v6最终报告](fullstack-v6-final.md)、[result](fullstack-v6-result.json)、[TAP](fullstack-browser-v6.tap.txt)。旧90私有逐文件baseline已丢失，本轮只实际重算shipping146，不将历史90事实冒充新核验。
