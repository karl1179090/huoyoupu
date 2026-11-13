import type { PrintConfig } from '../../api/types.js';

export type PrintPaper = PrintConfig['paper'];
export type PrintColumn = PrintConfig['columns'][number];

export const ALLOWED_HEADER_FIELDS = [
  { field: 'companyName', label: '企业名称' },
  { field: 'companyPhone', label: '企业电话' },
  { field: 'companyAddress', label: '企业地址' },
  { field: 'orderNo', label: '订单编号' },
  { field: 'confirmedAt', label: '确认时间' },
  { field: 'customerName', label: '客户名称' },
  { field: 'contactName', label: '联系人' },
  { field: 'phone', label: '收货电话' },
  { field: 'deliveryAddress', label: '收货地址' },
] as const;

export type HeaderFieldKey = (typeof ALLOWED_HEADER_FIELDS)[number]['field'];

export const ALLOWED_COLUMN_FIELDS = [
  { field: 'productName', label: '商品名称', defaultWidth: 45, defaultAlign: 'left' },
  { field: 'specification', label: '规格型号', defaultWidth: 25, defaultAlign: 'left' },
  { field: 'warehouseName', label: '发货仓', defaultWidth: 25, defaultAlign: 'left' },
  { field: 'unitName', label: '销售单位', defaultWidth: 18, defaultAlign: 'center' },
  { field: 'quantity', label: '数量', defaultWidth: 20, defaultAlign: 'right' },
  { field: 'unitPrice', label: '单价(元)', defaultWidth: 22, defaultAlign: 'right' },
  { field: 'netAmount', label: '金额(元)', defaultWidth: 25, defaultAlign: 'right' },
  { field: 'remark', label: '行备注', defaultWidth: 20, defaultAlign: 'left' },
] as const;

export type ColumnFieldKey = (typeof ALLOWED_COLUMN_FIELDS)[number]['field'];

export const FORBIDDEN_COLUMN_FIELDS = ['costAmount', 'salesCostAmount', 'grossProfit', 'profitRate', 'receiptCost'];

export function getPaperDimensions(paper: PrintPaper): { widthMm: number; heightMm: number } {
  let rawW = 210;
  let rawH = 297;
  if (paper.size === 'A4') {
    rawW = 210;
    rawH = 297;
  } else if (paper.size === 'A5') {
    rawW = 148;
    rawH = 210;
  } else if (paper.size === 'custom') {
    rawW = paper.widthMm ?? 210;
    rawH = paper.heightMm ?? 297;
  }

  // Consistent with backend printing geometry:
  // In landscape mode, width is the larger dimension and height is the smaller dimension.
  // Continuous needle paper (241mm x 93mm) is horizontally fed (width 241mm, height 93mm).
  if (paper.orientation === 'landscape') {
    return {
      widthMm: Math.max(rawW, rawH),
      heightMm: Math.min(rawW, rawH),
    };
  }
  return {
    widthMm: Math.min(rawW, rawH),
    heightMm: Math.max(rawW, rawH),
  };
}

/**
 * Continuous tractor-feed needle printer paper preset (241mm x 93mm, two-part continuous slip)
 */
export const NEEDLE_PRINTER_PAPER_PRESET = {
  name: '针式打印二等分单 (241×93mm)',
  paper: {
    size: 'custom' as const,
    orientation: 'landscape' as const,
    widthMm: 241,
    heightMm: 93,
    marginMm: 5,
  },
  minRowHeightMm: 6,
};

/**
 * Dynamic CSS @page size rule based on paper size and orientation
 */
export function getPageSizeRule(paper: PrintPaper): string {
  const orientation = paper.orientation === 'landscape' ? 'landscape' : 'portrait';
  if (paper.size === 'A4') return `A4 ${orientation}`;
  if (paper.size === 'A5') return `A5 ${orientation}`;
  const dims = getPaperDimensions(paper);
  return `${dims.widthMm}mm ${dims.heightMm}mm`;
}

export function getPrintableWidthMm(paper: PrintPaper): number {
  const { widthMm } = getPaperDimensions(paper);
  const marginMm = typeof paper.marginMm === 'number' ? paper.marginMm : 10;
  return Math.max(0, widthMm - marginMm * 2);
}

