import React, { useState, useEffect, useRef } from 'react';
import type {
  PrintData,
  PrintJob,
  OrderRevisionSummary,
  PrintTemplate,
  PrintTemplateVersion,
} from '../../api/types.js';
import * as api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import {
  PrinterIcon,
  CheckIcon,
  XIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  SettingsIcon,
} from '../../components/icons/index.js';
import {
  getPaperDimensions,
  getPrintableWidthMm,
  detectClientPlatform,
  ALLOWED_HEADER_FIELDS,
  getPageSizeRule,
  type PrintPaper,
} from './printConfigLogic.js';
import { formatShanghaiInstant } from '../reports/reportHelpers.js';
import { PrintTemplateManager } from './PrintTemplateManager.js';
import {
  listAllOrderRevisions,
  listAllPrintTemplates,
  listAllPrintTemplateVersions,
} from './printingLoaders.js';
import './printing.css';

export interface OrderPrintPreviewProps {
  orderId: string;
  initialRevisionId?: string;
  initialTemplateVersionId?: string;
  onBack: () => void;
}

const isUuid = (val?: string): val is string => {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
};

export function OrderPrintPreview({
  orderId,
  initialRevisionId,
  initialTemplateVersionId,
  onBack,
}: OrderPrintPreviewProps) {
  const { isAdmin } = useAuth();
  const [printData, setPrintData] = useState<PrintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<PrintJob | null>(null);
  const [activeJobPlatform, setActiveJobPlatform] = useState<'desktop_web' | 'mobile_web'>('desktop_web');
  const [jobHistory, setJobHistory] = useState<PrintJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Version controls
  const [revisions, setRevisions] = useState<OrderRevisionSummary[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | undefined>(
    isUuid(initialRevisionId) ? initialRevisionId : undefined
  );

  // Template & historical template versions
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined);
  const [templateVersions, setTemplateVersions] = useState<PrintTemplateVersion[]>([]);
  const [selectedTemplateVersionId, setSelectedTemplateVersionId] = useState<string | undefined>(
    isUuid(initialTemplateVersionId) ? initialTemplateVersionId : undefined
  );

  // Tracking initial props consumption to avoid clobbering user selection
  const initialPropsConsumedRef = useRef(false);
  const lastRevisionIdPropRef = useRef<string | undefined>(initialRevisionId);
  const lastTemplateVersionIdPropRef = useRef<string | undefined>(initialTemplateVersionId);

  useEffect(() => {
    if (!initialPropsConsumedRef.current) {
      initialPropsConsumedRef.current = true;
      if (isUuid(initialRevisionId)) {
        setSelectedRevisionId(initialRevisionId);
      }
      if (isUuid(initialTemplateVersionId)) {
        setSelectedTemplateVersionId(initialTemplateVersionId);
      }
    } else {
      if (initialRevisionId && initialRevisionId !== lastRevisionIdPropRef.current && isUuid(initialRevisionId)) {
        lastRevisionIdPropRef.current = initialRevisionId;
        setSelectedRevisionId(initialRevisionId);
      }
      if (
        initialTemplateVersionId &&
        initialTemplateVersionId !== lastTemplateVersionIdPropRef.current &&
        isUuid(initialTemplateVersionId)
      ) {
        lastTemplateVersionIdPropRef.current = initialTemplateVersionId;
        setSelectedTemplateVersionId(initialTemplateVersionId);
      }
    }
  }, [initialRevisionId, initialTemplateVersionId]);

  // Modal for template management
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);

  // Role/generation guards: employee must never hit template-management APIs, and a
  // late admin response must not write admin lists after a downgrade.
  const roleRef = useRef(isAdmin);
  roleRef.current = isAdmin;
  const adminGenRef = useRef(0);
  const templatesGenRef = useRef(0);
  const versionsGenRef = useRef(0);
  const printDataGenRef = useRef(0);
  const orderIdRef = useRef(orderId);
  orderIdRef.current = orderId;
  const selectedTemplateIdRef = useRef<string | undefined>(selectedTemplateId);
  selectedTemplateIdRef.current = selectedTemplateId;
  const selectedTemplateVersionIdRef = useRef<string | undefined>(selectedTemplateVersionId);
  selectedTemplateVersionIdRef.current = selectedTemplateVersionId;
  const prevIsAdminRef = useRef(isAdmin);

  useEffect(() => {
    if (prevIsAdminRef.current === isAdmin) return;
    prevIsAdminRef.current = isAdmin;
    // Clear all admin-only template state on downgrade and refresh loaders on upgrade.
    adminGenRef.current++;
    versionsGenRef.current++;
    setTemplates([]);
    setTemplateVersions([]);
    setSelectedTemplateId(undefined);
    setSelectedTemplateVersionId(undefined);
    setTemplateManagerOpen(false);
    void loadRevisionsAndTemplates();
  }, [isAdmin]);

  useEffect(() => {
    void loadRevisionsAndTemplates();
  }, [orderId]);

  useEffect(() => {
    if (selectedTemplateId && isAdmin) {
      void loadTemplateVersions(selectedTemplateId);
    }
  }, [selectedTemplateId]);

  useEffect(() => {
    void loadPrintData();
    void loadJobHistory();
  }, [orderId, selectedRevisionId, selectedTemplateId, selectedTemplateVersionId, isAdmin]);

  const loadRevisionsAndTemplates = async () => {
    const gen = ++adminGenRef.current;
    const role = roleRef.current;
    try {
      // Order revisions are readable by employees; template management lists are admin-only.
      const revItems = await listAllOrderRevisions(orderId);
      if (gen !== adminGenRef.current) return;
      setRevisions(revItems);

      if (!role) {
        // Employee: no template/version management request at all.
        return;
      }

      // Exhaustive pagination so templates and old order revisions beyond the
      // first page remain selectable for historical reprint.
      const tplItems = await listAllPrintTemplates();
      if (gen !== adminGenRef.current || !roleRef.current) return;
      setTemplates(tplItems);
      // Never clobber a template the user picked while this request was in flight.
      if (tplItems.length > 0 && !selectedTemplateIdRef.current) {
        const defaultTpl = tplItems.find(t => t.isDefault) || tplItems[0];
        if (defaultTpl) {
          setSelectedTemplateId(defaultTpl.id);
        }
      }
    } catch (err: unknown) {
      if (gen !== adminGenRef.current) return;
      console.warn('获取版本或模板列表失败', err);
    }
  };

  const loadTemplateVersions = async (tplId: string) => {
    const gen = ++versionsGenRef.current;
    // Switching templates immediately drops the previous template's versions/errors.
    setTemplateVersions([]);
    if (!roleRef.current) return;
    try {
      const items = await listAllPrintTemplateVersions(tplId);
      // Discard late responses for a template that is no longer selected, or after
      // a role downgrade.
      if (gen !== versionsGenRef.current || !roleRef.current) return;
      if (selectedTemplateIdRef.current !== tplId) return;
      setTemplateVersions(items);
    } catch (err: unknown) {
      if (gen !== versionsGenRef.current || !roleRef.current) return;
      console.warn('加载模板版本历史失败', err);
    }
  };

  // A response is only writable when it is still the newest request, the role has
  // not changed, and the preview still targets the same order.
  const isCurrentPrintRequest = (gen: number, roleAtRequest: boolean, orderIdAtRequest: string) =>
    gen === printDataGenRef.current && roleAtRequest === roleRef.current && orderIdAtRequest === orderIdRef.current;

  const loadPrintData = async () => {
    const gen = ++printDataGenRef.current;
    const roleAtRequest = roleRef.current;
    const orderIdAtRequest = orderId;
    setLoading(true);
    setError(null);
    try {
      const currentTpl = roleAtRequest ? templates.find(t => t.id === selectedTemplateId) : undefined;
      // Employee always prints with the server default template; admin may pin a
      // historical template version explicitly.
      const effectiveTemplateVersionId = roleAtRequest
        ? selectedTemplateVersionId || currentTpl?.currentTemplateVersionId
        : undefined;

      const query: { revisionId?: string; templateVersionId?: string } = {};
      if (selectedRevisionId) query.revisionId = selectedRevisionId;
      if (effectiveTemplateVersionId) query.templateVersionId = effectiveTemplateVersionId;

      const data = await api.getPrintData(orderId, query);
      // Late responses must not overwrite the current role/selection/order.
      if (!isCurrentPrintRequest(gen, roleAtRequest, orderIdAtRequest)) return;
      setPrintData(data);
      if (roleRef.current && data.templateVersionId && !selectedTemplateVersionIdRef.current) {
        setSelectedTemplateVersionId(data.templateVersionId);
      }
    } catch (err: unknown) {
      // A stale failure must not surface an error over a newer successful request.
      if (!isCurrentPrintRequest(gen, roleAtRequest, orderIdAtRequest)) return;
      setError(err instanceof Error ? err.message : '加载单据打印数据失败');
    } finally {
      // Only the latest request for the current role/order may clear the spinner.
      if (isCurrentPrintRequest(gen, roleAtRequest, orderIdAtRequest)) {
        setLoading(false);
      }
    }
  };

  const loadJobHistory = async () => {
    try {
      const res = await api.listPrintJobs(orderId);
      setJobHistory(res.items);
    } catch (err: unknown) {
      console.warn('获取打印记录历史失败', err);
    }
  };

  const handleTriggerPrint = async () => {
    if (!printData) return;
    setError(null);
    setStatusMsg(null);
    try {
      const clientPlatform = detectClientPlatform();
      setActiveJobPlatform(clientPlatform);
      const job = await api.createPrintJob(orderId, {
        orderRevisionId: printData.order.revisionId,
        templateVersionId: printData.templateVersionId,
        clientPlatform,
      });
      setActiveJob(job);
      void loadJobHistory();

      // Trigger browser native print dialog
      window.print();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '创建打印任务失败');
    }
  };

  const handleUpdateJobStatus = async (
    status: 'user_confirmed' | 'user_cancelled' | 'client_error'
  ) => {
    if (!activeJob) return;
    setError(null);
    try {
      const noteMap = {
        user_confirmed: '操作员人工确认物理打印机出纸成功',
        user_cancelled: '操作员主动取消打印任务',
        client_error: '物理出纸异常、卡纸或打印机故障',
      };
      const updated = await api.setPrintJobStatus(activeJob.id, {
        status,
        note: noteMap[status],
      });
      setActiveJob(updated);
      void loadJobHistory();
      const labelMap = {
        user_confirmed: '已人工确认出纸成功',
        user_cancelled: '已人工登记取消',
        client_error: '已登记打印故障/失败',
      };
      setStatusMsg(`打印任务 #${activeJob.id.substring(0, 8)} 状态已更新为：${labelMap[status]}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '更新打印状态失败');
    }
  };

  if (loading && !printData) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-subtle)' }}>
        正在加载配送单据与打印配置...
      </div>
    );
  }

  if (!printData) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ color: 'var(--danger)', marginBottom: '16px' }}>{error || '无法获取打印数据'}</div>
        <button onClick={onBack} className="btn btn-secondary">返回单据</button>
      </div>
    );
  }

  const { order, company, config } = printData;
  const paperDims = getPaperDimensions(config.paper);
  const printableWidth = getPrintableWidthMm(config.paper);
  // Important: margin 0 is completely legal! Do NOT do config.paper.marginMm || 10!
  const marginMm = typeof config.paper.marginMm === 'number' ? config.paper.marginMm : 10;
  const minRowHeightMm = typeof config.minRowHeightMm === 'number' ? config.minRowHeightMm : 8;
  // Compact paper layout for short slips (e.g. continuous needle 241x93mm with heightMm <= 130)
  const isCompactPaper = paperDims.heightMm <= 130;

  // Header field value mapper
  const getHeaderFieldValue = (fieldKey: string): { label: string; value: string } => {
    const labelDef = ALLOWED_HEADER_FIELDS.find(f => f.field === fieldKey)?.label || fieldKey;
    switch (fieldKey) {
      case 'companyName':
        return { label: labelDef, value: company?.name || '—' };
      case 'companyPhone':
        return { label: labelDef, value: company?.phone || '—' };
      case 'companyAddress':
        return { label: labelDef, value: company?.address || '—' };
      case 'orderNo':
        return { label: labelDef, value: order.orderNo };
      case 'confirmedAt':
        return { label: labelDef, value: order.confirmedAt ? formatShanghaiInstant(order.confirmedAt) : '—' };
      case 'customerName':
        return { label: labelDef, value: order.deliverySnapshot?.customerName || '—' };
      case 'contactName':
        return { label: labelDef, value: order.deliverySnapshot?.contactName || '—' };
      case 'phone':
        return { label: labelDef, value: order.deliverySnapshot?.phone || '—' };
      case 'deliveryAddress':
        return { label: labelDef, value: order.deliverySnapshot?.address || '—' };
      default:
        return { label: labelDef, value: '—' };
    }
  };

  const currentTemplate = templates.find(t => t.id === selectedTemplateId);
  const isOldTemplateVersion = Boolean(
    selectedTemplateVersionId &&
      currentTemplate &&
      selectedTemplateVersionId !== currentTemplate.currentTemplateVersionId
  );

  return (
    <div className="print-preview-container">
      {/* Inject real dynamic @page size and margins */}
      <style id="dynamic-order-print-page-style">{`
        @media print {
          @page {
            size: ${getPageSizeRule(config.paper)};
            margin: ${marginMm}mm;
          }
          #printable-area {
            width: ${printableWidth}mm !important;
            max-width: ${printableWidth}mm !important;
            padding: 0 !important;
            margin: 0 auto !important;
          }
        }
      `}</style>

      {/* Top Action Toolbar (hidden on print) */}
      <div className="card print-toolbar no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onBack} className="btn btn-secondary btn-sm">
            ← 返回单据
          </button>
          <div>
            <span style={{ fontWeight: 700, fontSize: '15px' }}>销售配送单打印预览</span>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px', flexWrap: 'wrap' }}>
              <span>纸型: {config.paper.size} ({config.paper.orientation === 'landscape' ? '横向' : '纵向'})</span>
              <span>边距: {marginMm}mm</span>
              <span>可打印宽: {printableWidth}mm</span>
              <span>模板版本: v{printData.templateVersionNo}</span>
              {printData.isCurrentOrderRevision ? (
                <span className="badge badge-success" style={{ fontSize: '10px' }}>当前订单版本</span>
              ) : (
                <span className="badge badge-warning" style={{ fontSize: '10px' }}>历史订单重打 (v{order.revisionNo})</span>
              )}
              {isOldTemplateVersion && (
                <span className="badge badge-warning" style={{ fontSize: '10px' }}>旧模板版本重打</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {isAdmin && (
            <button
              onClick={() => setTemplateManagerOpen(true)}
              className="btn btn-secondary btn-sm"
            >
              <SettingsIcon size={14} />
              <span>模板配置</span>
            </button>
          )}

          <button onClick={handleTriggerPrint} className="btn btn-primary">
            <PrinterIcon size={16} />
            <span>调起打印机 (Window Print)</span>
          </button>
        </div>
      </div>

      {/* Manual print outcome controls & alerts (hidden on print) */}
      {activeJob && (
        <div
          className="card no-print"
          style={{
            padding: '12px 16px',
            background: 'var(--accent-subtle)',
            border: '1px solid var(--accent)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>
              当前打印任务 #{activeJob.id.substring(0, 8)} ({activeJobPlatform === 'mobile_web' ? '移动端' : '桌面端'})
            </span>
            <span className="badge badge-info" style={{ fontSize: '11px' }}>
              状态: {activeJob.status}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>人工核验出纸：</span>
            <button
              onClick={() => void handleUpdateJobStatus('user_confirmed')}
              className="btn btn-sm"
              style={{ background: 'var(--success)', color: '#fff', borderColor: 'var(--success)' }}
            >
              <CheckIcon size={14} />
              <span>确认出纸成功</span>
            </button>
            <button
              onClick={() => void handleUpdateJobStatus('user_cancelled')}
              className="btn btn-secondary btn-sm"
            >
              <XIcon size={14} />
              <span>取消出纸</span>
            </button>
            <button
              onClick={() => void handleUpdateJobStatus('client_error')}
              className="btn btn-sm"
              style={{ background: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)' }}
            >
              <AlertCircleIcon size={14} />
              <span>打印失败/卡纸</span>
            </button>
          </div>
        </div>
      )}

      {/* Version & Template Selection Bar (hidden on print) */}
      <div className="print-version-bar no-print">
        {/* Order Revision Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600 }}>订单版本：</span>
          <select
            className="select"
            style={{ fontSize: '12px', padding: '3px 8px', height: '28px' }}
            value={selectedRevisionId || ''}
            onChange={e => setSelectedRevisionId(e.target.value || undefined)}
          >
            <option value="">当前最新版本 (v{order.revisionNo})</option>
            {revisions.map(rev => (
              <option key={rev.revisionId} value={rev.revisionId}>
                版本 v{rev.revisionNo} ({rev.changeReason || '初始确认'}) - {rev.createdAt.substring(0, 16)}
              </option>
            ))}
          </select>
        </div>

        {/* Template Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600 }}>出库模板：</span>
          <select
            className="select"
            style={{ fontSize: '12px', padding: '3px 8px', height: '28px' }}
            value={selectedTemplateId || ''}
            onChange={e => {
              const tplId = e.target.value || undefined;
              setSelectedTemplateId(tplId);
              setSelectedTemplateVersionId(undefined); // Reset version to default when changing template
            }}
          >
            {templates.map(tpl => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name} {tpl.isDefault ? '(默认)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Template Version Selector (supports explicit historical version selection for true reprint) */}
        {templateVersions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 600 }}>模板版本：</span>
            <select
              className="select"
              style={{ fontSize: '12px', padding: '3px 8px', height: '28px' }}
              value={selectedTemplateVersionId || ''}
              onChange={e => setSelectedTemplateVersionId(e.target.value || undefined)}
            >
              <option value="">最新发布版 (v{currentTemplate?.currentTemplateVersionNo || printData.templateVersionNo})</option>
              {templateVersions.map(v => (
                <option key={v.id} value={v.id}>
                  v{v.versionNo} ({v.createdAt.substring(0, 10)})
                  {v.id === currentTemplate?.currentTemplateVersionId ? ' - 当前最新' : ' - 历史版本'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {statusMsg && (
        <div
          className="no-print"
          style={{
            padding: '10px 14px',
            background: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--success)',
            fontSize: '13px',
          }}
        >
          {statusMsg}
        </div>
      )}

      {error && (
        <div
          className="no-print"
          style={{
            padding: '10px 14px',
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--danger)',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Printable Sheet Area */}
      <div className="print-sheet-wrapper">
        <div
          id="printable-area"
          className={`printable-sheet ${isCompactPaper ? 'is-compact-paper' : ''}`}
          style={{
            width: '100%',
            maxWidth: `${Math.min(paperDims.widthMm * 3.78, 900)}px`,
            padding: `${marginMm * 3.78}px`,
            background: '#ffffff',
          }}
        >
          {/* Header Title */}
          <div
            style={{
              textAlign: 'center',
              marginBottom: isCompactPaper ? '6px' : '16px',
              borderBottom: isCompactPaper ? '1.5px solid #000000' : '2px solid #000000',
              paddingBottom: isCompactPaper ? '4px' : '10px',
            }}
          >
            <h1
              style={{
                fontSize: isCompactPaper ? '16px' : '20px',
                fontWeight: 800,
                margin: 0,
                lineHeight: 1.2,
                letterSpacing: '0.5px',
              }}
            >
              {company?.name || '货友铺'} 销售商品配送单
            </h1>
            <div
              style={{
                fontSize: isCompactPaper ? '10.5px' : '12px',
                color: '#333333',
                marginTop: isCompactPaper ? '2px' : '4px',
              }}
            >
              电话: {company?.phone || '—'} · 发货地址: {company?.address || '—'}
            </div>
          </div>

          {/* Configured Header Fields Grid */}
          {config.headerFields && config.headerFields.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isCompactPaper
                  ? 'repeat(auto-fit, minmax(130px, 1fr))'
                  : 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: isCompactPaper ? '3px 10px' : '8px 16px',
                fontSize: isCompactPaper ? '10.5px' : '12px',
                marginBottom: isCompactPaper ? '6px' : '16px',
                paddingBottom: isCompactPaper ? '4px' : '12px',
                borderBottom: '1px dashed #cbd5e1',
              }}
            >
              {config.headerFields.map(hfKey => {
                const item = getHeaderFieldValue(hfKey);
                return (
                  <div key={hfKey} style={{ display: 'flex', gap: isCompactPaper ? '4px' : '6px', minWidth: 0 }}>
                    <span style={{ color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{item.label}:</span>
                    <span style={{ color: '#0f172a', wordBreak: 'break-word' }}>{item.value}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Lines Table: Truly consumes config.columns and minRowHeightMm */}
          <table className="print-table" style={{ marginBottom: isCompactPaper ? '6px' : '16px' }}>
            <thead>
              <tr>
                {config.columns.map((col, idx) => (
                  <th
                    key={idx}
                    style={{
                      width: `${col.widthMm}mm`,
                      textAlign: col.align || 'left',
                      fontSize: isCompactPaper ? '11px' : '12px',
                      padding: isCompactPaper ? '2px 4px' : undefined,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.lines.map(l => (
                <tr key={l.id}>
                  {config.columns.map((col, colIdx) => {
                    let cellContent: React.ReactNode = null;
                    switch (col.field) {
                      case 'productName':
                        cellContent = (
                          <div className="print-cell-long-text">
                            <strong>{l.productName}</strong>
                          </div>
                        );
                        break;
                      case 'specification':
                        cellContent = <span className="print-cell-long-text">{l.specification || '—'}</span>;
                        break;
                      case 'warehouseName':
                        cellContent = <span>{l.warehouseName}</span>;
                        break;
                      case 'unitName':
                        cellContent = <span>{l.unitName}</span>;
                        break;
                      case 'quantity':
                        cellContent = (
                          <span className="tabular-nums font-mono" style={{ fontWeight: 600 }}>
                            {l.quantity ?? l.quantityBase}
                          </span>
                        );
                        break;
                      case 'unitPrice':
                        cellContent = <span className="tabular-nums font-mono">¥{l.unitPrice}</span>;
                        break;
                      case 'netAmount':
                        cellContent = (
                          <span className="tabular-nums font-mono" style={{ fontWeight: 600 }}>
                            ¥{l.netAmount}
                          </span>
                        );
                        break;
                      case 'remark':
                        cellContent = <span className="print-cell-long-text">{l.remark || '—'}</span>;
                        break;
                      default:
                        cellContent = '—';
                    }

                    return (
                      <td
                        key={colIdx}
                        style={{
                          textAlign: col.align || 'left',
                          fontSize: isCompactPaper ? '11px' : '12px',
                          padding: isCompactPaper ? '2px 4px' : '4px',
                        }}
                      >
                        <div
                          style={{
                            minHeight: `${minRowHeightMm}mm`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start',
                            wordBreak: 'break-word',
                            overflowWrap: 'break-word',
                            whiteSpace: 'normal',
                            width: '100%',
                            lineHeight: isCompactPaper ? 1.25 : 1.35,
                          }}
                        >
                          {cellContent}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Remarks (if enabled in config and present) */}
          {config.showRemark && order.remark && (
            <div
              style={{
                fontSize: isCompactPaper ? '10.5px' : '12px',
                padding: isCompactPaper ? '4px 8px' : '8px 12px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                marginBottom: isCompactPaper ? '6px' : '16px',
              }}
            >
              <strong>订单整体备注:</strong> {order.remark}
            </div>
          )}

          {/* Totals Summary */}
          {isCompactPaper ? (
            <div
              className="print-totals-summary is-compact"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1.5px solid #000000',
                paddingTop: '4px',
                fontSize: '11px',
                flexWrap: 'wrap',
                gap: '4px 16px',
              }}
            >
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ color: '#475569' }}>商品总额: </span>
                  <span className="tabular-nums font-mono" style={{ fontWeight: 600 }}>¥{order.subtotalAmount}</span>
                </div>
                <div>
                  <span style={{ color: '#475569' }}>整单折扣优惠: </span>
                  <span className="tabular-nums font-mono">-¥{order.discountAmount}</span>
                </div>
                <div>
                  <span style={{ color: '#475569' }}>减免抹零: </span>
                  <span className="tabular-nums font-mono">-¥{order.roundOffAmount}</span>
                </div>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 800 }}>
                <span>应收合计: </span>
                <span className="tabular-nums font-mono">¥{order.totalAmount}</span>
              </div>
            </div>
          ) : (
            <div className="print-totals-summary" style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1.5px solid #000000', paddingTop: '10px', fontSize: '13px' }}>
              <div style={{ width: '260px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#475569' }}>商品总额:</span>
                  <span className="tabular-nums font-mono">¥{order.subtotalAmount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#475569' }}>整单折扣优惠:</span>
                  <span className="tabular-nums font-mono">-¥{order.discountAmount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#475569' }}>减免抹零:</span>
                  <span className="tabular-nums font-mono">-¥{order.roundOffAmount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 800, borderTop: '1px solid #000000', paddingTop: '6px' }}>
                  <span>应收合计:</span>
                  <span className="tabular-nums font-mono">¥{order.totalAmount}</span>
                </div>
              </div>
            </div>
          )}

          {/* Signatures */}
          <div
            className="print-signatures"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: isCompactPaper ? '12px' : '16px',
              marginTop: isCompactPaper ? '6px' : '36px',
              fontSize: isCompactPaper ? '10.5px' : '12px',
              color: '#1e293b',
            }}
          >
            <div>制单经办: _________________</div>
            <div>配送发货: _________________</div>
            <div>客户签收: _________________</div>
          </div>
        </div>
      </div>

      {/* Print Job History Log (hidden on print) */}
      <div className="card print-job-history-card no-print" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>本单打印与重打历史日志 ({jobHistory.length})</span>
          <button onClick={() => void loadJobHistory()} className="btn btn-ghost btn-sm">
            <RefreshCwIcon size={12} />
            <span>刷新日志</span>
          </button>
        </div>

        {jobHistory.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-subtle)', padding: '12px 0', textAlign: 'center' }}>
            暂无打印请求记录
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="print-job-history-table">
              <thead>
                <tr>
                  <th>任务标识</th>
                  <th>单据修订版本</th>
                  <th>模板版本</th>
                  <th>操作员</th>
                  <th>请求时间</th>
                  <th>出纸状态</th>
                  <th>操作员说明</th>
                </tr>
              </thead>
              <tbody>
                {jobHistory.map(job => (
                  <tr key={job.id}>
                    <td className="font-mono">{job.id.substring(0, 8)}</td>
                    <td>{job.orderRevisionId ? `rev-${job.orderRevisionId.substring(0, 6)}` : '当前版'}</td>
                    <td>tpl-{job.templateVersionId.substring(0, 6)}</td>
                    <td className="font-mono">{job.operatorId.substring(0, 8)}</td>
                    <td>{job.requestedAt.replace('T', ' ').substring(0, 19)}</td>
                    <td>
                      <span
                        className={`badge ${
                          job.status === 'user_confirmed'
                            ? 'badge-success'
                            : job.status === 'client_error'
                            ? 'badge-danger'
                            : job.status === 'user_cancelled'
                            ? 'badge-warning'
                            : 'badge-default'
                        }`}
                        style={{ fontSize: '11px' }}
                      >
                        {job.status === 'user_confirmed'
                          ? '已确认出纸'
                          : job.status === 'client_error'
                          ? '打印失败'
                          : job.status === 'user_cancelled'
                          ? '已取消'
                          : '已请求'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{job.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Template Manager Modal */}
      {templateManagerOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '960px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <PrintTemplateManager
              onClose={() => setTemplateManagerOpen(false)}
              onSelectTemplate={(tplId, verId) => {
                setSelectedTemplateId(tplId);
                setSelectedTemplateVersionId(verId);
                setTemplateManagerOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
