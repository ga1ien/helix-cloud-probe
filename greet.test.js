'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { greet } = require('./greet.js');

test('greet("Kulti") returns "Hello Kulti"', () => {
  assert.strictEqual(greet('Kulti'), 'Hello Kulti');
});
