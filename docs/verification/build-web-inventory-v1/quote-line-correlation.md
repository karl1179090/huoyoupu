# 单改报价行关联 metadata 修补

2026-11-11。CodeGraph当前未索引到sales实际文件，随后读取真实源码确认：splitReturned虽给余量设置quoteSourceLineId，但set的两个分支重新prepareLine后丢失该字段；无退set也丢rowId，所以CalculatedLine.sourceLineId返回null。金额/库存计算本来正确，缺的是已有公开字段的稳定关联。

修复仅在`apps/api/src/modules/sales/revisions.ts`的next分支补`next.quoteSourceLineId=target.original.dto.id`。不改rowId、dto.id、临时clientLineId、金额分摊、库存来源或版本写语义，不新增schema/API/迁移。该内存字段只由calculation投影读取，persistRevision仍只存原dto/input。

关联保证：已有当前原行用sourceLineId+readOnly，空修改/无退set/退后set均一致；同商品不同原行不串。新add原样返回请求clientLineId，sourceLineId=null/readOnly=false，用请求键关联，不依赖随机derived ID。保存后须刷新当前订单/行ID，不能跨版本硬用原source。完整recipe已更新docs/frontend-contract-recipes.md，保留原有单位/pricingBasis输入说明。

真实PG样例（由新回归的真实HTTP响应断言抽取，P代表本次真实原lineId，非新增字段或伪持久化ID）：

| 场景 | sourceLineId | readOnly | quantityBase | netAmount | costAmount |
| --- | --- | --- | --- | --- | --- |
| 原1件12瓶/24元，首次退3后空报价保护段 | P | true | 3 | 6.00 | 3.00 |
| 同次空报价余量 | P | false | 9 | 18.00 | 9.00 |
| set基础单位quantity12/unitPrice3后的保护段 | P | true | 3 | 6.00 | 3.00 |
| 同次set后的余量 | P | false | 9 | 27.00 | 9.00 |

回归还同时保留第二条相同商品行S，set后只用S关联2瓶/10元；新add相同商品用`clientLineId:'new-same-product'`关联1瓶/7元且sourceLineId=null，全部行合计50元/成本15元。报价字段没有quantity/unitPrice/unitName/multiplierBase/kind；UI仅用unitId/quantityBase及Product.units显示基础数量，未明确改价时省unitPrice保原pricingBasis，不前端除单价重估。

## 实际检查

- 新`apps/api/test/sales-quote-correlation.db.test.ts`修前真实复现：无退set、退后set两子场景均缺source；空修改3+9分段通过。修后均通过。
- `TMPDIR=/tmp npm run test:db -- apps/api/test/sales-quote-correlation.db.test.ts apps/api/test/sales.db.test.ts apps/api/test/sales-independent.db.test.ts apps/api/test/sales-discount-acceptance.db.test.ts`：27/27、fail0/skip0、exit0，6.24秒。独立临时PG，不用共享dev库。每次报价前后对public全部BASE TABLE（仅排认证session）行数和排序JSON内容digest逐表核对不变，含订单、revision、来源/返库、库存、账务、operations及审计；无报价写入/预留库存/新持久化ID。
- `npm run typecheck -w @huoyoupu/api`：exit0（含新增测试严格TS）。
- `npm run build:backend`：contracts/money/database/api构建均exit0。

未重复无关安全/规模/备份/部署全套，未改前端、依赖、契约或tasks checkbox；Mini后续待稳定前端再统一最小双镜像复验。共享开发API初次真实只读探针确认普通node未热加载：set报价sourceLineId=null。经协调者授权完成保库重载，现运行服务已实际验证新sourceMatched=true，细节如下。


## 当前开发 API 已实际加载修补

原PID42513经ps精确核为`node --conditions=development --import tsx scripts/dev-api.ts`，该脚本正常退出finally会DROP随机库/停PG，不能直接SIGTERM重跑。协调者明确授权只对该单PID SIGKILL跳过清库，未kill进程组/PG/Vite。执行前无3000已建立业务连接、DB活跃业务查询/事务计数0；46张非sessions BASE表已记录行数与内容digest，PG PID42535及数据库启动身份私下记录，目录0700/凭据0600。

只替换Node后，原PG仍存在且3000释放；以仓库外私有`/tmp/huoyoupu-dev-mTw6IP/resume-api.mts`重新createApp连接原socket/database，同PUBLIC_ORIGIN `http://localhost:5173`，无迁移/seed/新签名secret（原createApp也仅pool+origin）。新API PID97364，统一运行session54131；私有resume入口SIGTERM/SIGINT只close app/pool，不drop库、停PG或删目录。后续常规停止仅终止此新API进程即可，不要误用旧dev-api清理器。

实际后验：health成功、PG进程和数据库身份未变、46表指纹完全一致；重载前保存的opaque会话仍识别同user，使用GET/session合法刷新后的CSRF，原确认行的真实set报价返回sourceLineId `40397966-e208-4dd7-9a76-2d2fa292bac5`、readOnly=false、quantityBase12，sourceMatched=true。该探针只有GET/quote及本次认证登录退出，不创建业务数据；最后quote后业务指纹仍全一致。Cookie、CSRF、密码及连接URL未输出/入仓库，原私有凭据文件不变。API保持在线供A联调，未动Vite/PG/Mini。

探针先后纠正两处自身问题：JSON落盘使PG启动Date变字符串，统一序列化后比较；GET/session按现有设计轮换CSRF，后续quote应使用新返回token而不是保存的旧csrf，初次403来自探针沿用旧token。修正后后验全部通过，没有修改鉴权规则、重建secret或清库掩盖。前端真实拆段交互仍由A实施/独立验收，不以本次后端修补冒充完成。

## 非作者窄复核（contracts）

只读核对`revisions.ts`现有next分支、`quote.ts`公开投影及新增`sales-quote-correlation.db.test.ts`，与上述27/27及runtime报告一致：赋值位于两个set重建路径汇合处，仅补内存quoteSourceLineId，投影sourceLineId优先读取它；不改数量/成本、库存释放、持久化行ID或schema。新增真实HTTP/PG回归实际调用生产quote，逐项断言同商品不同原行、首次3+9预拆、set后3+9、重复报价及add请求clientLineId透明返回，并逐表比较非session内容摘要；不是测试复制算法自证。可确认现有行`sourceLineId+readOnly`及新增行`sourceLineId=null+clientLineId`关联保证，初始“尚未修复”已失效。

本代理未重跑测试/HTTP，27/27、type/build及开发服务sourceMatched=true是上文作者已执行证据，非本次新增运行；未读取私密凭据。客户端CalculatedLine仍不含unitPrice/quantity等字段，原价继承与整数基础余量口径不变。实际前端首退改单P1由A20修复/后续独立执行，不能以此后端通过代替。


后续Mini实际容器也已包含该修补并真实HTTPS set quote核sourceMatched=true，46非sessions表指纹不变；详见 [全栈报告v3末节](fullstack-container.md)。这是后端关联与部署证据，未修复前端A20 derived继承P1。
