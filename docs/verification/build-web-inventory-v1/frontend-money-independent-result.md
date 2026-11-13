# Money输入修复独立运行结果

2026-11-12，源码候选停写后，由非作者仅运行本次受影响门槛及原A浏览器回归；没有修改前端/测试，没有运行B/C/D/报表或追加GUI。

| 命令 | 实际结果 | 日志 |
| --- | --- | --- |
| `npm run typecheck:web` | exit0 | frontend-money-typecheck.log |
| `npm run build:web` | exit0 | frontend-money-build.log |
| `node --import tsx --test --test-concurrency=1 apps/web/test/money-input.test.ts` | exit0，9pass/0fail/0skip，98.5ms | frontend-money-pure.log |
| `node --conditions=development --import tsx --test --test-concurrency=1 apps/web/test/agent-a-e2e-regression.test.ts` | exit0，7pass/0fail/0skip，16.47s | frontend-money-a-regression.log |

固定文件及SHA见 `frontend-money-baseline.json`：60记录中，协调者显式授权唯一外部writer同时只编辑新 `order-write-flows-browser.test.ts`，该文件排除结束漂移判断；其余59个source/原A/BCD/报表/helper/config受保护文件结束 `changedAtEnd=[]`。初次基线尝试因helper路径少components目录没有写出文件，实际正确基线在类型检查完成后捕获；期间没有生产源码写者，不冒称类型检查前已成功落盘。

新增9项直接import生产金额helper，实际覆盖空串既有0语义、整数补两位、1位补0、已规范两位保留、大金额精确字符串处理、3位拒绝不舍入、负数拒绝、非数/畸形拒绝、前导0/加号拒绝。这是helper输入→结果证据，不代替页面无效输入清旧quote/禁提交的真实浏览器分支。

原A7项包含setup/teardown；业务实际通过员工权限拒绝、客户地址与报价失效、无刷新管理员/员工切换CSRF、PC/手机底栏以及退3后改单预拆/价格编辑真实报价。该回归没有新增优惠1/三位/负数页面操作，不能据7/7提前补写这些分支已验。真实owner/底栏数值随本轮日志输出；手机是headless视口仿真，非安卓实机，截图不是最终视觉接受。

此前新order case1报价400已由独立后端诊断校准：Money契约要求两位，普通金额输入raw `1` 应由前端精确规范化为 `1.00`，原raw透传为真实UX缺口，不能只把测试改填1.00掩盖。本轮helper与类型/构建/原A回归均通过；优惠1获得9.00及非法金额页面阻断仍待修正后的新order全文件实际运行。原独验报告保留当时400但未打印details的历史证据边界。

本轮全部runtime已结束。新order测试由唯一外部owner继续修改，待其明确停止后另独立完整运行；没有修改checkbox或宣称整个前端完成。
