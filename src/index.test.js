import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { STATUS_REGION_ID } from './announce.js';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');

test('the demo renders the live region announce.js expects', () => {
  assert.match(html, new RegExp(`id="${STATUS_REGION_ID}"`));
});

test('the live region is announced politely by default', () => {
  const region = html.slice(html.indexOf(`id="${STATUS_REGION_ID}"`));
  const tag = region.slice(0, region.indexOf('>'));

  assert.match(tag, /aria-live="polite"/);
  assert.match(tag, /role="status"/);
  assert.match(tag, /aria-atomic="true"/);
});

test('the demo routes state changes through the announcer', () => {
  assert.match(html, /import \{ announce \} from '\.\/announce\.js'/);
  // Errors must interrupt the reader instead of waiting for a pause.
  assert.match(html, /priority: 'assertive'/);
  // The visible output is not a live region, so nothing is announced twice.
  assert.match(html, /id="greeting-output"[^>]*>/);
  assert.doesNotMatch(html, /id="greeting-output"[^>]*aria-live/);
});
