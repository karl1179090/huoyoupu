# C3打印与AI产物非作者独立验收

2026-11-11。本轮读取PDF Skill，先CodeGraph未命中capture，再以实际落盘产物验收；C4初始props/241×93mm施工不参与本结论。没有GUI、全局checks、重启API、修改前端实现或测试；未重新运行capture。只增加本验收报告及固定快照/渲染/抽取结果。作者29测试声明未在本轮独立重跑。

**结论：A4/A5横尺寸、多页长名完整/表头重复/合计仅一次有真实PDF证据；120×180mm自定义PDF由仅改paper的未校验跨字段夹具生成并金额列裁切，不能作为合法模板的V1通过证据；不定性为生产合法模板缺陷。AI answered夹具合法性及真实report同ID可读已有实证，503图无旧回答；真实provider、澄清续答绑定和交互竞态仍未由这些图证明。** 12.7/13.3不据本产物验收整项勾选，14.2实物仍待验。

## 固定快照与工具

快照时间：2026-11-11T10:28:47.378946+08:00。文件复制到本代理独占的[c3-artifact-snapshot](c3-artifact-snapshot/manifest.json)，保留来源路径、mtime、bytes和SHA256，后续C4覆盖源文件不改变此结论。PDF源生成时间约10:20:41–44；capture源码快照mtime10:25:38，比PDF晚，故该脚本只能作为本次读取到的实现线索，不能靠mtime强称产物完全由该版本跑出。所有视觉/页型结论均直接检查固定PDF。

| 固定PDF | 源mtime（+08:00） | 字节 | SHA256 |
| --- | --- | --- | --- |
| order-print-output-a4.pdf | 2026-11-11T10:20:41.637630+08:00 | 306029 | `727968ee238afc777930d5f13cd15de603dff6e847249cd5c86a4e731b146405` |
| order-print-output-custom.pdf | 2026-11-11T10:20:44.493793+08:00 | 296117 | `6c943539fbcf1787d67350e9c21d10422749a77daabd17ec566a6799179b8e95` |
| order-print-output-a5-landscape.pdf | 2026-11-11T10:20:44.258470+08:00 | 306633 | `83e24ce15cdcc11ab47005e0b982b87513cc281cfddad1fb82d2e7df6bcf3a0c` |
| order-print-output-multipage.pdf | 2026-11-11T10:20:44.717777+08:00 | 362922 | `f5232707a7e7927485eaec45e819f07a90e62ac1631aaef3ce1661ac57d2deb7` |

实际用系统Poppler pdfinfo/pdftoppm及Codex bundled Python/pdfplumber测量与抽取；宿主默认Python缺pdfplumber，切bundled依赖后执行成功，无需安装。pdfplumber有FontBBox描述符警告，文本实际可提取；文字边界计数为0不代表布局无裁切，custom即为反例，所以逐页渲染检查。完整MediaBox/文本与边界统计：[pdf-inspection.json](c3-artifact-snapshot/pdf-inspection.json)，逐页txt及png同目录。

## 四PDF实际结果

| PDF | MediaBox（pt） / 约mm | 页数 | 真实检查结果 |
| --- | --- | --- | --- |
| a4 | 594.95996×841.91998 / 209.889×297.011 | 1 | 两商品短行完整，商品/仓/数量/单位/单价/金额六表头齐；两行各10.00，总额/应收20.00，合计一次，未见裁断 |
| a5-landscape | 594.95996×420 / 209.889×148.167 | 1 | 横向尺寸真实生效，六列与两行金额完整，合计一次，未见裁断 |
| custom | 340.07999×510 / 119.973×179.917 | 1 | 120×180纸型真实生效，但表格超过纸宽，右侧单价和金额列被裁掉；文本只剩前四表头及边缘¥。**夹具产物裁切，合法模板证据缺失** |
| multipage | 两页均594.95996×841.91998 / A4 | 2 | 第1页行1–14，第2页15–28；两页六表头齐，28个长名序号1–28及末尾“测试）”各完整一次，无跨页半行或视觉裁切；应收合计仅第2页一次。金额夹具一致性见下 |

已实际打开的独立渲染：[A4](c3-artifact-snapshot/huoyoupu-c3-a4-1.png)、[A5横](c3-artifact-snapshot/huoyoupu-c3-a5-1.png)、[custom](c3-artifact-snapshot/huoyoupu-c3-custom-1.png)、[长单第1页](c3-artifact-snapshot/huoyoupu-c3-multipage-1.png)、[第2页](c3-artifact-snapshot/huoyoupu-c3-multipage-2.png)。

### P2证据构造失败：custom只改paper，不能证明合法模板

