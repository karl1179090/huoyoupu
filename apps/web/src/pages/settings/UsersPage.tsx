import React, { useState, useEffect } from 'react';
import type { User } from '../../api/types.js';
import * as api from '../../api/client.js';
import { UsersIcon, PlusIcon, AlertCircleIcon, CheckIcon, RefreshCwIcon } from '../../components/icons/index.js';
import './settings.css';

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'employee'>('employee');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listUsers({ limit: 50 });
      setUsers(res.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!loginName.trim() || !password || password.length < 12) {
      setError('登录账号名必填，密码长度不能少于 12 位');
      return;
    }
    setCreating(true);
    try {
      await api.createUser({
        loginName: loginName.trim(),
        password,
        role,
      });
      setCreateModalOpen(false);
      setLoginName('');
      setPassword('');
      setSuccessMsg(`员工账号「${loginName.trim()}」已成功创建`);
      void loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '创建用户失败');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (u: User) => {
    setError(null);
    setSuccessMsg(null);
    try {
      await api.updateUser(u.id, {
        expectedVersion: u.version,
        active: !u.active,
      });
      setSuccessMsg(`账号「${u.loginName}」状态已成功更新为：${!u.active ? '正常' : '已停用'}`);
      void loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '更新用户状态失败');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UsersIcon size={20} />
            <span>员工账号与权限管理</span>
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            维护系统操作员身份与管理员/员工权限隔离
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => void loadUsers()} className="btn btn-secondary btn-sm">
            <RefreshCwIcon size={14} />
            <span>刷新</span>
          </button>
          <button onClick={() => setCreateModalOpen(true)} className="btn btn-primary">
            <PlusIcon size={16} />
            <span>新建用户</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '13px' }}>
          <CheckIcon size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px' }}>
          <AlertCircleIcon size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Desktop Table View */}
      <div className="card settings-user-desktop-table">
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: '160px' }}>登录用户名</th>
                <th style={{ width: '140px' }}>角色权限</th>
                <th style={{ width: '100px' }}>账号状态</th>
                <th style={{ width: '100px' }}>数据版本</th>
                <th style={{ width: '120px', textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-subtle)' }}>
                    正在加载员工列表...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-subtle)' }}>
                    暂无员工账号
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                      {u.loginName}
                    </td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'badge-info' : 'badge-default'}`}>
                        {u.role === 'admin' ? '系统管理员' : '普通员工'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.active ? 'badge-success' : 'badge-danger'}`}>
                        {u.active ? '正常' : '已停用'}
                      </span>
                    </td>
                    <td className="tabular-nums font-mono" style={{ color: 'var(--text-muted)' }}>
                      v{u.version}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => void handleToggleActive(u)}
                        className={`btn btn-sm ${u.active ? 'btn-ghost' : 'btn-secondary'}`}
                        style={{ fontSize: '12px' }}
                      >
                        {u.active ? '停用账号' : '重新启用'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card List View */}
      <div className="settings-user-mobile-cards">
        {loading ? (
          <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-subtle)' }}>
            正在加载员工列表...
          </div>
        ) : users.length === 0 ? (
          <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-subtle)' }}>
            暂无员工账号
          </div>
        ) : (
          users.map(u => (
            <div key={u.id} className="card" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '15px', fontWeight: 700 }}>{u.loginName}</span>
                <span className={`badge ${u.active ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '11px' }}>
                  {u.active ? '正常' : '已停用'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                <span>角色: {u.role === 'admin' ? '系统管理员' : '普通员工'}</span>
                <span className="font-mono">版本: v{u.version}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  onClick={() => void handleToggleActive(u)}
                  className={`btn btn-sm ${u.active ? 'btn-ghost' : 'btn-secondary'}`}
                  style={{ fontSize: '12px' }}
                >
                  {u.active ? '停用账号' : '重新启用'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {createModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '440px', width: '100%' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>新建系统账号</h3>
              <button onClick={() => setCreateModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                    登录账号名 <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="如：sales01"
                    value={loginName}
                    onChange={e => setLoginName(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                    初始登录密码 <span style={{ color: 'var(--danger)' }}>* (不少于 12 位)</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={12}
                    className="input"
                    placeholder="密码长度至少12位字符"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                    权限角色
                  </label>
                  <select
                    className="select"
                    value={role}
                    onChange={e => setRole(e.target.value as 'admin' | 'employee')}
                  >
                    <option value="employee">普通员工 (只读订单/打印)</option>
                    <option value="admin">系统管理员 (全功能/成本与经营报表)</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="btn btn-secondary"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn btn-primary"
                >
                  {creating ? '正在创建...' : '确认创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