export function getTotalColumnsWidthMm(columns: PrintColumn[]): number {
  return columns.reduce((acc, col) => acc + (Number(col.widthMm) || 0), 0);
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePrintConfig(config: PrintConfig): ValidationResult {
  const errors: string[] = [];
  const { paper, headerFields, columns, minRowHeightMm } = config;

  if (!paper) {
    errors.push('缺少纸张配置 (paper)');
    return { valid: false, errors };
  }

  // Check margin: 0 is completely legal!
  if (typeof paper.marginMm !== 'number' || paper.marginMm < 0 || paper.marginMm > 50) {
    errors.push('纸张边距 (marginMm) 必须在 0 到 50 mm 之间');
  }

  if (paper.size === 'custom') {
    if (typeof paper.widthMm !== 'number' || paper.widthMm < 50 || paper.widthMm > 420) {
      errors.push('自定义纸张宽度 (widthMm) 必须在 50 到 420 mm 之间');
    }
    if (typeof paper.heightMm !== 'number' || paper.heightMm < 50 || paper.heightMm > 600) {
      errors.push('自定义纸张高度 (heightMm) 必须在 50 到 600 mm 之间');
    }
  }

  // Row height
  if (typeof minRowHeightMm !== 'number' || minRowHeightMm < 3 || minRowHeightMm > 50) {
    errors.push('最小行高 (minRowHeightMm) 必须在 3 到 50 mm 之间');
  }

  // Header whitelist
  const allowedHeaderSet = new Set(ALLOWED_HEADER_FIELDS.map(f => f.field));
  for (const hf of headerFields || []) {
    if (!allowedHeaderSet.has(hf)) {
      errors.push(`不支持的表头字段: ${hf}`);
    }
  }

  // Columns whitelist & forbidden
  if (!Array.isArray(columns) || columns.length === 0) {
    errors.push('打印表格必须至少配置一列');
  } else {
    const allowedColSet = new Set(ALLOWED_COLUMN_FIELDS.map(c => c.field));
    for (const col of columns) {
      if (FORBIDDEN_COLUMN_FIELDS.includes(col.field)) {
        errors.push(`单据打印严禁包含成本与毛利字段: ${col.field}`);
      } else if (!allowedColSet.has(col.field as ColumnFieldKey)) {
        errors.push(`不支持的列字段: ${col.field}`);
      }
      if (typeof col.widthMm !== 'number' || col.widthMm <= 0) {
        errors.push(`列「${col.label || col.field}」宽度必须大于 0 mm`);
      }
    }

    const printableWidth = getPrintableWidthMm(paper);
    const totalColsWidth = getTotalColumnsWidthMm(columns);
    if (totalColsWidth > printableWidth) {
      errors.push(
        `列宽总和 (${totalColsWidth}mm) 超出可打印宽度 (${printableWidth}mm，纸宽减去左右边距)`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getDefaultPrintConfig(): PrintConfig {
  return {
    paper: {
      size: 'A4',
      orientation: 'portrait',
      marginMm: 10,
    },
    headerFields: [
      'companyName',
      'companyPhone',
      'orderNo',
      'confirmedAt',
      'customerName',
      'contactName',
      'phone',
      'deliveryAddress',
    ],
    columns: [
      { field: 'productName', label: '商品名称', widthMm: 45, align: 'left' },
      { field: 'specification', label: '规格型号', widthMm: 25, align: 'left' },
      { field: 'warehouseName', label: '发货仓库', widthMm: 24, align: 'left' },
      { field: 'unitName', label: '单位', widthMm: 16, align: 'center' },
      { field: 'quantity', label: '数量', widthMm: 20, align: 'right' },
      { field: 'unitPrice', label: '单价', widthMm: 25, align: 'right' },
      { field: 'netAmount', label: '金额', widthMm: 25, align: 'right' },
    ],
    minRowHeightMm: 8,
    showRemark: true,
  };
}

export function detectClientPlatform(): 'desktop_web' | 'mobile_web' {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'desktop_web';
  }
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isSmallScreen = window.innerWidth > 0 && window.innerWidth <= 768;
  return isMobileUA || isSmallScreen ? 'mobile_web' : 'desktop_web';
}
