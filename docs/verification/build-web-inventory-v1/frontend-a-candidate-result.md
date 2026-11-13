# A候选末轮：独立类型与单文件页面验收

2026-11-12约02:39。外部A写者因max-turns退出1不作为功能结果；全部停写后，本代理固定source/A/B/C/D/config [54文件baseline](frontend-a-candidate-baseline.json)，结束0漂移。没有改任何前端/测试/checkbox，不GUI，不重跑B/D/C或全套。

- `npm run typecheck:web`：**exit0**，[日志](frontend-a-candidate-typecheck.log)。
- `node --import tsx --test --test-concurrency=1 apps/web/test/agent-a-e2e-regression.test.ts`：**exit1，6pass/1fail/0skip/0cancel，10.9秒**，[完整日志](frontend-a-candidate-e2e.log)。

全部runtime结束，teardown完成已立即通知协调者；最多只这一次，无失败后自行再跑。

## 首次退后改单：本轮实际完整通过

test5全部通过，已真实运行保护已退3/原价2/净6、可编辑余量9/新价3/净27、整体33、独立客户净余额18→27/delta+9，实际UI点击确认再GET读取修订/订单和客户余额27。后端响应读取仍核quantity/null基础量与历史段保护；不是仅quote文案或pure状态证明。

新[确认后订单净图](frontend-a-candidate-artifacts/order-detail-after-return-revision.png)本代理已view：未退9瓶×3=27、成本9；已退严格只读3瓶×2=6、成本3；订单33、累计信用6。该图当前mtime02:39:04，SHA/源路径见[manifest](frontend-a-candidate-artifacts/manifest.json)。它证明改单后详情，不冒作Create/Edit底部截图或真安卓。

旧employee默认/明确403且0管理请求、CSRF无刷新切号、原test2、setup/teardown继续通过。B10/D7/C4独立结果保留。

## 唯一失败：长单备注与底栏几何，滚动owner未校准

test4没有删除footer/长单/手机/实际确认要求：当前有明确8行断言、同商品2个独立行，PC1280×900、手机400×750及350、Create/草稿Detail/Edit底栏与实际草稿确认仍在；Edit reason几何存在if(box)条件，应按未来实际经过边界记录。

本次已走到真实选客地址、非空8配置加入、8行页面计数、同商品2独立行、有效非零live quote、保存草稿及确认按钮visible/enabled。未输出quote HTTP失败或缺货/未填价/地址诊断；当前失败不是“无quote”。但日志没有保存完整成功quote payload/response，不凭helper存在伪称已抓所有请求细节。

失败精确位于 `agent-a-e2e-regression.test.ts:893`：`remarkBox.y + remarkBox.height <= barBox.y`为false，错误“Remarks field must not be obscured by sticky bottom bar”。其:888只执行`window.scrollTo(0, document.body.scrollHeight)`；实际AppLayout.tsx:157主体为`overflowY:'auto', maxHeight:'100vh'`的flex容器，内容滚动不一定由window承担。因此本次仅证明这个矩形断言失败，尚不能判断真实滚动到位后仍遮挡。

此run没有把两rect、scrollTop/clientHeight/scrollHeight打印，也在assert之后才截图，故无失败瞬间几何净图。下一唯一实施微轮应对实际滚动owner或备注控件scrollIntoView，明确等待滚动稳定，保存rect+viewport/owner数据及失败前页面截图，再保留同一不遮挡断言；不能删除断言凑绿，不能在无rect证据下直接改样式。若正确滚动后仍遮挡则交作者修真实布局。

后续PC草稿Detail确认、Edit几何与400/350手机各分支本次尚未到达，不能用源码仍存在或旧图称通过。本代理不追加运行/GUI以免扩大本轮；交由协调者下一唯一外部作者精确推进。
