import * as api from '../../api/client.js';
import type {
  PrintTemplate,
  PrintTemplateVersion,
  OrderRevisionSummary,
} from '../../api/types.js';

interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export type PageFetcher<T> = (query?: { limit?: number; cursor?: string }) => Promise<CursorPage<T>>;

/**
 * Exhaustively collects every page of a cursor-paginated printing endpoint.
 *
 * The backend lists are ordered by id/version and can contain more than the
 * default 50 items, so reading only the first page hides newer templates,
 * historical template versions and older order revisions. Pages are requested
 * with the same default page size the server uses; the first page keeps the
 * server's original ordering, so the collected array preserves it.
 *
 * Any page error rejects the whole call: a partial list is never returned as
 * if it were complete, and a repeated cursor aborts instead of looping.
 */
export async function collectAllPages<T>(fetchPage: PageFetcher<T>): Promise<T[]> {
  const all: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined = undefined;

  for (;;) {
    const page = await fetchPage(cursor ? { cursor } : undefined);
    all.push(...page.items);
    const nextCursor = page.nextCursor || undefined;
    if (!nextCursor) return all;
    if (seenCursors.has(nextCursor)) {
      throw new Error('分页游标重复，已中止加载以避免无限请求');
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
}

export function listAllPrintTemplates(): Promise<PrintTemplate[]> {
  return collectAllPages(query => api.listPrintTemplates(query));
}

export function listAllPrintTemplateVersions(templateId: string): Promise<PrintTemplateVersion[]> {
  return collectAllPages(query => api.listPrintTemplateVersions(templateId, query));
}

export function listAllOrderRevisions(orderId: string): Promise<OrderRevisionSummary[]> {
  return collectAllPages(query => api.listOrderRevisions(orderId, query));
}
