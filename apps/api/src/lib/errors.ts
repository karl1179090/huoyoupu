import {ContractValidationError, validateSchema, type components} from '@huoyoupu/contracts';
export class AppError extends Error {
  constructor(readonly code: string, readonly status: number, message: string, readonly details?: Record<string, unknown>, readonly retryable = false) {
    super(message);
    this.name = 'AppError';
  }
}
export function publicError(error: unknown, requestId: string): {status: number; body: components['schemas']['ApiError']} {
  let failure: AppError;
  if (error instanceof AppError) failure = error;
  else if (error instanceof ContractValidationError) failure = new AppError('INVALID_REQUEST', 400, '请求不符合接口约定');
  else {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (['23505', '23503', '23514', '22003', '22P02'].includes(code)) failure = new AppError('INVALID_REQUEST', 422, '数据违反唯一性、关联或数值约束');
    else if (['40001', '40P01', '55P03'].includes(code)) failure = new AppError('RETRYABLE_CONFLICT', 503, '操作发生并发冲突，请稍后重试', undefined, true);
    else if (['FST_ERR_CTP_INVALID_JSON_BODY','FST_ERR_CTP_EMPTY_JSON_BODY','FST_ERR_CTP_INVALID_MEDIA_TYPE','FST_ERR_CTP_BODY_TOO_LARGE','FST_ERR_CTP_INVALID_CONTENT_LENGTH'].includes(code)) failure = new AppError('INVALID_REQUEST', 400, '请求格式、媒体类型或正文长度无效');
    else failure = new AppError('RETRYABLE_CONFLICT', 503, '服务暂时无法完成请求', undefined, true);
  }
  const details = failure.details && validateSchema('ErrorDetails', failure.details) ? failure.details : undefined;
  return {status: failure.status, body: {code: failure.code, message: failure.message, requestId, retryable: failure.retryable, ...(details ? {details} : {})}};
}
