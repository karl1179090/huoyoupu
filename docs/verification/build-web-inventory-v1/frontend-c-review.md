# 前端 C 组最终生产源码有界复审

2026-11-11。范围仅 printing/reports/settings 的 R1–R6、来源 props、原 N1/N2 修复及金额展示；CodeGraph 未索引到本组真实符号，随后直接阅读当前源码。没有修改前端实现/测试，没有运行测试、类型检查、构建、GUI、NodeRepl 或 Mini。本报告是源码结论，不能代替冻结后浏览器/设备验收。

## 固定快照

11 份生产 TS/TSX/CSS 的两次 SHA256 全部一致，见 [哈希记录](frontend-c-precheck-hashes.json)，其中保留上一轮快照供比较。ReportsPage 当前为 `fa5d8f92cf0b9f69a91259fc25ef89bcc5ee8876a5973eea1b685a002f1df95f`，reportHelpers 为 `eee38fbf1689e0403556f918055fc5b57369b63b9d5f7baf812b5ec1044e4018`，AiReportPage 为 `fef62fa1e6905dfe52e4007451e9799db8c32493e295232adba68d607dc9a35f`。本轮只读时新的 deployment-browser-smoke.test.ts 和 DEPLOYMENT_SMOKE_NOTES.md 尚未落盘，不对其运行或安全性作验收结论。

## 最终源码矩阵

| 项目 | 当前结论 | 实际生产接线 / 边界 |
| --- | --- | --- |
| R1 非默认模板 currentVersion / 旧版选择 | 保持已关闭 | OrderPrintPreview:152–161 将选中模板 currentTemplateVersionId 或显式旧版 UUID 传 getPrintData；模板切换清旧版本状态，effect 含 selectedTemplateId。版本下拉/管理器回调传 v.id，不把数字 versionNo 当 UUID。静态接线不等于所有延迟切换时序已实测。 |
| R2 新问题 / 503 旧答案 | 保持已关闭 | handleAsk 清 result/reviewedReport/error，保存 submittedQuestion；主询问及澄清按 inquiryGen 拒旧响应，澄清固定原始问题/id。503 保留真实错误与普通报表 fallback，不造 answered。复核子请求也已由后续窄复验关闭，见文末。 |
| R3 主报表 / 行 / sources 代次 | 原已修项保持关闭 | Reports queryGen+paginationGen+prev.id 保护同 id 追加；sourcesReportId 固定打开时 run，独立 sourcesGen 保护分页；AI 主表分页检查当前 prev.report.id。“读取原始快照”子请求后续窄修亦已独立源码确认，见文末；真实延迟请求浏览器待统一验证。 |
| R4 initialQuery 可编辑 | 已修 | 初始 hydrate 后只执行一次 runExplicitQuery；kind 用户事件显式 buildQuery(newKind) 并清不适用过滤，后续表单执行使用当前状态，不持续锁回旧 initialQuery。 |
| R5 AI 合法夹具 / fallback | 保持已关闭 | [C3 独立产物](frontend-c-artifacts.md)已核 schema 合法、同 id 200、23 sources、503 无旧答案；明确为契约 UI mock，不是已连接真实供应商。本轮不将旧非法 custom / 长单总额夹具再报成生产缺陷。 |
| R6 完整实际条件 | 保持已关闭 | 报表和 AI 同时提供完整 normalizedQuery JSON，保留 filters/groupBy/阈值及本基期；上海时间展示与 asOf/watermark 存在。 |
| N1 初始 run 被隐式 POST 覆盖 | 本轮关闭 | ReportsPage:149–172 仅 mount 决策及 initialReportRunId 更新 effect；原 [kind] 自动查询 effect 已删除。指定 id 只调用 GET；hydrate setKind 不触发 POST。initialQuery 只走其显式初始化查询；用户点击查询或切 kind 才创建新 run。 |
| N2 上海本期 / 基期 / 时点回填 | 本轮关闭 | hydrateFormFromQuery:101–129 使用 isoToShanghaiDateInput/DateTimeInput，本期及 baselineStart/End 均回填；helpers 用 Asia/Shanghai formatToParts，合法 UTC ISO 不再 substring。例 2026-10-31T16:00Z 回填上海 2026-11-01。 |
| Reports.initialReportRunId / AI.onOpenReportRun | C 生产接线成立 | AI 明确传 result.report.id，父回调或内置 ReportsPage(initialReportRunId) 二选一；重新执行查询另用 onOpenReports(query)，不冒充同快照读取。A 的最终路由集成按 A 归属另验。 |
| Print initialRevisionId / initialTemplateVersionId | 保持已关闭 | optional UUID props 初始化/后续非空新值均消费；分别传 revisionId/templateVersionId。没有把 SourceRef.version 数字当 UUID。实际来源点击需整体集成验证。 |
| SourceRef / unknown href | C 接线成立；A 映射另验 | Reports/AI/SourcesModal 保留完整 SourceRef 回调，无父回调时保留元数据复制，符合 docs/frontend-source-navigation.md；未知路径不猜业务页。没有要求 C 越界改 App。 |
| 241×93 预设与分页 CSS | 源码几何合法；设备待验 | Manager 按钮真正调用 updatePaper(custom/landscape/241/93/margin5)，可打印 231×83mm；默认列宽和180mm、默认行高8mm，符合后端几何约束。getPageSizeRule 产生241mm 93mm；生产 @page 消费纸型/边距，thead 重复、tr 避免拆分，单元格内部消费 minRowHeight。预设不自动重排已有任意超宽列，仍需现有校验；真实 PDF/行高量测与针式出纸按独立证据另验。 |
| 手机 / PrintJob / 公司清空 / Users | 保持已关闭 | 手机 UA/视口识别传 mobile_web；三态为 user_confirmed/user_cancelled/client_error，经人工按钮更新，不用 afterprint 成功。Company 保存 expectedVersion，phone/address 明确发空字符串，Users Tab 存在；后端角色校验仍是权限边界。 |
| Money 展示精度 | 未发现本次担忧的具体缺陷 | reportHelpers.formatMoney 返回原字符串，表格金额原字符串插值；打印单价/净额/合计亦直接插值。两处 Number(grossProfit/netBalance) 只决定颜色，不用于显示金额或计算。未把合法 Money 经 Number/toFixed 格式化丢分，不报告假设性金额问题。 |

