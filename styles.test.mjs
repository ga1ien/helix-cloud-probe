// Tests for the keyboard focus styles in styles.css.
//
// Deliberately self-contained (reads only styles.css) so it runs on the
// focus-styles branch before the demo markup is merged in. Kept as .mjs so it
// is ESM even before the repo-wide package.json ("type": "module") lands.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
const html = await readFile(new URL('./src/index.html', import.meta.url), 'utf8');

/** Same CSS with comments removed, so prose can never satisfy an assertion. */
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');

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

/** Selector list of the first rule whose declaration block mentions `needle`. */
function selectorsFor(needle) {
  const at = cssCode.indexOf(needle);
  assert.notEqual(at, -1, `no rule mentions ${needle}`);
  const open = cssCode.lastIndexOf('{', at);
  const previousClose = cssCode.lastIndexOf('}', open);

  return cssCode
    .slice(previousClose + 1, open)
    .split(',')
    .map((selector) => selector.trim())
    .filter(Boolean);
}

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

// --- The ring only helps if the demo actually loads it ---------------------

test('the demo links the stylesheet that carries the ring', async () => {
  const link = html.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/i);
  assert.ok(link, 'src/index.html must link a stylesheet');

  // Resolve the href the way the browser does (relative to src/index.html)
  // and fail with ENOENT if the path is wrong.
  const linked = await readFile(new URL(link[1], new URL('./src/index.html', import.meta.url)));
  assert.equal(linked.toString('utf8'), css, `index.html links ${link[1]}, not this styles.css`);
});

test('every interactive element in the demo has a :focus-visible rule', () => {
  const bases = selectorsFor('outline: var(--kulti-focus-ring-width)').map((selector) =>
    selector.replace(/:focus-visible$/, ''),
  );
  const isCovered = (tag) =>
    bases.some((base) => base === tag || base.startsWith(`${tag}[`) || base.startsWith(`${tag}:`));

  const present = ['a', 'area', 'button', 'input', 'select', 'textarea', 'summary'].filter((tag) =>
    new RegExp(`<${tag}\\b`, 'i').test(html),
  );
  assert.ok(
    present.includes('input') && present.includes('button'),
    `the demo should keep its name input + buttons, found: ${present.join(', ')}`,
  );

  for (const tag of present) {
    assert.ok(isCovered(tag), `the demo has a <${tag}> but no :focus-visible rule covers it`);
  }
  // Custom widgets can still be reached with tabindex.
  assert.ok(isCovered('[tabindex]'), 'tabindex-reachable widgets must be covered');
});

test('the ring is tokenised and every token it uses is defined', () => {
  const defined = new Set([...cssCode.matchAll(/(--kulti-focus-[a-z-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...cssCode.matchAll(/var\((--kulti-focus-[a-z-]+)/g)].map((m) => m[1]));

  const undefinedTokens = [...used].filter((token) => !defined.has(token));
  assert.deepEqual(undefinedTokens, [], 'an undefined token would invalidate the whole outline');
  assert.ok(used.size >= 3, `expected the ring to be tokenised, saw ${used.size} tokens`);
});

test('the ring is an outline, not a shadow, so forced-colors keeps it', () => {
  assert.match(ring, /outline:\s*var\(--kulti-focus-ring-width\)\s+solid\s+var\(--kulti-focus-color\)/);
  assert.doesNotMatch(ring, /box-shadow/);
});

test('plain :focus is confined to the :focus-visible fallback block', () => {
  const fallbackAt = cssCode.indexOf('@supports not selector(:focus-visible)');
  assert.notEqual(fallbackAt, -1, 'expected an @supports not selector(:focus-visible) fallback');

  // Comments are stripped above, so a plain ":focus" here really is a rule.
  const plainFocus = [...cssCode.matchAll(/:focus(?!-visible)/g)].map((match) => match.index);
  assert.ok(plainFocus.length > 0, 'the fallback should apply the ring on plain :focus');

  for (const index of plainFocus) {
    assert.ok(index > fallbackAt, `plain :focus used outside the fallback block (offset ${index})`);
  }
});
