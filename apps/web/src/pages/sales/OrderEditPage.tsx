import React, { useState, useEffect, useMemo, useRef } from 'react';
import type {
  OrderAny,
  Warehouse,
  Customer,
  Address,
  AddressSnapshot,
  OrderQuote,
  CalculatedLine,
  OrderReviseInput,
} from '../../api/types.js';
import type { PickerLineItem } from './components/BatchProductPicker.js';
import {
  type QuoteState,
  createInitialQuoteState,
  invalidateQuoteOnConfigChange,
  applyQuoteResponse,
  applyQuoteError,
  resetQuoteState,
  getAddressPayload,
} from './components/batchPickerLogic.js';
import * as api from '../../api/client.js';
import { CustomerPickerModal } from './components/CustomerPickerModal.js';
import { BatchProductPicker } from './components/BatchProductPicker.js';
import { OrderLineEditor } from './components/OrderLineEditor.js';
import { OrderQuoteSummary } from './components/OrderQuoteSummary.js';
import { normalizeMoneyInput } from './components/moneyInput.js';
import { buildLineChanges, type RevisionLineState } from './orderEditLogic.js';
import {
  CheckIcon,
  AlertCircleIcon,
  PlusIcon,
  CartIcon,
  UsersIcon,
} from '../../components/icons/index.js';

interface OrderEditPageProps {
  orderId: string;
  onBack: () => void;
  onRevisionSuccess: (orderId: string) => void;
}

interface EditableOrderLine extends PickerLineItem, RevisionLineState {
  originalLineId?: string;
  isNew?: boolean;
  isRemoved?: boolean;
  readOnly?: boolean;
}

/**
 * Associates an editable or read-only order line with its server-calculated quote line.
 * For existing lines (including return splits): associates by sourceLineId + readOnly.
 * For new added lines: associates by sourceLineId === null && clientLineId.
 */
function findCalculatedLine(line: EditableOrderLine, calcLines?: CalculatedLine[]): CalculatedLine | undefined {
  if (!calcLines || calcLines.length === 0) return undefined;
  if (line.originalLineId) {
    return calcLines.find(cl => cl.sourceLineId === line.originalLineId && cl.readOnly === Boolean(line.readOnly));
  }
  if (line.clientLineId) {
    return calcLines.find(cl => (!cl.sourceLineId || cl.sourceLineId === null) && cl.clientLineId === line.clientLineId);
  }
  return undefined;
}

/**
 * Accurately parses a decimal amount string into integer cents using BigInt,
 * completely avoiding IEEE 754 precision loss even for large amounts or single-cent differences.
 */
export function parseDecimalToCents(amountStr: string | number | undefined | null): bigint {
  if (amountStr === undefined || amountStr === null || amountStr === '') return 0n;
  const str = String(amountStr).trim();
  const isNeg = str.startsWith('-');
  const cleanStr = isNeg ? str.slice(1) : str;
  const parts = cleanStr.split('.');
  const intPart = parts[0] || '0';
  const fracPart = (parts[1] || '').padEnd(2, '0').slice(0, 2);
  const cents = BigInt(intPart) * 100n + BigInt(fracPart);
  return isNeg ? -cents : cents;
}

export function formatCentsDelta(deltaCents: bigint): { text: string; isPositive: boolean; isNegative: boolean } {
  if (deltaCents === 0n) {
    return { text: '¥0.00', isPositive: false, isNegative: false };
  }
  const isNeg = deltaCents < 0n;
  const absVal = isNeg ? -deltaCents : deltaCents;
  const dollars = absVal / 100n;
  const cents = (absVal % 100n).toString().padStart(2, '0');
  const formatted = `${dollars}.${cents}`;
  return {
    text: isNeg ? `-¥${formatted}` : `+¥${formatted}`,
    isPositive: !isNeg,
    isNegative: isNeg,
  };
}

