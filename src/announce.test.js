import test from 'node:test';
import assert from 'node:assert/strict';

import { createAnnouncer, STATUS_REGION_ID } from './announce.js';

/** Minimal live-region stub that records every text mutation. */
function fakeRegion() {
  const attributes = {};
  const writes = [];
  let text = '';
  return {
    writes,
    attributes,
    get textContent() {
      return text;
    },
    set textContent(value) {
      text = value;
      writes.push(value);
    },
    setAttribute(name, value) {
      attributes[name] = value;
    },
    getAttribute(name) {
      return attributes[name] ?? null;
    },
  };
}

const immediate = (callback) => callback();

/** Let the default (setTimeout 0) scheduler run. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Stand in for one browser document for the duration of a test.
 * `globalThis.document` is only read when announce() is called, so a plain
 * assignment is enough.
 */
function stubDocument(t, getElementById) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { getElementById };

  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  });
}

// announce() memoises its announcer in a module-level singleton, so every test
// below loads a fresh copy of the module (?test-fresh=N busts the ESM cache)
// and the tests stay order-independent.
let freshModules = 0;
const loadFreshAnnounce = () => import(`./announce.js?test-fresh=${++freshModules}`);

test('announce writes the message into the live region (polite by default)', () => {
  const region = fakeRegion();
  const announcer = createAnnouncer(region, { schedule: immediate });

  assert.equal(announcer.announce('Hello, Kulti!'), 'Hello, Kulti!');
  assert.equal(region.textContent, 'Hello, Kulti!');
  assert.equal(region.attributes.role, 'status');
  assert.equal(region.attributes['aria-live'], 'polite');
  assert.equal(region.attributes['aria-atomic'], undefined);
});

test('errors are announced assertively as an alert', () => {
  const region = fakeRegion();
  const announcer = createAnnouncer(region, { schedule: immediate });

  announcer.announce('Please enter your name.', { priority: 'assertive' });

  assert.equal(region.textContent, 'Please enter your name.');
  assert.equal(region.attributes.role, 'alert');
  assert.equal(region.attributes['aria-live'], 'assertive');
});

test('the region never keeps a stale priority: polite after assertive is reset', () => {
  const region = fakeRegion();
  const announcer = createAnnouncer(region, { schedule: immediate });

  announcer.announce('Please enter your name.', { priority: 'assertive' });
  announcer.announce('Hello, Kulti! Nice to meet you.');

  // The demo reuses one element, so a leftover role="alert" would make every
  // later success interrupt the user.
  assert.equal(region.attributes.role, 'status');
  assert.equal(region.attributes['aria-live'], 'polite');
});

test('a repeated message is re-announced by clearing the region first', () => {
  const region = fakeRegion();
  const announcer = createAnnouncer(region, { schedule: immediate });

  announcer.announce('Loading greeting, please wait…');
  announcer.announce('Loading greeting, please wait…');

  // Clearing then rewriting is what makes assistive tech speak it again.
  assert.deepEqual(region.writes, [
    'Loading greeting, please wait…',
    '',
    'Loading greeting, please wait…',
  ]);
  assert.equal(region.textContent, 'Loading greeting, please wait…');
});

test('clear() empties the region', () => {
  const region = fakeRegion();
  const announcer = createAnnouncer(region, { schedule: immediate });

  announcer.announce('Hello, Kulti!');
  announcer.clear();

  assert.equal(region.textContent, '');
});

test('non-string messages are coerced and empty values are ignored safely', () => {
  const region = fakeRegion();
  const announcer = createAnnouncer(region, { schedule: immediate });

  announcer.announce(new Error('network down'));
  assert.match(region.textContent, /network down/);

  announcer.announce(null);
  assert.equal(region.textContent, '');
});

test('with the default scheduler the write is deferred (not synchronous)', async () => {
  const region = fakeRegion();
  const announcer = createAnnouncer(region);

  announcer.announce('Loaded greeting.');
  assert.equal(region.textContent, '', 'must not write during the same task');

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(region.textContent, 'Loaded greeting.');
});

test('createAnnouncer rejects a missing region so failures are obvious', () => {
  assert.throws(() => createAnnouncer(null), TypeError);
});

// --- announce(): the browser helper the demo page actually calls -----------

test('announce() writes into the live region the demo renders', async (t) => {
  const region = fakeRegion();
  const lookups = [];
  stubDocument(t, (id) => {
    lookups.push(id);
    return id === STATUS_REGION_ID ? region : null;
  });
  const { announce } = await loadFreshAnnounce();

  announce('Hello, Kulti!');
  await tick();

  assert.deepEqual(lookups, [STATUS_REGION_ID], 'must look the region up by its documented id');
  assert.equal(region.textContent, 'Hello, Kulti!');
  assert.equal(region.attributes.role, 'status');
});

test('announce() reuses one announcer, so the region is looked up once', async (t) => {
  const region = fakeRegion();
  let lookups = 0;
  stubDocument(t, () => {
    lookups += 1;
    return region;
  });
  const { announce } = await loadFreshAnnounce();

  announce('Loading greeting, please wait…');
  await tick();
  announce('Hello, Kulti! Nice to meet you.');
  await tick();

  assert.equal(lookups, 1, 'the page must not be re-queried on every announcement');
  assert.equal(region.textContent, 'Hello, Kulti! Nice to meet you.');
});

test('announce() forwards assertive priority for validation errors', async (t) => {
  const region = fakeRegion();
  stubDocument(t, () => region);
  const { announce } = await loadFreshAnnounce();

  announce('Please enter your name before saying hello.', { priority: 'assertive' });
  await tick();

  assert.equal(region.attributes.role, 'alert');
  assert.equal(region.attributes['aria-live'], 'assertive');
  assert.equal(region.textContent, 'Please enter your name before saying hello.');
});

test('announce() explains itself when there is no document', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
  });
  delete globalThis.document;

  const { announce } = await loadFreshAnnounce();

  assert.throws(() => announce('nobody is listening'), /needs a document/);
});

test('announce() names the missing live region so the bug is obvious', async (t) => {
  stubDocument(t, () => null);
  const { announce } = await loadFreshAnnounce();

  // A page that lost #kulti-status must fail loudly, not announce into the void.
  assert.throws(() => announce('Hello, Kulti!'), /Live region #kulti-status is missing/);
});
