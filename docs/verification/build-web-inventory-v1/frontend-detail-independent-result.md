# Detail移动布局与上海时间最终独立复验

2026-11-12，唯一前端owner停写后独立运行。没有修改前端源码/测试，没有重跑B/C/D/报表/旧PDF/系统打印，也没有为旧A启动devAPI。60文件冻结及结束无漂移见frontend-detail-final-baseline.json。

| 检查 | 实际结果 |
| --- | --- |
| `npm run typecheck:web` | exit0；frontend-detail-typecheck.log |
| `npm run build:web` | exit0；frontend-detail-build.log |
| 真机有限Detail/历史/应用打印 | SM-G981N / Android13 / Chrome157，真实360×718 DPR3；通过下列已执行分支 |
| 桌面同单及employee只读 | 独立Edge1280×900；通过下列已执行分支 |
| 现有neworder完整文件 | exit0，7pass/0fail/0skip/0cancel，22.52秒；1准备+6完整业务，frontend-detail-order-regression.log |

## 真机布局与业务入口

重新启用本轮Vite5173、独立PG随机DB API及19373临时反代/reverse，新建Chrome独立context；静态来自真实前端、API仅独立factory。没有访问用户其它tab/现有Cookie、共享dev数据。手机曾Dozing但keyguard未锁，使用正常WAKEUP显示，未绕解锁。临时登录动作等待曾被停止后重试，是本轮协调脚本时序，不当产品失败；后续实际进入新确认单再采证。

同类长UUID真实单号XS49289CCEACE44432BDDDE9AD1140616A已完整换行，状态/版本徽标完整；root和body clientWidth/scrollWidth均360。五个管理员动作实际rect：更正x24..125.88、退货133.88..213.77、配送221.77..336、作废24..163.92、打印171.92..336，均在屏内。可用按钮几何与真实打印/历史点击结合证明入口可达，不冒称每个写动作都再次提交。表格自身overflow-x:auto、clientWidth310/scrollWidth850，允许局部横滚。

computed body overflowX仍hidden（原全局样式），不能只靠根宽度断言通过；本次另核标题/五按钮rect并actual view净图，确实全文可断行/操作换两行，而非把旧超宽按钮裁掉。table超宽保留在自身auto容器内。本轮未逐列横拖核所有单元格，不冒完整表格所有数据交互。

真实点击“版本历史”并进入非current草稿v1快照，DOM出现历史只读说明，动作仅“返回当前生效版本(v2)”及“打印配送单”，没有更正/退货/配送/作废；实际点击打印到应用预览，显示历史订单重打(v1)。未再次调用window.print/出纸，沿用之前系统服务证据。

## 时间对应与桌面权限

真实order API createdAt=`2026-11-12T07:05:35.797Z`，手机创建显示`2026-11-12 15:05:35`；版本v1.createdAt同前者、v2.createdAt=`2026-11-12T07:05:35.804Z`，版本列表与历史更新时间均显示上海15:05:35。没有SQL改时间或伪造字段。

跨UTC日期边界仅最小隔离调用生产formatShanghaiDate/formatShanghaiInstant：输入`2026-10-31T16:00:00Z`→`2026-11-01`及`2026-11-01 00:00:00`，实际assert通过，见frontend-detail-time-boundary.log。初次临时调用误写.ts扩展名未找到模块，修正实际.tsx后该调用通过，不把工具路径错误当源失败。没有为跨日造新配送/退货业务；退货confirmedAt/配送日期的页面路径本轮未再写业务核验，源码调用复用由独立源审记录，不能补称本轮实际发生。

桌面1280同确认单root scrollWidth1280，标题/全部动作及table正常，已actual view。另正常API在本独立库创建虚构employee、全新context真实登录同单，动作仅“打印配送单”，DOM无核算成本/毛利；实际点击应用预览可达。记录请求只有auth/session/login、orders本单、revisions、print-data、print-jobs，无商品/客户/库存/模板管理GET。本轮没有降低权限、stub授权或用管理员数据替employee。两desktop context均已关。

## 回归及产物

现有neworder全7完整经过金额规范化/非法金额禁用、联合缺货、create及confirm丢响应同key同body/记账一次、编辑意图换key、迁客户新地址/原现金不迁及400/350有效报价真确认、未配送UI作废、真实外部revision→旧UI409→刷新GET/新版quote→新key/expectedVersion提交201/精确Detail及历史。没有if跳过、没有只测helper冒页面，原始TAP日志保留。

[detail-final产物目录](../../ui/build-web-inventory-v1/implementation/detail-final/)含真机current/版本列表/历史只读/历史打印应用图、桌面admin/employee图，phone-results.json保存真实order/revisions/layout/显示文本，desktop-results.json保存实际权限与请求路径。manifest.json记录各文件hash/设备/视口；不含密码/cookie/token。已actual view真机current与readonly、桌面admin与employee四张图，没用旧图代修后结果。历史只读图所截位置偏下，不冒整页全貌；current图明确能见完整长号与所有动作。

原android-real报告的Detail裁切与创建UTC错误为历史失败，本轮上述路径已关闭；真实开单/系统打印/empty8页结果复用不重跑、不冒物理纸面/最终视觉接受。自有phone context、19222 forward/19373 reverse及独立fixture已清理；最后neworder独立fixture也由其finally清理。当前无browser/API写进程；本轮Vite供协调者备用，未动旧dev/Mini。没有改任务checkbox。
