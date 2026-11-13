import React, { useState, useEffect } from 'react';
import type { Warehouse } from '../../api/types.js';
import * as api from '../../api/client.js';
import { WarehouseIcon, PlusIcon, EditIcon, CheckIcon, AlertCircleIcon, SearchIcon } from '../../components/icons/index.js';

export function WarehouseListPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Create Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Edit Active State
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    void loadWarehouses();
  }, []);

  const loadWarehouses = async (cursor?: string, qOverride?: string) => {
    setLoading(true);
    setError(null);
    try {
      const queryStr = qOverride !== undefined ? qOverride : searchQuery;
      // Fully supports listWarehouses({ q, cursor, limit }), definitely NO includeInactive
      const res = await api.listWarehouses({
        q: queryStr.trim() || undefined,
        limit: 50,
        cursor,
      });
      if (cursor) {
        setWarehouses(prev => [...prev, ...res.items]);
      } else {
        setWarehouses(res.items);
      }
      setNextCursor(res.nextCursor || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载仓库列表失败');
      if (!cursor) setWarehouses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    setCreating(true);
    try {
      await api.createWarehouse({
        code: code.trim(),
        name: name.trim(),
      });
      setCreateModalOpen(false);
      setCode('');
      setName('');
      void loadWarehouses();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '创建仓库失败');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (wh: Warehouse) => {
    setSelectedWarehouse(wh);
    setEditName(wh.name);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouse || !editName.trim()) return;
    setSavingEdit(true);
    try {
      await api.updateWarehouse(selectedWarehouse.id, {
        expectedVersion: selectedWarehouse.version,
        name: editName.trim(),
      });
      setEditModalOpen(false);
      void loadWarehouses();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '更新仓库失败');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleActive = async (wh: Warehouse) => {
    setUpdatingId(wh.id);
    try {
      await api.updateWarehouse(wh.id, {
        expectedVersion: wh.version,
        active: !wh.active,
      });
      void loadWarehouses();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '更新仓库状态失败');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.3px' }}>
            仓库管理
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            维护多仓存储结构与出入库货位
          </p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="btn btn-primary"
        >
          <PlusIcon size={16} />
          <span>新建仓库</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="card">
        <div className="card-body" style={{ padding: '12px 16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
            <SearchIcon size={16} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-subtle)' }} />
            <input
              type="text"
              className="input"
              style={{ paddingLeft: '32px' }}
              placeholder="搜索仓库编码或名称..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void loadWarehouses(undefined, e.currentTarget.value);
                }
              }}
            />
          </div>
          <button onClick={() => void loadWarehouses(undefined, searchQuery)} className="btn btn-secondary">
            搜索
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px' }}>
          <AlertCircleIcon size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Warehouse Cards / Table */}
      <div className="card" style={{ maxWidth: '100%', overflow: 'hidden' }}>
        <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
          <table className="table" style={{ width: '100%', minWidth: '340px' }}>
            <thead>
              <tr>
                <th style={{ width: '120px' }}>仓库编码</th>
                <th>仓库名称</th>
                <th style={{ width: '100px' }}>状态</th>
                <th style={{ width: '90px' }}>版本号</th>
                <th style={{ width: '130px', textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && warehouses.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-subtle)' }}>
                    正在加载仓库...
                  </td>
                </tr>
              ) : warehouses.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-subtle)' }}>
                    暂无仓库数据
                  </td>
                </tr>
              ) : (
                warehouses.map(wh => (
                  <tr key={wh.id} style={{ opacity: wh.active ? 1 : 0.6 }}>
                    <td>
                      <span className="badge badge-default font-mono">{wh.code}</span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <WarehouseIcon size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <span>{wh.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${wh.active ? 'badge-success' : 'badge-danger'}`}>
                        {wh.active ? '启用中' : '已停用'}
                      </span>
                    </td>
                    <td className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      v{wh.version}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => openEditModal(wh)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '12px' }}
                        >
                          <EditIcon size={13} />
                          <span>编辑</span>
                        </button>
                        <button
                          onClick={() => void handleToggleActive(wh)}
                          disabled={updatingId === wh.id}
                          className={`btn btn-sm ${wh.active ? 'btn-ghost' : 'btn-secondary'}`}
                          style={{ fontSize: '12px', color: wh.active ? 'var(--danger)' : undefined }}
                        >
                          {updatingId === wh.id ? '更新中...' : wh.active ? '停用' : '启用'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Continuation */}
      {nextCursor && (
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <button
            onClick={() => void loadWarehouses(nextCursor)}
            className="btn btn-secondary btn-sm"
            disabled={loading}
          >
            {loading ? '加载中...' : '加载更多仓库'}
          </button>
        </div>
      )}

      {/* Edit Modal */}
      {editModalOpen && selectedWarehouse && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '440px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>编辑仓库 - {selectedWarehouse.code}</h3>
              <button onClick={() => setEditModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <form onSubmit={handleSaveEdit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                    仓库名称 <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="input"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="btn btn-secondary"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || !editName.trim()}
                  className="btn btn-primary"
                >
                  {savingEdit ? '保存中...' : '保存修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {createModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '440px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>新增仓库</h3>
              <button onClick={() => setCreateModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                    仓库编码 <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="如 WH-01"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                    仓库名称 <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="如 主仓库 / 成品一号仓"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="btn btn-secondary"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating || !code.trim() || !name.trim()}
                  className="btn btn-primary"
                >
                  {creating ? '创建中...' : '确认创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
