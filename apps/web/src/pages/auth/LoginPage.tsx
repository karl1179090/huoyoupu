import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import * as api from '../../api/client.js';
import { BoxIcon, AlertCircleIcon } from '../../components/icons/index.js';

export function LoginPage() {
  const { login } = useAuth();
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Proactively guarantee an anonymous session challenge exists whenever LoginPage is mounted
    void api.ensureSessionChallenge().catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName.trim() || !password) {
      setError('请输入账号和密码');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login({ loginName: loginName.trim(), password });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '登录失败，请检查账号密码';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '380px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-default)', padding: '32px 28px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#0f172a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', marginBottom: '12px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)' }}>
            <BoxIcon size={28} />
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.3px' }}>
            货友铺进销存
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            多仓现货与资金流水核对工作台
          </p>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px', marginBottom: '20px' }}>
            <AlertCircleIcon size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-main)', marginBottom: '6px' }}>
              登录账号
            </label>
            <input
              type="text"
              autoFocus
              className="input"
              placeholder="请输入管理员或员工账号"
              value={loginName}
              onChange={e => setLoginName(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-main)', marginBottom: '6px' }}>
              登录密码
            </label>
            <input
              type="password"
              className="input"
              placeholder="请输入密码"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '8px', height: '38px', fontSize: '14px' }}
          >
            {loading ? '正在登录...' : '登 录'}
          </button>
        </form>

        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-light)', textAlign: 'center', fontSize: '12px', color: 'var(--text-subtle)' }}>
          支持管理员与员工双角色登录 · 安全可靠
        </div>
      </div>
    </div>
  );
}
