import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { collectAllPages, type PageFetcher } from '../src/pages/printing/printingLoaders.js';

/**
 * Pure tests for the production printing pagination collector. They drive the
 * real `collectAllPages` used by PrintTemplateManager/OrderPrintPreview with
 * in-memory multi-page fetchers; no network or browser is involved.
 */
describe('Printing loaders: exhaustive cursor pagination (production collectAllPages)', () => {
  test('1. Collects every template page in server order, including items outside page 1', async () => {
    const pages: Record<string, { items: { id: string }[]; nextCursor: string | null }> = {
      '': { items: [{ id: 'tpl-a' }, { id: 'tpl-b' }], nextCursor: 'c2' },
      c2: { items: [{ id: 'tpl-c' }], nextCursor: 'c3' },
      c3: { items: [{ id: 'tpl-d' }, { id: 'tpl-isolated-new' }], nextCursor: null },
    };
    const requestedCursors: (string | undefined)[] = [];
    const fetchPage: PageFetcher<{ id: string }> = async query => {
      requestedCursors.push(query?.cursor);
      const key = query?.cursor ?? '';
      const page = pages[key];
      assert.ok(page, `Unexpected cursor ${key}`);
      return page;
    };

    const all = await collectAllPages(fetchPage);

    assert.deepEqual(requestedCursors, [undefined, 'c2', 'c3'], 'Must follow every nextCursor in order');
    assert.deepEqual(
      all.map(t => t.id),
      ['tpl-a', 'tpl-b', 'tpl-c', 'tpl-d', 'tpl-isolated-new'],
      'Collected list must preserve server order and include later-page items'
    );
    assert.ok(
      all.some(t => t.id === 'tpl-isolated-new'),
      'A template outside the first page must be reachable after collection'
    );
  });

  test('2. Collects all historical template versions, newest-first order preserved', async () => {
    const pages: Record<string, { items: { id: string; versionNo: number }[]; nextCursor: string | null }> = {
      '': {
        items: [
          { id: 'v-3', versionNo: 3 },
          { id: 'v-2', versionNo: 2 },
        ],
        nextCursor: 'vpage2',
      },
      vpage2: { items: [{ id: 'v-1', versionNo: 1 }], nextCursor: null },
    };
    const fetchPage: PageFetcher<{ id: string; versionNo: number }> = async query => pages[query?.cursor ?? '']!;

    const all = await collectAllPages(fetchPage);
    assert.deepEqual(all.map(v => v.versionNo), [3, 2, 1], 'Historical versions must stay newest-first');
    assert.ok(all.some(v => v.id === 'v-1'), 'A version beyond the first page must be selectable');
  });

  test('3. A page error rejects instead of returning a partial list as complete', async () => {
    let calls = 0;
    const fetchPage: PageFetcher<{ id: string }> = async () => {
      calls++;
      if (calls === 1) return { items: [{ id: 'first-page-only' }], nextCursor: 'c2' };
      throw new Error('第二页加载失败');
    };

    await assert.rejects(
      () => collectAllPages(fetchPage),
      /第二页加载失败/,
      'A failing later page must surface the error, not a truncated list'
    );
    assert.equal(calls, 2, 'Collection must stop at the failing page');
  });

  test('4. A repeated cursor aborts instead of looping forever', async () => {
    let calls = 0;
    const fetchPage: PageFetcher<{ id: string }> = async () => {
      calls++;
      return { items: [{ id: `row-${calls}` }], nextCursor: 'same-cursor' };
    };

    await assert.rejects(() => collectAllPages(fetchPage), /分页游标重复/);
    assert.ok(calls <= 3, `Must abort quickly on a repeated cursor, made ${calls} calls`);
  });

  test('5. Single-page result returns exactly the server items without extra requests', async () => {
    let calls = 0;
    const fetchPage: PageFetcher<{ id: string }> = async () => {
      calls++;
      return { items: [{ id: 'only-1' }, { id: 'only-2' }], nextCursor: null };
    };

    const all = await collectAllPages(fetchPage);
    assert.deepEqual(all.map(t => t.id), ['only-1', 'only-2']);
    assert.equal(calls, 1, 'No extra request when nextCursor is null');
  });
});
