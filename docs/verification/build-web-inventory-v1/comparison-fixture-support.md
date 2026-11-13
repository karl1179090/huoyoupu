# 12.8 独立跨期比较夹具支持

2026-11-12。仅后端test/support与一个定向测试；未改生产App/API/契约、前端源码/测试/配置/锁，未访问或修改当前dev数据库、API97364、PG42535、Vite5173或Mini。最初“HTTP确认后pin日期”的设想已放弃：ledger不可变，不能只改confirmed_at造成业务日错配；最终不执行日期UPDATE、trigger/FK bypass或生产历史时间后门。

## 给 C5 的最小接口

后端模块：`apps/api/test/support/comparison-report-fixture.ts`，导出：

```ts
createComparisonReportFixture({
  frontendOrigin: string,
  timers: Pick<TestContext['mock']['timers'], 'enable' | 'setTime' | 'reset'>,
  pgBin?: string
})
```

在Node测试before中、**browser.launch之前**调用，timers传该hook/test的`t.mock.timers`；setup串行，不与其它mock Date或浏览器并行。函数返回前必恢复Date，不让Playwright在冻结时钟下运行。`frontendOrigin`传实际前端origin（例如http://localhost:5173），只支持loopback测试origin；不修改Secure/__Host/SameSite Cookie、Origin或CSRF。

返回值：

- `apiOrigin`：独立Fastify真实HTTP服务的动态127.0.0.1端口，不是3000；前端生产页面仍从原Vite打开。
- `admin: {loginName,password}`：仅内存随机虚构登录参数；不要console.log/JSON序列化整个fixture，也不要放argv、仓库或报告。
- `namespace`、`product`（一个独立基础SKU）、`warehouse`、`customers.decline/zero/new`、`orders`（5个真实orderId/revisionId/customerId/confirmedAt/quantityBase）。用真实customerId定位对应行，不按随机排序位置猜。
- `query`：完整合法`customer_product_comparison`请求；`period`：本/基期四个规范化ISO端点；`expected`：三客户的数量/百分比/trend断言目标（不是伪ReportRun rows）。
- `assertSeedUnchanged()`：只读比较seed后全部业务表行数与内容指纹，排认证sessions与允许新增的report_runs；可在真实报表翻页后调用，验证库存/ledger/accounts/audit等未变。
- `close()`：幂等，只关闭本fixture HTTP、随机DB及独有私有PG cluster，删除自己的临时目录。after中先结束使用它的浏览器context，再await close；不停止dev/Vite/其它库。

C5从`apps/web/test/*.ts`可导入`../../api/test/support/comparison-report-fixture.js`。运行使用现有tsx，并带`--conditions=development --test-concurrency=1`；示例验证本helper的命令见下文。此文不代写前端测试或新框架。

## 真正隔离与日期

helper自己建立`/tmp/huoyoupu-report-fixture-*`（0700）私有PG18 cluster，仅唯一Unix socket、无TCP监听；显式adminUrl只连它并用既有createTestDatabase创建随机库。**不读取DATABASE_URL、TEST_DATABASE_URL或dev credentials/config**，不向caller返回DB连接/密码；root已将最初读取dev邻近配置方案替换成独立server方案，因此没有连接串传递需求。PG_BIN不隐式取环境；需要非默认二进制位置时显式传pgBin。临时PG使用与既有test runner一致的-F，属于测试性能配置，不是持久性/生产备份验收。

先在真实时间完成admin认证、资料和50瓶/成本50元库存setup，再用node:test Date mock包正常HTTP的create/confirm；不改服务器业务规则。避免在过去时刻登录而生成已被PostgreSQL now()认定过期的会话。5笔确认：下降客户基期6+4两单、零购客户基期3、本期下降4、新增2，总下单19瓶；不打折、不退货、不退款。

默认两期是最近两个**已完整结束的上海自然日**：current为昨天00:00→今天00:00，baseline为前天00:00→昨天00:00；每期确认时钟为上海12:00，避免凌晨执行把确认时点造到未来。订单confirmed_at和ledger.effective_at由同一正常confirm自然写入；revision/库存/审计recorded_at仍是真实登记时刻，不伪造历史登记、旧ReportRun、rows或cursor。

报表读取事实为`reporting/sources.ts`：当前商业revision提供数量/金额，销售按sales_orders.confirmed_at归期；ledger按effective_at归业务日。保持两者一致，无日期pin字段或SQL后门。

## 浏览器如何只使用这一个 fixture

C5仅在自己的独立browser context中，将页面`/api/v1/**`请求通过route.fetch发到`fixture.apiOrigin`的同path/query，保留实际method、POST body、headers、Cookie、Origin、CSRF及真实response/Set-Cookie。所有响应来自正常真实PG+API；不修改DTO/rows/id/opaque cursor或造报告内容，不将请求发送给共享dev API。页面资源仍来自实际Vite。此隔离代理是测试传输fixture，不冒称当前dev/生产数据，不改production proxy/global配置。

正常页面重新登录`fixture.admin`。选择比较报表、custom，按`fixture.period`转换上海date输入（不能UTC substring），选本fixture客户/商品，关闭decreasesOnly与最小下降过滤；正常HTTP POST `fixture.query`。如要三行固定分页，只改真实GET/POST的limit=1并原样透传真实响应，按既有recipe明示受控页大小；每次后续GET保持同run.id及原opaque cursor，不POST新run翻页，sources独立cursor。

真实结果期望：下降10→4、change=-6/percent=-60.00/trend=decreased；零购3→0、percent=-100.00；新增0→2、percent=null/trend=new。expected只是断言，真正表格必须消费API响应，不能把expected塞给页面。

## 已实际执行

- `npm run typecheck -w @huoyoupu/api`：exit0，含helper和新test严格类型。
- `node --conditions=development --import tsx --test apps/api/test/comparison-report-fixture.db.test.ts`：**1/1 pass、fail0/skip0、exit0**。直接测试自身隔离cluster，不使用外层TEST_DATABASE_URL或共享dev库。
- 真实HTTP确认5单；三行取真实ReportResult并沿同run limit1逐页读取，id/asOf/sourceWatermark固定。5个sources精确对应5个真实确认revision；订单confirmedAt与ledger.effectiveAt逐一相等。
- 库存实际余31瓶/成本31元；三客户应收28/6/4元，合计38元；报表/分页读取后全业务指纹不变，含审计和财务内容。Date已恢复；close后自身health不可达。没有运行旧27/37/107全套、业务库日期改写或服务重启。

这仅使12.8独立前端补证具备后端真实fixture，不声称C5页面/浏览器已执行或真实期初已确定。14.4期初仍待；安卓/针式241×93物理设备边界不变。
