# 最终单文件浏览器复验

本代理仅承接A19/B8现有单文件的独立CLI复验，不写前端、不运行全局或capture；本机原生GUI由acceptance独占。当前**尚未执行**，不沿用作者通过声明。

## 启动前边界

CodeGraph未索引两文件，回落只读源码。当前待测入口为`apps/web/test/agent-a-e2e-regression.test.ts`及`apps/web/test/inventory-finance-browser.test.ts`，不是旧live-api-workflow纯API套。

- A19源码mtime22:26:42，CORE_NOTES22:16:26；其Node夹具已用绝对API URL及独立session，但先取首个active仓/前五active商品，不足才新建。
- B8源码mtime22:22:34，NOTES22:23:55；新客户及默认地址独立，但before先取首个active仓和前十产品中的首个active商品，再写200入库。
- 两者并非独立商品仓库夹具。原生GUI正做退货→改单→分次返库，未确认它的商品仓与上述候选互斥前，不启动CLI，以免改变所测库存前提。已向协调者报告，等待隔离事实确认或GUI释放；不为此修改测试/降低断言。

后续若获准，固定测试及生产源码hash，按文件串行、新浏览器context，保留真实TAP/失败，检查前后源码未变；不操作全局配置或账号角色。
