export interface paths {
    "/auth/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取身份或获取登录前 CSRF 挑战 */
        get: operations["getSession"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 登录并轮换会话 */
        post: operations["login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 退出并撤销会话 */
        post: operations["logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 账号列表 */
        get: operations["listUsers"];
        put?: never;
        /** 创建账号 */
        post: operations["createUser"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/{userId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** 修改角色、状态或密码 */
        patch: operations["updateUser"];
        trace?: never;
    };
    "/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 商品名称、编码、条码和助记码检索 */
        get: operations["listProducts"];
        put?: never;
        /** 创建商品及初始单位 */
        post: operations["createProduct"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/products/{productId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 商品详情 */
        get: operations["getProduct"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** 更新资料与助记码 */
        patch: operations["updateProduct"];
        trace?: never;
    };
    "/products/{productId}/units": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 新增商品销售单位 */
        post: operations["createUnit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/products/{productId}/units/{unitId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** 更新单位并保护历史倍率 */
        patch: operations["updateUnit"];
        trace?: never;
    };
    "/products/{productId}/barcodes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** 更新条码映射 */
        put: operations["replaceBarcodes"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/customers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 客户检索 */
        get: operations["listCustomers"];
        put?: never;
        /** 创建客户 */
        post: operations["createCustomer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/customers/{customerId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 客户及地址详情 */
        get: operations["getCustomer"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** 修改客户资料或停用 */
        patch: operations["updateCustomer"];
        trace?: never;
    };
    "/customers/{customerId}/addresses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 新增配送地址 */
        post: operations["createAddress"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/customers/{customerId}/addresses/{addressId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** 修改配送地址或默认地址 */
        patch: operations["updateAddress"];
        trace?: never;
    };
    "/customers/{customerId}/price-quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 按历史、专属、默认顺序建议价格 */
        get: operations["getCustomerPrice"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/customers/{customerId}/price-rules": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 客户专属价列表 */
        get: operations["listPriceRules"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/customers/{customerId}/price-rules/{productId}/{unitId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** 设置客户专属价 */
        put: operations["upsertPriceRule"];
        post?: never;
        /** 删除客户专属价 */
        delete: operations["deletePriceRule"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/warehouses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 仓库列表 */
        get: operations["listWarehouses"];
        put?: never;
        /** 创建仓库 */
        post: operations["createWarehouse"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/warehouses/{warehouseId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** 修改仓库资料和状态 */
        patch: operations["updateWarehouse"];
        trace?: never;
    };
    "/receipts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 入库列表 */
        get: operations["listReceipts"];
        put?: never;
        /** 确认采购或期初入库 */
        post: operations["confirmReceipt"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/receipts/{receiptId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 入库及批次来源 */
        get: operations["getReceipt"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/inventory/balances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 分仓商品库存 */
        get: operations["getStockBalances"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/inventory/batches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 按实际入库顺序查询批次 */
        get: operations["listBatches"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/inventory/movements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 库存来源流水 */
        get: operations["listStockMovements"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stocktakes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 盘点列表 */
        get: operations["listStocktakes"];
        put?: never;
        /** 建立盘点快照草稿 */
        post: operations["createStocktake"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stocktakes/{stocktakeId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 盘点快照与实盘 */
        get: operations["getStocktake"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** 录入实盘及盘盈成本 */
        patch: operations["updateStocktake"];
        trace?: never;
    };
    "/stocktakes/{stocktakeId}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 校验快照并确认盘点 */
        post: operations["confirmStocktake"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 按角色投影的全部订单列表 */
        get: operations["listOrders"];
        put?: never;
        /** 建立不记账草稿 */
        post: operations["createOrderDraft"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 预估创建或修改后的分配和金额，不预留库存 */
        post: operations["quoteOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 按角色投影的订单详情 */
        get: operations["getOrder"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** 仅更新草稿内容 */
        patch: operations["updateOrderDraft"];
        trace?: never;
    };
    "/orders/{orderId}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 确认销售且整单记账 */
        post: operations["confirmOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 订单版本列表 */
        get: operations["listOrderRevisions"];
        put?: never;
        /** 按命令修改已确认订单 */
        post: operations["reviseOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/revisions/{revisionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 按角色读取指定版本 */
        get: operations["getOrderRevision"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/void": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 作废未配送订单并合并关联更正 */
        post: operations["voidOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/delivery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 登记配送标记，不产生库存变化 */
        post: operations["setDeliveryStatus"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/returns": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 原单退货来源 */
        get: operations["listOrderReturns"];
        put?: never;
        /** 确认部分退货信用额，不自动返库退款 */
        post: operations["confirmReturn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/returns/{returnId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 退货与返库状态 */
        get: operations["getReturn"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/returns/{returnId}/restocks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 按原来源登记实际返库 */
        post: operations["recordRestock"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/customers/{customerId}/balance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 客户欠款、余额及待分配款 */
        get: operations["getCustomerBalance"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/customers/{customerId}/ledger": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 客户往来流水 */
        get: operations["getCustomerLedger"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/customers/{customerId}/opening-balance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 登记期初往来，不计新销售或实收 */
        post: operations["recordOpeningBalance"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/customers/{customerId}/balance-applications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 核销既有余额，不新增实收 */
        post: operations["applyCustomerBalance"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cash-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 实际收退款列表 */
        get: operations["listCashEvents"];
        put?: never;
        /** 登记实际收款或退款 */
        post: operations["recordCashEvent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cash-events/{cashEventId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 实收实退及分配来源 */
        get: operations["getCashEvent"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cash-events/{cashEventId}/reverse": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 冲正错误登记并保留来源 */
        post: operations["reverseCashEvent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/customers/{customerId}/statements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 月结历史版本 */
        get: operations["listStatements"];
        put?: never;
        /** 生成版本化月结快照 */
        post: operations["createStatement"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/statements/{statementId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取月结快照及过期标记 */
        get: operations["getStatement"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/company": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 打印所需公司资料 */
        get: operations["getCompany"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** 维护公司资料 */
        patch: operations["updateCompany"];
        trace?: never;
    };
    "/print-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 可用打印模板，员工仅获取打印投影 */
        get: operations["listPrintTemplates"];
        put?: never;
        /** 创建模板和首版本 */
        post: operations["createPrintTemplate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/print-templates/{templateId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** 修改模板名称、状态和默认选择 */
        patch: operations["updatePrintTemplate"];
        trace?: never;
    };
    "/print-templates/{templateId}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 打印模板历史版本 */
        get: operations["listPrintTemplateVersions"];
        put?: never;
        /** 保存新配置版本 */
        post: operations["createPrintTemplateVersion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/print-data": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 按版本读取无成本的配送单数据 */
        get: operations["getPrintData"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/print-jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 打印请求与人工状态 */
        get: operations["listPrintJobs"];
        put?: never;
        /** 登记打印请求，无记账副作用 */
        post: operations["createPrintJob"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/print-jobs/{printJobId}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** 本人或管理员填写人工打印状态 */
        patch: operations["setPrintJobStatus"];
        trace?: never;
    };
    "/reports/query": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 执行受控统计并保存来源快照 */
        post: operations["queryReport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/report-runs/{reportRunId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取同一统计快照分页 */
        get: operations["getReportRun"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/report-runs/{reportRunId}/sources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取快照对应明细来源 */
        get: operations["getReportSources"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ai/queries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 自然语言只读统计或澄清 */
        post: operations["askReport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/print-templates/{templateId}/versions/{templateVersionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取明确的模板版本 */
        get: operations["getPrintTemplateVersion"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** Format: uuid */
        Id: string;
        /** Format: date-time */
        Instant: string;
        Version: number;
        Quantity: number;
        PositiveQuantity: number;
        SignedQuantity: number;
        /** @example 100.00 */
        Money: string;
        /** @example -20.00 */
        SignedMoney: string;
        PositiveMoney: string;
        /** @example 23.500000 */
        UnitPrice: string;
        FieldError: {
            field: string;
            code: string;
            message: string;
        };
        StockShortage: {
            productId: components["schemas"]["Id"];
            warehouseId: components["schemas"]["Id"];
            requiredQuantityBase: components["schemas"]["PositiveQuantity"];
            availableQuantityBase: components["schemas"]["Quantity"];
            selectedBatchId: components["schemas"]["Id"] | null;
        };
        ErrorDetails: {
            fieldErrors?: components["schemas"]["FieldError"][];
            shortages?: components["schemas"]["StockShortage"][];
            expectedVersion?: components["schemas"]["Version"];
            actualVersion?: components["schemas"]["Version"];
            relatedIds?: components["schemas"]["Id"][];
            retryAfterMs?: number;
        };
        ApiError: {
            code: string;
            message: string;
            requestId: string;
            retryable: boolean;
            details?: components["schemas"]["ErrorDetails"];
        };
        User: {
            id: components["schemas"]["Id"];
            loginName: string;
            /** @enum {string} */
            role: "admin" | "employee";
            active: boolean;
            version: components["schemas"]["Version"];
        };
        Session: {
            user: components["schemas"]["User"] | null;
            csrfToken: string;
        };
        LoginInput: {
            loginName: string;
            password: string;
        };
        UserCreate: {
            loginName: string;
            password: string;
            /** @enum {string} */
            role: "admin" | "employee";
        };
        UserPatch: {
            expectedVersion: components["schemas"]["Version"];
            /** @enum {string} */
            role?: "admin" | "employee";
            active?: boolean;
            password?: string;
        };
        VersionInput: {
            expectedVersion: components["schemas"]["Version"];
        };
        ReasonInput: {
            expectedVersion: components["schemas"]["Version"];
            reason: string;
        };
        UnitCreate: {
            name: string;
            multiplierBase: components["schemas"]["PositiveQuantity"];
            defaultSalePrice: components["schemas"]["UnitPrice"];
            defaultReceiptCost?: components["schemas"]["UnitPrice"] | null;
        };
        Unit: {
            id: components["schemas"]["Id"];
            productId: components["schemas"]["Id"];
            name: string;
            multiplierBase: components["schemas"]["PositiveQuantity"];
            defaultSalePrice: components["schemas"]["UnitPrice"];
            defaultReceiptCost: components["schemas"]["UnitPrice"] | null;
            active: boolean;
            version: components["schemas"]["Version"];
        };
        UnitPatch: {
            expectedVersion: components["schemas"]["Version"];
            name?: string;
            multiplierBase?: components["schemas"]["PositiveQuantity"];
            defaultSalePrice?: components["schemas"]["UnitPrice"];
            defaultReceiptCost?: components["schemas"]["UnitPrice"] | null;
            active?: boolean;
        };
        Barcode: {
            value: string;
            unitId: components["schemas"]["Id"];
        };
        ProductCreate: {
            code: string;
            name: string;
            specification?: string;
            brand?: string;
            mnemonicCodeOverride?: string | null;
            baseUnit: {
                name: string;
                defaultSalePrice: components["schemas"]["UnitPrice"];
                defaultReceiptCost?: components["schemas"]["UnitPrice"] | null;
            };
            units?: components["schemas"]["UnitCreate"][];
            barcodes?: {
                value: string;
                unitName: string;
            }[];
        };
        ProductPatch: {
            expectedVersion: components["schemas"]["Version"];
            name?: string;
            specification?: string;
            brand?: string;
            mnemonicCodeOverride?: string | null;
            active?: boolean;
        };
        Product: {
            id: components["schemas"]["Id"];
            code: string;
            name: string;
            specification: string;
            brand: string;
            generatedMnemonicCode: string;
            mnemonicCodeOverride: string | null;
            mnemonicCode: string;
            baseUnitId: components["schemas"]["Id"];
            units: components["schemas"]["Unit"][];
            barcodes: components["schemas"]["Barcode"][];
            active: boolean;
            version: components["schemas"]["Version"];
        };
        AddressInput: {
            label?: string;
            contactName: string;
            phone?: string;
            address: string;
            isDefault?: boolean;
        };
        Address: {
            id: components["schemas"]["Id"];
            customerId: components["schemas"]["Id"];
            label: string;
            contactName: string;
            phone: string;
            address: string;
            isDefault: boolean;
            active: boolean;
            version: components["schemas"]["Version"];
        };
        AddressPatch: {
            expectedVersion: components["schemas"]["Version"];
            label?: string;
            contactName?: string;
            phone?: string;
            address?: string;
            isDefault?: boolean;
            active?: boolean;
        };
        CustomerInput: {
            code: string;
            name: string;
            contactName?: string;
            phone?: string;
            notes?: string;
        };
        CustomerPatch: {
            expectedVersion: components["schemas"]["Version"];
            name?: string;
            contactName?: string;
            phone?: string;
            notes?: string;
            active?: boolean;
        };
        Customer: {
            id: components["schemas"]["Id"];
            code: string;
            name: string;
            contactName: string;
            phone: string;
            notes: string;
            addresses: components["schemas"]["Address"][];
            active: boolean;
            version: components["schemas"]["Version"];
        };
        PriceRule: {
            customerId: components["schemas"]["Id"];
            productId: components["schemas"]["Id"];
            unitId: components["schemas"]["Id"];
            unitPrice: components["schemas"]["UnitPrice"];
            version: components["schemas"]["Version"];
        };
        PriceRuleInput: {
            unitPrice: components["schemas"]["UnitPrice"];
            expectedVersion: number;
        };
        PriceQuote: {
            unitPrice: components["schemas"]["UnitPrice"];
            /** @enum {string} */
            source: "history" | "customer_rule" | "default";
            sourceOrderId: components["schemas"]["Id"] | null;
            sourceRevisionId: components["schemas"]["Id"] | null;
            sourceLineId: components["schemas"]["Id"] | null;
            sourceConfirmedAt: components["schemas"]["Instant"] | null;
            sourceNetAmount: components["schemas"]["Money"] | null;
        };
        WarehouseInput: {
            code: string;
            name: string;
        };
        WarehousePatch: {
            expectedVersion: components["schemas"]["Version"];
            name?: string;
            active?: boolean;
        };
        Warehouse: {
            id: components["schemas"]["Id"];
            code: string;
            name: string;
            active: boolean;
            version: components["schemas"]["Version"];
        };
        ReceiptLineInput: {
            productId: components["schemas"]["Id"];
            unitId: components["schemas"]["Id"];
            quantity: components["schemas"]["PositiveQuantity"];
            unitCost: components["schemas"]["UnitPrice"];
        };
        ReceiptInput: {
            /** @enum {string} */
            kind: "purchase" | "opening";
            warehouseId: components["schemas"]["Id"];
            receivedAt: components["schemas"]["Instant"];
            supplierReference?: string;
            lines: components["schemas"]["ReceiptLineInput"][];
        };
        ReceiptLine: {
            id: components["schemas"]["Id"];
            productId: components["schemas"]["Id"];
            unitId: components["schemas"]["Id"];
            quantity: components["schemas"]["PositiveQuantity"];
            multiplierBase: components["schemas"]["PositiveQuantity"];
            quantityBase: components["schemas"]["PositiveQuantity"];
            unitCost: components["schemas"]["UnitPrice"];
            costAmount: components["schemas"]["Money"];
            batchId: components["schemas"]["Id"];
        };
        Receipt: {
            id: components["schemas"]["Id"];
            receiptNo: string;
            /** @enum {string} */
            kind: "purchase" | "opening";
            warehouseId: components["schemas"]["Id"];
            receivedAt: components["schemas"]["Instant"];
            recordedAt: components["schemas"]["Instant"];
            supplierReference: string;
            lines: components["schemas"]["ReceiptLine"][];
        };
        Batch: {
            id: components["schemas"]["Id"];
            productId: components["schemas"]["Id"];
            warehouseId: components["schemas"]["Id"];
            /** @enum {string} */
            sourceKind: "receipt" | "stocktake_gain";
            sourceLineId: components["schemas"]["Id"];
            receivedAt: components["schemas"]["Instant"];
            recordedAt: components["schemas"]["Instant"];
            costUnitId: components["schemas"]["Id"];
            multiplierBase: components["schemas"]["PositiveQuantity"];
            unitCost: components["schemas"]["UnitPrice"];
            quantityBase: components["schemas"]["Quantity"];
            costAmount: components["schemas"]["Money"];
            version: components["schemas"]["Version"];
        };
        StockBalance: {
            productId: components["schemas"]["Id"];
            warehouseId: components["schemas"]["Id"];
            quantityBase: components["schemas"]["Quantity"];
            costAmount: components["schemas"]["Money"];
            version: components["schemas"]["Version"];
        };
        StockMovement: {
            id: components["schemas"]["Id"];
            operationId: components["schemas"]["Id"];
            sourceKind: string;
            sourceId: components["schemas"]["Id"];
            batchId: components["schemas"]["Id"];
            productId: components["schemas"]["Id"];
            warehouseId: components["schemas"]["Id"];
            quantityDeltaBase: components["schemas"]["SignedQuantity"];
            costDeltaAmount: components["schemas"]["SignedMoney"];
            balanceAfterBase: components["schemas"]["Quantity"];
            recordedAt: components["schemas"]["Instant"];
        };
        StocktakeCreate: {
            warehouseId: components["schemas"]["Id"];
            countedAt?: components["schemas"]["Instant"];
            lines: {
                productId: components["schemas"]["Id"];
                batchId: components["schemas"]["Id"] | null;
            }[];
        };
        StocktakePatch: {
            expectedVersion: components["schemas"]["Version"];
            countedAt?: components["schemas"]["Instant"];
            lines: {
                id: components["schemas"]["Id"];
                actualQuantityBase: components["schemas"]["Quantity"];
                gainCostUnitId?: components["schemas"]["Id"];
                gainUnitCost?: components["schemas"]["UnitPrice"];
            }[];
        };
        StocktakeLine: {
            id: components["schemas"]["Id"];
            productId: components["schemas"]["Id"];
            batchId: components["schemas"]["Id"] | null;
            snapshotQuantityBase: components["schemas"]["Quantity"];
            snapshotBatchVersion: components["schemas"]["Version"] | null;
            actualQuantityBase: components["schemas"]["Quantity"] | null;
            differenceBase: components["schemas"]["SignedQuantity"] | null;
            gainCostUnitId: components["schemas"]["Id"] | null;
            gainUnitCost: components["schemas"]["UnitPrice"] | null;
            resultBatchId: components["schemas"]["Id"] | null;
        };
        Stocktake: {
            id: components["schemas"]["Id"];
            stocktakeNo: string;
            warehouseId: components["schemas"]["Id"];
            countedAt: components["schemas"]["Instant"];
            /** @enum {string} */
            status: "draft" | "confirmed";
            version: components["schemas"]["Version"];
            lines: components["schemas"]["StocktakeLine"][];
        };
        AddressSnapshot: {
            customerName: string;
            contactName: string;
            phone: string;
            address: string;
        };
        NewOrderLine: {
            clientLineId: string;
            productId: components["schemas"]["Id"];
            warehouseId: components["schemas"]["Id"];
            unitId: components["schemas"]["Id"];
            quantity: components["schemas"]["PositiveQuantity"];
            unitPrice: components["schemas"]["UnitPrice"];
            /** @enum {string} */
            allocationMode: "auto" | "manual";
            batchSelections?: {
                batchId: components["schemas"]["Id"];
                quantityBase: components["schemas"]["PositiveQuantity"];
            }[];
            remark?: string;
        };
        OrderDraftInput: {
            customerId: components["schemas"]["Id"];
            addressId?: components["schemas"]["Id"];
            deliverySnapshot?: components["schemas"]["AddressSnapshot"];
            lines: components["schemas"]["NewOrderLine"][];
            discountAmount: components["schemas"]["Money"];
            roundOffAmount: components["schemas"]["Money"];
            remark?: string;
        };
        OrderDraftPatch: {
            expectedVersion: components["schemas"]["Version"];
            customerId?: components["schemas"]["Id"];
            addressId?: components["schemas"]["Id"];
            deliverySnapshot?: components["schemas"]["AddressSnapshot"];
            lines?: components["schemas"]["NewOrderLine"][];
            discountAmount?: components["schemas"]["Money"];
            roundOffAmount?: components["schemas"]["Money"];
            remark?: string;
        };
        LineSetCommand: {
            /** @constant */
            op: "set";
            lineId: components["schemas"]["Id"];
            productId?: components["schemas"]["Id"];
            warehouseId?: components["schemas"]["Id"];
            unitId?: components["schemas"]["Id"];
            quantity?: components["schemas"]["PositiveQuantity"];
            unitPrice?: components["schemas"]["UnitPrice"];
            /** @enum {string} */
            allocationMode?: "auto" | "manual";
            batchSelections?: {
                batchId: components["schemas"]["Id"];
                quantityBase: components["schemas"]["PositiveQuantity"];
            }[];
            remark?: string;
        };
        LineAddCommand: {
            /** @constant */
            op: "add";
            line: components["schemas"]["NewOrderLine"];
        };
        LineRemoveCommand: {
            /** @constant */
            op: "remove";
            lineId: components["schemas"]["Id"];
        };
        OrderReviseInput: {
            expectedVersion: components["schemas"]["Version"];
            reason: string;
            customerId?: components["schemas"]["Id"];
            addressId?: components["schemas"]["Id"];
            deliverySnapshot?: components["schemas"]["AddressSnapshot"];
            discountAmount?: components["schemas"]["Money"];
            roundOffAmount?: components["schemas"]["Money"];
            remark?: string;
            lineChanges: (components["schemas"]["LineAddCommand"] | components["schemas"]["LineSetCommand"] | components["schemas"]["LineRemoveCommand"])[];
            releaseSelections?: {
                saleAllocationId: components["schemas"]["Id"];
                quantityBase: components["schemas"]["PositiveQuantity"];
            }[];
        };
        DeliveryInput: {
            expectedVersion: components["schemas"]["Version"];
            /** @enum {string} */
            deliveryStatus: "not_delivered" | "delivered";
            deliveredAt?: components["schemas"]["Instant"] | null;
        };
        AllocationRead: {
            id: components["schemas"]["Id"];
            batchId: components["schemas"]["Id"];
            warehouseId: components["schemas"]["Id"];
            quantityBase: components["schemas"]["Quantity"];
            costAmount: components["schemas"]["Money"];
            inputUnitCost: components["schemas"]["UnitPrice"];
            costMultiplierBase: components["schemas"]["PositiveQuantity"];
            issueSequence: components["schemas"]["PositiveQuantity"];
        };
        AccountChange: {
            customerId: components["schemas"]["Id"];
            beforeNetBalance: components["schemas"]["SignedMoney"];
            afterNetBalance: components["schemas"]["SignedMoney"];
        };
        ReturnSelection: {
            saleAllocationId: components["schemas"]["Id"];
            quantityBase: components["schemas"]["PositiveQuantity"];
        };
        ReturnInput: {
            expectedVersion: components["schemas"]["Version"];
            reason: string;
            lines: {
                lineId: components["schemas"]["Id"];
                quantityBase: components["schemas"]["PositiveQuantity"];
                allocationSelections?: components["schemas"]["ReturnSelection"][];
                /** @enum {string} */
                restockDisposition?: "pending" | "not_returning";
            }[];
        };
        ReturnAllocationRead: {
            id: components["schemas"]["Id"];
            saleAllocationId: components["schemas"]["Id"];
            batchId: components["schemas"]["Id"];
            warehouseId: components["schemas"]["Id"];
            quantityBase: components["schemas"]["PositiveQuantity"];
            returnAmount: components["schemas"]["Money"];
            costCreditAmount: components["schemas"]["Money"];
            restockedQuantityBase: components["schemas"]["Quantity"];
        };
        ReturnLineRead: {
            id: components["schemas"]["Id"];
            lineId: components["schemas"]["Id"];
            quantityBase: components["schemas"]["PositiveQuantity"];
            returnAmount: components["schemas"]["Money"];
            costCreditAmount: components["schemas"]["Money"];
            /** @enum {string} */
            restockDisposition: "pending" | "not_returning";
            restockedQuantityBase: components["schemas"]["Quantity"];
            allocations: components["schemas"]["ReturnAllocationRead"][];
        };
        SalesReturn: {
            id: components["schemas"]["Id"];
            returnNo: string;
            orderId: components["schemas"]["Id"];
            sourceRevisionId: components["schemas"]["Id"];
            orderVersion: components["schemas"]["Version"];
            version: components["schemas"]["Version"];
            /** @enum {string} */
            status: "confirmed" | "absorbed_by_void";
            confirmedAt: components["schemas"]["Instant"];
            returnAmount: components["schemas"]["Money"];
            costCreditAmount: components["schemas"]["Money"];
            refundedAmount: components["schemas"]["Money"];
            lines: components["schemas"]["ReturnLineRead"][];
            customerIdAtConfirmation: components["schemas"]["Id"];
            customerNameAtConfirmation: string;
        };
        RestockInput: {
            expectedVersion: components["schemas"]["Version"];
            restockedAt: components["schemas"]["Instant"];
            reason?: string;
            lines: {
                returnAllocationId: components["schemas"]["Id"];
                quantityBase: components["schemas"]["PositiveQuantity"];
            }[];
        };
        Restock: {
            id: components["schemas"]["Id"];
            returnId: components["schemas"]["Id"];
            returnVersion: components["schemas"]["Version"];
            restockedAt: components["schemas"]["Instant"];
            recordedAt: components["schemas"]["Instant"];
            lines: {
                returnAllocationId: components["schemas"]["Id"];
                quantityBase: components["schemas"]["PositiveQuantity"];
                costAmount: components["schemas"]["Money"];
            }[];
        };
        CustomerBalance: {
            customerId: components["schemas"]["Id"];
            netBalance: components["schemas"]["SignedMoney"];
            receivableBalance: components["schemas"]["Money"];
            creditBalance: components["schemas"]["Money"];
            unallocatedAmount: components["schemas"]["Money"];
            version: components["schemas"]["Version"];
            asOf: components["schemas"]["Instant"];
        };
        LedgerEntry: {
            id: components["schemas"]["Id"];
            customerId: components["schemas"]["Id"];
            kind: string;
            amount: components["schemas"]["SignedMoney"];
            effectiveAt: components["schemas"]["Instant"];
            recordedAt: components["schemas"]["Instant"];
            sourceType: string;
            sourceId: components["schemas"]["Id"];
            sourceVersion: components["schemas"]["Version"] | null;
            reversesId: components["schemas"]["Id"] | null;
        };
        OpeningBalanceInput: {
            amount: components["schemas"]["SignedMoney"];
            effectiveAt: components["schemas"]["Instant"];
            reason: string;
        };
        PaymentAllocation: {
            orderId: components["schemas"]["Id"];
            amount: components["schemas"]["PositiveMoney"];
        };
        ReceiptCashInput: {
            /** @constant */
            kind: "receipt";
            customerId: components["schemas"]["Id"];
            amount: components["schemas"]["PositiveMoney"];
            occurredAt: components["schemas"]["Instant"];
            /** @enum {string} */
            method: "cash" | "bank_transfer" | "wechat" | "alipay" | "other";
            reference?: string;
            note?: string;
            /** @enum {string} */
            allocationMode: "auto" | "manual";
            allocations?: components["schemas"]["PaymentAllocation"][];
        };
        RefundCashInput: {
            /** @constant */
            kind: "refund";
            customerId: components["schemas"]["Id"];
            amount: components["schemas"]["PositiveMoney"];
            occurredAt: components["schemas"]["Instant"];
            /** @enum {string} */
            method: "cash" | "bank_transfer" | "wechat" | "alipay" | "other";
            reference?: string;
            note?: string;
            relatedReturnId?: components["schemas"]["Id"] | null;
        };
        CashInput: components["schemas"]["ReceiptCashInput"] | components["schemas"]["RefundCashInput"];
        AllocationReadCash: {
            id: components["schemas"]["Id"];
            sourceEntryId: components["schemas"]["Id"];
            orderId: components["schemas"]["Id"] | null;
            refundId: components["schemas"]["Id"] | null;
            /** @enum {string} */
            kind: "allocate" | "release";
            amount: components["schemas"]["PositiveMoney"];
        };
        CashEvent: {
            id: components["schemas"]["Id"];
            customerId: components["schemas"]["Id"];
            /** @enum {string} */
            kind: "receipt" | "refund";
            amount: components["schemas"]["PositiveMoney"];
            occurredAt: components["schemas"]["Instant"];
            recordedAt: components["schemas"]["Instant"];
            method: string;
            reference: string;
            note: string;
            relatedReturnId: components["schemas"]["Id"] | null;
            /** @enum {string} */
            status: "active" | "reversed";
            version: components["schemas"]["Version"];
            allocations: components["schemas"]["AllocationReadCash"][];
            balance: components["schemas"]["CustomerBalance"];
            customerName: string;
        };
        BalanceApplyInput: {
            expectedVersion: components["schemas"]["Version"];
            reason?: string;
            allocations: components["schemas"]["PaymentAllocation"][];
        };
        StatementInput: {
            periodStart: components["schemas"]["Instant"];
            periodEnd: components["schemas"]["Instant"];
        };
        Statement: {
            id: components["schemas"]["Id"];
            customerId: components["schemas"]["Id"];
            periodStart: components["schemas"]["Instant"];
            periodEnd: components["schemas"]["Instant"];
            asOf: components["schemas"]["Instant"];
            sourceWatermark: string;
            openingBalance: components["schemas"]["SignedMoney"];
            salesAmount: components["schemas"]["Money"];
            returnAmount: components["schemas"]["Money"];
            receiptAmount: components["schemas"]["Money"];
            refundAmount: components["schemas"]["Money"];
            closingBalance: components["schemas"]["SignedMoney"];
            stale: boolean;
            rows: components["schemas"]["LedgerEntry"][];
            nextCursor: string | null;
            rowCount: components["schemas"]["Quantity"];
        };
        Company: {
            name: string;
            phone: string;
            address: string;
            version: components["schemas"]["Version"];
        };
        CompanyPatch: {
            expectedVersion: components["schemas"]["Version"];
            name?: string;
            phone?: string;
            address?: string;
        };
        PrintColumn: {
            /** @enum {string} */
            field: "productName" | "specification" | "unitName" | "quantity" | "unitPrice" | "netAmount" | "warehouseName" | "remark";
            label: string;
            widthMm: number;
            /** @enum {string} */
            align: "left" | "center" | "right";
        };
        PrintPaper: {
            /** @enum {string} */
            size: "A4" | "A5" | "custom";
            /** @enum {string} */
            orientation: "portrait" | "landscape";
            widthMm?: number;
            heightMm?: number;
            marginMm: number;
        } & unknown;
        PrintConfig: {
            paper: components["schemas"]["PrintPaper"];
            headerFields: ("companyName" | "companyPhone" | "companyAddress" | "orderNo" | "confirmedAt" | "customerName" | "contactName" | "phone" | "deliveryAddress")[];
            columns: components["schemas"]["PrintColumn"][];
            minRowHeightMm: number;
            showRemark: boolean;
        };
        TemplateCreate: {
            name: string;
            config: components["schemas"]["PrintConfig"];
        };
        TemplateVersionInput: {
            expectedVersion: components["schemas"]["Version"];
            config: components["schemas"]["PrintConfig"];
        };
        TemplatePatch: {
            expectedVersion: components["schemas"]["Version"];
            name?: string;
            active?: boolean;
            isDefault?: boolean;
        };
        PrintTemplate: {
            id: components["schemas"]["Id"];
            name: string;
            active: boolean;
            isDefault: boolean;
            version: components["schemas"]["Version"];
            currentTemplateVersionId: components["schemas"]["Id"];
            currentTemplateVersionNo: components["schemas"]["Version"];
            config: components["schemas"]["PrintConfig"];
        };
        PrintJobInput: {
            orderRevisionId: components["schemas"]["Id"];
            templateVersionId: components["schemas"]["Id"];
            /** @enum {string} */
            clientPlatform: "desktop_web" | "mobile_web";
        };
        PrintStatusInput: {
            /** @enum {string} */
            status: "user_confirmed" | "user_cancelled" | "client_error";
            note: string;
        };
        PrintJob: {
            id: components["schemas"]["Id"];
            orderId: components["schemas"]["Id"];
            orderRevisionId: components["schemas"]["Id"];
            templateVersionId: components["schemas"]["Id"];
            /** @enum {string} */
            status: "requested" | "user_confirmed" | "user_cancelled" | "client_error";
            operatorId: components["schemas"]["Id"];
            requestedAt: components["schemas"]["Instant"];
            note: string;
        };
        OrderLinePublic: {
            id: components["schemas"]["Id"];
            /** @enum {string} */
            kind: "normal" | "derived" | "return_history";
            readOnly: boolean;
            productId: components["schemas"]["Id"];
            productName: string;
            specification: string;
            warehouseId: components["schemas"]["Id"];
            warehouseName: string;
            unitId: components["schemas"]["Id"];
            unitName: string;
            quantity: components["schemas"]["Quantity"] | null;
            quantityBase: components["schemas"]["Quantity"];
            multiplierBase: components["schemas"]["PositiveQuantity"];
            unitPrice: components["schemas"]["UnitPrice"];
            subtotalAmount: components["schemas"]["Money"];
            discountAllocatedAmount: components["schemas"]["Money"];
            netAmount: components["schemas"]["Money"];
            returnedQuantityBase: components["schemas"]["Quantity"];
            remark: string;
        };
        OrderLineAdmin: {
            id: components["schemas"]["Id"];
            /** @enum {string} */
            kind: "normal" | "derived" | "return_history";
            readOnly: boolean;
            productId: components["schemas"]["Id"];
            productName: string;
            specification: string;
            warehouseId: components["schemas"]["Id"];
            warehouseName: string;
            unitId: components["schemas"]["Id"];
            unitName: string;
            quantity: components["schemas"]["Quantity"] | null;
            quantityBase: components["schemas"]["Quantity"];
            multiplierBase: components["schemas"]["PositiveQuantity"];
            unitPrice: components["schemas"]["UnitPrice"];
            subtotalAmount: components["schemas"]["Money"];
            discountAllocatedAmount: components["schemas"]["Money"];
            netAmount: components["schemas"]["Money"];
            returnedQuantityBase: components["schemas"]["Quantity"];
            remark: string;
            costAmount: components["schemas"]["Money"];
            grossProfit: components["schemas"]["SignedMoney"];
            allocations: components["schemas"]["AllocationRead"][];
        };
        OrderPublic: {
            id: components["schemas"]["Id"];
            orderNo: string;
            /** @enum {string} */
            status: "draft" | "confirmed" | "voided";
            version: components["schemas"]["Version"];
            revisionId: components["schemas"]["Id"];
            revisionNo: components["schemas"]["Version"];
            customerId: components["schemas"]["Id"];
            deliverySnapshot: components["schemas"]["AddressSnapshot"];
            confirmedAt: components["schemas"]["Instant"] | null;
            /** @enum {string} */
            deliveryStatus: "not_delivered" | "delivered";
            deliveredAt: components["schemas"]["Instant"] | null;
            subtotalAmount: components["schemas"]["Money"];
            discountAmount: components["schemas"]["Money"];
            roundOffAmount: components["schemas"]["Money"];
            totalAmount: components["schemas"]["Money"];
            returnAmount: components["schemas"]["Money"];
            remark: string;
            lines: components["schemas"]["OrderLinePublic"][];
            /** @enum {string} */
            currentRevisionPrintStatus: "not_requested" | "requested" | "user_confirmed" | "client_error";
            createdAt: components["schemas"]["Instant"];
            updatedAt: components["schemas"]["Instant"];
            isCurrentRevision: boolean;
        };
        OrderAdmin: {
            id: components["schemas"]["Id"];
            orderNo: string;
            /** @enum {string} */
            status: "draft" | "confirmed" | "voided";
            version: components["schemas"]["Version"];
            revisionId: components["schemas"]["Id"];
            revisionNo: components["schemas"]["Version"];
            customerId: components["schemas"]["Id"];
            deliverySnapshot: components["schemas"]["AddressSnapshot"];
            confirmedAt: components["schemas"]["Instant"] | null;
            /** @enum {string} */
            deliveryStatus: "not_delivered" | "delivered";
            deliveredAt: components["schemas"]["Instant"] | null;
            subtotalAmount: components["schemas"]["Money"];
            discountAmount: components["schemas"]["Money"];
            roundOffAmount: components["schemas"]["Money"];
            totalAmount: components["schemas"]["Money"];
            returnAmount: components["schemas"]["Money"];
            remark: string;
            lines: components["schemas"]["OrderLineAdmin"][];
            /** @enum {string} */
            currentRevisionPrintStatus: "not_requested" | "requested" | "user_confirmed" | "client_error";
            createdAt: components["schemas"]["Instant"];
            updatedAt: components["schemas"]["Instant"];
            costAmount: components["schemas"]["Money"];
            grossProfit: components["schemas"]["SignedMoney"];
            accountChanges: components["schemas"]["AccountChange"][];
            isCurrentRevision: boolean;
        };
        OrderRead: components["schemas"]["OrderAdmin"] | components["schemas"]["OrderPublic"];
        OrderQuoteInput: components["schemas"]["OrderDraftInput"] | {
            orderId: components["schemas"]["Id"];
            revision: components["schemas"]["OrderReviseInput"];
        };
        OrderQuote: {
            calculation: components["schemas"]["OrderCalculation"];
            warnings: {
                code: string;
                message: string;
            }[];
            /** @constant */
            stockReserved: false;
            asOf: components["schemas"]["Instant"];
        };
        PrintData: {
            order: components["schemas"]["OrderPublic"];
            company: components["schemas"]["Company"];
            templateVersionId: components["schemas"]["Id"];
            templateVersionNo: components["schemas"]["Version"];
            config: components["schemas"]["PrintConfig"];
            isCurrentOrderRevision: boolean;
        };
        CalculatedLine: {
            clientLineId: string | null;
            sourceLineId: components["schemas"]["Id"] | null;
            productId: components["schemas"]["Id"];
            warehouseId: components["schemas"]["Id"];
            unitId: components["schemas"]["Id"];
            quantityBase: components["schemas"]["Quantity"];
            subtotalAmount: components["schemas"]["Money"];
            discountAllocatedAmount: components["schemas"]["Money"];
            netAmount: components["schemas"]["Money"];
            costAmount: components["schemas"]["Money"];
            grossProfit: components["schemas"]["SignedMoney"];
            readOnly: boolean;
            allocations: {
                batchId: components["schemas"]["Id"];
                warehouseId: components["schemas"]["Id"];
                quantityBase: components["schemas"]["Quantity"];
                costAmount: components["schemas"]["Money"];
                inputUnitCost: components["schemas"]["UnitPrice"];
                costMultiplierBase: components["schemas"]["PositiveQuantity"];
            }[];
        };
        OrderCalculation: {
            subtotalAmount: components["schemas"]["Money"];
            discountAmount: components["schemas"]["Money"];
            roundOffAmount: components["schemas"]["Money"];
            totalAmount: components["schemas"]["Money"];
            costAmount: components["schemas"]["Money"];
            grossProfit: components["schemas"]["SignedMoney"];
            lines: components["schemas"]["CalculatedLine"][];
            accountChanges: components["schemas"]["AccountChange"][];
        };
        OrderSummaryPublic: {
            id: components["schemas"]["Id"];
            orderNo: string;
            /** @enum {string} */
            status: "draft" | "confirmed" | "voided";
            customerId: components["schemas"]["Id"];
            customerName: string;
            version: components["schemas"]["Version"];
            revisionId: components["schemas"]["Id"];
            revisionNo: components["schemas"]["Version"];
            totalAmount: components["schemas"]["Money"];
            confirmedAt: components["schemas"]["Instant"] | null;
            /** @enum {string} */
            deliveryStatus: "not_delivered" | "delivered";
            /** @enum {string} */
            currentRevisionPrintStatus: "not_requested" | "requested" | "user_confirmed" | "client_error";
            updatedAt: components["schemas"]["Instant"];
        };
        OrderSummaryAdmin: {
            id: components["schemas"]["Id"];
            orderNo: string;
            /** @enum {string} */
            status: "draft" | "confirmed" | "voided";
            customerId: components["schemas"]["Id"];
            customerName: string;
            version: components["schemas"]["Version"];
            revisionId: components["schemas"]["Id"];
            revisionNo: components["schemas"]["Version"];
            totalAmount: components["schemas"]["Money"];
            confirmedAt: components["schemas"]["Instant"] | null;
            /** @enum {string} */
            deliveryStatus: "not_delivered" | "delivered";
            /** @enum {string} */
            currentRevisionPrintStatus: "not_requested" | "requested" | "user_confirmed" | "client_error";
            updatedAt: components["schemas"]["Instant"];
            costAmount: components["schemas"]["Money"];
            grossProfit: components["schemas"]["SignedMoney"];
        };
        OrderSummary: components["schemas"]["OrderSummaryPublic"] | components["schemas"]["OrderSummaryAdmin"];
        OrderRevisionSummary: {
            revisionId: components["schemas"]["Id"];
            revisionNo: components["schemas"]["Version"];
            createdAt: components["schemas"]["Instant"];
            changeReason: string;
            createdBy: components["schemas"]["Id"];
            isCurrent: boolean;
        };
        BarcodeUpdate: {
            expectedVersion: components["schemas"]["Version"];
            barcodes: components["schemas"]["Barcode"][];
        };
        ReportPeriod: {
            /** @enum {string} */
            mode: "mtd_previous" | "calendar_months" | "custom";
            start?: components["schemas"]["Instant"];
            end?: components["schemas"]["Instant"];
            baselineStart?: components["schemas"]["Instant"];
            baselineEnd?: components["schemas"]["Instant"];
        };
        ReportFilters: {
            customerIds?: components["schemas"]["Id"][];
            productIds?: components["schemas"]["Id"][];
            warehouseIds?: components["schemas"]["Id"][];
            batchIds?: components["schemas"]["Id"][];
            decreasesOnly?: boolean;
            minDecreaseQuantityBase?: components["schemas"]["Quantity"];
            minDecreasePercent?: string;
        };
        ReportQuery: {
            /** @enum {string} */
            kind: "sales_summary" | "customer_product_comparison" | "inventory" | "customer_balances" | "cash_flow" | "inventory_loss";
            period?: components["schemas"]["ReportPeriod"];
            filters?: components["schemas"]["ReportFilters"];
            groupBy?: ("customer" | "product" | "warehouse" | "batch" | "day" | "month")[];
            pointAsOf?: components["schemas"]["Instant"];
            /**
             * @default ordered
             * @enum {string}
             */
            quantityBasis?: "ordered" | "net";
            limit?: number;
        };
        SalesSummaryRow: {
            periodStart: components["schemas"]["Instant"];
            periodEnd: components["schemas"]["Instant"];
            grossSalesAmount: components["schemas"]["Money"];
            returnAmount: components["schemas"]["Money"];
            netSalesAmount: components["schemas"]["SignedMoney"];
            salesCostAmount: components["schemas"]["Money"];
            returnCostCreditAmount: components["schemas"]["Money"];
            grossProfit: components["schemas"]["SignedMoney"];
            orderCount: components["schemas"]["Quantity"];
            receiptAmount: components["schemas"]["Money"] | null;
            refundAmount: components["schemas"]["Money"] | null;
        };
        CustomerProductRow: {
            customerId: components["schemas"]["Id"] | null;
            customerName: string | null;
            productId: components["schemas"]["Id"];
            productName: string;
            baseUnitName: string;
            currentOrderedQuantityBase: components["schemas"]["Quantity"];
            baselineOrderedQuantityBase: components["schemas"]["Quantity"];
            currentReturnQuantityBase: components["schemas"]["Quantity"];
            baselineReturnQuantityBase: components["schemas"]["Quantity"];
            currentNetQuantityBase: components["schemas"]["SignedQuantity"];
            baselineNetQuantityBase: components["schemas"]["SignedQuantity"];
            quantityChangeBase: components["schemas"]["SignedQuantity"];
            changePercent: string | null;
            /** @enum {string} */
            trend: "decreased" | "increased" | "unchanged" | "new" | "no_baseline";
            currentNetSalesAmount: components["schemas"]["SignedMoney"];
            baselineNetSalesAmount: components["schemas"]["SignedMoney"];
        };
        InventoryRow: {
            productId: components["schemas"]["Id"];
            productName: string;
            warehouseId: components["schemas"]["Id"] | null;
            warehouseName: string | null;
            batchId: components["schemas"]["Id"] | null;
            baseUnitName: string;
            quantityBase: components["schemas"]["Quantity"];
            costAmount: components["schemas"]["Money"];
            receivedAt: components["schemas"]["Instant"] | null;
            recordedAt: components["schemas"]["Instant"] | null;
        };
        CashFlowRow: {
            eventId: components["schemas"]["Id"];
            customerId: components["schemas"]["Id"];
            /** @enum {string} */
            kind: "receipt" | "refund";
            amount: components["schemas"]["PositiveMoney"];
            occurredAt: components["schemas"]["Instant"];
            recordedAt: components["schemas"]["Instant"];
            method: string;
            customerName: string;
        };
        InventoryLossRow: {
            id: components["schemas"]["Id"];
            productId: components["schemas"]["Id"];
            warehouseId: components["schemas"]["Id"];
            batchId: components["schemas"]["Id"] | null;
            /** @enum {string} */
            kind: "stocktake_gain" | "stocktake_loss" | "return_loss" | "loss_reversal";
            amount: components["schemas"]["Money"];
            effectiveAt: components["schemas"]["Instant"];
            recordedAt: components["schemas"]["Instant"];
        };
        Report_sales_summary: {
            id: components["schemas"]["Id"];
            /** @constant */
            kind: "sales_summary";
            normalizedQuery: components["schemas"]["ReportQuery"];
            asOf: components["schemas"]["Instant"];
            generatedAt: components["schemas"]["Instant"];
            sourceWatermark: string;
            /** @constant */
            timezone: "Asia/Shanghai";
            currentPeriod: {
                start: components["schemas"]["Instant"];
                end: components["schemas"]["Instant"];
                incomplete: boolean;
            } | null;
            baselinePeriod: {
                start: components["schemas"]["Instant"];
                end: components["schemas"]["Instant"];
            } | null;
            nextCursor: string | null;
            rows: components["schemas"]["SalesSummaryRow"][];
        };
        Report_customer_product_comparison: {
            id: components["schemas"]["Id"];
            /** @constant */
            kind: "customer_product_comparison";
            normalizedQuery: components["schemas"]["ReportQuery"];
            asOf: components["schemas"]["Instant"];
            generatedAt: components["schemas"]["Instant"];
            sourceWatermark: string;
            /** @constant */
            timezone: "Asia/Shanghai";
            currentPeriod: {
                start: components["schemas"]["Instant"];
                end: components["schemas"]["Instant"];
                incomplete: boolean;
            } | null;
            baselinePeriod: {
                start: components["schemas"]["Instant"];
                end: components["schemas"]["Instant"];
            } | null;
            nextCursor: string | null;
            rows: components["schemas"]["CustomerProductRow"][];
        };
        Report_inventory: {
            id: components["schemas"]["Id"];
            /** @constant */
            kind: "inventory";
            normalizedQuery: components["schemas"]["ReportQuery"];
            asOf: components["schemas"]["Instant"];
            generatedAt: components["schemas"]["Instant"];
            sourceWatermark: string;
            /** @constant */
            timezone: "Asia/Shanghai";
            currentPeriod: {
                start: components["schemas"]["Instant"];
                end: components["schemas"]["Instant"];
                incomplete: boolean;
            } | null;
            baselinePeriod: {
                start: components["schemas"]["Instant"];
                end: components["schemas"]["Instant"];
            } | null;
            nextCursor: string | null;
            rows: components["schemas"]["InventoryRow"][];
        };
        Report_customer_balances: {
            id: components["schemas"]["Id"];
            /** @constant */
            kind: "customer_balances";
            normalizedQuery: components["schemas"]["ReportQuery"];
            asOf: components["schemas"]["Instant"];
            generatedAt: components["schemas"]["Instant"];
            sourceWatermark: string;
            /** @constant */
            timezone: "Asia/Shanghai";
            currentPeriod: {
                start: components["schemas"]["Instant"];
                end: components["schemas"]["Instant"];
                incomplete: boolean;
            } | null;
            baselinePeriod: {
                start: components["schemas"]["Instant"];
                end: components["schemas"]["Instant"];
            } | null;
            nextCursor: string | null;
            rows: components["schemas"]["CustomerBalanceRow"][];
        };
        Report_cash_flow: {
            id: components["schemas"]["Id"];
            /** @constant */
            kind: "cash_flow";
            normalizedQuery: components["schemas"]["ReportQuery"];
            asOf: components["schemas"]["Instant"];
            generatedAt: components["schemas"]["Instant"];
            sourceWatermark: string;
            /** @constant */
            timezone: "Asia/Shanghai";
            currentPeriod: {
                start: components["schemas"]["Instant"];
                end: components["schemas"]["Instant"];
                incomplete: boolean;
            } | null;
            baselinePeriod: {
                start: components["schemas"]["Instant"];
                end: components["schemas"]["Instant"];
            } | null;
            nextCursor: string | null;
            rows: components["schemas"]["CashFlowRow"][];
        };
        Report_inventory_loss: {
            id: components["schemas"]["Id"];
            /** @constant */
            kind: "inventory_loss";
            normalizedQuery: components["schemas"]["ReportQuery"];
            asOf: components["schemas"]["Instant"];
            generatedAt: components["schemas"]["Instant"];
            sourceWatermark: string;
            /** @constant */
            timezone: "Asia/Shanghai";
            currentPeriod: {
                start: components["schemas"]["Instant"];
                end: components["schemas"]["Instant"];
                incomplete: boolean;
            } | null;
            baselinePeriod: {
                start: components["schemas"]["Instant"];
                end: components["schemas"]["Instant"];
            } | null;
            nextCursor: string | null;
            rows: components["schemas"]["InventoryLossRow"][];
        };
        ReportResult: components["schemas"]["Report_sales_summary"] | components["schemas"]["Report_customer_product_comparison"] | components["schemas"]["Report_inventory"] | components["schemas"]["Report_customer_balances"] | components["schemas"]["Report_cash_flow"] | components["schemas"]["Report_inventory_loss"];
        SourceRef: {
            /** @enum {string} */
            entityType: "order_revision" | "return" | "restock" | "receipt" | "stocktake" | "cash_event" | "ledger_entry" | "batch" | "loss_entry";
            id: components["schemas"]["Id"];
            version: components["schemas"]["Version"] | null;
            recordedAt: components["schemas"]["Instant"];
            href: string;
        };
        AiInput: {
            question: string;
            clarificationRunId?: components["schemas"]["Id"];
            clarificationAnswer?: string;
        };
        AiAnswer: {
            /** @constant */
            status: "answered";
            id: components["schemas"]["Id"];
            summary: string;
            query: components["schemas"]["ReportQuery"];
            report: components["schemas"]["ReportResult"];
            evidence: components["schemas"]["SourceRef"][];
        };
        AiClarification: {
            /** @constant */
            status: "needs_clarification";
            id: components["schemas"]["Id"];
            question: string;
            choices: {
                id: string;
                label: string;
            }[];
        };
        AiResult: components["schemas"]["AiAnswer"] | components["schemas"]["AiClarification"];
        UserPage: {
            items: components["schemas"]["User"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        ProductPage: {
            items: components["schemas"]["Product"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        CustomerPage: {
            items: components["schemas"]["Customer"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        WarehousePage: {
            items: components["schemas"]["Warehouse"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        PriceRulePage: {
            items: components["schemas"]["PriceRule"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        ReceiptPage: {
            items: components["schemas"]["Receipt"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        BatchPage: {
            items: components["schemas"]["Batch"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        StockBalancePage: {
            items: components["schemas"]["StockBalance"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        StockMovementPage: {
            items: components["schemas"]["StockMovement"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        StocktakePage: {
            items: components["schemas"]["Stocktake"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        OrderPage: {
            items: components["schemas"]["OrderSummary"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        OrderRevisionPage: {
            items: components["schemas"]["OrderRevisionSummary"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        ReturnPage: {
            items: components["schemas"]["SalesReturn"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        CashEventPage: {
            items: components["schemas"]["CashEvent"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        LedgerPage: {
            items: components["schemas"]["LedgerEntry"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        AllocationPage: {
            items: components["schemas"]["AllocationReadCash"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        StatementPage: {
            items: components["schemas"]["Statement"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        TemplatePage: {
            items: components["schemas"]["PrintTemplate"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        PrintJobPage: {
            items: components["schemas"]["PrintJob"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        SourcePage: {
            items: components["schemas"]["SourceRef"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        PrintTemplateVersion: {
            id: components["schemas"]["Id"];
            templateId: components["schemas"]["Id"];
            versionNo: components["schemas"]["Version"];
            config: components["schemas"]["PrintConfig"];
            createdAt: components["schemas"]["Instant"];
        };
        TemplateVersionPage: {
            items: components["schemas"]["PrintTemplateVersion"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        OrderPageAdmin: {
            items: components["schemas"]["OrderSummaryAdmin"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        OrderPagePublic: {
            items: components["schemas"]["OrderSummaryPublic"][];
            nextCursor: string | null;
            asOf: components["schemas"]["Instant"];
        };
        CustomerBalanceRow: {
            customerId: components["schemas"]["Id"];
            netBalance: components["schemas"]["SignedMoney"];
            receivableBalance: components["schemas"]["Money"];
            creditBalance: components["schemas"]["Money"];
            unallocatedAmount: components["schemas"]["Money"];
            version: components["schemas"]["Version"];
            asOf: components["schemas"]["Instant"];
            customerName: string;
        };
    };
    responses: {
        /** @description 结构化错误，按 code 处理，详见 api-contract.md。 */
        ApiError: {
            headers: {
                "X-Request-Id"?: string;
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ApiError"];
            };
        };
    };
    parameters: {
        /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
        IdempotencyKey: string;
        /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
        CsrfToken: string;
        Cursor: string;
        Limit: number;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Session"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    login: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginInput"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Session"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    logout: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            204: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listUsers: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserPage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    createUser: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserCreate"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    updateUser: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                userId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserPatch"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listProducts: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
                q?: string;
                includeInactive?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductPage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    createProduct: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProductCreate"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Product"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getProduct: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Product"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    updateProduct: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                productId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProductPatch"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Product"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    createUnit: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                productId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UnitCreate"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Unit"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    updateUnit: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                productId: components["schemas"]["Id"];
                unitId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UnitPatch"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Unit"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    replaceBarcodes: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                productId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BarcodeUpdate"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Product"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listCustomers: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
                q?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerPage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    createCustomer: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CustomerInput"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Customer"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getCustomer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                customerId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Customer"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    updateCustomer: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                customerId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CustomerPatch"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Customer"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    createAddress: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                customerId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AddressInput"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Address"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    updateAddress: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                customerId: components["schemas"]["Id"];
                addressId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AddressPatch"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Address"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getCustomerPrice: {
        parameters: {
            query: {
                productId: components["schemas"]["Id"];
                unitId: components["schemas"]["Id"];
            };
            header?: never;
            path: {
                customerId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceQuote"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listPriceRules: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path: {
                customerId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceRulePage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    upsertPriceRule: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                customerId: components["schemas"]["Id"];
                productId: components["schemas"]["Id"];
                unitId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PriceRuleInput"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceRule"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    deletePriceRule: {
        parameters: {
            query: {
                expectedVersion: components["schemas"]["Version"];
            };
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                customerId: components["schemas"]["Id"];
                productId: components["schemas"]["Id"];
                unitId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            204: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listWarehouses: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
                q?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WarehousePage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    createWarehouse: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WarehouseInput"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Warehouse"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    updateWarehouse: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                warehouseId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WarehousePatch"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Warehouse"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listReceipts: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
                warehouseId?: components["schemas"]["Id"];
                kind?: "purchase" | "opening";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReceiptPage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    confirmReceipt: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReceiptInput"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Receipt"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getReceipt: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                receiptId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Receipt"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getStockBalances: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
                warehouseId?: components["schemas"]["Id"];
                productId?: components["schemas"]["Id"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StockBalancePage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listBatches: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
                warehouseId?: components["schemas"]["Id"];
                productId?: components["schemas"]["Id"];
                positiveOnly?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BatchPage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listStockMovements: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
                warehouseId?: components["schemas"]["Id"];
                productId?: components["schemas"]["Id"];
                batchId?: components["schemas"]["Id"];
                from?: components["schemas"]["Instant"];
                to?: components["schemas"]["Instant"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StockMovementPage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listStocktakes: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StocktakePage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    createStocktake: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StocktakeCreate"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Stocktake"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getStocktake: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                stocktakeId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Stocktake"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    updateStocktake: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                stocktakeId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StocktakePatch"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Stocktake"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    confirmStocktake: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                stocktakeId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionInput"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Stocktake"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listOrders: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
                q?: string;
                status?: "draft" | "confirmed" | "voided";
                customerId?: components["schemas"]["Id"];
                from?: components["schemas"]["Instant"];
                to?: components["schemas"]["Instant"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderPage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    createOrderDraft: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrderDraftInput"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderAdmin"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    quoteOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrderQuoteInput"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderQuote"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orderId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderRead"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    updateOrderDraft: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                orderId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrderDraftPatch"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderAdmin"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    confirmOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                orderId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionInput"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderAdmin"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listOrderRevisions: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path: {
                orderId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderRevisionPage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    reviseOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                orderId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrderReviseInput"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderAdmin"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getOrderRevision: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orderId: components["schemas"]["Id"];
                revisionId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderRead"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    voidOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                orderId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReasonInput"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderAdmin"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    setDeliveryStatus: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                orderId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeliveryInput"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderAdmin"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listOrderReturns: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path: {
                orderId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReturnPage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    confirmReturn: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                orderId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReturnInput"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SalesReturn"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getReturn: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                returnId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SalesReturn"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    recordRestock: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                returnId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RestockInput"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Restock"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getCustomerBalance: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                customerId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerBalance"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getCustomerLedger: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
                from?: components["schemas"]["Instant"];
                to?: components["schemas"]["Instant"];
            };
            header?: never;
            path: {
                customerId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LedgerPage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    recordOpeningBalance: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                customerId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OpeningBalanceInput"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerBalance"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    applyCustomerBalance: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                customerId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BalanceApplyInput"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerBalance"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listCashEvents: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
                customerId?: components["schemas"]["Id"];
                from?: components["schemas"]["Instant"];
                to?: components["schemas"]["Instant"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CashEventPage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    recordCashEvent: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CashInput"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CashEvent"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getCashEvent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cashEventId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CashEvent"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    reverseCashEvent: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                cashEventId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReasonInput"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CashEvent"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listStatements: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path: {
                customerId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StatementPage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    createStatement: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                customerId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StatementInput"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Statement"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getStatement: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path: {
                statementId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Statement"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            410: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getCompany: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Company"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    updateCompany: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompanyPatch"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Company"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listPrintTemplates: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TemplatePage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    createPrintTemplate: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TemplateCreate"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrintTemplate"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    updatePrintTemplate: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                templateId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TemplatePatch"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrintTemplate"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listPrintTemplateVersions: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path: {
                templateId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TemplateVersionPage"];
                };
            };
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
        };
    };
    createPrintTemplateVersion: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                templateId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TemplateVersionInput"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrintTemplate"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getPrintData: {
        parameters: {
            query?: {
                revisionId?: components["schemas"]["Id"];
                templateVersionId?: components["schemas"]["Id"];
            };
            header?: never;
            path: {
                orderId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrintData"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    listPrintJobs: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path: {
                orderId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrintJobPage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    createPrintJob: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                orderId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PrintJobInput"];
            };
        };
        responses: {
            /** @description 成功 */
            201: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrintJob"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    setPrintJobStatus: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
                /** @description 每次业务意图使用新键，完全相同请求重试沿用原键；已失败后改变正文也必须新键。 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                printJobId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PrintStatusInput"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    /** @description true 表示已完成请求的原结果重放 */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrintJob"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    queryReport: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReportQuery"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReportResult"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getReportRun: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path: {
                reportRunId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReportResult"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            410: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getReportSources: {
        parameters: {
            query?: {
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path: {
                reportRunId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SourcePage"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            410: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    askReport: {
        parameters: {
            query?: never;
            header: {
                /** @description 由 GET /auth/session 获取，登录与后续写请求均验证。 */
                "X-CSRF-Token": components["parameters"]["CsrfToken"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AiInput"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AiResult"];
                };
            };
            400: components["responses"]["ApiError"];
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
            409: components["responses"]["ApiError"];
            422: components["responses"]["ApiError"];
            429: components["responses"]["ApiError"];
            503: components["responses"]["ApiError"];
        };
    };
    getPrintTemplateVersion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                templateId: components["schemas"]["Id"];
                templateVersionId: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrintTemplateVersion"];
                };
            };
            401: components["responses"]["ApiError"];
            403: components["responses"]["ApiError"];
            404: components["responses"]["ApiError"];
        };
    };
}