固定custom图中，单价/金额标题及数字不在纸内；该结论来自真实PDF渲染与文本，不是CSS猜测。已核capture快照:254–260确为route.fetch旧PrintData后仅将config.paper改120×180、margin0，沿用旧columns再fulfill；没有服务端保存合法120×180模板、没有重新读取该模板版本PrintData，也未调用跨字段validatePrintConfig。后端printing/config.ts:11–18明确精确校验列宽总和+两侧margin不大于纸宽，否则422 PRINT_LAYOUT_INVALID。故这是绕过服务端合法性约束的跨字段夹具证据失败，**不能据裁切武断推导生产合法模板缺陷**；仅证明该被替换对象渲染时裁切及120×180 MediaBox生效。需要正式合法模板/相应列宽的真实PrintData，再导出PDF核完整列；不能声称现custom布局完整或全部V1通过。本轮不对C4正在改的源码作最终缺陷归因。

### P2证据缺口：长单金额夹具不自洽

capture用route.fulfill将order.lines替为28行、数量10–37、单价150.00、每行净额1500–5550，却保留真实短单header商品总额/应收20.00。固定PDF确实呈现这一矛盾：行金额合计**98,700.00**，末页总额20.00。因此它证明长名换行/分页/表头/合计出现次数，**不能证明长单账面金额对账正确**。这是构造夹具不一致，不能指控生产打印应该在前端重算header；正式金额仍须后端给出。应使用合法、自洽PrintData或真实长单再测，不以删除总额掩盖。

### C4/设备边界

本次custom是120×180，不是用户目标241×93mm。C4后续真实目标纸型尚未执行/未验；禁止将它混入本快照。上述浏览器PDF也不证明针式打印机进纸、驱动纸型、连续纸偏移、实物多页或安卓真机；14.2仍待实际设备。

## AI夹具、真实快照与503产物

### 已实际核实

1. capture当前源码明确先真实POST /reports/query、GET该report.id/sources，再以真实ReportResult/SourceRef组成candidateAiAnswer，**fulfill前调用生产parseSchema('AiResult',...)**；clarification同样parse。旧“answered缺normalizedQuery/watermark/period、非法证据”问题已在当前构造路径修正，不重报旧对象问题。脚本没有保存完整fixture JSON，故本代理补下面同ID只读复核。
2. 本代理没有再POST queryReport或写经营数据，仅以既有私有文件在脚本内部登录本机，再对answered图中**7fb7f162-cec2-4e68-9931-b7dd5e6d9892** GET report-runs及sources：均200，报告1行、来源23条、无下一页；重复GET同report逐字段相等。用其真实响应及capture同字段重组answered/clarification，再调生产parseSchema，二者均成功。认证有必要的session/login调用，凭据未打印、未写入报告；经营接口只有GET，不扰DEMO-C1。[脱敏回读记录](c3-artifact-snapshot/ai-live-readback.json)保留该虚构结果，含真实id/query/asOf/watermark/来源。
3. 已实际查看固定[answered图](c3-artifact-snapshot/ai-report-answered.png)：显示规范化条件、真实report.id、水印/期间与复核入口；此截图是被拦截AI answered夹具的UI，不是真实模型推理。
4. 已实际查看固定[503图](c3-artifact-snapshot/ai-report-503-fallback.png)：未配置模型错误与转固定报表按钮，下方无旧AI答案卡。capture也在unroute AI后发新问，并断言旧.ai-answer-card不存在。**该张失败态产物的旧答案污染已消除**；不能由静态图关闭所有并发旧答案回流。

### 未被产物证明的事项

- 澄清图为UI夹具，capture先填新问题取得clarification，随后改成另一个新问题拿answered，**没有点击choice或输入自由澄清后断言clarificationId/choiceId及绑定原问题**。parseSchema只证明JSON结构，不证明候选选择语义或真实provider。
- same report.id复核按钮脚本只检查模态文本含该ID，未断言浏览器GET响应与原report逐字段一致。本代理同ID GET复读证明服务端真实快照可复核，但不是页面事件/请求链独立验证；本次也未通过GUI点该按钮。
- answered summary固定写“重点客户订购量稳定、无异常退货集中风险”，sales_summary快照本身不足支撑这些客户/风险断言。这是UI mock文字，不是后端证据核对已接受的模型解释，不能用于证明AI业务叙述质量。
- 真实provider未配置；未验证真实自然语言识别、收费或外部账户，合法契约fixture不等价真实模型。后端ai-independent中合法统计/非法混合写、同数字反向解释降级等确定性边界证据继续有效，但不替代本轮页面续答。
- R1/R3源码与分页竞争、初始props/来源集成由C4稳定后contracts复审，本轮不在其写入期间做最终代码结论，也不运行其capture/新增前端测试或据截图关闭race。

## 后续最小补证

C owner提供合法列宽custom完整PDF及自洽长单对账；C4另留241×93 PDF的MediaBox/页数/全部行/表头/单次合计，实物另待设备。AI补真实组件的候选/自由澄清请求绑定断言、同id页面复核响应、旧页延迟→新查询先完成的隔离证据；真实provider具备后单列，不为UI夹具编造外部能力。所有问题回Gemini作者，Codex不改前端或测试。
