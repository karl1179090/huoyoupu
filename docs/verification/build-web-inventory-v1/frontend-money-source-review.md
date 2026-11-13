# 销售Money输入源码独立窄审

2026-11-12。唯一外部前端owner停止后，本代理按CodeGraph优先（当前未命中实际源码）回落读取Create/Edit、components/moneyInput及其直接import pure；没有运行types/build/tests/API/browser/GUI、改前端或checkbox。**源审通过，可冻结；50/56保持。**Sol独立types/build/A实际验证正在进行，另以其result报告为准，不共写该文件。

- normalizeMoneyInput仅用字符串正则/padEnd：空→0.00、1/1.0→1.00、两位保持、18位整数精确；第三位、负数或非法输入返回错误，不浮点、不舍入、不截断。上限与既有Money契约相同，未放宽后端或新增阈值。
- Create的quote/save/confirm及Edit唯一buildRevisionPayload供quote/revisions使用，均读取同一memo规范值；raw输入state及传表单props保留。没有更改UnitPrice（含0.005000原价展示）、数量或buildLineChanges定价继承。
- invalid输入清旧quote且resetQuoteState递增seq，Create清timer、Edit由effect cleanup清timer；过时响应不能恢复旧报价。错误可见、保存/确认禁用及handler阻断非法API齐备，依赖memo不随任意render新建造成循环。
- intent refs/重试key、角色和既有handler保留。本轮不据source通过断言UI丢响应或完整订单写入已经成功。

新pure9直接import生产helper，覆盖空/零/整数/一位/两位/大额/三位/负数/非法形态。**作者9/9是helper单测，不是实际页面/HTTP写入；本代理没有重跑。**正常用户键1元不能报价的真实UI缺口，其源处理已补；最终真实9元报价/提交须由独立order-write case证明，不能把测试改填1.00绕过。

90文件保护基线重新枚举90→90，新增/删除/修改均[]，包括根/包/锁/TS/AGENTS与后端共享生产源；授权新增backend test factory不在禁止生产范围，未当越界。相对已冻结C生产源，本轮仅两销售组件变化及许可helper新增，未改其它业务域。源码精确hash通过协调者私有保护/当前冻结清单留存；后续test-only修正不改变本源审边界。

本轮固定SHA256：Create `abcba45b40983de302ceda1f35750700f38511050c6a9bd0090c8cf1594a284e`；Edit `b676be1c47463d7e4774f51a3945c7ff7ad9f1aed315130ce011e32defd1b5fd`；helper `19a8eb3ade4c7fd091bdb46ed529bb0dae0e371c1203c92e494aabcd4dad7d40`；pure `26e81984bb7d4a1b3c7731f2c9cae75e8e072ad398fd28c01e379a8f36796830`。

后续独立结果已齐：[Money types/build0、pure9/A7](frontend-money-independent-result.md)，以及[最终真实订单六业务](frontend-order-write-independent-result.md)的raw1/三位负数/清旧quote/禁写与重放实证。故前文“独立正在进行”仅描述源审时点，当前源码缺口与所需实际UI链均已关闭；不把helper9单独当UI通过。
