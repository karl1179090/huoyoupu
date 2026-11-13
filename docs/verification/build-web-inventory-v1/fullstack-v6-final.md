# v6 最终隔离全栈定向验证

2026-11-12，Root 冻结 Detail 手机布局/上海时间局部修补后执行。相对持久化 v5 shipping146，只有 OrderDetailPage.tsx 与 styles/index.css 两文件改变，其余144无变，新增/删除[]；API build inputs 相对 v3 drift=[]。测试前后146文件再次核对 drift=[]。详见 [manifest](fullstack-source-manifest-v6.json)、[结构化结果](fullstack-v6-result.json)。归档337988字节，SHA256 `d2fc8b442e2d29c2e0342e96ca457463bd90c03579ff358af2c4af013ecbecb6`，Mini复算一致；排除全部测试/support/factory/凭据及临时数据。

首次标准 Dockerfile 构建 exit1：Docker Hub 匿名 token 请求连接重置，未进入编译，保留 [失败日志](fullstack-v6-build-web-v6.log)。只做一次受控 `docker build --pull=false --platform linux/arm64 --target web ...` 原样重试，exit0，见 [成功日志](fullstack-v6-build-web-v6-retry.log)。没有修改源码、Dockerfile、TLS、网络或凭据。新 web digest `sha256:f60f315873c5e2cd7205f08c7f25e13ea729a2471cd67f35553e3da6887c6425`；API复用 `sha256:396b979111706257521878430d13d52319df85be5219b5ddc5bae3bd11d48233`，均 Linux/arm64。

本次真正使用私有 `compose.test-v6.json` 覆盖 api/migrate/proxy 镜像，up --wait exit0，并 inspect 确认运行容器实际引用上述 v6 tags/digests。复用原独占项目、虚构fixture及数据库/Caddy卷，无重新seed、dev服务或真实业务操作。

先以 curl --cacert 验 health200，再用 OpenSSL `-noservername -CAfile ... -verify_return_error -verify_ip 192.0.2.10` 严格验证当前链及IP SAN；从本次已认证叶证书重算SPKI。Node仅 NODE_EXTRA_CA_CERTS，Edge仅临时profile的精确leaf SPKI；未装系统根、未全局忽略TLS。旧无pin/错误pin负向事实保留，本轮未重复。

实际运行既有 deployment-browser-smoke，仅选择 `Node fetch|Read-only Browser Smoke`，120000ms上限；[脱敏TAP](fullstack-browser-v6.tap.txt) **2/2 pass、fail0、skip0、exit0，总9094.591416ms**：

- Node HTTP 静态段84.839917ms：HTTPS health/index200、实际hash JS/CSS200与MIME、缺失assets404。新JS `/assets/index-M4S5BUMC.js` 662848字节，CSS `/assets/index-ChvEgnsV.css` 21423字节；实际停止后proxy `/srv`产物hash存于result。此项是Node HTTP，非浏览器。
- 真实Edge headless段8716.605625ms：真实页面管理员登录、原生旧confirmed revision GET/只读、批次生产CustomEvent触发真实双query GET/payload/DOM定位；admin退出→employee登录及打印入口→真实ledger来源403→返回→employee退出→admin登录。批次证据是生产event入口，不冒称点击报表来源。最终零业务写断言真正到达，除auth外无写操作；角色切换main-frame reload0，员工限定窗口受限管理API0。没有route/mock、伪PrintData或新业务资料。

浏览器/context finally关闭且测试进程exit0后，仅 stop 本独占项目；api/db/migrate/proxy四服务均exited，见 [stop日志](fullstack-v6-stop-v6.log)。原0700目录 `/tmp/huoyoupu-test-fullstack-2Sm3Fc3D`、0600私有配置和卷保留，未down/prune/触碰其它项目。可由授权执行者在该目录运行 `docker compose -p huoyoupu-test-fullstack-2sm3fc3d -f compose.test-v6.json up -d --wait db migrate api proxy` 续验；其中不含secret。

旧私有90逐文件baseline已被清理，本轮不声称重算90；v5已持久化90结果仅作历史事实。本轮真实保护范围是持久化shipping146。未重复旧全后端套件、容量、空bootstrap或47表备份恢复，其既有独立证据按原范围保留。此次通过是隔离Linux/arm64容器与内部CA私有IP验证，不等于生产公网DNS/ACME、系统CA信任或针式打印实际走纸上线；由非作者结合最终规划审判14.5。
