# 1.3 独立验收结果

日期：2026-11-10。结论：**通过任务 1.3 的真实数据库测试与迁移基础设施验收**。

实际运行 `npm run test:db`，exit 0，12/12，无跳过。其中数据库基础 4 项验证 PostgreSQL 空库独立重建、迁移重放/校验和、迁移失败的 schema 与 tracking 同事务回滚、真实行锁竞争返回 `55P03`、业务事务抛错后原数量不变；同次运行还包含商品模块 8 项。这些商品测试的通过记录不替代该模块独立验收。

实际运行额外独立测试：

```sh
node --conditions=development --import tsx --test docs/verification/build-web-inventory-v1/database-acceptance.test.ts
```

exit 0，1/1。独立测试使用 `/opt/homebrew/opt/postgresql@18/bin` 的 initdb/pg_ctl，新建私有临时 cluster 和 Unix socket，无 TCP 监听；数据库实际 `SELECT version()` 证实 PostgreSQL 18。并发调用两次迁移仅一次应用迁移；源表主键和安全整数 CHECK 分别返回 `23505`、`23514`；主动制造 SQL 失败返回 `42703` 后，失败夹具新库被清理，不留下随机测试库。测试停止自身 cluster 并删除自身临时目录。

检查 `createTestDatabase` 确认只创建 UUID 名的新库，不清空传入管理数据库；各夹具独立 pool，cleanup 删除自己的数据库。`migrate` 使用同一连接、事务和 advisory lock，保存校验和，并拒绝变更、缺失及倒插已应用迁移。后续业务迁移仍应逐项验证业务约束。

独立测试初稿的 teardown 顺序先停止服务器再关闭管理连接池，触发连接终止错误；已修正自建测试的清理顺序，重跑通过。未修改数据库实现。
