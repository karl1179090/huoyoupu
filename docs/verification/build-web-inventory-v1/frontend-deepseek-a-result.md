# DeepSeek阶段A独立验证与两条有限GUI补验

2026-11-12。外部CLI阶段A明确停写后，验收子代理固定[src/A tests/config 52文件](frontend-deepseek-a-baseline.json)，独占执行。B/D/C随后仅改其test/NOTES，无production/HMR或runtime。所有结果是本代理实际运行，不引用作者claim；未写前端/前端测试/checkbox。结束基线52文件无漂移。GUI完成后已正式交还root，Edge admin空开单0行、未选客户、无弹窗，DevTools关闭。

## 独立命令结果

| 根目录实际命令 | exit / 结果 |
| --- | --- |
| `npm run typecheck:web` | 0；[日志](frontend-deepseek-a-typecheck.log) |
| `npm run build:web` | 0；JS659.81kB/gzip160.49、CSS20.93kB，仅chunk warning；[日志](frontend-deepseek-a-build.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/agent-a-workflow.test.ts apps/web/test/batch-session-regression.test.ts` | 0；33pass/15suites/0skip；[日志](frontend-deepseek-a-pure.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/agent-a-e2e-regression.test.ts` | **1；5pass/2fail/0skip，7项**；[日志](frontend-deepseek-a-e2e.log) |

类型、构建、pure完成即通知协调者，不以门槛通过代替页面验收。A页面旧employee403/0管理请求、CSRF无刷新换号、setup/旧test2/teardown过。新test4越过旧选客错误后，在:657等陈旧标题“批量选品工作台”30秒超时；生产BatchProductPicker:252是“批量选品与配置”。test5保护6.00/余量18.00的异步等待已越过，到:899填`input[placeholder*="沿用原价"]`strict violation，desktop及隐藏mobile各匹配一个。两项均是精确测试locator问题，不判生产金额错误；后续footer几何/提交/双端截图尚未执行，不补写通过。

新pure25真正import生产`orderEditLogic.buildLineChanges`，OrderEditPage:308也真实调用该helper；覆盖未变derived无set、改其它行不误送derived、数量/单位/显式价格编辑的字段省略、首次退后剩余+已退总量转换。33项中的这个回归本身仍只是状态→payload，下面真实GUI分价链另外补其业务证据。

## 12.2 GUI：补录实际时间与成本

仅通过Computer Use / node_repl + @oai/sky操作Edge，无console/CDP/Playwright替代。API仅准备新独立仓/商品、最后GET；采购入库/盘点确认/重建均真实页面操作。fixture及会话只保仓库外0600文件`/tmp/huoyoupu-gui-stock-fixture.json`，没有输出密码/cookie或保存其它标签截图。

- 新独立仓与商品（命名尾号1794415988539，基础瓶）通过后台setup，未动DEMO/其它资料。
- GUI采购入库选择该仓/商品，数量10，成本明确`2.125000`，供应商凭据为独立补录描述；日期原生控件用键盘设实际`2026-11-11 10:30`，确认前AX核准确，再点击确认入库。
- GUI原批显示数量10、每瓶2.125000、成本21.25；实际入库`2026-11-11 10:30:00`与系统登记`2026-11-12 00:55:46`分列正确。最终GET同样receivedAt=11日10:30+08、recordedAt=12日00:55:46.578116+08。
- GUI建立快照`d2010dcc-62f9-4e76-8d0e-5d6a5c8f6b0d`，只含该批10。再GUI采购同仓同商品2瓶/同成本，形成新批2、成本4.25。原快照原10无差异确认成功，总库存仍10+2=12/成本25.50。

这里纠正此前验收清单假设：新增未入快照的独立batch不必然stale。有batchId盘点按该batch.version校验，delta inventory-batches:67–69要求盘点使用的快照被销售改变才拒绝。旧批不变、无差异过账且新批完整保留是正确行为，不记生产缺陷，不修改spec迎合旧清单。

## 正确stale与页面重建

1. GUI再建快照`8475d218-1a15-4a65-9dd0-82370e8ad3bf`，两行账面分别新批2/原批10。
2. 后台只作隔离fixture setup：独立订单手动指定原10瓶批次销售1瓶，明确原批版本/数量被改变；没有用HTTP代办盘点确认。
3. GUI仍保持快照2/10，点击“确认盘点并过账”，实际显示“盘点快照已过期(STOCKTAKE_STALE)”，禁止旧快照覆盖；暂存/确认及实盘输入均disabled。未抓该请求HTTP码，不把页面错误冒称已抓409。
4. 点击页面“重新发起新建快照”，modal预选正确独立仓，再点生成。新快照`e7a8f2fd-0452-468c-ae6a-bd242a097d40`两行最新账面2/9，未继续确认制造损益。
5. 最终只读GET：旧stale与新快照均draft；原批9成本19.12、新批2成本4.25，合计11/23.37。原入库10×2.125=21.25，销售1承接2.13后余19.12；没有旧实盘把原批改回10。私有最终结果`/tmp/huoyoupu-gui-stock-stale-final.json`。

## 1分钱derived原价继承：真实GUI与原生Network

setup单独客户/商品/仓（不关联上述DEMO或别组fixture），2瓶×0.005000=0.01；退1瓶信用0.01，再准备后续derived1瓶净0.00及readonly历史1瓶净0.01。后台setup数据及初态在0600私有`/tmp/huoyoupu-gui-cent-fixture.json`。

实际GUI订单`19cf9d67-bc31-4408-ac43-3a6fc23523fe`→更正改单：页面显示保护历史段0.01，derived余量1与显示价0.005000，整体总0.01。只输入新的变更原因“独立分价GUI仅改头部原因，保持未退1瓶净0原定价依据”，不触数量、单位或价格，等待quote后点击确认。

为核实际业务请求，使用原生DevTools **Network UI**记录并选POST revisions的201行→“负载”，没有用console或私有浏览器API。实际请求文本为：

```json
{
  "expectedVersion": 4,
  "reason": "独立分价GUI仅改头部原因，保持未退1瓶净0原定价依据",
  "lineChanges": [],
  "discountAmount": "0.00",
  "roundOffAmount": "0.00",
  "remark": "fixture仅先分保护历史段"
}
```

同一真实请求另含原客户与原配送快照；此处只记录必要业务字段，不记录Cookie/CSRF。Network实际201，`lineChanges:[]`直接证明没有重新set derived展示单价或单位，不只靠helper静态推算。没有导出HAR、没有新增净截图，以上为本轮实际AX读取的业务负载文本证据。

GUI回详情显示修订v4、derived1净0.00与历史1净0.01；最终只读GET再次核derived=0.00/历史=0.01/累计退货信用=0.01，没有因为只改原因重新把余量舍成1分。私有最终GET`/tmp/huoyoupu-gui-cent-final.json`。这条限定生产链实测关闭原价继承风险的所测路径；其它单位切换/所有手动批次/跨行组合仍按其测试边界，不扩为全部数学场景已验。

## 边界与后续

没有重跑旧C PDF/后端全套/规模或设备GUI。手机只继承浏览器400仿真，不是真安卓；实物打印、最终视觉、期初等仍待。A新footer的本轮真实分支未到，因此没有新增footer通过图。下一步等外部CLI明确停写且A两locator修正，再仅A E2E→B→D→C逐文件一次串行；本代理不代写前端测试，也不再扩GUI。

## 12.2最后唯一补验：手选不足→补足→真实quote恢复

2026-11-12约01:06–01:10，仅Computer Use/Sky真实Edge操作，production冻结；未运行其它browser或写前端。复用本轮独立商品`feebe92f-9d8c-4e25-a8a8-76bae3164c44`、仓`664323a2-d17c-4c89-915a-740f1106fb51`，两个原批现有余量9和2，选择既有独立验收客户有效默认地址。没有HTTP代替选品业务。

1. 空开单→选客户/地址→批量选品检索独立商品，添加一行，切独立仓、基础瓶、数量3、单价5.000000。
2. 切“手动指定批次”，只给原批`26d6c42d-bf27-403b-aeae-ccb10d141ccc`分1。AX实际显示“手动批次分配不足（需分配3，当前1）”“还需补选2基础单位”；“确认加入订单”disabled。没有静默补自动批次。
3. 给另一批`15d41fba-1325-4ce4-ab2c-c4fa05e79900`补2。AX不足错误和还需补选提示消失，已分配3，确认加入恢复enabled。
4. 打开原生DevTools Network记录，再回页面点确认加入。页面一行3瓶、小计/应付15.00、成本6.37、毛利8.63，“保存为草稿”“确认销售订单”均enabled。不是仅modal局部校验通过。
5. 原生Network实际POST `/api/v1/orders/quote` **200 OK**，点击负载“查看源”核请求manual+batchSelections为1和2；点击响应并用原生编辑器End显示完整末尾，核真实服务端两段allocation。未使用console/CDP、未导出包含cookie的HAR。

实际请求关键字段（虚构资料；不是从接口另行构造的替代请求）：

```json
{
  "clientLineId": "line-ji4rpez",
  "productId": "feebe92f-9d8c-4e25-a8a8-76bae3164c44",
  "warehouseId": "664323a2-d17c-4c89-915a-740f1106fb51",
  "unitId": "90fa210a-d0d1-4606-8ae0-d816f3f2a2de",
  "quantity": 3,
  "unitPrice": "5.000000",
  "allocationMode": "manual",
  "batchSelections": [
    {"batchId":"26d6c42d-bf27-403b-aeae-ccb10d141ccc","quantityBase":1},
    {"batchId":"15d41fba-1325-4ce4-ab2c-c4fa05e79900","quantityBase":2}
  ]
}
```

实际响应：calculation.totalAmount15.00/costAmount6.37/grossProfit8.63；line.quantityBase3；allocations分别原批1成本2.12、另一批2成本4.25（合计3/6.37）；warnings=[]、stockReserved=false，asOf=`2026-11-11T17:09:12.798Z`。原批经过前次销售分成本尾差后现余成本19.12，因此不是将3×原成本展示价先算6.375再强改6.38；严格沿后端实际分摊6.37。

没有点击保存或确认销售，没有扣库或新增订单。关闭DevTools后真实刷新丢弃未保存表单，核admin空0行/未选客户/无弹窗，已明确交还GUI并通知协调者与contracts。没有新增净截图，此处是实际屏幕AX与原生Network业务请求/响应文字证据，不冒称实体手机/所有竞态或全部手选组合已验。本轮不再扩其它GUI。