export function OrderEditPage({
  orderId,
  onBack,
  onRevisionSuccess,
}: OrderEditPageProps) {
  const [order, setOrder] = useState<OrderAny | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  // Customer & Delivery fields
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [deliverySnapshot, setDeliverySnapshot] = useState<AddressSnapshot | undefined>(undefined);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);

  // Edit fields
  const [lines, setLines] = useState<EditableOrderLine[]>([]);
  const [reason, setReason] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0.00');
  const [roundOffAmount, setRoundOffAmount] = useState('0.00');
  const [remark, setRemark] = useState('');

  // Batch Picker modal
  const [pickerModalOpen, setPickerModalOpen] = useState(false);

  // Server Quote & Submission with production QuoteState controller
  const [quoteState, setQuoteState] = useState<QuoteState<OrderQuote>>(createInitialQuoteState);
  const { quote, loading: quoteLoading, dirty: quoteDirty, error: quoteError } = quoteState;
  const quoteSeqRef = useRef<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Strict Money normalisation for 整单优惠 / 减免抹零 (raw editor text stays untouched).
  // Quote + revision payload + confirm gating all read this one canonical value.
  const discount = useMemo(() => normalizeMoneyInput(discountAmount), [discountAmount]);
  const roundOff = useMemo(() => normalizeMoneyInput(roundOffAmount), [roundOffAmount]);
  const moneyInputError = discount.error || roundOff.error;

  // Business intent idempotency key
  const intentKeyRef = useRef<string>(api.generateIdempotencyKey());

  useEffect(() => {
    void initialize();
  }, [orderId]);

  const initialize = async () => {
    setLoading(true);
    try {
      const [ord, whs, prods] = await Promise.all([
        api.getOrder(orderId),
        api.listWarehouses(),
        api.listProducts({ limit: 100 }),
      ]);
      setOrder(ord);
      setWarehouses(whs.items);
      setDiscountAmount(ord.discountAmount);
      setRoundOffAmount(ord.roundOffAmount);
      setRemark(ord.remark || '');

      try {
        const cust = await api.getCustomer(ord.customerId);
        setSelectedCustomer(cust);
        if (ord.deliverySnapshot?.address) {
          setSelectedAddress(cust.addresses.find(a => a.address === ord.deliverySnapshot?.address) || null);
        } else {
          setSelectedAddress(null);
        }
      } catch {
        // Fallback
      }
      setDeliverySnapshot(ord.deliverySnapshot);

      const prodMap = new Map(prods.items.map(p => [p.id, p]));
      for (const l of ord.lines) {
        if (!prodMap.has(l.productId)) {
          try {
            const p = await api.getProduct(l.productId);
            prodMap.set(p.id, p);
          } catch {
            // fallback
          }
        }
      }

      // Transform existing lines: preserve quantityBase without forging quantity || 1
      // Note: return_history is readOnly; unreturned derived lines (readOnly: false) are editable!
      // In Stage A20: If line has returnedQuantityBase > 0 and is not already return_history,
      // split it safely into:
      // 1) Read-only protected segment (quantity = returnedQuantityBase, unit = base unit)
      // 2) Editable remaining segment (quantity = quantityBase - returnedQuantityBase, unit = base unit)
      const mapped: EditableOrderLine[] = [];

      for (const l of ord.lines) {
        const prod = prodMap.get(l.productId);
        const allUnits = prod?.units || [{
          id: l.unitId,
          productId: l.productId,
          name: l.unitName,
          multiplierBase: l.multiplierBase,
          defaultSalePrice: l.unitPrice,
          defaultReceiptCost: null,
          active: true,
          version: 1,
        }];
        const baseUnit = allUnits.find(u => u.id === prod?.baseUnitId) || allUnits.find(u => u.multiplierBase === 1) || allUnits[0]!;

        const hasReturned = !l.readOnly && l.kind !== 'return_history' && (l.returnedQuantityBase || 0) > 0;

        if (hasReturned) {
          const returnedBase = l.returnedQuantityBase || 0;
          const remainingBase = l.quantityBase - returnedBase;

          // 1. 只读保护段（显示已退数量，只读）
          mapped.push({
            clientLineId: 'protected-' + l.id,
            originalLineId: l.id,
            productId: l.productId,
            productName: l.productName,
            specification: l.specification,
            warehouseId: l.warehouseId,
            unitId: baseUnit.id,
            quantity: returnedBase,
            quantityRaw: String(returnedBase),
            unitPrice: l.unitPrice,
            allocationMode: 'auto',
            batchSelections: [],
            remark: l.remark ? `${l.remark} (已退历史保护段)` : '已退历史保护段',
            readOnly: true,
            returnedQuantityBase: returnedBase,
            units: [baseUnit],
            readOnlyBadgeText: `已退${returnedBase}${baseUnit.name} (只读)`,
            priceNote: `原订单已退货部分 (${returnedBase}${baseUnit.name})，不可修改或删除`,
            initialQuantity: returnedBase,
            initialUnitId: baseUnit.id,
            initialWarehouseId: l.warehouseId,
            initialRemark: l.remark ? `${l.remark} (已退历史保护段)` : '已退历史保护段',
            initialAllocationMode: 'auto',
          });

          // 2. 可编辑余量段
          const originalUnitName = l.unitName || '件';
          const priceLabel = `沿用原价 ${l.unitPrice}元/${originalUnitName}${l.multiplierBase > 1 ? ` (${l.multiplierBase}${baseUnit.name})` : ''}`;

          mapped.push({
            clientLineId: 'existing-' + l.id,
            originalLineId: l.id,
            productId: l.productId,
            productName: l.productName,
            specification: l.specification,
            warehouseId: l.warehouseId,
            unitId: baseUnit.id, // 基础单位整数编辑，不显示0.75件
            quantity: remainingBase,
            quantityRaw: String(remainingBase),
            unitPrice: '', // 初始不显式改价，保持继承定价口径
            priceEdited: false, // 标记用户尚未显式输入新单价
            allocationMode: 'auto',
            batchSelections: [],
            remark: l.remark,
            readOnly: false,
            returnedQuantityBase: returnedBase,
            units: [baseUnit], // 锁定基础单位编辑
            priceNote: priceLabel,
            initialQuantity: remainingBase,
            initialUnitId: baseUnit.id,
            initialWarehouseId: l.warehouseId,
            initialRemark: l.remark,
            initialAllocationMode: 'auto',
          });
        } else {
          // 普通行或已拆分派生行
          const effectiveQty = l.quantity !== null && l.quantity !== undefined ? l.quantity : l.quantityBase;
          const isReadOnly = Boolean(l.readOnly || l.kind === 'return_history');

          mapped.push({
            clientLineId: 'existing-' + l.id,
            originalLineId: l.id,
            productId: l.productId,
            productName: l.productName,
            specification: l.specification,
            warehouseId: l.warehouseId,
            unitId: l.unitId,
            quantity: effectiveQty,
            quantityRaw: String(effectiveQty),
            unitPrice: l.unitPrice,
            priceEdited: false,
            allocationMode: 'auto',
            batchSelections: [],
            remark: l.remark,
            readOnly: isReadOnly,
            returnedQuantityBase: l.returnedQuantityBase || 0,
            units: allUnits,
            initialQuantity: effectiveQty,
            initialUnitId: l.unitId,
            initialWarehouseId: l.warehouseId,
            initialRemark: l.remark,
            initialAllocationMode: 'auto',
          });
        }
      }
      setLines(mapped);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : '加载待改单据失败');
    } finally {
      setLoading(false);
    }
  };

  const resetIntentKey = () => {
    intentKeyRef.current = api.generateIdempotencyKey();
  };

  // Build revision payload
  const buildRevisionPayload = (): OrderReviseInput | null => {
    if (!order) return null;
    // Never build (or submit) a revision with non-Money discount text.
    if (!discount.valid || !roundOff.valid) return null;
    // Only real operator changes are sent. Untouched existing lines (including
    // return-derived remainder lines) are omitted entirely so the backend keeps
    // their stored pricingBasis instead of re-pricing the displayed approximation.
    const lineChanges = buildLineChanges(lines);

    const addressPayload = getAddressPayload(selectedAddress, deliverySnapshot);

    return {
      expectedVersion: order.version,
      reason: reason.trim() || '订单日常更正',
      customerId: selectedCustomer?.id || order.customerId,
      ...addressPayload,
      lineChanges,
      discountAmount: discount.value,
      roundOffAmount: roundOff.value,
      remark: remark || undefined,
    };
  };

  // Quote live revision with QuoteState controller and race condition protection
  useEffect(() => {
    if (!order || lines.length === 0) {
      setQuoteState(prev => resetQuoteState(prev));
      return;
    }
    const hasErrors = lines.some(l => !l.isRemoved && (
      l.quantityError ||
      l.quantity <= 0 ||
      (l.batchSelectionErrors && Object.keys(l.batchSelectionErrors).length > 0)
    ));
    if (hasErrors) {
      setQuoteState(prev => resetQuoteState(prev, '存在数量不合法或批次分配有误的明细，请先修正正整数数量'));
      return;
    }

    // Non-Money discount text invalidates the previous valid quote and blocks the API call.
    if (moneyInputError) {
      setQuoteState(prev => resetQuoteState(prev, moneyInputError));
      return;
    }

    let nextSeq = 0;
    setQuoteState(prev => {
      const next = invalidateQuoteOnConfigChange(prev);
      nextSeq = next.seq;
      quoteSeqRef.current = nextSeq;
      return next;
    });

    const timer = setTimeout(() => {
      void fetchRevisionQuote(quoteSeqRef.current);
    }, 400);
    return () => clearTimeout(timer);
  }, [
    selectedCustomer?.id,
    selectedAddress?.id,
    deliverySnapshot?.customerName,
    deliverySnapshot?.contactName,
    deliverySnapshot?.phone,
    deliverySnapshot?.address,
    lines,
    discount,
    roundOff,
    moneyInputError,
  ]);

  const fetchRevisionQuote = async (expectedSeq: number) => {
    const payload = buildRevisionPayload();
    if (!payload || !order) return;
    if (expectedSeq !== quoteSeqRef.current) return;
    try {
      const q = await api.quoteOrder({
        orderId: order.id,
        revision: payload,
      });
      setQuoteState(prev => applyQuoteResponse(prev, expectedSeq, q));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '报价失败';
      setQuoteState(prev => applyQuoteError(prev, expectedSeq, msg));
    }
  };

  const activeLines = lines.filter(l => !l.isRemoved);
  const hasLineErrors = activeLines.some(l =>
    l.quantityError ||
    l.quantity <= 0 ||
    (l.batchSelectionErrors && Object.keys(l.batchSelectionErrors).length > 0)
  );

  const handleConfirmRevision = async () => {
    if (!order) return;
    if (!reason.trim()) {
      setSubmitError('改单必须填写变更原因说明');
      return;
    }
    if (hasLineErrors) {
      setSubmitError('存在数量不合法的商品明细，请输入正整数');
      return;
    }
    if (moneyInputError) {
      setSubmitError(moneyInputError);
      return;
    }
    if (!quote || quoteLoading || quoteDirty) {
      setSubmitError('当前改单尚未完成最新有效报价，请等待报价计算完成');
      return;
    }
    const payload = buildRevisionPayload();
    if (!payload) return;
    payload.reason = reason.trim();

    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.reviseOrder(order.id, payload, intentKeyRef.current);
      onRevisionSuccess(order.id);
    } catch (err: unknown) {
      if (err instanceof api.ClientError && err.status === 409) {
        if (err.code === 'VERSION_CONFLICT') {
          setSubmitError('订单已被其他操作员更新（版本冲突），已自动刷新最新版本并重置意图与报价，请确认后重新提交');
          resetIntentKey();
          void initialize();
        } else {
          setSubmitError(`提交冲突 (${err.code}): ${err.message}`);
        }
      } else {
        setSubmitError(err instanceof Error ? err.message : '提交改单失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-subtle)' }}>加载中...</div>;
  }
  if (!order) {
    return <div style={{ padding: '48px', textAlign: 'center' }}>订单不存在</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '90px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onBack} className="btn btn-secondary btn-sm">
            ← 取消并返回
          </button>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>
              更正已确认销售订单 - {order.orderNo}
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              修改各行数量、单价与批次，支持添加新商品或拆行。已退货段受保护不可篡改。
            </p>
          </div>
        </div>
      </div>

      {submitError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px' }}>
          <AlertCircleIcon size={16} />
          <span>{submitError}</span>
        </div>
      )}

      {quoteError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 'var(--radius-sm)', color: 'var(--warning)', fontSize: '13px' }}>
          <AlertCircleIcon size={16} />
          <span>报价提示: {quoteError}</span>
        </div>
      )}

      {/* Customer & Delivery Information Card */}
      <div className="card">
        <div className="card-header" style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UsersIcon size={18} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: '14px' }}>
              客户与配送信息
            </span>
            {selectedCustomer && selectedCustomer.id !== order.customerId && (
              <span className="badge badge-warning" style={{ fontSize: '11px' }}>
                已变更客户 (原单客户: {order.deliverySnapshot?.customerName || '原客户'})
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCustomerModalOpen(true)}
          >
            更换客户 / 配送信息
          </button>
        </div>
        <div className="card-body" style={{ padding: '12px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', fontSize: '13px' }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>客户名称：</span>
            <strong style={{ color: 'var(--text-main)' }}>{selectedCustomer?.name || order.deliverySnapshot?.customerName || '原客户'}</strong>
            <span className="badge badge-default" style={{ marginLeft: '6px', fontSize: '11px' }}>{selectedCustomer?.code || '—'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>交付方式：</span>
            <span>
              {selectedAddress
                ? `${selectedAddress.contactName} (${selectedAddress.phone}) · ${selectedAddress.address}`
                : deliverySnapshot
                ? `[自定义快照] ${deliverySnapshot.contactName} (${deliverySnapshot.phone}) · ${deliverySnapshot.address}`
                : '未指定地址（默认自提/现场交接）'}
            </span>
          </div>
        </div>
      </div>

      {/* Revision Reason Card */}
      <div className="card">
        <div className="card-body" style={{ padding: '14px 18px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
            变更原因说明 <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            type="text"
            className="input"
            required
            placeholder="例如：客户追加订单、协商调整价格、更换提货仓库..."
            value={reason}
            onChange={e => {
              resetIntentKey();
              setReason(e.target.value);
            }}
          />
        </div>
      </div>

      {/* Order Lines Card */}
      <div className="card">
        <div className="card-header" style={{ padding: '12px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CartIcon size={18} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: '14px' }}>
              订单明细列表 ({activeLines.length} 行)
            </span>
          </div>

          <button
            type="button"
            onClick={() => setPickerModalOpen(true)}
            className="btn btn-accent btn-sm"
          >
            <PlusIcon size={16} />
            <span>批量添加新商品</span>
          </button>
        </div>

        <div className="card-body" style={{ padding: '14px 18px' }}>
          {/* Table headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '40px 1.5fr 1.2fr 1fr 1fr 1.2fr 1.2fr 90px',
              padding: '8px 12px',
              gap: '8px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border-default)',
              marginBottom: '8px',
            }}
          >
            <div>#</div>
            <div>商品名称 / 规格</div>
            <div>出货仓库</div>
            <div>销售单位</div>
            <div>数量</div>
            <div>成交单价 (元)</div>
            <div className="text-right">应付小计 (元)</div>
            <div className="text-right">操作</div>
          </div>

          {activeLines.map((line, idx) => {
            const calcLine = findCalculatedLine(line, quote?.calculation?.lines);
            return (
              <OrderLineEditor
                key={line.clientLineId}
                line={line}
                index={idx}
                warehouses={warehouses}
                calculatedLine={calcLine}
                readOnly={line.readOnly}
              onChange={updated => {
                resetIntentKey();
                setLines(prev => prev.map(l => (l.clientLineId === line.clientLineId ? {
                  ...updated,
                  originalLineId: line.originalLineId,
                  isNew: line.isNew,
                  readOnly: line.readOnly,
                  // Baseline for change detection must survive every edit.
                  initialQuantity: l.initialQuantity,
                  initialUnitId: l.initialUnitId,
                  initialWarehouseId: l.initialWarehouseId,
                  initialRemark: l.initialRemark,
                  initialAllocationMode: l.initialAllocationMode,
                } : l)));
              }}
              onRemove={() => {
                resetIntentKey();
                if (line.readOnly) return;
                setLines(prev =>
                  prev.map(l => (l.clientLineId === line.clientLineId ? { ...l, isRemoved: true } : l))
                );
              }}
              onDuplicate={() => {
                resetIntentKey();
                const copy: EditableOrderLine = {
                  ...line,
                  clientLineId: 'new-line-' + Math.random().toString(36).substring(2, 9),
                  originalLineId: undefined,
                  isNew: true,
                  readOnly: false,
                  batchSelections: [],
                  priceEdited: false,
                };
                setLines(prev => [...prev, copy]);
              }}
            />
            );
          })}
        </div>
      </div>

      {/* Quote Summary */}
      <OrderQuoteSummary
        quote={quote}
        loading={quoteLoading || quoteDirty}
        discountAmount={discountAmount}
        roundOffAmount={roundOffAmount}
        onDiscountChange={val => {
          resetIntentKey();
          setDiscountAmount(val);
        }}
        onRoundOffChange={val => {
          resetIntentKey();
          setRoundOffAmount(val);
        }}
      />

      {/* Account Balance Changes Impact Prediction */}
      {quote?.calculation?.accountChanges && quote.calculation.accountChanges.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
          <div className="card-body" style={{ padding: '14px 18px' }}>
            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)', marginBottom: '10px' }}>
              改单对往来账款影响预测 (共 {quote.calculation.accountChanges.length} 个账户变动)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {quote.calculation.accountChanges.map((change, idx) => {
                const bCents = parseDecimalToCents(change.beforeNetBalance);
                const aCents = parseDecimalToCents(change.afterNetBalance);
                const diffCents = aCents - bCents;
                const delta = formatCentsDelta(diffCents);

                const isCustSwitched = Boolean(selectedCustomer && selectedCustomer.id !== order.customerId);
                const isOriginalCustomer = change.customerId === order.customerId;
                const isSelectedCustomer = Boolean(selectedCustomer && change.customerId === selectedCustomer.id);

                let roleTag = '';
                let customerNameDisplay = '';

                if (isCustSwitched) {
                  if (isOriginalCustomer) {
                    roleTag = '（原客户冲减）';
                    customerNameDisplay = order.deliverySnapshot?.customerName || '原客户';
                  } else if (isSelectedCustomer) {
                    roleTag = '（新客户计入）';
                    customerNameDisplay = selectedCustomer?.name || '新客户';
                  } else {
                    roleTag = '（关联账户）';
                    customerNameDisplay = change.customerId;
                  }
                } else {
                  customerNameDisplay = selectedCustomer?.name || order.deliverySnapshot?.customerName || '当前客户';
                }

                return (
                  <div key={change.customerId || idx} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', fontSize: '12px', padding: '10px 14px', background: 'var(--bg-app)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                        账户主体 {roleTag}：
                      </span>
                      <strong style={{ fontSize: '13px' }}>
                        {customerNameDisplay}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>净应收余额变动：</span>
                      <span className="tabular-nums" style={{ fontWeight: 600, fontSize: '13px' }}>
                        ¥{change.beforeNetBalance} → ¥{change.afterNetBalance}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>净额变动差额：</span>
                      <span className="tabular-nums" style={{ fontWeight: 700, fontSize: '13px', color: delta.isPositive ? 'var(--danger)' : delta.isNegative ? 'var(--success)' : 'inherit' }}>
                        {delta.text}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sticky Action Bar */}
      <div className="order-bottom-actions-bar">
        <div className="order-bottom-actions-inner">
          <div className="order-bottom-summary-text">
            <span>有效明细 <strong>{activeLines.length}</strong> 行 {quote ? `· 预估总额: ¥${quote.calculation.totalAmount}` : ''}</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={onBack}
              disabled={submitting}
              className="btn btn-secondary"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirmRevision}
              disabled={submitting || activeLines.length === 0 || hasLineErrors || Boolean(moneyInputError) || !quote || quoteLoading || quoteDirty}
              className="btn btn-primary"
            >
              <CheckIcon size={16} />
              <span>{submitting ? '正在提交更正...' : '确认更正并重新记账 (v' + (order.revisionNo + 1) + ')'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Batch Product Picker Modal */}
      <BatchProductPicker
        isOpen={pickerModalOpen}
        onClose={() => setPickerModalOpen(false)}
        customerId={selectedCustomer?.id || order.customerId}
        warehouses={warehouses}
        onConfirm={newItems => {
          resetIntentKey();
          const mapped: EditableOrderLine[] = newItems.map(item => ({
            ...item,
            isNew: true,
          }));
          setLines(prev => [...prev, ...mapped]);
        }}
      />

      {/* Customer Picker Modal */}
      <CustomerPickerModal
        isOpen={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        selectedCustomerId={selectedCustomer?.id || order.customerId}
        selectedAddressId={selectedAddress?.id || undefined}
        onConfirm={({ customer, address, deliverySnapshot: snap }) => {
          resetIntentKey();
          setSelectedCustomer(customer);
          setSelectedAddress(address || null);
          setDeliverySnapshot(snap);
        }}
      />
    </div>
  );
}
