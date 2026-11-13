# PostgreSQL 夹具清理竞态

2026-11-10。全局测试间歇报告 operations 并发场景结束后出现 `terminating connection due to administrator command`。原始定向20轮与最小8连接清理100轮自然调度均通过，说明问题依赖时序。

检查 pg-pool 8.23 的生命周期后，将实际 `Client.end` 延迟50ms放大正常异步关闭窗口：最小8并发连接 → fixture.cleanup 稳定复现同句错误及测试结束后的 uncaughtException。旧夹具在 `pool.end()` 返回后立即 `DROP DATABASE WITH (FORCE)`，但 pg-pool 先从内部列表移除客户端、后等待物理关闭回调；数据库强制删除抢先终止尚在关闭的连接。所有 HTTP Promise 已被等待，根因在夹具生命周期。

修正：跟踪 Pool connect/remove，等待 pool.end 和所有物理关闭回调，再执行普通 DROP DATABASE；重复 cleanup 返回同一 Promise。未吞掉客户端错误，也未把未完成请求当作成功。

回归位于 `packages/database/test/lifecycle.test.ts`，保留50ms调度放大并断言8个物理关闭回调全部完成。修正后 `npm run test:db -- packages/database/test/lifecycle.test.ts apps/api/test/operations.db.test.ts` 12/12通过；随后一次全局 `npm run test:db` 63/63通过，无残留异步异常。临时复现脚本已删除，未保留调试日志。