首轮已关闭的纸型/旧版/过滤/上海手工输入/公司清空等旧项继续关闭；本轮不因缺浏览器新证据重报为源码缺陷。

## 原 R3 最后分支：AI 原始快照复核隔离已关闭（源码窄复验）

2026-11-11 后续只读窄复核，未重查其他关闭项。AiReportPage SHA256 两次一致：`78a6e910adec891157c0c866cf4532fababba83871690e7a690be19730d3183f`；此值替代上方首轮最终快照中该文件的旧 hash，其他文件不在此次窄复核范围。

原 `handleReviewReportRun` 无隔离 P2 已修：当前117–153捕获 inquiryGen 和单独 reviewGen；success/catch/finally 均检查二者，旧响应不能写数据/错误或结束新请求的loading；成功还核 run.id===targetReportId。新提问及澄清提交均增加 reviewGen 并清复核表/错误/loading，切换普通报表或打开同run入口也使旧复核失效。575行渲染额外要求 reviewedReport.id===result.report.id，防止旧快照混到当前答案下。

因此关闭原“问题A复核GET延迟回流问题B”源码缺陷，生产源码本轮无保留项。真实 late GET 成功/失败响应的浏览器时序仍待统一运行，不能将本次静态守卫确认写成浏览器实测通过。没有执行测试、GUI、NodeRepl、Mini或API，没有修改前端实现/测试。

## 仍未执行的边界

C 新 browser smoke 入口正在独立施工，待其落盘、统一静态门槛与协调者冻结通知后另验。没有运行作者“33 绿”来冒充独验，也没有重复全局后端回归。C3 已独证的 mock 视觉产物保持其限定结论；新产物及真实构建 HTTPS 登录/深链由后续独立验收承担。安卓真机、电脑连接针式打印机的241×93mm物理走纸仍按 [设备计划](device-acceptance-plan.md) 待验，不能以 PDF 替代。

## 短纸修复后capture两断言窄复核（2026-11-11）

仅只读本次最后delta，没有运行tests/API/browser/capture、未改实现。OrderPrintPreview紧凑布局/上海转换的前次源码结论保持；**下面两处测试源码缺口现已关闭，短纸真实单页/金额字段/无裁与A4/A5兼容仍须acceptance实际执行及PDF独立核对。**

- 时间：capture在选择针打模板前建立真实print-data response等待，保存本次needlePrintData；断言期望来自effectivePrintData.order.confirmedAt→生产formatShanghaiInstant，比较完整上海日期时分秒，并在UTC秒数与本地秒数不同的情况下拒绝原UTC片段。已不把旧11:28:47强套同日最新订单；固定旧ISO的纯函数回归可保留，不与动态capture期望混同。
- 页数：getPdfPageCount确实读取本次PDF，先数`/Type /Page`对象，再读Pages/Count；两者均无法识别时assert.fail，**不再fallback 1**。针打两行短单exact1页断言不会因“解析不到”而默认通过。仍是此生成器PDF的脚本解析，不替代后续pdfplumber/渲染/文本检查。

固定测试入口SHA-256：`apps/web/test/printing-reports-capture.ts` = `bb74266447c2813f75810417652453fb9f3238ccfcade1d2fa21c891bcda05a2`。作者“35过”只属作者声明，本轮不采为实际执行结论；acceptance独占types/build/pure/A E2E/B browser/C capture，Mini另由foundation续验。
