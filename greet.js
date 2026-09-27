'use strict';

/**
 * Zero-dependency greeting helper.
 *
 * @param {string} name Name to greet.
 * @returns {string} "Hello " + name.
 */
function greet(name) {
  return 'Hello ' + name;
}

module.exports = { greet };
