# C5 三行分页独立事实核对

2026-11-12。CodeGraph未索引当前reporting实际文件，随后直接核route/service与C5候选测试；只用comparison-report-fixture自己的随机PG+动态HTTP server，未调用dev、Mini、Vite或浏览器，未改前端和生产后端。

## 实际结果

`node --conditions=development --import tsx --test apps/api/test/comparison-report-fixture.db.test.ts`：1/1 pass、fail0、exit0，总2074.06ms；已正常close自己的HTTP/随机DB/私有cluster。API typecheck最终exit0。测试诊断只含虚构customer IDs、真实opaque cursor与快照元数据，不含凭据。

原始实际每页URL/客户/nextCursor/id/asOf/sourceWatermark见 [report-three-pages.json](report-three-pages.json)。没有解码后重造任何cursor；下一请求直接使用上一响应nextCursor并encodeURIComponent。

本次精确复现C5受控模式：

1. POST `/reports/query` 发送fixture.query（不带limit），真实响应3行、nextCursor=null，normalizedQuery.limit=50。
2. GET `/report-runs/{该id}?limit=1`：1行，customerId=11646428-a5cf-4533-928d-ff25ec0e9f52，nextCursor非空。
3. GET同id、`limit=1&cursor={第2步响应原nextCursor}`：1行，customerId=dcb94b9a-cee2-4f18-90db-8c6a8a7a7792，nextCursor仍非空。
4. GET同id、`limit=1&cursor={第3步响应原nextCursor}`：1行，customerId=e4d868a2-158b-4cf5-ac4b-305a7a0567f4，nextCursor=null。

三页id均1d485f76-e72a-496d-9f70-c98f31849340，asOf均2026-11-11T19:42:56.129Z，sourceWatermark均c2eeafad14624455567794af87f05ff1c43dd079cd98f072fb594e5e3560079a。真实URL请求limit均1，三customerId互不重复且正好覆盖fixture三客户。报告读取后原有金额/库存/audit等业务表指纹仍不变，三类10→4/3→0/0→2语义照常通过。

## 真实参数与DTO

- `reporting/index.ts`将GET query.limit的数字字符串转Number，经getReportRun请求契约校验后把cursor/limit交service。
- `reporting/service.ts`优先显式GET limit，缺省才用snapshot.normalized_query.limit；分页以原cursor内部的合法offset读取slice并提供下一个原生opaque cursor。
- **ReportResult没有独立page.limit字段。** normalizedQuery是创建该run时的查询，GET limit1不会改写它，故上述三页的normalizedQuery.limit仍50完全合法。不要用该字段判定GET实际页大小；核URL及实际rows.length。
- 正确消费只是固定id，带上一页返回的原opaque cursor和所需limit；不自行改变cursor内容。rows/sources游标不同view，不能互用。

## C5唯一确定不匹配

`apps/web/test/report-comparison-browser.test.ts:262` 当前断言`capturedRunPages[1].body.nextCursor === null`，消息是“Second page of a 3-row run is the last page”。三行、每页1行时此断言错误：第1、2页均应非空且不相同，第3页才null；第1页与后2次GET共三页。它会在真实正确响应上失败，不应改后端分页迎合。

当前代理源码把原path/search转向fixture server并显式limit1，这个请求模式已被上述直接HTTP精确复现为正确三页；本次没有证据证明代理参数本身错误，也不能采信“首cursor解码offset2”的作者自述作为backend bug。若修断言后仍有差异，应保留每个实际原请求URL/转发URL与原响应的客户ID/nextCursor，按本证据逐页核对是否捕获了别的run或重复页；不得通过造cursor、改rows、吞掉错误或放宽三客户不重复断言求绿。

本轮仅增强后端定向测试的逐页断言及脱敏诊断（包含与C5一致的POST默认limit→GET limit1模式）。类型检查初次因cursor可空推断报错，补明确本地类型后exit0，不影响已实际执行的请求与数据；没有生产代码/契约变更。
