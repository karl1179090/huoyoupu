# 2.1–2.3 独立验收结果

日期：2026-11-10。结论：**通过账号、会话、管理员保护、业务操作幂等与审计基础验收**。验收者未参与该模块实现。

| 实际命令 | 结果 |
| --- | --- |
| `npm run test:db -- apps/api/test/auth.db.test.ts apps/api/test/operations.db.test.ts` | exit 0，23/23，无跳过 |
| `npm exec tsc -- -p .scratch/backend-auth-typecheck.json` | exit 0，定向类型检查 |
| `npm run test:db -- docs/verification/build-web-inventory-v1/auth-acceptance.db.test.ts` | exit 0，新增独立负向检查 3/3 |

上述测试通过实际 PostgreSQL 18 临时实例与 UUID 随机新库执行。没有用内存数据库替代事务与锁。

已阅读账号 service、密码派生、初始化 CLI、HTTP 测试、操作测试及 `docs/security-operations.md`。实测覆盖匿名挑战、错误/未知/停用凭据统一响应、Secure/HttpOnly/SameSite Cookie、登录轮换且撤销匿名会话、Origin 与 CSRF、即时角色变更/停用/过期/登出、最后管理员禁止降级或停用、两个管理员互停至多一项成功、真实 CLI 私有密码文件初始化及重复拒绝、审计不含密码且不可覆盖。

幂等实测覆盖规范化正文顺序、不同正文/路径同键冲突、成功与失败结果精确重放、8 个并发同键只生效一次、鉴权先于缓存、未过期租约拒绝、过期租约恢复、已提交结果先于租约、整次回滚，以及模拟 `40001` 的有限三次重试且只有一次最终效果。模拟 SQLSTATE 用于检验重试控制；真实行锁另外已有基础数据库验收证据，未声称此处制造了真正 PostgreSQL 序列化冲突。

独立额外负向检查：读取会话后旧 CSRF 立即拒绝、新令牌可写；重复同名 Cookie 拒绝；真实 CLI 拒绝 0644 密码文件且不创建账号、不打印密码；持续 `40001` 恰好尝试三次后返回脱敏 503，全部效果回滚，同键重放失败不再次执行。

未修改身份/幂等实现。当前销售等模块仍在施工，本报告未宣称全局 API 类型检查或全部业务验收通过。
