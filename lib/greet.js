'use strict';

/**
 * Build a short greeting string.
 *
 * @param {string} [name='world'] Name to greet. Surrounding whitespace is ignored.
 * @returns {string} A greeting of the form `Hello, <name>!`
 * @throws {TypeError} If `name` is not a string, or is empty/blank.
 */
function greet(name = 'world') {
  if (typeof name !== 'string') {
    throw new TypeError('name must be a string');
  }

  const trimmed = name.trim();

  if (trimmed === '') {
    throw new TypeError('name must not be empty');
  }

  return `Hello, ${trimmed}!`;
}

module.exports = { greet };
