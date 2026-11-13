import React, { useState, useEffect, useRef } from 'react';
import type {
  PrintTemplate,
  PrintTemplateVersion,
  PrintConfig,
} from '../../api/types.js';
import * as api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import {
  ALLOWED_HEADER_FIELDS,
  ALLOWED_COLUMN_FIELDS,
  validatePrintConfig,
  getDefaultPrintConfig,
  getPrintableWidthMm,
  getTotalColumnsWidthMm,
  getPaperDimensions,
  type HeaderFieldKey,
  type ColumnFieldKey,
  type PrintPaper,
  type PrintColumn,
} from './printConfigLogic.js';
import { listAllPrintTemplates, listAllPrintTemplateVersions } from './printingLoaders.js';
import {
  PrinterIcon,
  PlusIcon,
  CheckIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  TrashIcon,
} from '../../components/icons/index.js';

interface PrintTemplateManagerProps {
  onSelectTemplate?: (templateId: string, versionId?: string) => void;
  onClose?: () => void;
}

export function PrintTemplateManager({ onSelectTemplate, onClose }: PrintTemplateManagerProps) {
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<PrintTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [editingConfig, setEditingConfig] = useState<PrintConfig>(getDefaultPrintConfig());
  const [templateName, setTemplateName] = useState('');
  const [templateActive, setTemplateActive] = useState(true);
  const [templateIsDefault, setTemplateIsDefault] = useState(false);

  // Versions history
  const [versions, setVersions] = useState<PrintTemplateVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  // Create new modal
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  // Request generation / selection guards: a late response for a previously
  // selected template must never overwrite the currently selected one.
  const versionsGenRef = useRef(0);
  const templatesGenRef = useRef(0);
  const selectedTemplateIdRef = useRef<string | null>(null);

  const { isAdmin } = useAuth();
  const isAdminRef = useRef(isAdmin);
  isAdminRef.current = isAdmin;
  const prevIsAdminRef = useRef(isAdmin);

  useEffect(() => {
    if (prevIsAdminRef.current !== isAdmin) {
      prevIsAdminRef.current = isAdmin;
      if (!isAdmin) {
        // Role downgrade: drop management selection/versions and invalidate any
        // in-flight versions request so its response can never land here.
        versionsGenRef.current++;
        selectedTemplateIdRef.current = null;
        setSelectedTemplate(null);
        setVersions([]);
        setLoadingVersions(false);
        setError(null);
        setSuccessMsg(null);
      }
    }
    void loadTemplates();
  }, [isAdmin]);

  const loadTemplates = async () => {
    const gen = ++templatesGenRef.current;
    if (!isAdminRef.current) {
      // Employees must not request template-management APIs at all.
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Exhaustive cursor pagination: a template outside the first page (e.g. a
      // freshly created isolated template) must still be reachable/selectable.
      const items = await listAllPrintTemplates();
      if (gen !== templatesGenRef.current || !isAdminRef.current) return;
      setTemplates(items);
      if (items.length > 0 && !selectedTemplateIdRef.current && items[0]) {
        selectTemplate(items[0]);
      }
    } catch (err: unknown) {
      if (gen !== templatesGenRef.current || !isAdminRef.current) return;
      setError(err instanceof Error ? err.message : '加载打印模板列表失败');
    } finally {
      if (gen === templatesGenRef.current && isAdminRef.current) {
        setLoading(false);
      }
    }
  };

  const selectTemplate = (tpl: PrintTemplate) => {
    // Switching templates immediately drops the previous template's versions/errors,
    // so a late response for the old template can never show under the new one.
    versionsGenRef.current++;
    selectedTemplateIdRef.current = tpl.id;
    setVersions([]);
    setLoadingVersions(false);
    setSelectedTemplate(tpl);
    setTemplateName(tpl.name);
    setTemplateActive(tpl.active);
    setTemplateIsDefault(tpl.isDefault);
    setEditingConfig(JSON.parse(JSON.stringify(tpl.config)));
    setError(null);
    setSuccessMsg(null);
    void loadVersions(tpl.id);
  };

  const isCurrentVersionRequest = (gen: number, templateId: string) =>
    gen === versionsGenRef.current && isAdminRef.current && selectedTemplateIdRef.current === templateId;

  const loadVersions = async (templateId: string) => {
    const gen = ++versionsGenRef.current;
    if (!isAdminRef.current) {
      // Employees must not request version-management APIs at all.
      setVersions([]);
      setLoadingVersions(false);
      return;
    }
    setLoadingVersions(true);
    try {
      // Full cursor pagination keeps historical versions (>50) selectable for reprint.
      const items = await listAllPrintTemplateVersions(templateId);
      // Late response for template A must not overwrite the now-selected template B,
      // nor land after a role downgrade.
      if (!isCurrentVersionRequest(gen, templateId)) return;
      setVersions(items);
    } catch (err: unknown) {
      if (!isCurrentVersionRequest(gen, templateId)) return;
      console.error('加载版本历史失败', err);
    } finally {
      if (isCurrentVersionRequest(gen, templateId)) {
        setLoadingVersions(false);
      }
    }
  };

  const handleUpdateMeta = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await api.updatePrintTemplate(selectedTemplate.id, {
        expectedVersion: selectedTemplate.version,
        name: templateName.trim() || selectedTemplate.name,
        active: templateActive,
        isDefault: templateIsDefault,
      });
      setSelectedTemplate(updated);
      setSuccessMsg('模板基本信息已更新');
      void loadTemplates();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '更新模板基本信息失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNewVersion = async () => {
    if (!selectedTemplate) return;
    const validation = validatePrintConfig(editingConfig);
    if (!validation.valid) {
      setError(`配置验证未通过：${validation.errors.join('；')}`);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await api.createPrintTemplateVersion(selectedTemplate.id, {
        expectedVersion: selectedTemplate.version,
        config: editingConfig,
      });
      setSelectedTemplate(updated);
      setSuccessMsg(`新版本已成功创建发布 (v${updated.currentTemplateVersionNo})`);
      void loadTemplates();
      void loadVersions(selectedTemplate.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存配置版本失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) {
      setError('请输入模板名称');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await api.createPrintTemplate({
        name: newTemplateName.trim(),
        config: getDefaultPrintConfig(),
      });
      setIsCreatingNew(false);
      setNewTemplateName('');
      void loadTemplates();
      selectTemplate(created);
      setSuccessMsg(`模板「${created.name}」已创建`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '创建模板失败');
    } finally {
      setSaving(false);
    }
  };

  // Config editing helpers
  const updatePaper = (patch: Partial<PrintPaper>) => {
    setEditingConfig(prev => ({
      ...prev,
      paper: {
        ...prev.paper,
        ...patch,
      },
    }));
  };

  const toggleHeaderField = (field: HeaderFieldKey) => {
    setEditingConfig(prev => {
      const current = prev.headerFields || [];
      if (current.includes(field)) {
        return { ...prev, headerFields: current.filter(f => f !== field) };
      }
      return { ...prev, headerFields: [...current, field] };
    });
  };

  const moveHeaderField = (index: number, direction: 'up' | 'down') => {
    setEditingConfig(prev => {
      const list = [...prev.headerFields];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= list.length) return prev;
      const currentItem = list[index];
      const targetItem = list[targetIndex];
      if (currentItem !== undefined && targetItem !== undefined) {
        list[index] = targetItem;
        list[targetIndex] = currentItem;
      }
      return { ...prev, headerFields: list };
    });
  };

  const updateColumn = (index: number, patch: Partial<PrintColumn>) => {
    setEditingConfig(prev => {
      const cols = [...prev.columns];
      const existing = cols[index];
      if (existing) {
        cols[index] = { ...existing, ...patch };
      }
      return { ...prev, columns: cols };
    });
  };

  const addColumn = () => {
    setEditingConfig(prev => ({
      ...prev,
      columns: [
        ...prev.columns,
        {
          field: 'remark',
          label: '行备注',
          widthMm: 20,
          align: 'left',
        },
      ],
    }));
  };

  const removeColumn = (index: number) => {
    setEditingConfig(prev => ({
      ...prev,
      columns: prev.columns.filter((_, i) => i !== index),
    }));
  };

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    setEditingConfig(prev => {
      const cols = [...prev.columns];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= cols.length) return prev;
      const currentCol = cols[index];
      const targetCol = cols[targetIndex];
      if (currentCol !== undefined && targetCol !== undefined) {
        cols[index] = targetCol;
        cols[targetIndex] = currentCol;
      }
      return { ...prev, columns: cols };
    });
  };

  const printableWidth = getPrintableWidthMm(editingConfig.paper);
  const totalColsWidth = getTotalColumnsWidthMm(editingConfig.columns);
  const isWidthExceeded = totalColsWidth > printableWidth;
  const paperDims = getPaperDimensions(editingConfig.paper);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PrinterIcon size={20} />
            <span>单据打印模板管理</span>
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            维护纸张类型、表头白名单、列宽顺序与最小行高四项配置
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setIsCreatingNew(true)}
            className="btn btn-primary btn-sm"
          >
            <PlusIcon size={14} />
            <span>新建模板</span>
          </button>
          {onClose && (
            <button onClick={onClose} className="btn btn-secondary btn-sm">
              关闭
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px' }}>
          <AlertCircleIcon size={16} />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '13px' }}>
          <CheckIcon size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* New template modal */}
      {isCreatingNew && (
        <div className="card" style={{ padding: '16px', background: 'var(--bg-surface-subtle)', border: '1px solid var(--accent)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>创建新打印模板</h3>
          <form onSubmit={handleCreateTemplate} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>模板名称</label>
              <input
                type="text"
                className="input"
                placeholder="如：标准销售出库配送单 (A4)"
                value={newTemplateName}
                onChange={e => setNewTemplateName(e.target.value)}
                autoFocus
              />
            </div>
            <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
              {saving ? '创建中...' : '确认创建'}
            </button>
            <button type="button" onClick={() => setIsCreatingNew(false)} className="btn btn-secondary btn-sm">
              取消
            </button>
          </form>
        </div>
      )}

      {/* Main Layout: Template List + Editor */}
      <div className="print-template-grid">
        {/* Template Selector Sidebar */}
        <div className="card" style={{ padding: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
            已定义模板 ({templates.length})
          </div>
          {loading ? (
            <div style={{ fontSize: '12px', color: 'var(--text-subtle)', padding: '16px 0', textAlign: 'center' }}>
              加载模板中...
            </div>
          ) : templates.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-subtle)', padding: '16px 0', textAlign: 'center' }}>
              暂无模板
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {templates.map(t => (
                <div
                  key={t.id}
                  onClick={() => selectTemplate(t)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    background: selectedTemplate?.id === t.id ? 'var(--accent-subtle)' : 'transparent',
                    border: selectedTemplate?.id === t.id ? '1px solid var(--accent)' : '1px solid transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: selectedTemplate?.id === t.id ? 600 : 500 }}>
                      {t.name}
                    </span>
                    {t.isDefault && (
                      <span className="badge badge-info" style={{ fontSize: '10px', padding: '1px 4px' }}>
                        默认
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    v{t.currentTemplateVersionNo} · {t.config.paper.size}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Template Editor Area */}
        {selectedTemplate ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Meta Card */}
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 700 }}>{selectedTemplate.name}</span>
                  <span className="badge badge-default" style={{ fontSize: '11px' }}>
                    当前配置版本: v{selectedTemplate.currentTemplateVersionNo}
                  </span>
                  <span className="badge font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    记录版本: v{selectedTemplate.version}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={() => setShowVersions(!showVersions)}
                    className="btn btn-secondary btn-sm"
                  >
                    <RefreshCwIcon size={13} />
                    <span>历史配置版本 ({versions.length})</span>
                  </button>
                  {onSelectTemplate && (
                    <button
                      onClick={() => onSelectTemplate(selectedTemplate.id, selectedTemplate.currentTemplateVersionId)}
                      className="btn btn-primary btn-sm"
                    >
                      使用此模板预览
                    </button>
                  )}
                </div>
              </div>

              {/* Version History Drawer */}
              {showVersions && (
                <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>模板历史版本清单：</div>
                  {loadingVersions ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-subtle)' }}>正在读取版本...</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {versions.map(v => (
                        <div
                          key={v.id}
                          style={{
                            padding: '4px 8px',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            display: 'flex',
                            gap: '6px',
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>v{v.versionNo}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{v.createdAt.substring(0, 10)}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingConfig(JSON.parse(JSON.stringify(v.config)));
                              setSuccessMsg(`已载入历史版本 v${v.versionNo} 的配置参数供编辑`);
                            }}
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '11px', padding: '1px 4px' }}
                          >
                            载入编辑
                          </button>
                          {onSelectTemplate && (
                            <button
                              type="button"
                              onClick={() => onSelectTemplate(selectedTemplate.id, v.id)}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '11px', padding: '1px 6px' }}
                            >
                              以此版本预览
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Basic Meta Settings */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>模板名称</label>
                  <input
                    type="text"
                    className="input"
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={templateIsDefault}
                      onChange={e => setTemplateIsDefault(e.target.checked)}
                    />
                    设为默认模板
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={templateActive}
                      onChange={e => setTemplateActive(e.target.checked)}
                    />
                    启用状态
                  </label>
                </div>
                <button
                  type="button"
                  onClick={handleUpdateMeta}
                  disabled={saving}
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: '16px' }}
                >
                  保存基本属性
                </button>
              </div>
            </div>

            {/* 1. Paper Setting Card */}
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                <span>1. 纸张与边距配置 (Paper)</span>
                <span style={{ fontSize: '12px', color: isWidthExceeded ? 'var(--danger)' : 'var(--text-muted)' }}>
                  纸张实际宽高: {paperDims.widthMm}mm × {paperDims.heightMm}mm · 可打印宽度: {printableWidth}mm
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>纸型尺寸</label>
                  <select
                    className="select"
                    value={editingConfig.paper.size}
                    onChange={e => updatePaper({ size: e.target.value as any })}
                  >
                    <option value="A4">A4 (210 × 297 mm)</option>
                    <option value="A5">A5 (148 × 210 mm)</option>
                    <option value="custom">自定义尺寸</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>打印方向</label>
                  <select
                    className="select"
                    value={editingConfig.paper.orientation}
                    onChange={e => updatePaper({ orientation: e.target.value as any })}
                  >
                    <option value="portrait">纵向 (Portrait)</option>
                    <option value="landscape">横向 (Landscape)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    页边距 (marginMm: 0~50)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    className="input"
                    value={editingConfig.paper.marginMm}
                    onChange={e => updatePaper({ marginMm: Number(e.target.value) })}
                  />
                </div>

                {editingConfig.paper.size === 'custom' && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                        自定义宽 (50~420mm)
                      </label>
                      <input
                        type="number"
                        min={50}
                        max={420}
                        className="input"
                        value={editingConfig.paper.widthMm ?? 210}
                        onChange={e => updatePaper({ widthMm: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                        自定义高 (50~600mm)
                      </label>
                      <input
                        type="number"
                        min={50}
                        max={600}
                        className="input"
                        value={editingConfig.paper.heightMm ?? 297}
                        onChange={e => updatePaper({ heightMm: Number(e.target.value) })}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Quick Preset for Needle Continuous Paper */}
              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed var(--border-default)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>常用预设纸型:</span>
                <button
                  type="button"
                  onClick={() =>
                    updatePaper({
                      size: 'custom',
                      orientation: 'landscape',
                      widthMm: 241,
                      heightMm: 93,
                      marginMm: 5,
                    })
                  }
                  className="btn btn-secondary btn-xs"
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                >
                  连续针打二等分单 (241×93mm)
                </button>
              </div>
            </div>

            {/* 2. Header Fields Whitelist & Ordering */}
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                2. 表头信息白名单与顺序 (Header Fields)
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                勾选需要显示的单据头部信息，并可通过上下移动调整输出先后次序：
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {editingConfig.headerFields.map((fieldKey, idx) => {
                  const fieldDef = ALLOWED_HEADER_FIELDS.find(f => f.field === fieldKey);
                  return (
                    <div
                      key={fieldKey}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 12px',
                        background: 'var(--bg-surface-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-default)',
                        fontSize: '13px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: 'var(--text-muted)', width: '20px' }}>#{idx + 1}</span>
                        <span style={{ fontWeight: 600 }}>{fieldDef?.label || fieldKey}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                          ({fieldKey})
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveHeaderField(idx, 'up')}
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '2px 6px' }}
                        >
                          ↑ 上移
                        </button>
                        <button
                          type="button"
                          disabled={idx === editingConfig.headerFields.length - 1}
                          onClick={() => moveHeaderField(idx, 'down')}
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '2px 6px' }}
                        >
                          ↓ 下移
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleHeaderField(fieldKey as HeaderFieldKey)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger)', padding: '2px 6px' }}
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add unselected header fields */}
              <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>添加可用字段:</span>
                {ALLOWED_HEADER_FIELDS.filter(f => !editingConfig.headerFields.includes(f.field)).map(f => (
                  <button
                    key={f.field}
                    type="button"
                    onClick={() => toggleHeaderField(f.field)}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '12px', padding: '2px 8px' }}
                  >
                    + {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Table Columns & Widths */}
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600 }}>3. 表格列配置与列宽顺序 (Columns)</span>
                <button
                  type="button"
                  onClick={addColumn}
                  className="btn btn-secondary btn-sm"
                >
                  <PlusIcon size={13} />
                  <span>添加列</span>
                </button>
              </div>

              {/* Width Gauge */}
              <div
                style={{
                  marginBottom: '12px',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: isWidthExceeded ? 'var(--danger-bg)' : 'var(--bg-surface-subtle)',
                  border: `1px solid ${isWidthExceeded ? 'var(--danger-border)' : 'var(--border-default)'}`,
                  color: isWidthExceeded ? 'var(--danger)' : 'var(--text-main)',
                  fontSize: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong>总列宽: {totalColsWidth} mm</strong> / 可打印区域: {printableWidth} mm
                  {isWidthExceeded && (
                    <span style={{ fontWeight: 700, marginLeft: '8px' }}>
                      (超出 {totalColsWidth - printableWidth} mm，无法保存生效！)
                    </span>
                  )}
                </div>
                <div>
                  剩余可用宽度: {Math.max(0, printableWidth - totalColsWidth)} mm
                </div>
              </div>

              {/* Columns Table */}
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table className="table" style={{ width: '100%', minWidth: '480px', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>字段</th>
                      <th>列标题 (Label)</th>
                      <th style={{ width: '90px' }}>宽度 (mm)</th>
                      <th style={{ width: '90px' }}>对齐方式</th>
                      <th style={{ width: '140px', textAlign: 'right' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editingConfig.columns.map((col, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td>
                          <select
                            className="select"
                            value={col.field}
                            onChange={e => {
                              const newField = e.target.value as ColumnFieldKey;
                              const def = ALLOWED_COLUMN_FIELDS.find(f => f.field === newField);
                              updateColumn(idx, {
                                field: newField,
                                label: def?.label || col.label,
                                align: def?.defaultAlign || col.align,
                              });
                            }}
                          >
                            {ALLOWED_COLUMN_FIELDS.map(f => (
                              <option key={f.field} value={f.field}>
                                {f.label} ({f.field})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="text"
                            className="input"
                            value={col.label}
                            onChange={e => updateColumn(idx, { label: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={5}
                            max={300}
                            className="input"
                            value={col.widthMm}
                            onChange={e => updateColumn(idx, { widthMm: Number(e.target.value) })}
                          />
                        </td>
                        <td>
                          <select
                            className="select"
                            value={col.align}
                            onChange={e => updateColumn(idx, { align: e.target.value as any })}
                          >
                            <option value="left">左对齐</option>
                            <option value="center">居中</option>
                            <option value="right">右对齐</option>
                          </select>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveColumn(idx, 'up')}
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '1px 5px' }}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={idx === editingConfig.columns.length - 1}
                              onClick={() => moveColumn(idx, 'down')}
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '1px 5px' }}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              disabled={editingConfig.columns.length <= 1}
                              onClick={() => removeColumn(idx)}
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--danger)', padding: '1px 5px' }}
                            >
                              <TrashIcon size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. Row Height & Remark */}
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>
                4. 最小行高与单据备注 (Row Height & Remarks)
              </div>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ width: '220px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    最小行高 (minRowHeightMm: 3~50)
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={50}
                    className="input"
                    value={editingConfig.minRowHeightMm}
                    onChange={e => setEditingConfig(prev => ({ ...prev, minRowHeightMm: Number(e.target.value) }))}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>
                    注：商品名过长时会自动换行增高，不截断内容
                  </span>
                </div>

                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editingConfig.showRemark}
                      onChange={e => setEditingConfig(prev => ({ ...prev, showRemark: e.target.checked }))}
                    />
                    在单据下方显示订单备注信息 (showRemark)
                  </label>
                </div>
              </div>
            </div>

            {/* Save Version Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setEditingConfig(JSON.parse(JSON.stringify(selectedTemplate.config)))}
                className="btn btn-secondary"
              >
                重置修改
              </button>
              <button
                type="button"
                disabled={saving || isWidthExceeded}
                onClick={handleSaveNewVersion}
                className="btn btn-primary"
              >
                <CheckIcon size={16} />
                <span>{saving ? '保存发布中...' : '保存并发布为新版本'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-subtle)' }}>
            请在左侧选择一个模板，或点击上方新建模板
          </div>
        )}
      </div>
    </div>
  );
}
