import test from 'node:test';
import assert from 'node:assert/strict';

import { createAnnouncer } from './announce.js';

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
