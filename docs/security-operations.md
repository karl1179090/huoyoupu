# 账号、会话与关键操作

API 使用同源 HTTPS，启动需 `DATABASE_URL`、`PUBLIC_ORIGIN`；后者必须是网页的真实来源，例如 `https://inventory.example.com`。浏览器 Cookie 固定为 `__Host-huoyoupu_session`，包含 `Secure; HttpOnly; Path=/; SameSite=Strict`；不能为方便本地开发去掉 Secure，浏览器开发环境应配置 HTTPS。

先执行数据库迁移，再在当前用户私有文件中准备 12–128 字符密码，文件权限为 0600。不要把真实密码写到仓库、命令参数、示例或日志。

```sh
DATABASE_URL='postgresql://user@localhost/huoyoupu' npm run db:migrate
HYP_ADMIN_LOGIN='admin' HYP_ADMIN_PASSWORD_FILE='/absolute/path/to/private-password-file' npm run admin:init
```

上述第二条同样需要 `DATABASE_URL` 环境变量。初始化仅允许空账号库，重复执行拒绝；初始化也记录不含密码的账号审计。管理员在应用中创建其余账号。最后一个有效管理员不能停用或降级；管理员变更通过同一 PostgreSQL advisory lock 串行化，并在取得锁后重新检查操作者权限，防止两个管理员互停产生空管理状态。

密码使用 Node.js 内置 scrypt，随机 16 字节盐、N=131072/r=8/p=1（128 MiB 工作内存，maxmem 256 MiB），比较派生值使用常量时间函数。配置参考 [OWASP 密码存储指南](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) 与 [Node.js crypto](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)。

`GET /api/v1/auth/session` 未登录时发放匿名挑战，返回 `user:null`。每次会话读取轮换 CSRF 挑战；登录后撤销匿名会话，重新生成会话 Cookie 和 CSRF。会话/CSRF秘密只以 SHA-256 存于数据库，Cookie 秘密不进入 JSON；账号密码及哈希不进入 User DTO。默认会话绝对期限12小时，每次受保护请求都重新检查过期、撤销、账号 active 和当前角色。停用或重置密码撤销原会话，角色变化立即影响后续请求。

浏览器写入必须带精确匹配 `PUBLIC_ORIGIN` 的 Origin 以及当前 `X-CSRF-Token`。Cookie 存在不能代替 CSRF；登录/登出也执行此规则。参考 [OWASP CSRF 指南](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) 与 [会话指南](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)。

## 幂等与事务

关键写入使用 `security.withOperation(request, {kind,routeKey}, work)`。流程为：当前会话及角色授权 → Origin/CSRF → 幂等键与请求摘要 → 持久化短租约 → 单库事务内写业务、来源审计和最终幂等结果。work 只使用提供的 `PoolClient`，结构校验也应放在 work 内，以便记录合法幂等键对应的校验失败。

摘要覆盖规范化对象键顺序的正文、路径参数及查询条件；同键换目标不能重放另一实体结果。相同键相同内容返回同一状态/正文并带 `Idempotency-Replayed:true`；不同内容409。角色降级/停用不能读取此前管理员缓存。缓存重放计数及时间独立记录，不创建第二笔业务操作。

默认租约30秒。未过期且由另一 worker 持有时返回 `OPERATION_IN_PROGRESS`。过期恢复先检查已完成状态，再领取新租约；事务持有该登记行锁，因此不会在旧事务仍提交时启动第二次效果。业务成功与成功结果原子提交；业务校验/约束失败先回滚业务，再保存失败状态与脱敏错误，后续同键重放完全相同失败。死锁/序列化失败最多重试三次，沿用同一请求语义；失败重放不会自动变成一次新业务，开始新意图需要新键。

审计通过同client `appendAudit` 追加实体前后公开快照与版本；账号审计从 User DTO 投影，不保存 password/passwordHash/会话秘密。数据库触发器拒绝修改和删除审计。pg 唯一性、外键、CHECK 和数值溢出转为标准422响应，不返回原始 SQL、约束名或堆栈。未知技术异常使用脱敏503。错误 details 经严格 ErrorDetails 校验，未定义字段全部移除。

```sh
npm run test:db -- apps/api/test/auth.db.test.ts apps/api/test/operations.db.test.ts
```

该命令自行建立真实 PostgreSQL 临时实例与隔离空库，覆盖 Cookie/CSRF、错误凭据、角色即时生效、最后管理员并发、CLI 初始化、失败重放、跨路径冲突、并发同键、租约恢复、已提交结果优先和回滚后精确重放。全部测试使用虚构资料。

公共幂等层 `allowedRoles` 缺省仅admin；仅允许员工的打印写操作显式传['admin','employee']。身份、active、会话和CSRF仍先于cache，事务内也复核。目标资源“本人或管理员”等权限必须由路由在withOperation之前校验，并在事务锁后再复核，不能只放work里让重放绕过。operations-roles.db.test.ts实际覆盖默认admin拒员工、显式员工操作成功且重放只一次、无CSRF拒绝、停用后不得读缓存。
