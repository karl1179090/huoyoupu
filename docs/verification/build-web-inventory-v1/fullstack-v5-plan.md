# 最终 v5 最小执行准备（等待源码冻结）

2026-11-12。本轮只整理现状、私有执行入口和静态语法；**没有打包当前施工源码、build、启动Compose、调用API或运行浏览器**。Money前端源修/订单边界独验尚在进行，必须等Root明确冻结与验收门槛通过，不能把v4候选或本计划当最终验证。

## 当前精确状态

- Mini设备00000000-0000-0000-0000-000000000000，唯一项目`huoyoupu-test-fullstack-2sm3fc3d`；保留根目录`/tmp/huoyoupu-test-fullstack-2Sm3Fc3D`权限0700、其中browser-credentials.json0600。原api/db/migrate/proxy均Exited(0)，没有监听中的本项目服务。
- 原已验v3 API digest `sha256:396b979111706257521878430d13d52319df85be5219b5ddc5bae3bd11d48233`。v4 API新tag仅复用它；API生产输入未变的前提下v5仍复用，不无理由重build后端。
- v4 web仅构建候选，tag`huoyoupu-test-fullstack-2sm3fc3d-web-v4`，digest `sha256:7ef83f0aeeb06c06f6b75b53483a529227f6a111691521740e10fee720bc2499`；尚未smoke，不覆盖其证据。v3已验web tag/digest与原compose.test.json保留。
- 当前Mac私有目录`/var/folders/0_/j9jz72fn73zczk2lcj34c9w40000gn/T/huoyoupu-mini-smoke-ehpw9n75`存在且0700，公开root.crt、私有credentials.json与旧leaf-current.spki均在；只核存在/权限，没有展开凭据。旧SPKI不得直接沿用。

## 已准备、未执行的两个入口

1. Mini `/tmp/huoyoupu-test-fullstack-2Sm3Fc3D/prepare-compose-v5.py`：读取原已解析JSON，先核唯一project名，另以exclusive新建0600的compose.test-v5.json；将api/migrate/initialize-admin三个image改`huoyoupu-test-fullstack-2sm3fc3d-api-v5`，proxy改`huoyoupu-test-fullstack-2sm3fc3d-web-v5`，其余端口/网络/卷/私有secret路径/PUBLIC_ORIGIN/Caddy测试配置保持。**目前只写好了脚本，未执行/未生成新Compose**，不会启动服务。原JSON image已具体化，单设HYP_API_IMAGE/HYP_WEB_IMAGE环境不会替换它，不能用那种方式假称切到v5。
2. 当前Mac上述私有目录的`run-v5-smoke.sh`（0700）：`bash -n` exit0，仅语法检查未运行。实际运行时先curl --cacert，再现有Homebrew OpenSSL无SNI/严格链与verify_ip，提取当次已认证叶证书SHA256 DER SPKI；之后使用NODE_EXTRA_CA_CERTS、HYP_DEPLOY_ORIGIN/CREDENTIALS_FILE/TLS_SPKI，运行既有deployment-browser-smoke的`Node fetch|Read-only Browser Smoke`两段，120秒上限并留私有TAP log。没有ignoreHTTPSErrors、全局TLS绕过或密码内容参数。

## Root冻结后的最小顺序

1. 固定完整shipping manifest-v5，与v4和已验v3对照。包含Money源修及实际所有生产helper/样式；排除所有前后端tests/support、factory/启动器、notes、credentials/env、node_modules/dist、截图、tsbuildinfo、.git等。前后两次hash监测，若生产输入漂移则停并报告，不能称最终；当前新测试仍由本机运行，不上传为shipping源码。
2. 新空`source-v5`白名单解包，复算归档SHA；核API所有构建输入仍同396b979版本。未变则为原digest增加唯一api-v5 tag；若真变先报root，不假复用。仅以独立web-v5 tag执行现有Dockerfile web目标build，保留v3/v4 tags及logs，不prune/cache清理。实际产物hash/JS/CSS文件名另记，不能预填成功。
3. 构建通过后才在Mini执行prepare-compose-v5.py，再`docker compose -p huoyoupu-test-fullstack-2sm3fc3d -f /tmp/huoyoupu-test-fullstack-2Sm3Fc3D/compose.test-v5.json config --quiet`和`up -d --wait db api proxy`。复用原固定虚构DB/Caddy卷/账号，不重seed、不动原dev97364/PG42535/Vite。
4. 确认Mini当前LAN IP与独占49543可用，原计划origin为`https://192.0.2.10:49543`。若IP变化必须明确更新本项目Caddy IP SAN/对应PUBLIC_ORIGIN并重新验CA/IP，不改生产配置或globalCA。通过授权远程通道核CA证书，绝不复制私钥或把secret输出；私有root.crt若不再匹配，先停查原因，不绕过严格验证。
5. 在当前Mac**执行私有run-v5-smoke.sh**。最新真实index/hash资源/缺失assets404；正确当前leaf pin下原生历史revision、batch真实query/DOM、admin→employee→ledger403→admin、最终零业务写/0reload/0员工受限API均需真正到达断言。旧no-pin/wrong-pin、备份恢复/容量/27/37/107不为绿重跑；smoke失败如实保留，禁止改front/test绕过。
6. 编排者不论成功失败，结束浏览器后都通过Remote Desktop Commander执行本唯一project的`docker compose ... -f compose.test-v5.json stop --timeout 15`，确认四服务Stopped。当前Mac不装Docker/CLI；本地smoke shell不包含远程凭据或暗中自行停止Mini，finally安全stop由该编排步骤负责。保0700目录/0600凭据与卷续验，不down其它项目或清共享资源。

入口命令均不含密码；实际凭据只由受控测试进程本地文件读取，不放argv/仓库/聊天。若需回退，原v3 compose.test.json与已验镜像仍在；v4只是候选不当作已验回退证据。以上只有计划和已准备入口，未执行v5构建/部署，真实公网DNS/ACME与安卓/针式物理设备仍是原待验边界。
