# 打印与订单状态独立验收

结论：**10.1、10.2、10.3及6.6通过后端独立验收**。验收者没有实现printing模块；6.6销售角色逻辑此前由foundation独立验收，本报告补齐外部打印状态来源联动。前端预览渲染、真实纸型分页和物理出纸没有执行，14.2保持待验。

## 实际执行

- `npm run test:db -- apps/api/test/printing.db.test.ts docs/verification/build-web-inventory-v1/printing-independent.db.test.ts docs/verification/build-web-inventory-v1/business-loop.db.test.ts`：真实PostgreSQL18，3/3通过。
- 增补独立角色降级后同key拒绝案例后，定向重跑`printing-independent.db.test.ts`：1/1通过。
- `NODE_OPTIONS=--trace-deprecation npm run test:db -- docs/verification/build-web-inventory-v1/printing-independent.db.test.ts docs/verification/build-web-inventory-v1/business-loop.db.test.ts`：2/2通过，无数据库并发query警告。
- `node --import tsx --test apps/api/test/printing.test.ts`：1/1通过；API类型检查exit0。

初始独立测试错把状态接口写成POST，实际契约是PATCH；修正测试方法后通过，未作为实现缺陷登记。长单真实暴露销售作者在同一PoolClient上Promise.all读取的pg弃用警告，销售作者改为顺序读取，复跑无警告；不改变库存或金额算法。

## 分任务证据

| 任务 | 证据 |
| --- | --- |
| 10.1 | 四项配置与字段顺序通过；A4边距10的可打印宽度190，191列宽422拒绝；成本字段400拒绝且版本数不增加；自定义尺寸/边距/标准纸矛盾/重复列/未知字段被拒绝。模板v2最小行高8，原v1仍6，DB UPDATE旧模板版本拒绝。 |
| 10.2 | 独立32行长名称/两仓商品PrintData，管理员与员工均保留32行及16/16仓来源，商品名完整，合计32；递归无cost/profit，契约OrderPublic投影不含原消耗段。显式旧模板v1与旧订单版本保持金额32，新版商业额33并明确旧版isCurrent=false。 |
| 10.3 | 员工3次请求，每次同key重放不增加job，总数3；默认仅requested而非物理成功。本人状态允许、他人403、管理员可代填；独立管理员改他人job成功后降为员工，原key重放403且无Replayed头。人工确认/取消/客户端错误均实际执行。打印前后订单字段（除状态展示）、write version、revision、库存汇总/版本、商业ledger及现金均不变。 |
| 6.6 | 列表/详情/历史沿用独立员工DTO，当前打印状态读最新当前revision job。旧版确认后改单，新版not_requested；再重打确认旧版仍不标新版本；新版client_error真实显示、人工取消还原not_requested。管理员与员工读状态一致且无成本字段；员工不能写模板。 |

## 联调闭环

`business-loop.db.test.ts`在原订单/改价/退货/返库/收退款/换客/月结/报表流程中再执行打印预览、三次请求、重放、人工确认/取消。打印前后实际库存、完整商业分录、两笔现金事实、订单版本及毛利逐字段保持；随后作废仍正确回补库存和冲正商业来源，固定报表/旧月结继续可追溯。

浏览器调用与人工状态是可观测记录，不能证明纸张输出；本轮没有调用真实浏览器或打印机，也没有验证页面分页、重复表头或实际裁切。
