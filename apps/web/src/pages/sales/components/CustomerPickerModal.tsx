import React, { useState, useEffect } from 'react';
import type { Customer, Address, AddressSnapshot } from '../../../api/types.js';
import * as api from '../../../api/client.js';
import { SearchIcon, XIcon, CheckIcon, UsersIcon } from '../../../components/icons/index.js';

interface CustomerPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomerId?: string;
  selectedAddressId?: string;
  onConfirm: (payload: { customer: Customer; address?: Address; deliverySnapshot?: AddressSnapshot }) => void;
}

export function CustomerPickerModal({
  isOpen,
  onClose,
  selectedCustomerId,
  selectedAddressId,
  onConfirm,
}: CustomerPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [chosenAddressId, setChosenAddressId] = useState<string | undefined>(selectedAddressId);
  const [useCustomSnapshot, setUseCustomSnapshot] = useState(false);
  const [customContactName, setCustomContactName] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [customAddress, setCustomAddress] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setValidationError(null);
    void loadCustomers(searchQuery);
  }, [isOpen]);

  const loadCustomers = async (q: string) => {
    setLoading(true);
    try {
      const res = await api.listCustomers({ q: q.trim() || undefined, limit: 50 });
      setCustomers(res.items);
      if (selectedCustomerId) {
        const found = res.items.find(c => c.id === selectedCustomerId);
        if (found) {
          applyCustomerSelection(found, selectedAddressId);
        }
      } else if (res.items.length > 0 && !activeCustomer) {
        applyCustomerSelection(res.items[0]!);
      }
    } catch {
      // Keep state
    } finally {
      setLoading(false);
    }
  };

  const applyCustomerSelection = (c: Customer, preferredAddressId?: string) => {
    setActiveCustomer(c);
    setValidationError(null);
    const activeAddrs = c.addresses.filter(a => a.active);
    const matched = preferredAddressId ? activeAddrs.find(a => a.id === preferredAddressId) : undefined;
    const def = matched || activeAddrs.find(a => a.isDefault) || activeAddrs[0];

    if (def) {
      setChosenAddressId(def.id);
      setUseCustomSnapshot(false);
    } else {
      setChosenAddressId(undefined);
      setUseCustomSnapshot(true);
    }

    setCustomContactName(c.contactName || c.name || '');
    setCustomPhone(c.phone || '');
    setCustomAddress('');
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    void loadCustomers(val);
  };

  const handleSelectCustomer = (c: Customer) => {
    applyCustomerSelection(c);
  };

  const handleConfirm = () => {
    if (!activeCustomer) return;
    setValidationError(null);

    if (!useCustomSnapshot && chosenAddressId) {
      const addr = activeCustomer.addresses.find(a => a.id === chosenAddressId && a.active);
      if (addr) {
        onConfirm({
          customer: activeCustomer,
          address: addr,
          deliverySnapshot: undefined,
        });
        onClose();
        return;
      }
    }

    // Custom snapshot branch: strictly validate user input without silent fake placeholders
    const contact = customContactName.trim();
    const phone = customPhone.trim();
    const address = customAddress.trim();

    if (!contact) {
      setValidationError('配送快照必须包含联系人姓名，请填写');
      return;
    }
    if (!phone) {
      setValidationError('配送快照必须包含联系电话，请填写真实联系电话');
      return;
    }
    if (!address) {
      setValidationError('客户无预设有效地址或已选自填快照，请填写具体的交付/自提地址');
      return;
    }

    const snapshot: AddressSnapshot = {
      customerName: activeCustomer.name,
      contactName: contact,
      phone: phone,
      address: address,
    };

    onConfirm({
      customer: activeCustomer,
      address: undefined,
      deliverySnapshot: snapshot,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-wide">
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UsersIcon size={20} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: '16px' }}>选择客户与配送地址</span>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: '4px' }}>
            <XIcon size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Top Search bar */}
          <div style={{ position: 'relative' }}>
            <SearchIcon size={16} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-subtle)' }} />
            <input
              type="text"
              autoFocus
              className="input"
              style={{ paddingLeft: '32px' }}
              placeholder="搜索客户名称、拼音编码、联系人或电话..."
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
            />
          </div>

          {/* Two Pane Split: Left Customers, Right Addresses */}
          <div style={{ display: 'flex', gap: '16px', minHeight: '380px', flex: 1 }}>
            {/* Left Customer List */}
            <div style={{ flex: 1, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', overflowY: 'auto', background: 'var(--bg-surface)' }}>
              {loading && customers.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '13px' }}>加载客户中...</div>
              ) : customers.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '13px' }}>未找到匹配客户</div>
              ) : (
                customers.map(c => {
                  const isSelected = activeCustomer?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCustomer(c)}
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--border-light)',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'var(--accent-subtle)' : 'transparent',
                        borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                        transition: 'background-color 0.1s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: isSelected ? 'var(--accent)' : 'var(--text-main)' }}>
                          {c.name}
                        </span>
                        <span className="badge badge-default" style={{ fontSize: '11px' }}>{c.code}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        联系人: {c.contactName || '无'} {c.phone ? `· ${c.phone}` : ''}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '2px' }}>
                        {c.addresses.length} 个预设配送地址
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Right Address List & Custom Snapshot */}
            <div style={{ flex: 1.2, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '12px', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px', color: 'var(--text-main)', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                {activeCustomer ? `${activeCustomer.name} - 配送与交付设置` : '请先选择客户'}
              </div>

              {validationError && (
                <div style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px', marginBottom: '10px' }}>
                  {validationError}
                </div>
              )}

              {!activeCustomer ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle)', fontSize: '13px' }}>
                  从左侧点击选择客户
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', flex: 1 }}>
                  {/* Address Choice Tabs if customer has saved addresses */}
                  {activeCustomer.addresses.filter(a => a.active).length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${!useCustomSnapshot ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => {
                          setUseCustomSnapshot(false);
                          const activeAddrs = activeCustomer.addresses.filter(a => a.active);
                          if (!chosenAddressId && activeAddrs[0]) {
                            setChosenAddressId(activeAddrs[0].id);
                          }
                        }}
                      >
                        使用预设地址 ({activeCustomer.addresses.filter(a => a.active).length})
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${useCustomSnapshot ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => {
                          setUseCustomSnapshot(true);
                          setChosenAddressId(undefined);
                        }}
                      >
                        录入本次自定义快照
                      </button>
                    </div>
                  )}

                  {!useCustomSnapshot && activeCustomer.addresses.filter(a => a.active).length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {activeCustomer.addresses.filter(a => a.active).map(addr => {
                        const isChecked = chosenAddressId === addr.id;
                        return (
                          <div
                            key={addr.id}
                            onClick={() => setChosenAddressId(addr.id)}
                            style={{
                              padding: '10px 12px',
                              border: isChecked ? '1px solid var(--accent)' : '1px solid var(--border-default)',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: isChecked ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontWeight: 600, fontSize: '13px' }}>
                                {addr.label ? `[${addr.label}] ` : ''}{addr.contactName} ({addr.phone})
                              </span>
                              {addr.isDefault && <span className="badge badge-success" style={{ fontSize: '10px' }}>默认</span>}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              {addr.address}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg-app)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        {activeCustomer.addresses.length === 0
                          ? '客户尚未维护预设有效地址，必须录入本次交付快照真实信息，禁止虚构空值。'
                          : '本次订单将使用独立交付快照，不修改客户资料库中的预设地址。'}
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>
                          联系人姓名 <span style={{ color: 'var(--danger)' }}>*</span>
                        </label>
                        <input
                          type="text"
                          className="input"
                          placeholder="例如：张经理"
                          value={customContactName}
                          onChange={e => {
                            setValidationError(null);
                            setCustomContactName(e.target.value);
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>
                          联系电话 <span style={{ color: 'var(--danger)' }}>*</span>
                        </label>
                        <input
                          type="text"
                          className="input"
                          placeholder="例如：13800000000"
                          value={customPhone}
                          onChange={e => {
                            setValidationError(null);
                            setCustomPhone(e.target.value);
                          }}
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 600 }}>
                            交付 / 提货地址 <span style={{ color: 'var(--danger)' }}>*</span>
                          </label>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '11px', padding: '1px 6px' }}
                              onClick={() => {
                                setValidationError(null);
                                setCustomAddress('客户现场自提 / 仓库交接');
                              }}
                            >
                              + 现场自提
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '11px', padding: '1px 6px' }}
                              onClick={() => {
                                setValidationError(null);
                                setCustomAddress('同城送货上门');
                              }}
                            >
                              + 同城送货
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          className="input"
                          placeholder="请输入明确地址或点击上方快捷类型..."
                          value={customAddress}
                          onChange={e => {
                            setValidationError(null);
                            setCustomAddress(e.target.value);
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">
            取 消
          </button>
          <button
            onClick={handleConfirm}
            className="btn btn-primary"
            disabled={!activeCustomer}
          >
            <CheckIcon size={16} />
            <span>确认选用该客户</span>
          </button>
        </div>
      </div>
    </div>
  );
}
