import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The greeting module ships inline in the demo page: it owns the greeting
// templates, the trimming rule, and the single visible output element.
const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
const moduleSource = html.slice(
  html.indexOf('<script type="module">') + '<script type="module">'.length,
  html.indexOf('</script>'),
);

// Pull a `Hello, ${name}! ...` template out of the module and instantiate it,
// so the greeting text under test is the text the app actually renders.
function renderGreeting(templateMatch, name) {
  const template = `\`${templateMatch[1]}\``;
  return new Function('name', `return ${template};`)(name);
}

function extractTemplate(pattern) {
  const match = moduleSource.match(pattern);
  assert.ok(match, `greeting template not found in src/index.html: ${pattern}`);
  return match;
}

test('the greeting module renders a deterministic greeting for a given name', () => {
  // Form submit path: "Hello, <name>! Nice to meet you."
  const submit = extractTemplate(/`(Hello, \$\{name\}! Nice to meet you\.)`/);
  assert.equal(renderGreeting(submit, 'Ada'), 'Hello, Ada! Nice to meet you.');

  // Async load path: "Hello, <name>! Welcome to Kulti."
  const async = extractTemplate(/`(Hello, \$\{name\}! Welcome to Kulti\.)`/);
  assert.equal(renderGreeting(async, 'Ada'), 'Hello, Ada! Welcome to Kulti.');

  // The name is trimmed before it reaches either template.
  assert.match(moduleSource, /nameInput\.value\.trim\(\)/);
  assert.equal(renderGreeting(submit, '  Ada  '.trim()), 'Hello, Ada! Nice to meet you.');

  // Output is written as text into the non-live output element.
  assert.match(moduleSource, /function showGreeting\(text\) \{\s*output\.textContent = text;/);
});
