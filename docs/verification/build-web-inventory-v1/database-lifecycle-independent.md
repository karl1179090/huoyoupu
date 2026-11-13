# PostgreSQL 夹具清理修复：独立复核

2026-11-10。复核人：contracts/inventory Agent；未参与本次fixture修复，未修改foundation实现或测试。

结论：本次修复与实际pg-pool生命周期一致，定向回归31/31通过；未发现已验收任务1.3回归。没有重跑全量63套作为此项证据。

## 源码核对

- `packages/database/src/testing.ts` 在工作Pool发生任何连接前注册connect/remove跟踪。cleanup同时等待pool.end()完成及全部已连接client的remove事件，再普通DROP DATABASE，不使用FORCE；重复cleanup共用同一Promise。
- 已读取实际安装的 `node_modules/pg-pool/index.js`：`_remove`先从内部_clients数组移除client，再调用client.end，并在其回调中emit remove（172–187行）；`_pulseQueue`在_clients为空时即可完成pool.end（133–143行）。因此单独await pool.end不足以证明全部物理关闭回调完成，新等待条件针对真实时序而非压住错误。
- `packages/database/test/lifecycle.test.ts` 对真实PostgreSQL的8个并发连接，将原client.end延迟50ms；cleanup返回后必须8/8物理关闭回调完成，再重复cleanup验证幂等。没有stub PostgreSQL，也没有吞掉池错误。

## 独立执行

在独立、无TCP监听的临时PostgreSQL 18集群执行，TEST_DATABASE_URL只指向私有Unix socket。实际测试命令：

```sh
node --conditions=development --import tsx --test \
  packages/database/test/lifecycle.test.ts \
  packages/database/test/database.test.ts \
  apps/api/test/operations.db.test.ts \
  apps/api/test/inventory.db.test.ts \
  apps/api/test/inventory-http.db.test.ts \
  apps/api/test/inventory.test.ts
```

结果：exit 0，31 tests、31 pass、0 fail、0 skip，无测试结束后的uncaughtException。其中包括50ms关闭调度放大、真实数据库重建/失败迁移回滚/锁与事务、同key并发/租约恢复/失败重放，以及最新库存数据库与HTTP用例。

首次独立集群的系统临时目录路径过长，PostgreSQL未能创建Unix socket，测试尚未启动；改为 `/tmp/hy-check-*` 短路径后完成上述全部验证。结束后正常停止并删除独立集群，无长期数据库或凭据写入仓库。

修复前的间歇异常由本Agent在两次全局PG运行中实际观察并报告；本次针对修复后的生命周期回归和既有1.3场景核验，不据此额外宣称吞吐量或生产部署已验证。
