import React, { useState, useEffect } from 'react';
import type { Product, Unit, Barcode } from '../../api/types.js';
import * as api from '../../api/client.js';
import {
  SearchIcon,
  PlusIcon,
  EditIcon,
  AlertCircleIcon,
  CheckIcon,
  TrashIcon,
} from '../../components/icons/index.js';

export function ProductListPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Create Product Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [spec, setSpec] = useState('');
  const [baseUnitName, setBaseUnitName] = useState('瓶');
  const [defaultPrice, setDefaultPrice] = useState('10.00');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Product Modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSpec, setEditSpec] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editMnemonicOverride, setEditMnemonicOverride] = useState('');
  const [clearMnemonic, setClearMnemonic] = useState(false);
  const [editActive, setEditActive] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Unit Management Modal
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [newUnitName, setNewUnitName] = useState('件');
  const [multiplier, setMultiplier] = useState(12);
  const [unitPrice, setUnitPrice] = useState('120.00');
  const [unitCost, setUnitCost] = useState('');
  const [addingUnit, setAddingUnit] = useState(false);
  const [unitActionError, setUnitActionError] = useState<string | null>(null);

  // Edit Unit State (UnitPatch)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [editUnitName, setEditUnitName] = useState('');
  const [editUnitPrice, setEditUnitPrice] = useState('');
  const [editUnitCost, setEditUnitCost] = useState('');
  const [savingUnitEdit, setSavingUnitEdit] = useState(false);

  // Barcode Management Modal
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeList, setBarcodeList] = useState<{ value: string; unitId: string }[]>([]);
  const [newBarcodeVal, setNewBarcodeVal] = useState('');
  const [newBarcodeUnitId, setNewBarcodeUnitId] = useState('');
  const [savingBarcodes, setSavingBarcodes] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  useEffect(() => {
    void loadProducts();
  }, [includeInactive]);

  const loadProducts = async (cursor?: string, qOverride?: string) => {
    setLoading(true);
    try {
      const queryStr = qOverride !== undefined ? qOverride : searchQuery;
      const res = await api.listProducts({
        q: queryStr.trim() || undefined,
        includeInactive,
        limit: 50,
        cursor,
      });
      if (cursor) {
        setProducts(prev => [...prev, ...res.items]);
      } else {
        setProducts(res.items);
      }
      setNextCursor(res.nextCursor);
    } catch {
      if (!cursor) setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim() || !baseUnitName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api.createProduct({
        code: code.trim(),
        name: name.trim(),
        specification: spec.trim() || undefined,
        baseUnit: {
          name: baseUnitName.trim(),
          defaultSalePrice: defaultPrice.trim() || '0.00',
        },
      });
      setCreateModalOpen(false);
      setCode('');
      setName('');
      setSpec('');
      void loadProducts();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : '创建商品失败');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (prod: Product) => {
    setSelectedProduct(prod);
    setEditName(prod.name);
    setEditSpec(prod.specification || '');
    setEditBrand(prod.brand || '');
    setEditMnemonicOverride(prod.mnemonicCodeOverride || '');
    setClearMnemonic(false);
    setEditActive(prod.active);
    setEditError(null);
    setEditModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !editName.trim()) return;
    setSavingProduct(true);
    setEditError(null);

    const mnemonicPayload = clearMnemonic
      ? null
      : editMnemonicOverride.trim() !== ''
      ? editMnemonicOverride.trim()
      : undefined;

    try {
      const updated = await api.updateProduct(selectedProduct.id, {
        expectedVersion: selectedProduct.version,
        name: editName.trim(),
        specification: editSpec.trim() || undefined,
        brand: editBrand.trim() || undefined,
        mnemonicCodeOverride: mnemonicPayload,
        active: editActive,
      });
      setSelectedProduct(updated);
      setEditModalOpen(false);
      void loadProducts();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : '保存商品修改失败');
    } finally {
      setSavingProduct(false);
    }
  };

  const openUnitModal = (prod: Product) => {
    setSelectedProduct(prod);
    setNewUnitName('');
    setMultiplier(12);
    setUnitPrice('0.00');
    setUnitCost('');
    setEditingUnit(null);
    setUnitActionError(null);
    setUnitModalOpen(true);
  };

  const startEditUnit = (u: Unit) => {
    setEditingUnit(u);
    setEditUnitName(u.name);
    setEditUnitPrice(u.defaultSalePrice);
    setEditUnitCost(u.defaultReceiptCost || '');
    setUnitActionError(null);
  };

  const cancelEditUnit = () => {
    setEditingUnit(null);
    setUnitActionError(null);
  };

  const handleSaveUnitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !editingUnit || !editUnitName.trim() || !editUnitPrice.trim()) return;
    setSavingUnitEdit(true);
    setUnitActionError(null);

    try {
      await api.updateProductUnit(selectedProduct.id, editingUnit.id, {
        expectedVersion: editingUnit.version,
        name: editUnitName.trim(),
        defaultSalePrice: editUnitPrice.trim(),
        defaultReceiptCost: editUnitCost.trim() ? editUnitCost.trim() : null,
      });
      setEditingUnit(null);
      const refreshed = await api.getProduct(selectedProduct.id);
      setSelectedProduct(refreshed);
      void loadProducts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '更新单位资料失败';
      if (msg.includes('UNIT_REFERENCED')) {
        setUnitActionError('该单位已被单据引用，不可修改基础换算或属性');
      } else if (msg.includes('VERSION_CONFLICT')) {
        setUnitActionError('单位版本冲突，请重新打开管理刷新后修改');
      } else {
        setUnitActionError(msg);
      }
    } finally {
      setSavingUnitEdit(false);
    }
  };

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !newUnitName.trim()) return;
    setAddingUnit(true);
    setUnitActionError(null);
    try {
      await api.createProductUnit(selectedProduct.id, {
        name: newUnitName.trim(),
        multiplierBase: multiplier,
        defaultSalePrice: unitPrice.trim() || '0.00',
        defaultReceiptCost: unitCost.trim() ? unitCost.trim() : undefined,
      });
      const refreshed = await api.getProduct(selectedProduct.id);
      setSelectedProduct(refreshed);
      setNewUnitName('');
      void loadProducts();
    } catch (err: unknown) {
      setUnitActionError(err instanceof Error ? err.message : '添加辅助单位失败');
    } finally {
      setAddingUnit(false);
    }
  };

  const handleToggleUnitActive = async (unit: Unit) => {
    if (!selectedProduct) return;
    setUnitActionError(null);
    try {
      await api.updateProductUnit(selectedProduct.id, unit.id, {
        expectedVersion: unit.version,
        active: !unit.active,
      });
      const refreshed = await api.getProduct(selectedProduct.id);
      setSelectedProduct(refreshed);
      void loadProducts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '更新单位状态失败';
      if (msg.includes('UNIT_REFERENCED')) {
        setUnitActionError('该单位已被历史单据引用，无法执行当前操作');
      } else {
        setUnitActionError(msg);
      }
    }
  };

  const openBarcodeModal = (prod: Product) => {
    setSelectedProduct(prod);
    setBarcodeList(prod.barcodes.map(b => ({ value: b.value, unitId: b.unitId })));
    setNewBarcodeVal('');
    setNewBarcodeUnitId(prod.baseUnitId || prod.units[0]?.id || '');
    setBarcodeError(null);
    setBarcodeModalOpen(true);
  };

  const handleAddBarcodeItem = () => {
    const trimmed = newBarcodeVal.trim();
    if (!trimmed) return;
    // Retain leading zeros (e.g. 00892)
    if (barcodeList.some(b => b.value === trimmed)) {
      setBarcodeError('该条码已在当前列表中');
      return;
    }
    setBarcodeList(prev => [...prev, { value: trimmed, unitId: newBarcodeUnitId }]);
    setNewBarcodeVal('');
    setBarcodeError(null);
  };

  const handleRemoveBarcodeItem = (index: number) => {
    setBarcodeList(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveBarcodes = async () => {
    if (!selectedProduct) return;
    setSavingBarcodes(true);
    setBarcodeError(null);
    try {
      const updatedProd = await api.replaceProductBarcodes(selectedProduct.id, {
        expectedVersion: selectedProduct.version,
        barcodes: barcodeList,
      });
      setSelectedProduct(updatedProd);
      setBarcodeModalOpen(false);
      void loadProducts();
    } catch (err: unknown) {
      setBarcodeError(err instanceof Error ? err.message : '保存条码失败');
    } finally {
      setSavingBarcodes(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>商品与单位资料</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            维护商品编码、拼音助记码(如500mljy)、包装多单位换算倍率与条形码
          </p>
        </div>

        <button onClick={() => setCreateModalOpen(true)} className="btn btn-primary">
          <PlusIcon size={16} />
          <span>新建商品档案</span>
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="card">
        <div className="card-body" style={{ padding: '12px 16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <SearchIcon size={16} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-subtle)' }} />
            <input
              type="text"
              className="input"
              style={{ paddingLeft: '32px' }}
              placeholder="搜索商品名称、规格、助记码或条形码..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void loadProducts(undefined, e.currentTarget.value);
                }
              }}
            />
          </div>
          <button onClick={() => void loadProducts(undefined, searchQuery)} className="btn btn-secondary">搜索</button>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={e => setIncludeInactive(e.target.checked)}
            />
            <span>包含已停用商品</span>
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
        <table className="table" style={{ width: '100%', minWidth: '350px' }}>
          <thead>
            <tr>
              <th>编码</th>
              <th>商品名称</th>
              <th>规格</th>
              <th>拼音助记码</th>
              <th>基准单位</th>
              <th>辅助换算包装单位</th>
              <th>条形码</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && products.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '32px' }}>加载中...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '32px' }}>未找到匹配商品</td></tr>
            ) : (
              products.map(prod => {
                const base = prod.units.find(u => u.id === prod.baseUnitId) || prod.units[0];
                const subUnits = prod.units.filter(u => u.id !== prod.baseUnitId);
                return (
                  <tr key={prod.id} style={{ opacity: prod.active ? 1 : 0.6 }}>
                    <td style={{ fontWeight: 600 }}>{prod.code}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{prod.name}</div>
                      {prod.brand && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>品牌: {prod.brand}</div>}
                    </td>
                    <td>{prod.specification || '标准'}</td>
                    <td>
                      {prod.mnemonicCodeOverride ? (
                        <span className="badge badge-warning" title="人工指定助记码">{prod.mnemonicCodeOverride}</span>
                      ) : prod.mnemonicCode ? (
                        <span className="badge badge-default" title="系统自动拼音助记码">{prod.mnemonicCode}</span>
                      ) : (
                        <span style={{ color: 'var(--text-subtle)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-info">{base?.name || '件'} (¥{base?.defaultSalePrice || '0.00'})</span>
                    </td>
                    <td>
                      {subUnits.length === 0 ? (
                        <span style={{ color: 'var(--text-subtle)', fontSize: '12px' }}>单单位</span>
                      ) : (
                        subUnits.map(u => (
                          <span
                            key={u.id}
                            className={`badge ${u.active ? 'badge-default' : 'badge-danger'}`}
                            style={{ marginRight: '4px', marginBottom: '2px', display: 'inline-block' }}
                          >
                            {u.name} (1{u.name}={u.multiplierBase}{base?.name} · ¥{u.defaultSalePrice})
                            {!u.active && ' [已停用]'}
                          </span>
                        ))
                      )}
                    </td>
                    <td>
                      {prod.barcodes.length === 0 ? (
                        <span style={{ color: 'var(--text-subtle)', fontSize: '12px' }}>无条码</span>
                      ) : (
                        prod.barcodes.map((b, i) => (
                          <span key={i} className="badge badge-default" style={{ marginRight: '4px', marginBottom: '2px', display: 'inline-block' }}>
                            {b.value}
                          </span>
                        ))
                      )}
                    </td>
                    <td>
                      {prod.active ? <span className="badge badge-success">启用</span> : <span className="badge badge-danger">停用</span>}
                    </td>
                    <td className="text-right">
                      <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => openEditModal(prod)}
                          className="btn btn-secondary btn-sm"
                          title="编辑商品资料与助记码"
                        >
                          <EditIcon size={14} />
                          <span>编辑</span>
                        </button>
                        <button
                          onClick={() => openUnitModal(prod)}
                          className="btn btn-secondary btn-sm"
                          title="管理多单位"
                        >
                          单位 ({prod.units.length})
                        </button>
                        <button
                          onClick={() => openBarcodeModal(prod)}
                          className="btn btn-secondary btn-sm"
                          title="整组维护条形码"
                        >
                          条码 ({prod.barcodes.length})
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={() => void loadProducts(nextCursor)} className="btn btn-secondary btn-sm" disabled={loading}>
            {loading ? '加载中...' : '加载更多商品'}
          </button>
        </div>
      )}

      {/* Create Product Modal */}
      {createModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 600 }}>新建商品档案</span>
              <button onClick={() => setCreateModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <form onSubmit={handleCreateProduct}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {createError && (
                  <div style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px' }}>
                    {createError}
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>商品编码 *</label>
                  <input type="text" className="input" required value={code} onChange={e => setCode(e.target.value)} placeholder="如 SP-001" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>商品名称 *</label>
                  <input type="text" className="input" required value={name} onChange={e => setName(e.target.value)} placeholder="如 500ml特级雪花" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>规格描述</label>
                  <input type="text" className="input" value={spec} onChange={e => setSpec(e.target.value)} placeholder="如 500ml/瓶" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>基础单位名称 *</label>
                    <input type="text" className="input" required value={baseUnitName} onChange={e => setBaseUnitName(e.target.value)} placeholder="如 瓶 / 袋 / 支" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>默认售价 (元) *</label>
                    <input type="text" className="input tabular-nums" required value={defaultPrice} onChange={e => setDefaultPrice(e.target.value)} placeholder="10.00" />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setCreateModalOpen(false)} className="btn btn-secondary">取消</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? '保存中...' : '确认创建'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editModalOpen && selectedProduct && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 600 }}>编辑商品档案 - {selectedProduct.code}</span>
              <button onClick={() => setEditModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <form onSubmit={handleSaveProduct}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {editError && (
                  <div style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px' }}>
                    {editError}
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>商品名称 *</label>
                  <input type="text" className="input" required value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>规格描述</label>
                    <input type="text" className="input" value={editSpec} onChange={e => setEditSpec(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>品牌</label>
                    <input type="text" className="input" value={editBrand} onChange={e => setEditBrand(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                    拼音助记码 (留空将自动根据名称拼音首字母生成，如500mljy)
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={editMnemonicOverride}
                    onChange={e => {
                      setEditMnemonicOverride(e.target.value);
                      setClearMnemonic(false);
                    }}
                    placeholder={selectedProduct.generatedMnemonicCode || '系统自动生成'}
                    disabled={clearMnemonic}
                  />
                  <div style={{ marginTop: '6px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={clearMnemonic}
                        onChange={e => {
                          setClearMnemonic(e.target.checked);
                          if (e.target.checked) setEditMnemonicOverride('');
                        }}
                      />
                      <span>清除人工指定助记码 (恢复系统全自动根据名称拼音生成)</span>
                    </label>
                  </div>
                </div>
                <div style={{ paddingTop: '6px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={e => setEditActive(e.target.checked)}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>商品启用状态 (取消勾选即停用)</span>
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setEditModalOpen(false)} className="btn btn-secondary">取消</button>
                <button type="submit" className="btn btn-primary" disabled={savingProduct}>
                  {savingProduct ? '保存中...' : '保存修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unit Management Modal */}
      {unitModalOpen && selectedProduct && (
        <div className="modal-overlay">
          <div className="modal-content modal-content-wide" style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 600 }}>管理包装单位 - 【{selectedProduct.name}】</span>
              <button onClick={() => setUnitModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {unitActionError && (
                <div style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px' }}>
                  {unitActionError}
                </div>
              )}

              {/* Editing Unit Card (UnitPatch) */}
              {editingUnit && (
                <div style={{ background: 'var(--bg-subtle, #f8f9fa)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm, 6px)', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)' }}>
                      编辑单位资料 - 【{editingUnit.name}】 (版本: v{editingUnit.version})
                    </span>
                    <button type="button" onClick={cancelEditUnit} className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }}>✕</button>
                  </div>
                  <form onSubmit={handleSaveUnitEdit}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', alignItems: 'flex-end' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>单位名称 *</label>
                        <input
                          type="text"
                          className="input"
                          required
                          value={editUnitName}
                          onChange={e => setEditUnitName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>归一换算倍率</label>
                        <input
                          type="text"
                          className="input tabular-nums"
                          disabled
                          value={editingUnit.id === selectedProduct.baseUnitId ? '1 (基准单位不可变)' : `${editingUnit.multiplierBase} (固定倍率不可改)`}
                          style={{ background: 'var(--bg-disabled, #eee)', cursor: 'not-allowed' }}
                          title="归一倍率遵循后端不可变规则"
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>默认售价 (元) *</label>
                        <input
                          type="text"
                          className="input tabular-nums"
                          required
                          value={editUnitPrice}
                          onChange={e => setEditUnitPrice(e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>默认进价 (留空表示无)</label>
                        <input
                          type="text"
                          className="input tabular-nums"
                          value={editUnitCost}
                          onChange={e => setEditUnitCost(e.target.value)}
                          placeholder="可留空"
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                      <button type="button" onClick={cancelEditUnit} className="btn btn-secondary btn-sm">
                        取消
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={savingUnitEdit || !editUnitName.trim() || !editUnitPrice.trim()}
                      >
                        {savingUnitEdit ? '保存中...' : '保存单位修改'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Existing Units Table */}
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>已有单位列表</div>
                <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
                  <table className="table" style={{ width: '100%', minWidth: '340px' }}>
                    <thead>
                      <tr>
                        <th>单位名称</th>
                        <th>换算倍率</th>
                        <th>默认售价</th>
                        <th>默认进价</th>
                        <th>类型</th>
                        <th>状态</th>
                        <th>版本</th>
                        <th className="text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProduct.units.map(u => {
                        const isBase = u.id === selectedProduct.baseUnitId;
                        return (
                          <tr key={u.id}>
                            <td style={{ fontWeight: 600 }}>{u.name}</td>
                            <td className="tabular-nums">
                              {isBase ? '1 (基准单位)' : `${u.multiplierBase} 倍`}
                            </td>
                            <td className="tabular-nums">¥{u.defaultSalePrice}</td>
                            <td className="tabular-nums text-muted">{u.defaultReceiptCost ? `¥${u.defaultReceiptCost}` : '—'}</td>
                            <td>
                              {isBase ? <span className="badge badge-info">基础单位</span> : <span className="badge badge-default">辅助包装</span>}
                            </td>
                            <td>
                              {u.active ? <span className="badge badge-success">启用</span> : <span className="badge badge-danger">停用</span>}
                            </td>
                            <td className="tabular-nums text-muted" style={{ fontSize: '11px' }}>
                              v{u.version}
                            </td>
                            <td className="text-right">
                              <div style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  onClick={() => startEditUnit(u)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: '12px' }}
                                >
                                  <EditIcon size={12} />
                                  <span>编辑</span>
                                </button>
                                {!isBase && (
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleUnitActive(u)}
                                    className={`btn btn-sm ${u.active ? 'btn-ghost' : 'btn-secondary'}`}
                                    style={{ fontSize: '12px', color: u.active ? 'var(--danger)' : undefined }}
                                  >
                                    {u.active ? '停用' : '恢复启用'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add New Unit Form */}
              <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '14px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px' }}>添加辅助包装单位</div>
                <form onSubmit={handleAddUnit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', alignItems: 'flex-end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>单位名称 (如 箱/打) *</label>
                    <input type="text" className="input" required value={newUnitName} onChange={e => setNewUnitName(e.target.value)} placeholder="箱" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>换算基础数 *</label>
                    <input type="number" min="2" step="1" className="input tabular-nums" required value={multiplier} onChange={e => setMultiplier(parseInt(e.target.value, 10) || 2)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>默认售价 (元) *</label>
                    <input type="text" className="input tabular-nums" required value={unitPrice} onChange={e => setUnitPrice(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>默认进价 (选填)</label>
                    <input type="text" className="input tabular-nums" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="可留空" />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={addingUnit} style={{ height: '34px' }}>
                    <PlusIcon size={14} />
                    <span>添加</span>
                  </button>
                </form>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setUnitModalOpen(false)} className="btn btn-secondary">完成</button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Management Modal */}
      {barcodeModalOpen && selectedProduct && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 600 }}>维护商品条形码 - 【{selectedProduct.name}】</span>
              <button onClick={() => setBarcodeModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {barcodeError && (
                <div style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px' }}>
                  {barcodeError}
                </div>
              )}

              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                条码采用整组全量替换机制保存。条形码为字符串，严格保留前导0（如00892）。
              </p>

              {/* Add Barcode Row Form */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>输入条形码</label>
                  <input
                    type="text"
                    className="input tabular-nums"
                    placeholder="如 6901234567890 或 00892"
                    value={newBarcodeVal}
                    onChange={e => setNewBarcodeVal(e.target.value)}
                  />
                </div>
                <div style={{ width: '130px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>对应单位</label>
                  <select
                    className="select"
                    value={newBarcodeUnitId}
                    onChange={e => setNewBarcodeUnitId(e.target.value)}
                  >
                    {selectedProduct.units.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleAddBarcodeItem}
                  className="btn btn-secondary"
                  disabled={!newBarcodeVal.trim()}
                >
                  添加
                </button>
              </div>

              {/* Barcode List */}
              <div className="table-container" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                <table className="table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>条码值</th>
                      <th>绑定单位</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barcodeList.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-subtle)' }}>
                          暂无条形码
                        </td>
                      </tr>
                    ) : (
                      barcodeList.map((b, idx) => {
                        const matchedUnit = selectedProduct.units.find(u => u.id === b.unitId);
                        return (
                          <tr key={idx}>
                            <td className="tabular-nums" style={{ fontWeight: 600 }}>{b.value}</td>
                            <td>
                              <span className="badge badge-default">{matchedUnit?.name || '未知单位'}</span>
                            </td>
                            <td className="text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveBarcodeItem(idx)}
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--danger)', padding: '2px 6px' }}
                              >
                                <TrashIcon size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setBarcodeModalOpen(false)} className="btn btn-secondary">取消</button>
              <button
                type="button"
                onClick={handleSaveBarcodes}
                className="btn btn-primary"
                disabled={savingBarcodes}
              >
                {savingBarcodes ? '保存中...' : '整组保存条码'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
