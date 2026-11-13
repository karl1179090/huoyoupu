import React, { useState, useRef } from 'react';
import type { AiResult, ReportResult, ReportQuery } from '../../api/types.js';
import * as api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import {
  SparklesIcon,
  AlertCircleIcon,
  CheckIcon,
  RefreshCwIcon,
  ChartIcon,
} from '../../components/icons/index.js';
import {
  ReportResultViewer,
  formatShanghaiInstant,
  formatShanghaiDate,
  type SourceRef,
} from './reportHelpers.js';
import { ReportsPage } from './ReportsPage.js';
import './reports.css';

export interface AiReportPageProps {
  onOpenReports?: (query?: ReportQuery) => void;
  onOpenReportRun?: (reportRunId: string) => void;
  onNavigateToSource?: (source: SourceRef) => void;
}

export function AiReportPage({ onOpenReports, onOpenReportRun, onNavigateToSource }: AiReportPageProps) {
  const { isAdmin } = useAuth();
  const [question, setQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Concurrency & generation guards
  const inquiryGenRef = useRef(0);
  const reportPaginationGenRef = useRef(0);
  const reviewGenRef = useRef(0);

  // Clarification free-text reply
  const [customClarificationText, setCustomClarificationText] = useState('');

  // In-component fallback to standard ReportsPage
  const [switchToReports, setSwitchToReports] = useState(false);
  const [prefilledQuery, setPrefilledQuery] = useState<ReportQuery | undefined>(undefined);
  const [prefilledRunId, setPrefilledRunId] = useState<string | undefined>(undefined);

  // Review verified report by report.id
  const [reviewedReport, setReviewedReport] = useState<ReportResult | null>(null);
  const [reviewingReport, setReviewingReport] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [loadingMoreReport, setLoadingMoreReport] = useState(false);

  const handleAsk = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const currentQ = question.trim();
    if (!currentQ) return;
    const currentGen = ++inquiryGenRef.current;
    ++reviewGenRef.current; // Invalidate any pending review sub-requests
    setLoading(true);
    setError(null);
    setResult(null); // R2: Immediately clear previous answer so failure doesn't show old answer!
    setReviewedReport(null);
    setReviewError(null);
    setReviewingReport(false);
    setSubmittedQuestion(currentQ);
    try {
      const res = await api.askReport({ question: currentQ });
      if (inquiryGenRef.current !== currentGen) return; // Stale request, discard!
      setResult(res);
    } catch (err: unknown) {
      if (inquiryGenRef.current !== currentGen) return;
      setError(err instanceof Error ? err.message : 'AI 统计分析失败');
      setResult(null); // Guarantee result remains null on error!
    } finally {
      if (inquiryGenRef.current === currentGen) {
        setLoading(false);
      }
    }
  };

  const handleClarificationSubmit = async (answer: string) => {
    if (!result || result.status !== 'needs_clarification') return;
    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer) return;
    const clarificationRunId = result.id;
    // R2: Bind to the original question that triggered this clarification, NOT any edited text in input
    const originalQuestion = submittedQuestion || ('question' in result ? result.question : question.trim());
    const currentGen = ++inquiryGenRef.current;
    ++reviewGenRef.current; // Invalidate any pending review sub-requests
    setLoading(true);
    setError(null);
    setReviewedReport(null);
    setReviewError(null);
    setReviewingReport(false);
    try {
      const res = await api.askReport({
        question: originalQuestion,
        clarificationRunId,
        clarificationAnswer: trimmedAnswer,
      });
      if (inquiryGenRef.current !== currentGen) return; // Stale response, discard!
      setResult(res);
      setCustomClarificationText('');
    } catch (err: unknown) {
      if (inquiryGenRef.current !== currentGen) return;
      setError(err instanceof Error ? err.message : '提交澄清信息失败');
    } finally {
      if (inquiryGenRef.current === currentGen) {
        setLoading(false);
      }
    }
  };

  const handleReviewReportRun = async (reportId: string) => {
    if (!reportId) return;
    const capturedInquiryGen = inquiryGenRef.current;
    const capturedReviewGen = ++reviewGenRef.current;
    const targetReportId = reportId;

    setReviewingReport(true);
    setReviewError(null);
    try {
      const run = await api.getReportRun(targetReportId);
      // R3: Discard if inquiry generation or review generation changed
      if (
        inquiryGenRef.current !== capturedInquiryGen ||
        reviewGenRef.current !== capturedReviewGen
      ) {
        return; // Stale review response, discard!
      }
      if (run && run.id === targetReportId) {
        setReviewedReport(run);
      }
    } catch (err: unknown) {
      if (
        inquiryGenRef.current !== capturedInquiryGen ||
        reviewGenRef.current !== capturedReviewGen
      ) {
        return; // Stale review error, discard!
      }
      const errMsg = err instanceof Error ? err.message : '读取报表快照复核数据失败';
      if (errMsg.includes('410') || errMsg.includes('SNAPSHOT_EXPIRED') || (err as any)?.status === 410) {
        setReviewError('该报表快照已在服务端过期 (410 SNAPSHOT_EXPIRED)');
      } else {
        setReviewError(errMsg);
      }
    } finally {
      if (
        inquiryGenRef.current === capturedInquiryGen &&
        reviewGenRef.current === capturedReviewGen
      ) {
        setReviewingReport(false);
      }
    }
  };

  /**
   * Paging along the exact same report ID returned by AI (with generation & snapshot ID isolation)
   */
  const handleLoadMoreReportRows = async () => {
    if (!result || result.status !== 'answered' || !result.report.nextCursor || loadingMoreReport) return;
    const targetReportId = result.report.id;
    const currentGen = ++reportPaginationGenRef.current;
    setLoadingMoreReport(true);
    try {
      const nextRun = await api.getReportRun(targetReportId, {
        cursor: result.report.nextCursor,
        limit: 50,
      });
      // R3: Discard if newer request in flight
      if (reportPaginationGenRef.current !== currentGen) return;
      setResult(prev => {
        // Discard if user submitted a new question or snapshot changed
        if (!prev || prev.status !== 'answered' || prev.report.id !== targetReportId) {
          return prev;
        }
        return {
          ...prev,
          report: {
            ...nextRun,
            id: targetReportId,
            rows: [...(prev.report.rows as any[]), ...(nextRun.rows as any[])] as any,
          },
        };
      });
    } catch (err: unknown) {
      if (reportPaginationGenRef.current !== currentGen) return;
      setError(err instanceof Error ? err.message : '加载后续报表行失败');
    } finally {
      if (reportPaginationGenRef.current === currentGen) {
        setLoadingMoreReport(false);
      }
    }
  };

  const handleTransitionToNormalReports = (query?: ReportQuery) => {
    ++reviewGenRef.current;
    setReviewingReport(false);
    setReviewedReport(null);
    setReviewError(null);
    if (onOpenReports) {
      onOpenReports(query);
    }
    setPrefilledQuery(query);
    setPrefilledRunId(undefined);
    setSwitchToReports(true);
  };

  const handleOpenReportRun = (runId: string) => {
    ++reviewGenRef.current;
    setReviewingReport(false);
    setReviewedReport(null);
    setReviewError(null);
    if (onOpenReportRun) {
      onOpenReportRun(runId);
      return;
    }
    setPrefilledRunId(runId);
    setPrefilledQuery(undefined);
    setSwitchToReports(true);
  };

  // If transitioned to ReportsPage
  if (switchToReports) {
    return (
      <ReportsPage
        initialReportRunId={prefilledRunId}
        initialQuery={prefilledQuery}
        onBackToAi={() => {
          setSwitchToReports(false);
          setPrefilledRunId(undefined);
          setPrefilledQuery(undefined);
        }}
        onNavigateToSource={onNavigateToSource}
      />
    );
  }

  const exampleQuestions = [
    '哪些客户本月某商品下单量比上月少？',
    '本月各商品销售与毛利汇总情况如何？',
    '当前各仓库批次结存与临期库存情况',
    '哪些客户存在应收逾期或未结余额？',
  ];

  return (
    <div className="reports-container">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SparklesIcon size={22} style={{ color: '#8b5cf6' }} />
          <span>AI 智能经营报表与自然语言查询</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          通过自然语言提问经营指标，自动落实为底层规范化统计条件、凭据明细与结构化报表
        </p>
      </div>

      {!isAdmin && (
        <div style={{ padding: '10px 14px', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 'var(--radius-sm)', color: 'var(--warning)', fontSize: '13px' }}>
          注：AI 经营报表仅管理员具有完整查询权限，普通员工访问受安全策略限制
        </div>
      )}

      {/* Error alert with clean fallback to ReportsPage */}
      {error && (
        <div className="card" style={{ padding: '16px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', fontSize: '14px', fontWeight: 600 }}>
            <AlertCircleIcon size={18} />
            <span>{error}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-main)' }}>
            如遇 AI 模型未配置、超时 (503) 或拒绝，系统严禁编造虚假数据。您可以直接转至固定报表执行标准统计：
          </div>
          <div>
            <button
              type="button"
              onClick={() => handleTransitionToNormalReports(undefined)}
              className="btn btn-secondary btn-sm"
            >
              <ChartIcon size={14} />
              <span>转为固定业务报表查询</span>
            </button>
          </div>
        </div>
      )}

      {/* Query input card */}
      <div className="ai-chat-card">
        <form onSubmit={handleAsk}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
            输入您的经营统计问题 (支持多维度条件与同期比较)
          </label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="input"
              placeholder="例如：哪些客户本月某商品下单量比上月少？或本月销售总额与毛利如何？"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              style={{ flex: 1, minWidth: '260px' }}
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="btn btn-primary"
              style={{ background: '#7c3aed', borderColor: '#6d28d9' }}
            >
              <SparklesIcon size={16} />
              <span>{loading ? 'AI 分析中...' : '提交统计问题'}</span>
            </button>
          </div>
        </form>

        {/* Quick Example Prompts */}
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>快捷示例：</span>
          {exampleQuestions.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setQuestion(q)}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '11px', padding: '2px 8px', background: 'var(--bg-surface-subtle)' }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Result Presentation */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Branch 1: Needs Clarification */}
          {result.status === 'needs_clarification' && (
            <div className="card ai-clarification-box">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b45309', fontWeight: 700, fontSize: '14px' }}>
                <AlertCircleIcon size={18} />
                <span>需要进一步澄清统计口径</span>
                <span className="badge font-mono" style={{ fontSize: '10px', marginLeft: 'auto' }}>
                  Run ID: #{result.id.substring(0, 8)}
                </span>
              </div>

              <div style={{ fontSize: '14px', color: 'var(--text-main)', background: '#ffffff', padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid #fde68a' }}>
                {result.question}
              </div>

              {/* Preset choices if any */}
              {result.choices && result.choices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                    请选择符合您意图的候选方案：
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {result.choices.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => void handleClarificationSubmit(c.id)}
                        disabled={loading}
                        className="btn btn-secondary btn-sm"
                        style={{ background: '#ffffff' }}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Free-text clarification input (supports clarification when choices=[] or custom answer) */}
              <div style={{ marginTop: '8px', borderTop: '1px dashed #fde68a', paddingTop: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  或者输入自定义补充说明：
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="输入具体客户名称、特定日期或业务条件..."
                    value={customClarificationText}
                    onChange={e => setCustomClarificationText(e.target.value)}
                    style={{ flex: 1, background: '#ffffff' }}
                  />
                  <button
                    type="button"
                    disabled={loading || !customClarificationText.trim()}
                    onClick={() => void handleClarificationSubmit(customClarificationText)}
                    className="btn btn-primary btn-sm"
                  >
                    提交补充说明
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Branch 2: Answered */}
          {result.status === 'answered' && (
            <div className="ai-answer-card">
              {/* Question binding banner */}
              <div style={{ padding: '8px 12px', background: 'var(--accent-subtle)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)', fontSize: '13px', color: 'var(--text-main)', marginBottom: '12px' }}>
                <strong>统计问题：</strong>“{submittedQuestion || ('question' in result ? (result as any).question : '当前经营问题')}”
              </div>

              {/* Header with conclusion */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontWeight: 700, fontSize: '15px' }}>
                  <CheckIcon size={20} />
                  <span>AI 经营分析结论</span>
                </div>
                <span className="badge font-mono" style={{ fontSize: '11px' }}>
                  Run ID: #{result.id.substring(0, 8)}
                </span>
              </div>

              {/* Summary text */}
              <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-main)', whiteSpace: 'pre-wrap', background: 'var(--bg-surface-subtle)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }}>
                {result.summary}
              </div>

              {/* Normalized Query Card with button to launch normal query */}
              {result.query && (
                <div style={{ padding: '12px 14px', background: '#f8fafc', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>底层执行的规范化统计条件 (Normalized Query)</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span className="badge badge-info" style={{ fontSize: '11px' }}>
                        {result.query.kind}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleTransitionToNormalReports(result.query)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '12px' }}
                      >
                        <ChartIcon size={12} />
                        <span>在普通报表中执行此查询 (新快照)</span>
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                    <div>
                      <strong>统计主题:</strong> {result.query.kind}
                    </div>
                    {result.query.period && (
                      <div>
                        <strong>期间模式:</strong> {result.query.period.mode}
                        {result.query.period.start && ` (${formatShanghaiDate(result.query.period.start)} 至 ${formatShanghaiDate(result.query.period.end)})`}
                      </div>
                    )}
                    {result.query.pointAsOf && (
                      <div>
                        <strong>结存时点:</strong> {formatShanghaiInstant(result.query.pointAsOf)}
                      </div>
                    )}
                    {result.query.quantityBasis && (
                      <div>
                        <strong>数量口径:</strong> {result.query.quantityBasis}
                      </div>
                    )}
                    {result.query.filters?.customerIds && result.query.filters.customerIds.length > 0 && (
                      <div>
                        <strong>筛选客户 ({result.query.filters.customerIds.length}):</strong> {result.query.filters.customerIds.join(', ')}
                      </div>
                    )}
                    {result.query.filters?.productIds && result.query.filters.productIds.length > 0 && (
                      <div>
                        <strong>筛选商品 ({result.query.filters.productIds.length}):</strong> {result.query.filters.productIds.join(', ')}
                      </div>
                    )}
                    {result.query.filters?.warehouseIds && result.query.filters.warehouseIds.length > 0 && (
                      <div>
                        <strong>筛选仓库 ({result.query.filters.warehouseIds.length}):</strong> {result.query.filters.warehouseIds.join(', ')}
                      </div>
                    )}
                    {result.query.filters?.decreasesOnly !== undefined && (
                      <div>
                        <strong>仅看下降:</strong> {result.query.filters.decreasesOnly ? '是' : '否'}
                      </div>
                    )}
                    {result.query.filters?.minDecreaseQuantityBase !== undefined && (
                      <div>
                        <strong>最小下降量:</strong> {result.query.filters.minDecreaseQuantityBase}
                      </div>
                    )}
                    {result.query.filters?.minDecreasePercent && (
                      <div>
                        <strong>最小下降比例:</strong> {result.query.filters.minDecreasePercent}%
                      </div>
                    )}
                    {result.query.groupBy && result.query.groupBy.length > 0 && (
                      <div>
                        <strong>分组维度:</strong> {result.query.groupBy.join(', ')}
                      </div>
                    )}
                  </div>

                  {/* Collapsible raw JSON normalized query */}
                  <details style={{ marginTop: '10px', fontSize: '11px', borderTop: '1px dashed var(--border-default)', paddingTop: '6px' }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 500 }}>
                      展开核对完整规范化条件 (JSON)
                    </summary>
                    <pre style={{ marginTop: '6px', padding: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '4px', overflowX: 'auto', fontSize: '11px' }}>
                      {JSON.stringify(result.query, null, 2)}
                    </pre>
                  </details>
                </div>
              )}

              {/* Structured Report Result */}
              {result.report && (
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '14px' }}>对应结构化报表数据</span>
                      <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                        快照ID: #{result.report.id} · 共 {result.report.rows?.length || 0} 行
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => result.report && handleOpenReportRun(result.report.id)}
                        className="btn btn-secondary btn-sm"
                        title="在固定业务报表中打开并固定此快照 ID 翻页复核"
                      >
                        <ChartIcon size={12} />
                        <span>在普通报表中复核此快照</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => result.report && handleReviewReportRun(result.report.id)}
                        disabled={reviewingReport}
                        className="btn btn-ghost btn-sm"
                      >
                        <RefreshCwIcon size={12} />
                        <span>{reviewingReport ? '复核中...' : '弹窗复核'}</span>
                      </button>
                    </div>
                  </div>

                  <ReportResultViewer
                    result={result.report}
                    isAdmin={isAdmin}
                    onNavigateToSource={onNavigateToSource}
                  />

                  {/* Pagination on report rows */}
                  {result.report.nextCursor && (
                    <div style={{ padding: '12px', borderTop: '1px solid var(--border-default)', display: 'flex', justifyContent: 'center', background: 'var(--bg-surface-subtle)' }}>
                      <button
                        type="button"
                        onClick={handleLoadMoreReportRows}
                        disabled={loadingMoreReport}
                        className="btn btn-secondary btn-sm"
                      >
                        {loadingMoreReport ? '正在加载后续行...' : '加载更多行 (同快照下一页)'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Reviewed snapshot view if loaded */}
              {reviewError && (
                <div style={{ padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px' }}>
                  复核失败: {reviewError}
                </div>
              )}
              {reviewedReport && result.report && reviewedReport.id === result.report.id && (
                <div className="card" style={{ border: '2px solid var(--accent)', padding: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', marginBottom: '8px' }}>
                    服务端原始快照复核数据 (Verified Report Run #{reviewedReport.id.substring(0, 8)})
                  </div>
                  <ReportResultViewer
                    result={reviewedReport}
                    isAdmin={isAdmin}
                    onNavigateToSource={onNavigateToSource}
                  />
                </div>
              )}

              {/* Evidence Refs */}
              {result.evidence && result.evidence.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                    底层事实依据凭证清单 ({result.evidence.length} 条)
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {result.evidence.map((ev, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '4px 8px',
                          background: 'var(--bg-surface-subtle)',
                          border: '1px solid var(--border-default)',
                          borderRadius: '4px',
                          fontSize: '11px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span className="badge badge-default">{ev.entityType}</span>
                        <span className="font-mono">{ev.id.substring(0, 8)}</span>
                        {ev.version !== null && <span className="font-mono">v{ev.version}</span>}
                        {ev.href && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (onNavigateToSource) {
                                  onNavigateToSource(ev);
                                }
                              }}
                              className="btn btn-ghost btn-sm font-mono"
                              style={{ fontSize: '11px', color: 'var(--accent)', padding: '0 4px', textDecoration: 'underline' }}
                              title={onNavigateToSource ? `跳转事实凭据: ${ev.href}` : `未接通路由，来源: ${ev.href}`}
                            >
                              {ev.href}
                            </button>
                            <button
                              type="button"
                              onClick={() => void navigator.clipboard?.writeText(JSON.stringify(ev, null, 2))}
                              className="btn btn-ghost btn-xs"
                              style={{ fontSize: '10px', padding: '0 3px', color: 'var(--text-muted)' }}
                              title="复制完整凭证元数据"
                            >
                              复制
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
