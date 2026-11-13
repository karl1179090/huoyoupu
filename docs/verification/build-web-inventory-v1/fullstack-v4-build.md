# Mini v4 构建候选（未最终 smoke）

2026-11-12。按协调者授权，仅准备固定production shipping输入和镜像，等待订单6个边界独验后再运行HTTPS/static/role/ledger smoke。没有启服务、浏览器、迁移或业务数据写入，没有修改Dockerfile/Compose/前端源码/模型或secret，没有覆盖v3证据/镜像。

## 输入与隔离

[完整shipping manifest](fullstack-source-manifest-v4.json)相对v3生产差异为OrderEditPage、OrderPrintPreview、PrintTemplateManager三修改，以及orderEditLogic、printingLoaders两新增。API、packages、依赖/lock、根构建配置和runtime等API构建输入完全相同，API可复用原digest。

145文件、335725字节gzip，SHA256 `b13a55fb293cc7e515be49613a06588b3f0ca4d2773de05e90739496da5334cf`，Mini接收后复算一致。全部前后端test/support、factory、临时fixture启动器、凭据、env、截图、tsbuildinfo、node_modules/dist均排除，不把新增报告fixture或测试目录复制到production镜像。新上下文 `/tmp/huoyoupu-test-fullstack-2Sm3Fc3D/source-v4` 从空目录解包，不继承旧source中的测试文件；没有读取任何凭据。

传输后与构建后两次shipping哈希均drift=[]；新订单边界测试本身不属于shipping输入。若后续发现production bug并改源，本候选必须重新比对/构建，不能继续称最终。

## 实际镜像结果

- 新API候选tag `huoyoupu-test-fullstack-2sm3fc3d-api-v4`，明确复用v3已验image `sha256:396b979111706257521878430d13d52319df85be5219b5ddc5bae3bd11d48233`，Linux/arm64，没有谎称重新编译。
- 新web候选tag `huoyoupu-test-fullstack-2sm3fc3d-web-v4`：`docker build --platform linux/arm64 --target web ...` 实际exit0（远程进程8.79秒），image `sha256:7ef83f0aeeb06c06f6b75b53483a529227f6a111691521740e10fee720bc2499`，Linux/arm64。
- Vite实际产物index.html1.00kB、CSS `index-Cogy-3Ko.css`20.93kB、JS `index-Bu79sepK.js`661.61kB（gzip161.85kB）。有既有>500kB chunk提示，构建成功；未为压警告临时改业务/分包。
- 旧v3 API/web tags保持，旧web仍 `sha256:4bc68dcd58b3702296ddc32ec1808d7cef44af22812f7c45797122d3910c0a14`。只新增唯一v4标签，未prune或清共享cache。结构化结果见 [构建记录](fullstack-v4-build.json)，远端build-web-v4.log留在本次私有目录。

## 尚未执行

v4服务从未启动。最后ps确认原project的api/db/migrate/proxy全部Exited(0)，仍是v3原镜像配置；原0700目录、0600凭据及数据库卷保持原状。此轮没有需要stop的新服务，也没有新TLS/页面smoke结果。

待root确认订单边界独验/源码最终稳定后，再使用v4唯一tags创建本测试项目专用Compose覆盖（原compose.test.json是已解析的v3具体image，单改环境变量不会替换它），复用原卷做一次已有定向HTTPS/currentleaf/static/role/ledger smoke；保留v3配置与镜像可回退。旧备份恢复/容量/27/37/107不重跑。不得将本次build候选称为v4部署已验、前端任务全部验收或生产上线。
