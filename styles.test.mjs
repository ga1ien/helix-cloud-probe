// Tests for the keyboard focus styles in styles.css.
//
// Deliberately self-contained (reads only styles.css) so it runs on the
// focus-styles branch before the demo markup is merged in. Kept as .mjs so it
// is ESM even before the repo-wide package.json ("type": "module") lands.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('./styles.css', import.meta.url), 'utf8');

/** Relative luminance per WCAG 2.x. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The declaration block of the first rule matching `selectorText`. */
function blockFor(selectorText) {
  const start = css.indexOf(selectorText);
  assert.notEqual(start, -1, `${selectorText} is missing from styles.css`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

const ring = blockFor('[tabindex]:not([tabindex="-1"]):focus-visible');

test('the ring is driven by :focus-visible, not plain :focus', () => {
  assert.match(css, /:focus-visible/);
  assert.match(ring, /outline:/);
  assert.match(ring, /outline-offset:/);
});

test('the ring covers every interactive element type in the demo', () => {
  // The demo has a name input, a submit button and an async button; links,
  // selects, textareas and disclosures are covered for future markup.
  for (const selector of [
    'a[href]:focus-visible',
    'button:focus-visible',
    'input:focus-visible',
    'select:focus-visible',
    'textarea:focus-visible',
    'summary:focus-visible',
    '[tabindex]:not([tabindex="-1"]):focus-visible',
  ]) {
    assert.ok(css.includes(selector), `missing focus selector: ${selector}`);
  }
});

test('no rule suppresses the native focus outline', () => {
  assert.doesNotMatch(css, /outline\s*:\s*(none|0)/);
});

test('the ring is thick enough and offset from the control', () => {
  const width = Number(css.match(/--kulti-focus-ring-width:\s*(\d+(?:\.\d+)?)px/)[1]);
  const offset = Number(css.match(/--kulti-focus-ring-offset:\s*(\d+(?:\.\d+)?)px/)[1]);

  assert.ok(width >= 2, `ring width ${width}px is too thin`);
  assert.ok(offset >= 1, `ring offset ${offset}px is too tight`);
});

test('the ring colour has >= 3:1 contrast on light and dark surfaces', () => {
  const color = css.match(/--kulti-focus-color:\s*(#[0-9a-f]{6})/i)[1].toLowerCase();

  for (const [surface, name] of [
    ['#ffffff', 'light'],
    ['#000000', 'dark'],
  ]) {
    const ratio = contrast(color, surface);
    assert.ok(ratio >= 3, `${color} on ${name} surface is only ${ratio.toFixed(2)}:1`);
  }
});

test('forced-colors users get the system highlight colour', () => {
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /--kulti-focus-color:\s*Highlight/);
});
