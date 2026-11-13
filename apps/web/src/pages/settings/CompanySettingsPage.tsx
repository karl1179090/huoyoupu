import React, { useState, useEffect } from 'react';
import type { Company } from '../../api/types.js';
import * as api from '../../api/client.js';
import { SettingsIcon, CheckIcon, AlertCircleIcon, PrinterIcon, RefreshCwIcon, UsersIcon } from '../../components/icons/index.js';
import { PrintTemplateManager } from '../printing/PrintTemplateManager.js';
import { UsersPage } from './UsersPage.js';
import './settings.css';

export function CompanySettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'templates' | 'users'>('profile');
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadCompany();
  }, []);

  const loadCompany = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCompany();
      setCompany(res);
      setName(res.name || '');
      setPhone(res.phone || '');
      setAddress(res.address || '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载企业设置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      // Name cannot be empty; phone and address can be explicitly cleared with ""
      const updated = await api.updateCompany({
        expectedVersion: company.version,
        name: name.trim() || undefined,
        phone: phone.trim(), // send empty string to clear, not undefined
        address: address.trim(), // send empty string to clear, not undefined
      });
      setCompany(updated);
      setName(updated.name || '');
      setPhone(updated.phone || '');
      setAddress(updated.address || '');
      setMsg(`企业基本信息已成功更新 (版本 v${updated.version})`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '更新企业设置失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SettingsIcon size={20} />
          <span>系统设置与管理</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          维护出库打印单据抬头、企业联系电话、发货地址、各型号打印模板与员工账号权限
        </p>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="settings-tab-bar" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            <SettingsIcon size={14} />
            <span>企业基本资料</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`settings-tab-btn ${activeTab === 'templates' ? 'active' : ''}`}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            <PrinterIcon size={14} />
            <span>出库打印模板配置</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`settings-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            <UsersIcon size={14} />
            <span>员工账号与权限</span>
          </span>
        </button>
      </div>

      {activeTab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '680px' }}>
          {msg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '13px' }}>
              <CheckIcon size={16} />
              <span>{msg}</span>
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px' }}>
              <AlertCircleIcon size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="card" style={{ padding: '24px' }}>
            {loading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-subtle)' }}>
                正在加载系统设置...
              </div>
            ) : (
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', paddingBottom: '10px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>公司资料信息</span>
                  {company && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="badge font-mono" style={{ fontSize: '12px' }}>
                        数据版本: v{company.version}
                      </span>
                      <button
                        type="button"
                        onClick={() => void loadCompany()}
                        className="btn btn-ghost btn-sm"
                        title="刷新最新数据"
                      >
                        <RefreshCwIcon size={12} />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                    企业 / 门店全称
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="如：货友商贸供应链有限公司"
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '2px', display: 'block' }}>
                    该名称将作为所有销售配送单据的抬头主标题输出
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                    联系电话 (清空保存即可删除)
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="如：021-88889999 / 13800000000"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                    经营 / 发货地址 (清空保存即可删除)
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="用于打印单据底部或抬头显示的联系发货地址"
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', gap: '8px' }}>
                  <button
                    type="submit"
                    disabled={saving}
                    className="btn btn-primary"
                  >
                    {saving ? '正在保存...' : '保存修改'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <PrintTemplateManager />
      )}

      {activeTab === 'users' && (
        <UsersPage />
      )}
    </div>
  );
}
