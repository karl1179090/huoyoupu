# Mini v5 Money 源修构建候选（构建时记录）

后续已在Root授权后实际完成定向smoke并安全停止，见 [实际v5结果](fullstack-v5-final.md)。下文保留仅构建阶段的原始边界。

2026-11-12。Root确认Money最终生产源停写/独审通过后，仅执行shipping快照与web候选构建。订单写流程测试仍是test-only施工，不纳入shipping。**没有启动服务、迁移、API请求、浏览器或smoke**；等待Root确认最后独验门槛通过。

[完整manifest](fullstack-source-manifest-v5.json)相对v4：OrderCreatePage/OrderEditPage修改，新增components/moneyInput.ts。146文件、337645字节gzip，SHA256 `7751eb00d09e6075a7251b9457d81752017693d4d72390743af40c9114433ab1`，Mini复算一致。全部tests/support/factory、notes、secret/env/credentials、node_modules/dist、截图及tsbuildinfo均排除；空source-v5目录解包，不继承旧测试副本。构建后shipping哈希drift=[]。

API全部构建输入仍与已验v3相同，仅为image `sha256:396b979111706257521878430d13d52319df85be5219b5ddc5bae3bd11d48233`增加独立tag `huoyoupu-test-fullstack-2sm3fc3d-api-v5`，没有谎称重新编译。

实际 `docker build --platform linux/arm64 --target web -t huoyoupu-test-fullstack-2sm3fc3d-web-v5 .` exit0，远程构建进程9.82秒，image `sha256:f9a7a0502b1a023ded7b93b906ea418c883c2c2eef33baf9508a1aa696082e71`。Vite产物JS `index-rmei_GfS.js`662.68kB/gzip162.26kB，CSS `index-Cogy-3Ko.css`20.93kB，index.html1.00kB；保留既有>500kB chunk提示，构建成功。结构化结果见 [build.json](fullstack-v5-build.json)，远端build-web-v5.log保留私有目录。

旧v3/v4标签和证据未覆盖、原compose.test.json未改。末次ps确认原api/db/migrate/proxy仍全部Exited(0)，没有激活v5配置或启动服务。私有prepare-compose-v5.py与本机严格CA/IP/currentSPKI smoke入口仍只是待执行准备，见 [v5计划](fullstack-v5-plan.md)。源码后续若因订单独验发现真bug再变，则此候选需重核/构建；不得用此build成功代替最新业务smoke、前端全验或生产发布。
