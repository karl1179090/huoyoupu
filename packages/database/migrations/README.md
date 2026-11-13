按文件名排序执行 `0001_name.sql`。已应用文件不可修改或移除，修复使用新迁移。
迁移执行器保存 SHA-256 校验和，并用 PostgreSQL 事务级 advisory lock 串行化迁移。
所有待执行文件在同一事务提交，SQL 文件不得自行 BEGIN/COMMIT。
