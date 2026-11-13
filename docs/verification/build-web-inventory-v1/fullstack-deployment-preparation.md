# 全栈容器部署配置准备

后续实际状态：本文件保留配置准备时的历史边界；2026-11-11已完成隔离双镜像构建、严格HTTPS及最后完整业务段，详见 [实际全栈验收](fullstack-container.md)。下文“尚未/待冻结”均指当时准备阶段，不覆盖该后续证据。

2026-11-11。实际检查确认此前Dockerfile只构建API，Caddy反代所有请求，没有React静态资源和SPA回退。本次补齐部署配置，没有修改apps/web、共享契约、根脚本或lock；没有将前端施工源码同步Mini，也没有执行新增全栈镜像构建。

## 已落盘配置

- Dockerfile提取dependencies安装阶段，后端build/runtime保留；默认最后目标仍runtime，现有后端构建入口兼容。web-build独立从完整开发依赖开始，先构建contracts声明，再运行现有build:web；web目标仅将dist复制到Caddy/srv，不包含Node依赖、测试资料或后端secret。
- Compose proxy使用必填HYP_WEB_IMAGE，infra/.env.example补huoyoupu-web:local；Caddy基础镜像由Dockerfile的CADDY_IMAGE build arg指定。避免原始Caddy镜像启动正常但页面不存在。
- Caddy优先独占/api和/health路径并保留请求路径；/assets/*缺失404，不返回HTML；其余路径try_files回退index.html，入口页使用重新验证缓存。此顺序按 [官方SPA与API模式](https://caddyserver.com/docs/caddyfile/patterns#single-page-apps-spas)配置。
- API的PUBLIC_ORIGIN、Origin/CSRF校验和Secure Cookie保持原样；静态服务不注入任何后端密钥。API/PG仍不发布宿主端口。

## 实际静态验证

只将Caddyfile、compose.yaml和无真实凭证的.env.example传到Mini新/tmp/huoyoupu-test-config-yyEFhuJB目录，不含源码或真实secret。

1. `docker compose -p huoyoupu-test-config-yyef --profile setup --env-file example.env -f compose.yaml config --quiet`：exit0。
2. 使用既有caddy:2-alpine，临时`docker run --rm --network none`仅执行`caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile --validate`：exit0，没有监听服务端口或申请证书。输出有缩进格式提示，不影响验证通过。
3. 检查适配后的实际JSON，确认API、assets、SPA三个handle属于同一独占group，匹配顺序正确，API handler是reverse_proxy，SPA包含/index.html回退：通过。初次辅助断言未跳过最前面的encode handler而KeyError，修正为仅检查handle group后通过，配置本身不受该辅助断言影响。
4. `sh -n infra/database.sh`、`node --check infra/runtime.mjs`：exit0；现有根build:web脚本存在，无需新增运行脚本。
5. --rm配置检查容器已经退出，按唯一名称确认无残留；临时配置目录已删除。没有创建业务数据库、业务容器或卷，没有更改Docker context或开发Mac的软件。

## 等待源码稳定后实际执行

新增web-build/web阶段尚未实际构建，不能将静态验证写成镜像/页面已经通过。此前 [后端容器实际验收](deployment-container.md) 的构建、8迁移、内部CA HTTPS及47表备份恢复事实保留，适用其当时的后端配置。

收到协调者冻结通知后，使用新的唯一隔离项目，按源码白名单同步稳定的前后端版本，构建runtime和web两个目标；使用内部CA及回环端口验证首页/index.html、真实hash JS/CSS、业务深链应用壳回退、缺失assets404、未知API的JSON404、/health200、HTTPS会话/CSRF登录与权限。额外确认前端自身能解析业务深链，而不仅是服务器返回index.html。最后清理该测试项目实例/临时secret；真实公网DNS/ACME与生产发布仍不属于该隔离验收。

## 后续跨机浏览器 HTTPS smoke 的最小方案（尚未执行）

2026-11-11 官方资料核查结论：优先使用重新确认的 Mini 私有 LAN IP 与一个未占用高端口作为唯一 origin，例如 `https://<Mini-IP>:<port>`。不修改 hosts、不配置 DNS、不在当前 Mac 安装 Docker 或系统根证书。以下只是待冻结后执行的参数约定；本节没有启动容器、浏览器或验证真实 Edge 的参数行为。

隔离 Compose 只将 Caddy 的容器 443 映射到指定 Mini LAN IP 的该高端口，不发布 API/PG 端口，不更改防火墙。PUBLIC_ORIGIN 必须是同一个完整 HTTPS origin（含端口），浏览器使用构建产物与相对 `/api`，不能继续指向 localhost:3000/5173。只使用独立虚构夹具和新测试项目。生产 Caddyfile 的域名/ACME 不变。

Caddy [支持 IP 的本地 HTTPS](https://caddyserver.com/docs/automatic-https#local-https)，临时测试 Caddyfile 可在保留现有 API/assets/SPA 路由的基础上使用：

```caddyfile
{
    skip_install_trust
    auto_https disable_redirects
    default_sni <Mini-IP>
}
https://<Mini-IP> {
    tls internal
    # 此处保留已准备的 API/assets/SPA handles
}
```

`tls internal` 只用于这个测试项目；[skip_install_trust](https://caddyserver.com/docs/caddyfile/options#skip-install-trust) 阻止 Caddy 尝试安装根证书。[default_sni](https://caddyserver.com/docs/caddyfile/options#default-sni) 用于没有 SNI 的客户端，避免 IP 直连在容器网络下选不到目标证书。IP SAN、无 SNI 握手以及 LAN 高端口可达性仍需实际验证，不能仅凭配置声称通过；若网络限制阻挡，应记录限制，不自动开放其它接口。

### 先正常验 CA/IP，再提取本次叶证书的 SPKI

通过现有受控远程通道仅复制该测试 CA 的公开 `root.crt` 到本机私有临时目录，不复制 CA 私钥。以下为未来 shell 命令，变量由本次隔离项目给出；`HYP_SMOKE_DIR` 为 `mktemp -d` 创建、权限 0700 的目录，凭证文件另行保存在其内且权限 0600，不打印内容。

```bash
set -euo pipefail
# HYP_SMOKE_IP、HYP_SMOKE_PORT、HYP_SMOKE_DIR 由执行者填入本次测试值
HYP_SMOKE_ORIGIN="https://${HYP_SMOKE_IP}:${HYP_SMOKE_PORT}"
HYP_SMOKE_CA_FILE="$HYP_SMOKE_DIR/root.crt"
curl --fail --show-error --cacert "$HYP_SMOKE_CA_FILE" "$HYP_SMOKE_ORIGIN/health"
openssl s_client -connect "${HYP_SMOKE_IP}:${HYP_SMOKE_PORT}" \
  -noservername -CAfile "$HYP_SMOKE_CA_FILE" -verify_return_error \
  -verify_ip "$HYP_SMOKE_IP" -showcerts </dev/null >"$HYP_SMOKE_DIR/chain.pem"
openssl x509 -in "$HYP_SMOKE_DIR/chain.pem" -out "$HYP_SMOKE_DIR/leaf.pem"
openssl x509 -in "$HYP_SMOKE_DIR/leaf.pem" -noout -ext subjectAltName
HYP_SMOKE_CERT_SPKI="$(openssl x509 -in "$HYP_SMOKE_DIR/leaf.pem" -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary | openssl base64 -A)"
```

必须先获得成功的链验证、IP SAN 验证和 health 响应；不能直接信任从未认证网络连接提取的公钥。实际 Caddy 续签若换公钥，重新正常验证并提取，不固定使用旧 pin。Node 端 API 请求用启动环境 `NODE_EXTRA_CA_CERTS="$HYP_SMOKE_CA_FILE"`；[Node 官方说明](https://nodejs.org/api/cli.html#node_extra_ca_certsfile)该文件在进程启动时读取。它不会自动让浏览器信任此 CA。

### 交给 A 的浏览器入口参数

由 Antigravity A 最小改造现有 smoke 入口，支持 origin/API/凭证路径/叶证书 SPKI 环境覆盖；这里的 `HYP_SMOKE_*` 是建议约定，尚不表示现有脚本已经支持。API base 为 `$HYP_SMOKE_ORIGIN/api/v1`，凭证只从指定 0600 文件读取，不写源码、URL或日志；浏览器可继续使用本机已有 Edge executable。

浏览器 headless 启动只追加 `--ignore-certificate-errors-spki-list=<本次叶证书的Base64值>`，无 `sha256/` 前缀。必须有新的临时 `--user-data-dir`，不能复用日常 Edge profile。[Chromium 官方开关定义](https://chromium.googlesource.com/chromium/src/+/HEAD/services/network/public/cpp/network_switches.cc)要求此目录参数，且说明值是 Base64 SHA-256 SPKI。现有 Playwright `chromium.launch` 会自动建立临时目录；本机已安装版本的启动实现只读核查确认会追加此参数，A 应核实际启动参数，不重复手加。若显式管理目录，用官方 [launchPersistentContext(userDataDir, options)](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)，结束关闭进程后清理临时 profile。

[Chromium verifier 源码](https://chromium.googlesource.com/chromium/src/+/HEAD/services/network/ignore_errors_cert_verifier.cc)表明链中任意证书 SPKI 命中就放行证书错误，未命中仍走原验证器。它不是向浏览器添加受信任 CA，例外也不按 hostname 限定。因此只 pin 本次叶证书，不 pin 可签其它站点的 CA/中间证书；仅访问私有夹具目标，并先完成上述严格 CA/IP 验证。不要使用 `ignoreHTTPSErrors:true`、`--ignore-certificate-errors`、`NODE_TLS_REJECT_UNAUTHORIZED=0` 或降低 PUBLIC_ORIGIN 为 HTTP。真实 Secure Cookie、同源 Origin、登录 challenge/CSRF 及角色权限照常执行。

冻结后的最小正反向检查：两个全新浏览器 profile，正确叶 pin 可访问目标；无 pin 或错误 pin 时同目标应报证书错误。保留 Edge 版本、实际参数（不含凭证）、HTTPS origin 和结果；如果无 pin 也成功，先查已有信任，不能把它当作 pin 生效证据。之后只读访问构建页面/业务深链和 API，验证真实 HTTPS 登录，不创建业务写入或把 `afterprint` 当打印成功。

IP 方案不需要 `--host-resolver-rules`。若真实握手迫使使用测试域名，备用参数为 `--host-resolver-rules=MAP huoyoupu-test.test <Mini-IP>`，并使 Caddy 证书域名、页面 URL、PUBLIC_ORIGIN 全部采用同一测试域名。该开关[只改变 Chromium resolver](https://chromium.googlesource.com/chromium/src/+/HEAD/services/network/public/cpp/network_switches.cc)，不会改 Node DNS、系统 hosts 或 URL/Origin；Node/curl 还需各自明确解析，故不作为首选。

若当前 Edge 构建/策略不接受上述精确例外，则停止并记录浏览器 TLS 未验，保留 curl/Node 的真实 HTTPS 证据。后续可另行选择已有合法公开证书的专用测试域名；不因此申请证书、安装系统 CA、全局忽略 TLS 或改变生产安全配置。14.2 真实安卓/打印机与 14.3 真实生产宿主、DNS/ACME 发布边界仍保留。

## 冻结后虚构夹具准备入口（仅已备脚本，尚未运行）

`scripts/prepare-deployment-smoke-fixture.py` 复用既有 deployment-http-check.py 的 stdlib HTTPS、CookieJar、CSRF 与逐写 idempotency-key 模式。它只经现有真实 API 创建数据，不构造 PrintData/SourceRef，不接数据库直写，不调用共享开发 API。只有显式指定 `huoyoupu-test-` 项目和写入 opt-in 才执行；此名称是防误操作声明，仍必须由执行者先确认该 origin 确实属于本次临时项目，不能代替远端身份核查。

准备动作：读取既有管理员私密 JSON（`{loginName,password}` 或已有 `{admin:{loginName,password}}`）；创建随机员工及虚构客户/地址/商品/仓库；入库10瓶、成本20元；确认销售2瓶/10元，再通过真实改单 API 改为12元。GET 核对原确认 revision 仍为历史只读10元、当前 revision不同；核对剩余批次8瓶/16元，读取真实客户 ledger entry，并实际验证员工能读取该历史版本。两角色准备会话都退出。无现金、打印任务或伪造快照写入。

输出与 C 新入口的**确切 schema**一致：`admin/employee` 各含 `loginName/password`；`ids` 含 `orderId/revisionId/productId/warehouseId/batchId/customerId/ledgerEntryId`，其中 revisionId 是更正前的真实 confirmed revision。文件 `O_EXCL` 新建、0600，必须位于仓库外的当前用户0700目录；拒绝覆盖，密码/Token/Cookie 不输出。仅复制该私有文件给受控本机 smoke 进程，不上传仓库或截图。脚本失败可能已创建部分虚构实体，须删除整个唯一临时项目/测试库清理，不向共享库发删除请求；重跑使用新项目。

未来命令示意（当前未执行，先完成前节严格 CA/IP 验证；输出父目录预先用 mktemp -d 创建）：

```bash
python3 scripts/prepare-deployment-smoke-fixture.py \
  --origin "$HYP_DEPLOY_ORIGIN" --ca-file "$HYP_SMOKE_CA_FILE" \
  --admin-file "$HYP_PRIVATE_ADMIN_FILE" \
  --output-file "$HYP_PRIVATE_DIR/browser-credentials.json" \
  --fixture-project "$HYP_TEST_PROJECT" --allow-disposable-fixture-writes
```

后续 C 入口使用 `HYP_DEPLOY_ORIGIN`、`HYP_DEPLOY_CREDENTIALS_FILE="$HYP_PRIVATE_DIR/browser-credentials.json"`、`HYP_DEPLOY_TLS_SPKI`；Node 启动前设置 `NODE_EXTRA_CA_CERTS`。不要把前节建议的 HYP_SMOKE 命名误认为该入口实际变量。C notes 见 `apps/web/DEPLOYMENT_SMOKE_NOTES.md`；目前仅只读核其 schema，没有执行该前端测试。脚本只做 AST 语法静态核对，真实 API 夹具创建/鉴权/输出权限仍待 freeze 后的实际独立容器验证，不能写成已通过。
