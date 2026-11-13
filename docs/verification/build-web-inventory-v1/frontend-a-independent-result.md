# A最终单文件独立验收与最新实现净图

2026-11-12。唯一A写者自然停止后，本代理先固定最终source/A/B/C/D/config[54文件哈希](frontend-a-final-baseline.json)，结束0漂移。没有改前端/测试/checkbox，不GUI、不重跑B/D/C/build/pure。实际执行：

| 根目录命令 | 实际结果 |
| --- | --- |
| `npm run typecheck:web` | exit0；[日志](frontend-a-final-typecheck.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/agent-a-e2e-regression.test.ts` | **exit0；7pass/0fail/0skip/0cancel，15.5秒**；[完整日志](frontend-a-independent-final.log) |

全部runtime已结束并通知协调者可开下一C5自测，未与作者runtime并跑。A旧权限/CSRF、资料客户切换等先前限定证据保持；本轮首退改单test5再次真实UI确认并GET核订单33/信用6/净余额27、保护3与可改9。

## Footer真实经过的分支

- **电脑1280×900 Create**：同一picker实际7商品、其中一个重复成独立行，总8行；非零真实quote230、两按钮visible/enabled。滚动实际AppLayout owner到末端，scrollTop423/clientHeight900/scrollHeight1323，atEnd=true；备注bottom720<bar749，无旧window滚错owner假失败。净图为实际填单，非空壳。
- **电脑Draft Detail**：独立4行草稿、金额200，顶部无重复确认、底部确认可见；通过真实handler点击确认并显示已确认。不是只看按钮。
- **电脑Edit**：独立4行已确认订单，顶部无重复确认、底栏取消/更正可见，等待有效quote，真实owner滚到底。变更原因field与bar bbox均非null并**无if跳过**地核不遮挡，图显示240有效报价。该分支未填写原因提交更正；实际更正提交由test5首退case覆盖。
- **400×750 Create**：同一会话6条配置，实际加入、非零quote145；bar(y605,h85) bottom690<nav700.5，owner1459/750/2209 atEnd；备注bottom577.5<bar605。没有静默if-null跳过导航几何。
- **400×750 Draft Detail**：独立4行草稿200，滚到末端、bar与唯一可见nav bbox必存在并核不遮，底部确认可见；本分支没有实际点确认，不误称手机确认提交已测。
- **400×750 Edit**：真实进入4行已确认单更正，滚owner末端，原因field/bar bbox必存在并核不遮；**截图当时quote仍loading/0.00、确认disabled**。这只证该时点布局/字段填单，不证手机有效quote/更正提交。不能把整文件7/7扩成这一未等条件。
- **350×667**：在上一步**Edit页**改宽350，owner末端、barbottom607<nav617.5，document无横向溢出，bbox/唯一可见nav不可空。没有新开Create或Draft Detail350；源文件名误叫create，归档已改正确Edit名。截图同样quote pending，不当有效报价图。

几何是这些实际视口和fixture的证据，非所有设备/系统键盘/safe-area组合；headless仿真不是安卓真机。源脚本保留的字段不遮挡断言已实际走到；截图只显示滚动末端，当时上部字段可能不在视口，不把bbox不重叠泛称始终可见。

## 实际view与产物固定

10张本轮实际产物只复制不编辑至 [latest-implementation](../../ui/build-web-inventory-v1/latest-implementation/manifest.json)，逐张view完成。manifest保原path、原mtime、sha256、字节数、真实CSS viewport与PNG像素、对应scene及手机Edit pending限制，并关联本轮source baseline和run log。

适合向用户审阅此次“确认按钮放下面”实际外观的两张有效报价净图：

- [电脑Create 8行/230有效报价及底栏](../../ui/build-web-inventory-v1/latest-implementation/order-create-bottom-bar-desktop.png)
- [400手机Create 6行/145有效报价及底栏](../../ui/build-web-inventory-v1/latest-implementation/order-create-bottom-bar-mobile-400.png)

两图均滚动末端，顶部部分商品不在当前画面，目的为底部布局审阅；无浏览器栏/其它标签，不是旧参考图。电脑Detail/Edit、400Detail、400/350Edit及确认后首退详情也已复制，按manifest的实际场景查看。400/350Edit显示加载0的图仅留施工证据，不选为有效金额最终视觉代表。

没有凭用户之前“按钮放下面”推定最终视觉已接受。本轮也不代勾11.1/其它task；由协调者展示、用户确认视觉范围后再按规范处理。B10/D7/C4与旧PDF/真实GUI守恒证据不重复、不覆盖其原有限边界。
