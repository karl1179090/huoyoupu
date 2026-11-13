import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Customer, Address, AddressSnapshot, Warehouse, OrderQuote } from '../../api/types.js';
import {
  type PickerLineItem,
  type QuoteState,
  getAddressPayload,
  hasLineErrors,
  createInitialQuoteState,
  invalidateQuoteOnConfigChange,
  applyQuoteResponse,
  applyQuoteError,
  resetQuoteState,
  addLineToSession,
  addLinesToOrder,
} from './components/batchPickerLogic.js';
import * as api from '../../api/client.js';
import { CustomerPickerModal } from './components/CustomerPickerModal.js';
import { BatchProductPicker } from './components/BatchProductPicker.js';
import { OrderLineEditor } from './components/OrderLineEditor.js';
import { OrderQuoteSummary } from './components/OrderQuoteSummary.js';
import { normalizeMoneyInput } from './components/moneyInput.js';
import {
  UsersIcon,
  PlusIcon,
  CheckIcon,
  AlertCircleIcon,
  BoxIcon,
  CartIcon,
} from '../../components/icons/index.js';

interface OrderCreatePageProps {
  onOrderCreated: (orderId: string) => void;
}

export function OrderCreatePage({ onOrderCreated }: OrderCreatePageProps) {
  // Customer & Address
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<Address | undefined>(undefined);
  const [deliverySnapshot, setDeliverySnapshot] = useState<AddressSnapshot | undefined>(undefined);

  // Warehouses
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Product Selection
  const [pickerModalOpen, setPickerModalOpen] = useState(false);
  const [orderLines, setOrderLines] = useState<PickerLineItem[]>([]);

  // Discount & Round-off
  const [discountAmount, setDiscountAmount] = useState('0.00');
  const [roundOffAmount, setRoundOffAmount] = useState('0.00');
  const [remark, setRemark] = useState('');

  // Live Server Quote with state controller and race condition protection
  const [quoteState, setQuoteState] = useState<QuoteState<OrderQuote>>(createInitialQuoteState);
  const { quote, loading: quoteLoading, dirty: quoteDirty, error: quoteError } = quoteState;
  const quoteSeqRef = useRef<number>(0);

  // Strict Money normalisation for 整单优惠 / 减免抹零. The raw editor state stays exactly as
  // typed (no per-keystroke rewrite), while quote/create payloads and confirm gating all read
  // this one canonical value, so the quote can never validate a different amount than the write.
  const discount = useMemo(() => normalizeMoneyInput(discountAmount), [discountAmount]);
  const roundOff = useMemo(() => normalizeMoneyInput(roundOffAmount), [roundOffAmount]);
  const moneyInputError = discount.error || roundOff.error;

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Business Intent Idempotency Key: held stable across retries of the same content
  const draftIntentKeyRef = useRef<string>(api.generateIdempotencyKey());
  const confirmIntentKeyRef = useRef<string>(api.generateIdempotencyKey());

  // Debounce quote
  const quoteTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Load warehouses on mount
    void api.listWarehouses().then(res => setWarehouses(res.items)).catch(() => {});
  }, []);

  // When order content changes, reset intent keys for new payload
  const resetIntentKeys = () => {
    draftIntentKeyRef.current = api.generateIdempotencyKey();
    confirmIntentKeyRef.current = api.generateIdempotencyKey();
  };

  // Recalculate quote whenever lines, customer, or discounts change
  useEffect(() => {
    if (!selectedCustomer || orderLines.length === 0) {
      setQuoteState(prev => resetQuoteState(prev));
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
      return;
    }

    // If any line has invalid quantity or batch allocation errors, don't request quote
    if (hasLineErrors(orderLines)) {
      setQuoteState(prev =>
        resetQuoteState(prev, '存在数量不合法或批次分配有误的商品明细，请先修正正整数数量')
      );
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
      return;
    }

    // Invalid discount/round-off text must invalidate the previous valid quote and never be sent.
    if (moneyInputError) {
      setQuoteState(prev => resetQuoteState(prev, moneyInputError));
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
      return;
    }

    // Instantly invalidate current quote pending debounced fetch using pure production controller:
    let nextSeq = 0;
    setQuoteState(prev => {
      const next = invalidateQuoteOnConfigChange(prev);
      nextSeq = next.seq;
      quoteSeqRef.current = nextSeq;
      return next;
    });

    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);

    quoteTimerRef.current = setTimeout(() => {
      void fetchQuote(quoteSeqRef.current);
    }, 300);

    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    };
  }, [selectedCustomer, selectedAddress, deliverySnapshot, orderLines, discount, roundOff, moneyInputError]);

  const fetchQuote = async (expectedSeq: number) => {
    if (!selectedCustomer) return;
    if (expectedSeq !== quoteSeqRef.current) return; // Superseded during 300ms debounce
    if (!discount.valid || !roundOff.valid) return; // Never quote with non-Money input

    const addressPayload = getAddressPayload(selectedAddress, deliverySnapshot);

    const payload = {
      customerId: selectedCustomer.id,
      ...addressPayload,
      lines: orderLines.map(l => ({
        clientLineId: l.clientLineId,
        productId: l.productId,
        warehouseId: l.warehouseId,
        unitId: l.unitId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        allocationMode: l.allocationMode,
        batchSelections: l.allocationMode === 'manual' ? l.batchSelections : undefined,
        remark: l.remark,
      })),
      discountAmount: discount.value,
      roundOffAmount: roundOff.value,
      remark: remark || undefined,
    };

    try {
      const q = await api.quoteOrder(payload);
      setQuoteState(prev => applyQuoteResponse(prev, expectedSeq, q));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '获取报价失败';
      setQuoteState(prev => applyQuoteError(prev, expectedSeq, msg));
    }
  };

  // Add new lines from BatchProductPicker
  const handleAddLinesFromPicker = (newLines: PickerLineItem[]) => {
    resetIntentKeys();
    setOrderLines(prev => addLinesToOrder(prev, newLines));
  };

  const handleUpdateLine = (index: number, updated: PickerLineItem) => {
    resetIntentKeys();
    setOrderLines(prev => {
      const copy = [...prev];
      copy[index] = updated;
      return copy;
    });
  };

  const handleRemoveLine = (index: number) => {
    resetIntentKeys();
    setOrderLines(prev => prev.filter((_, i) => i !== index));
  };

  const handleDuplicateLine = (line: PickerLineItem) => {
    resetIntentKeys();
    const copy: PickerLineItem = {
      ...line,
      clientLineId: 'line-' + Math.random().toString(36).substring(2, 9),
      batchSelections: [],
      batchSelectionsRaw: {},
      batchSelectionErrors: {},
      priceEdited: false,
    };
    setOrderLines(prev => addLineToSession(prev, copy));
  };

  // Validation
  const lineErrorsExist = hasLineErrors(orderLines);

  // Submit Draft
  const handleSaveDraft = async () => {
    if (!selectedCustomer) {
      setSubmitError('请先选择客户');
      return;
    }
    if (orderLines.length === 0) {
      setSubmitError('请至少添加一行商品');
      return;
    }
    if (lineErrorsExist) {
      setSubmitError('存在数量不合法或批次分配有误的商品行，请修正');
      return;
    }
    if (moneyInputError) {
      setSubmitError(moneyInputError);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const addressPayload = getAddressPayload(selectedAddress, deliverySnapshot);
      const draft = await api.createOrderDraft(
        {
          customerId: selectedCustomer.id,
          ...addressPayload,
          lines: orderLines.map(l => ({
            clientLineId: l.clientLineId,
            productId: l.productId,
            warehouseId: l.warehouseId,
            unitId: l.unitId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            allocationMode: l.allocationMode,
            batchSelections: l.allocationMode === 'manual' ? l.batchSelections : undefined,
            remark: l.remark,
          })),
          discountAmount: discount.value,
          roundOffAmount: roundOff.value,
          remark: remark || undefined,
        },
        draftIntentKeyRef.current
      );
      setSuccessMsg('草稿订单已成功保存！');
      setTimeout(() => onOrderCreated(draft.id), 800);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : '保存草稿失败');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit & Confirm Order
  const handleConfirmOrder = async () => {
    if (!selectedCustomer) {
      setSubmitError('请先选择客户与配送地址');
      return;
    }
    if (orderLines.length === 0) {
      setSubmitError('请至少添加一行商品');
      return;
    }
    if (lineErrorsExist) {
      setSubmitError('存在数量不合法或批次分配有误的商品行，请修正');
      return;
    }
    if (moneyInputError) {
      setSubmitError(moneyInputError);
      return;
    }
    if (!quote || quoteLoading || quoteDirty) {
      setSubmitError('当前订单配置尚未生成最新有效报价，请等待报价计算完成');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const addressPayload = getAddressPayload(selectedAddress, deliverySnapshot);
      // 1. Create draft with draft intent key
      const draft = await api.createOrderDraft(
        {
          customerId: selectedCustomer.id,
          ...addressPayload,
          lines: orderLines.map(l => ({
            clientLineId: l.clientLineId,
            productId: l.productId,
            warehouseId: l.warehouseId,
            unitId: l.unitId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            allocationMode: l.allocationMode,
            batchSelections: l.allocationMode === 'manual' ? l.batchSelections : undefined,
            remark: l.remark,
          })),
          discountAmount: discount.value,
          roundOffAmount: roundOff.value,
          remark: remark || undefined,
        },
        draftIntentKeyRef.current
      );

      // 2. Confirm order atomically with confirm intent key and expectedVersion
      const confirmed = await api.confirmOrder(
        draft.id,
        { expectedVersion: draft.version },
        confirmIntentKeyRef.current
      );
      setSuccessMsg(`订单 ${confirmed.orderNo} 已成功确认！`);
      setTimeout(() => onOrderCreated(confirmed.id), 800);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : '确认订单失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '90px' }}>
      {/* Top Banner & Header */}
      <div className="page-header-responsive" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.3px' }}>
            销售开单工作台
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            在同一会话中批量配置多商品，支持明细行内即时编辑与自动核算
          </p>
        </div>
      </div>

      {/* Alerts */}
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

      {successMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '13px' }}>
          <CheckIcon size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Customer & Address Section Card */}
      <div className="card">
        <div className="card-header" style={{ padding: '12px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UsersIcon size={18} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: '14px' }}>下单客户与配送信息</span>
          </div>

          <button
            type="button"
            onClick={() => setCustomerModalOpen(true)}
            className="btn btn-secondary btn-sm"
          >
            {selectedCustomer ? '更换客户/地址' : '选择客户与地址'}
          </button>
        </div>

        <div className="card-body" style={{ padding: '14px 18px' }}>
          {!selectedCustomer ? (
            <div
              onClick={() => setCustomerModalOpen(true)}
              style={{
                cursor: 'pointer',
                border: '1px dashed var(--border-strong)',
                borderRadius: 'var(--radius-sm)',
                padding: '16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '13px',
                backgroundColor: 'var(--bg-surface-subtle)',
              }}
            >
              点击选择客户门店及配送地址，开启开单流程
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', fontSize: '13px' }}>
              <div>
                <span style={{ color: 'var(--text-subtle)', fontSize: '11px', display: 'block' }}>客户名称 / 编码</span>
                <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '14px' }}>{selectedCustomer.name}</span>
                <span className="badge badge-default" style={{ marginLeft: '6px' }}>{selectedCustomer.code}</span>
              </div>

              <div>
                <span style={{ color: 'var(--text-subtle)', fontSize: '11px', display: 'block' }}>联系人 / 电话</span>
                <span>
                  {deliverySnapshot?.contactName || selectedAddress?.contactName || selectedCustomer.contactName || '无'}{' '}
                  {deliverySnapshot?.phone || selectedAddress?.phone || selectedCustomer.phone
                    ? `(${deliverySnapshot?.phone || selectedAddress?.phone || selectedCustomer.phone})`
                    : ''}
                </span>
              </div>

              <div>
                <span style={{ color: 'var(--text-subtle)', fontSize: '11px', display: 'block' }}>配送地址</span>
                <span>{selectedAddress ? selectedAddress.address : (deliverySnapshot?.address || '自提 / 现场交接')}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Order Lines Card */}
      <div className="card">
        <div className="card-header" style={{ padding: '12px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CartIcon size={18} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: '14px' }}>
              订单商品明细 ({orderLines.length} 行)
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!selectedCustomer) {
                setCustomerModalOpen(true);
                return;
              }
              setPickerModalOpen(true);
            }}
            className="btn btn-accent btn-sm"
          >
            <PlusIcon size={16} />
            <span>批量添加商品</span>
          </button>
        </div>

        <div className="card-body" style={{ padding: '14px 18px' }}>
          {orderLines.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-sm)' }}>
              <BoxIcon size={36} style={{ color: 'var(--border-strong)', margin: '0 auto 10px auto' }} />
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-main)' }}>暂无商品</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                点击“批量添加商品”打开批量选品弹窗，在同一个会话中多选商品并配置仓库与单价
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!selectedCustomer) {
                    setCustomerModalOpen(true);
                    return;
                  }
                  setPickerModalOpen(true);
                }}
                className="btn btn-primary"
                style={{ marginTop: '16px' }}
              >
                <PlusIcon size={16} />
                <span>批量添加商品</span>
              </button>
            </div>
          ) : (
            <div>
              {/* Table Column Headers */}
              <div
                className="hide-mobile"
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

              {/* Rows */}
              {orderLines.map((line, idx) => {
                const calcLine = quote?.calculation.lines.find(
                  cl => cl.clientLineId === line.clientLineId
                );
                return (
                  <OrderLineEditor
                    key={line.clientLineId}
                    line={line}
                    index={idx}
                    warehouses={warehouses}
                    calculatedLine={calcLine}
                    onChange={updated => handleUpdateLine(idx, updated)}
                    onRemove={() => handleRemoveLine(idx)}
                    onDuplicate={() => handleDuplicateLine(line)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quote Summary and Final Inputs */}
      {orderLines.length > 0 && (
        <OrderQuoteSummary
          quote={quote}
          loading={quoteLoading || quoteDirty}
          discountAmount={discountAmount}
          roundOffAmount={roundOffAmount}
          onDiscountChange={val => {
            resetIntentKeys();
            setDiscountAmount(val);
          }}
          onRoundOffChange={val => {
            resetIntentKeys();
            setRoundOffAmount(val);
          }}
        />
      )}

      {/* Order Remarks Card */}
      <div className="card">
        <div className="card-body" style={{ padding: '12px 18px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '4px' }}>
            整单备注说明
          </label>
          <input
            type="text"
            className="input"
            placeholder="填写整单运输、发票或交接特别要求..."
            value={remark}
            onChange={e => {
              resetIntentKeys();
              setRemark(e.target.value);
            }}
          />
        </div>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="order-bottom-actions-bar">
        <div className="order-bottom-actions-inner">
          <div className="order-bottom-summary-text">
            {orderLines.length > 0 ? (
              <span>已选 <strong>{orderLines.length}</strong> 行商品 {quote ? `· 预估总额: ¥${quote.calculation.totalAmount}` : ''}</span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>尚未添加订单商品</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={submitting || !selectedCustomer || orderLines.length === 0 || lineErrorsExist || Boolean(moneyInputError)}
              className="btn btn-secondary"
            >
              保存为草稿
            </button>
            <button
              type="button"
              onClick={handleConfirmOrder}
              disabled={submitting || !selectedCustomer || orderLines.length === 0 || lineErrorsExist || Boolean(moneyInputError) || !quote || quoteLoading || quoteDirty}
              className="btn btn-primary"
            >
              <CheckIcon size={16} />
              <span>{submitting ? '正在提交...' : '确认销售订单'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Customer Picker Modal */}
      <CustomerPickerModal
        isOpen={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        selectedCustomerId={selectedCustomer?.id}
        selectedAddressId={selectedAddress?.id}
        onConfirm={({ customer, address, deliverySnapshot: snap }) => {
          resetIntentKeys();
          setSelectedCustomer(customer);
          setSelectedAddress(address);
          setDeliverySnapshot(snap);
        }}
      />

      {/* Batch Product Picker Modal */}
      <BatchProductPicker
        isOpen={pickerModalOpen}
        onClose={() => setPickerModalOpen(false)}
        customerId={selectedCustomer?.id || ''}
        warehouses={warehouses}
        onConfirm={handleAddLinesFromPicker}
      />
    </div>
  );
}
