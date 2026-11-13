# 固定客户商品对比报表：独立页面与真实游标验证

2026-11-12。候选自然停写后，本代理固定原54文件+新报表test+后端fixture/helpertest共[57文件](frontend-report-comparison-baseline.json)，结束无漂移。不改production、前端测试或checkbox，未跑其它组/build/GUI。唯一runtime依次执行：

| 实际根目录命令 | 结果 |
| --- | --- |
| `npm run typecheck:web` | **exit0**；[日志](frontend-report-comparison-typecheck.log) |
| `node --conditions=development --import tsx --test --test-concurrency=1 apps/web/test/report-comparison-browser.test.ts` | **exit0，2pass/0fail/0skip/0cancel，4.5秒**；[日志](frontend-report-comparison-independent.log) |

准确计数是**1个隔离fixture准备case + 1个主UIcase**，不是2个独立经营场景。runtime结束/清理完成已立即通知协调者，随后只有文件归档/view，没有与下一作者自测并行。

## 真实事实来源与受控范围

新后端factory建立私有PG与动态HTTP fixture，注入客户/商品和两期真实交易，非生产数据、非现有共享DEMO/期初。浏览器仍渲染生产ReportsPage，route只将API通信转发至这个真实隔离服务，并为同一个真实report run把页长固定为1。

实际页面选择customer_product_comparison、自定义本期及基期和fixture SKU，真实POST report query；测试核UI发出的四个区间时点（Shanghai边界）与SKU filter，生产parseSchema核真实结果。首屏被转发为同一个run的真实GET `?limit=1`响应，后续cursor不伪造，仅页长仍强制1。这是受控三页可重复UI证据，**不代表生产默认页长、大数据量性能或真实业务规模**。

## 实际跑到的主UI断言

- 同run真实三行，metadata两期开始/结束与Shanghai时区相符，不仅展示预设label。
- 点击真实“加载更多”后按完整report id与原opaque cursor等待GET响应，DOM累积2行、3行，第三页nextCursor=null；客户各一次，无丢行或重复，完整覆盖三fixture客户。
- 下降客户本期4/基期10，差-6、API changePercent=-60.00、UI“下降/-60.00%”。
- 本期未购买客户0、基期3，UI明确“0(未购买)”、-100.00%/下降。
- 基期0/本期2客户trend=new、changePercent=null，UI“本期新增/—”，不显示0%或Infinity。该例是“空基期且本期新增”，没有以此声称所有both-zero/no_baseline分支独立验证。
- UI本/基期金额直接对照真实API各行值，不自行重算；同run第一页再次GET仍同id、首客户与原nextCursor一致。
- 当前生产页是append-only“加载更多”，没有上一页按钮。测试准确断言无上一页并另以真实同run GET重读首屏；**不是UI点击返回上一页已验证**。
- fixture.assertSeedUnchanged最后成功，受控业务/审计seed指纹不变；report自身快照生成是预期事实，不称查询绝对不落任何报表记录。

## 本轮新净图与真实可见边界

已复制并实际view：

- [desktop1280×800](../../ui/build-web-inventory-v1/latest-implementation/report-comparison-desktop.png)：真实3行都可见，新增null占位、下降、未购买及两期区间metadata同屏。右侧表格列较宽，截图不代表横向全部列同时可见；已运行的数字/金额断言另有DOM证据。
- [mobile390×844](../../ui/build-web-inventory-v1/latest-implementation/report-comparison-mobile-390.png)：真实页面净图，但当前只显示筛选表单与底导航，结果表在内部scroll视口外。脚本在改390后仅等待并截图，没有手机结果表操作/横向滚动断言，故**不称手机结果表已目验或交互通过**。

[产物manifest](../../ui/build-web-inventory-v1/latest-implementation/report-comparison-manifest.json)记录源path/mtime/sha256、CSS viewport/PNG像素并关联57文件source基线。没有编辑图或新写capture脚本，不用文件名补造截图内容。

本轮不冒真实容量/期初、真实安卓、生产发布或最终视觉接受；任务12.8完整原文结论由协调者另核。后续唯一order-write-flows作者runtime已可按协调者gate运行，本代理不追加测试或GUI。

## 390结果左右区域最终补验（2026-11-12后续独立运行）

候选停写后仅独立 `npm run typecheck:web` exit0，再运行 `node --conditions=development --import tsx --test --test-concurrency=1 apps/web/test/report-comparison-browser.test.ts` **exit0，2pass/0fail/0skip/0cancel，5.2秒**，仍为1准备+1主UI。日志frontend-report-mobile-{typecheck,independent}.log；frontend-report-mobile-baseline.json原57文件结束0漂移。下一order-write-flows新文件为另授权新增，不在本轮57冻结集合内；本轮runtime已结束，未与下一作者自测并跑。

本次新增实际分支查找结果表祖先overflow-y真实owner，通过生产表元素scrollIntoViewIfNeeded触发真实滚动，没有写CSS/transform/缩放居中或合成截图规避；再找到实际overflow-x容器，scrollLeft设到scrollWidth末端并确认scrollLeft真实增大。三客户行仍3，末行有真实bbox且位于844视口内；百分比/趋势单元格各自rect全部落在水平容器内，读取-60.00%、-100.00%、—与本期新增。实际owner/table/导航rect在执行中读取校验，但脚本未将具体数值输出或保存JSON，**本代理不伪造数值rect产物**；可复核运行源码断言和下面实际像素图。

同run短码与sourceWatermark仍原值，所有真实cursor及三页控制沿前文；手机resize/滚动后显式queryPostCount仍1，累计POST计数不增。末fixture业务/审计指纹保持，未用前端重算百分比、未造新报表来冒同run。

本代理已经view本轮3张图，复制本轮净图至latest-implementation并记录[新manifest](../../ui/build-web-inventory-v1/latest-implementation/report-comparison-mobile-manifest.json)（CSS视口、像素、mtime、SHA256、57文件基线）：

- [390表格左侧](../../ui/build-web-inventory-v1/latest-implementation/report-comparison-mobile-390.png)：实际看到同run19ae1654/水印、两期区间metadata、3行客户与商品列；三行均在固定底部导航之上完整可见，旧版“仅筛选表单”的图边界已由本次新结果补齐。
- [390表格右侧](../../ui/build-web-inventory-v1/latest-implementation/report-comparison-mobile-390-table-right.png)：实际三行的—/本期新增、-100%/下降、-60%/下降及本基期金额可见，真实水平滚到右侧，左边数量列部分裁切属于横向容器正常视窗，不冒称一屏显示所有列。
- [桌面同run三行](../../ui/build-web-inventory-v1/latest-implementation/report-comparison-desktop.png)：本次fixture新run与390图一致，三行/区间可见。

latest路径本轮已更新；前一manifest/前文“390只表单”保留的是历史哈希/历史运行限制，不再当当前图内容。两期/零购买/null与三页证据仍是隔离真实API fixture + controlled limit1，不代表默认页长、生产容量、正式期初或安卓真机。没有再追加GUI/运行其它组，也未改变任务checkbox。
