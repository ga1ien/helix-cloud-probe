'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { greet } = require('../lib/greet.js');

test('greets a given name', () => {
  assert.equal(greet('Ada'), 'Hello, Ada!');
});

test('defaults to world when no name is given', () => {
  assert.equal(greet(), 'Hello, world!');
});

test('trims surrounding whitespace', () => {
  assert.equal(greet('  Ada  '), 'Hello, Ada!');
});

test('rejects non-string names', () => {
  assert.throws(() => greet(42), TypeError);
  assert.throws(() => greet(null), TypeError);
  assert.throws(() => greet({}), TypeError);
});

test('rejects empty and blank names', () => {
  assert.throws(() => greet(''), TypeError);
  assert.throws(() => greet('   '), TypeError);
});
