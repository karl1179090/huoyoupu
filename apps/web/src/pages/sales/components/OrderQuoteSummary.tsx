import React from 'react';
import type { OrderQuote } from '../../../api/types.js';
import { useAuth } from '../../../context/AuthContext.js';
import { AlertCircleIcon, CheckIcon } from '../../../components/icons/index.js';

interface OrderQuoteSummaryProps {
  quote: OrderQuote | null;
  loading: boolean;
  discountAmount: string;
  roundOffAmount: string;
  onDiscountChange: (val: string) => void;
  onRoundOffChange: (val: string) => void;
  readOnly?: boolean;
}

export function OrderQuoteSummary({
  quote,
  loading,
  discountAmount,
  roundOffAmount,
  onDiscountChange,
  onRoundOffChange,
  readOnly = false,
}: OrderQuoteSummaryProps) {
  const { isAdmin } = useAuth();

  const calc = quote?.calculation;
  const warnings = quote?.warnings || [];

  // Compute profit margin percentage cleanly if admin
  let marginText = '—';
  let isNegativeProfit = false;
  if (calc && isAdmin && calc.totalAmount && calc.grossProfit) {
    const net = parseFloat(calc.totalAmount);
    const profit = parseFloat(calc.grossProfit);
    if (net > 0) {
      const margin = (profit / net) * 100;
      marginText = `${margin.toFixed(1)}%`;
      if (profit < 0) isNegativeProfit = true;
    }
  }

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-main)' }}>
          订单金额核算与优惠
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {loading && <span style={{ fontSize: '12px', color: 'var(--text-subtle)' }}>正在核算最新报价...</span>}
          <span className="badge badge-default" style={{ fontSize: '11px' }}>
            系统自动核算
          </span>
        </div>
      </div>

      {/* Warnings from backend */}
      {warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {warnings.map((w, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                background: 'var(--warning-bg)',
                border: '1px solid var(--warning-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--warning)',
                fontSize: '12px',
              }}
            >
              <AlertCircleIcon size={14} />
              <span>{typeof w === 'string' ? w : w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Calculations Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', alignItems: 'flex-start' }}>
        {/* Subtotal */}
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>商品小计</div>
          <div className="tabular-nums" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>
            ¥{calc?.subtotalAmount || '0.00'}
          </div>
        </div>

        {/* Discount Amount Input */}
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>整单优惠 (元)</div>
          {readOnly ? (
            <div className="tabular-nums" style={{ fontSize: '15px', color: 'var(--text-main)' }}>¥{discountAmount}</div>
          ) : (
            <input
              type="text"
              className="input tabular-nums"
              value={discountAmount}
              onChange={e => onDiscountChange(e.target.value)}
              placeholder="0.00"
              style={{ height: '30px', fontSize: '13px' }}
            />
          )}
        </div>

        {/* Round Off Amount Input */}
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>减免抹零 (元)</div>
          {readOnly ? (
            <div className="tabular-nums" style={{ fontSize: '15px', color: 'var(--text-main)' }}>¥{roundOffAmount}</div>
          ) : (
            <input
              type="text"
              className="input tabular-nums"
              value={roundOffAmount}
              onChange={e => onRoundOffChange(e.target.value)}
              placeholder="0.00"
              style={{ height: '30px', fontSize: '13px' }}
            />
          )}
        </div>

        {/* Total Net Amount */}
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>应付总额</div>
          <div className="tabular-nums" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>
            ¥{calc?.totalAmount || '0.00'}
          </div>
        </div>

        {/* Admin only: Cost & Profit */}
        {isAdmin && (
          <>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>预估总成本</div>
              <div className="tabular-nums" style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-muted)' }}>
                ¥{calc?.costAmount || '0.00'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>预估毛利 / 毛利率</div>
              <div
                className="tabular-nums"
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: isNegativeProfit ? 'var(--danger)' : 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>¥{calc?.grossProfit || '0.00'}</span>
                <span style={{ fontSize: '12px' }}>({marginText})</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Account receivable preview */}
      {calc?.accountChanges && calc.accountChanges.length > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', paddingTop: '6px', borderTop: '1px solid var(--border-light)' }}>
          <span>客户资金变动核对: </span>
          {calc.accountChanges.map((ac, i) => (
            <span key={i} style={{ marginRight: '10px' }}>
              变动前净结余 ¥{ac.beforeNetBalance} → 变动后净结余 ¥{ac.afterNetBalance}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
