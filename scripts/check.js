#!/usr/bin/env node
'use strict';

/**
 * Hello Kulti automated check.
 *
 * Zero dependencies (Node >= 18 for global fetch). Boots the server on an
 * ephemeral port and verifies content, headers, routing and traversal safety.
 *
 *   node scripts/check.js       # or: npm test
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const server = require(path.join(ROOT, 'server.js'));

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log('  \u2713 ' + name);
  } else {
    failures.push(name + (detail ? ' \u2014 ' + detail : ''));
    console.log('  \u2717 ' + name + (detail ? ' \u2014 ' + detail : ''));
  }
}

function group(title) {
  console.log('\n' + title);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function sha256Base64(text) {
  return 'sha256-' + createHash('sha256').update(text, 'utf8').digest('base64');
}

/** Extract the body of every inline <script> (no src attribute). */
function inlineScripts(html) {
  const bodies = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    if (!/\bsrc\s*=/i.test(match[1])) bodies.push(match[2]);
  }
  return bodies;
}

/** Crude balance check for the structural tags used on the page. */
function unbalancedTags(html) {
  const tags = [
    'html', 'head', 'body', 'main', 'header', 'footer', 'section', 'nav', 'div',
    'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'pre', 'button',
    'h1', 'h2', 'h3', 'p', 'span', 'a', 'strong', 'em', 'code', 'caption'
  ];
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
  const bad = [];
  tags.forEach((tag) => {
    const open = (stripped.match(new RegExp('<' + tag + '(?=[\\s>/])', 'gi')) || []).length;
    const close = (stripped.match(new RegExp('</' + tag + '\\s*>', 'gi')) || []).length;
    const selfClosing = (stripped.match(new RegExp('<' + tag + '\\b[^>]*/>', 'gi')) || []).length;
    if (open - selfClosing !== close) bad.push(tag + ': ' + open + ' open vs ' + close + ' close');
  });
  return bad;
}

async function main() {
  const pkgRaw = read('package.json');
  const pkg = JSON.parse(pkgRaw);
  const html = read('public/index.html');
  const css = read('public/styles.css');
  const appJs = read('public/app.js');

  group('Project shape');
  check('package.json declares zero dependencies', !pkg.dependencies || !Object.keys(pkg.dependencies).length);
  check('package.json declares zero devDependencies', !pkg.devDependencies || !Object.keys(pkg.devDependencies).length);
  check('start script runs server.js', typeof pkg.scripts?.start === 'string' && pkg.scripts.start.includes('server.js'));
  check('test script runs the check', /check\.js/.test(String(pkg.scripts?.test || '')));
  check('server.js default port is 3000', server.DEFAULT_PORT === 3000, 'got ' + server.DEFAULT_PORT);
  check('server.js ships without third-party code', !/require\(['"](?!node:)/.test(read('server.js')));

  group('Markup');
  check('index.html declares lang="en"', /<html[^>]*\blang="en"/i.test(html));
  check('index.html has a viewport meta tag', /<meta[^>]+name="viewport"[^>]+width=device-width/i.test(html));
  check('index.html contains the heading text "Hello Kulti"', /Hello\s*<span[^>]*>Kulti<\/span>/i.test(html) || /Hello Kulti/i.test(html.replace(/<[^>]+>/g, ' ')));
  check('index.html has exactly one <h1>', (html.match(/<h1\b/gi) || []).length === 1);
  check('index.html links /styles.css', /href="\/styles\.css"/.test(html));
  check('index.html loads /app.js with defer', /<script[^>]+src="\/app\.js"[^>]*\bdefer\b/.test(html));
  check('index.html has a skip link and main landmark', /class="skip-link"/.test(html) && /<main[^>]+id="main"/.test(html));
  check('index.html has no inline event handlers (on*=)', !/\son[a-z]+\s*=\s*"/i.test(html));
  check('index.html has no style="" attributes (strict CSP)', !/\sstyle\s*=\s*"/i.test(html));
  check('index.html makes no cross-origin asset requests', !/(?:src|href)\s*=\s*"https?:\/\//i.test(html));
  const unbalanced = unbalancedTags(html);
  check('index.html tags are balanced', unbalanced.length === 0, unbalanced.join(', '));

  group('Styles');
  check('styles.css has responsive media queries', /@media\s*\(/.test(css));
  check('styles.css uses fluid clamp() sizing', /clamp\(/.test(css));
  check('styles.css supports light and dark themes', /prefers-color-scheme/.test(css) && /data-theme=/.test(css));
  check('styles.css honours prefers-reduced-motion', /prefers-reduced-motion/.test(css));
  check('styles.css includes a mobile breakpoint', /max-width:\s*620px/.test(css));

  group('Client script');
  check('app.js is dependency-free and strict-mode', /^\/\*[\s\S]*?\*\/\s*\(function \(\) \{\s*'use strict';/m.test(appJs) || appJs.includes("'use strict'"));
  check('app.js handles the theme toggle', appJs.includes('theme-toggle'));
  check('app.js polls /health', appJs.includes("'/health'"));
  check('app.js requests /api/greeting', appJs.includes("'/api/greeting'"));

  await runServerChecks(html);
}

async function runServerChecks(html) {
  const httpServer = server.createServer();
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const port = httpServer.address().port;
  const base = 'http://127.0.0.1:' + port;

  const request = (pathname, options) =>
    fetch(base + pathname, Object.assign({ redirect: 'manual' }, options || {}));

  try {
    group('HTTP (' + base + ')');

    const home = await request('/');
    const homeBody = await home.text();
    check('GET / -> 200', home.status === 200, 'got ' + home.status);
    check('GET / serves HTML', (home.headers.get('content-type') || '').includes('text/html'));
    check('GET / body mentions Hello Kulti', homeBody.includes('Hello Kulti'));
    check('GET / sends security headers', Boolean(home.headers.get('x-content-type-options')) && Boolean(home.headers.get('content-security-policy')));

    const csp = home.headers.get('content-security-policy') || '';
    check('CSP has no unsafe-inline for scripts', !/script-src[^;]*unsafe-inline/i.test(csp));
    const bodies = inlineScripts(html);
    const hashesOk = bodies.every((body) => csp.includes("'" + sha256Base64(body) + "'"));
    check(
      'CSP allows every inline script by hash (' + bodies.length + ' found)',
      bodies.length > 0 && hashesOk,
      hashesOk ? '' : 'hash mismatch: inline script changed without updating server.js CSP'
    );

    const css = await request('/styles.css');
    check('GET /styles.css -> 200 text/css', css.status === 200 && (css.headers.get('content-type') || '').includes('text/css'), 'got ' + css.status);
    const cssEtag = css.headers.get('etag');
    check('static assets set an ETag and content-length', Boolean(cssEtag) && Number(css.headers.get('content-length')) > 0);

    const cached = await request('/styles.css', { headers: { 'if-none-match': cssEtag } });
    check('conditional GET /styles.css -> 304', cached.status === 304, 'got ' + cached.status);

    const head = await request('/styles.css', { method: 'HEAD' });
    const headBody = await head.text();
    check('HEAD /styles.css -> 200 with empty body', head.status === 200 && headBody.length === 0, 'status ' + head.status + ', body ' + headBody.length);

    const js = await request('/app.js');
    check('GET /app.js -> 200 javascript', js.status === 200 && /javascript/.test(js.headers.get('content-type') || ''));

    const icon = await request('/favicon.svg');
    check('GET /favicon.svg -> 200 svg', icon.status === 200 && /svg/.test(icon.headers.get('content-type') || ''));

    const health = await request('/health');
    const healthJson = await health.json();
    check('GET /health -> ok JSON', health.status === 200 && healthJson.status === 'ok' && typeof healthJson.uptimeSeconds === 'number');

    const greeting = await request('/api/greeting');
    const greetingJson = await greeting.json();
    check('GET /api/greeting -> Hello Kulti', greeting.status === 200 && greetingJson.message === 'Hello Kulti');

    const missing = await request('/definitely-not-here');
    const missingBody = await missing.text();
    check('unknown path -> 404 page', missing.status === 404, 'got ' + missing.status);
    check('404 page mentions 404', /404|Not Found|Nothing/i.test(missingBody));

    group('Safety');
    for (const attack of ['/../server.js', '/%2e%2e%2fserver.js', '/..%2fserver.js', '/%2e%2e/server.js', '/package.json']) {
      const res = await request(attack);
      const body = await res.text();
      const leaked = body.includes('createServer') || body.includes('"name": "hello-kulti"');
      check('blocked ' + attack + ' (no source leak)', res.status === 404 && !leaked, 'status ' + res.status);
    }

    const posted = await request('/', { method: 'POST', body: 'x' });
    check('POST / -> 405 with Allow header', posted.status === 405 && (posted.headers.get('allow') || '').includes('GET'), 'got ' + posted.status);

    const traversalGuard = server.resolveStaticPath('/../server.js');
    check('resolveStaticPath refuses traversal', traversalGuard === null, 'got ' + traversalGuard);
    check('resolveStaticPath allows public assets', server.resolveStaticPath('/index.html') === path.join(server.PUBLIC_DIR, 'index.html'));
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
  }
}

main()
  .then(() => {
    const total = passed + failures.length;
    if (failures.length) {
      console.log('\n\u2717 ' + failures.length + '/' + total + ' checks failed:');
      failures.forEach((f) => console.log('   - ' + f));
      process.exitCode = 1;
    } else {
      console.log('\n\u2713 all ' + total + ' checks passed');
    }
  })
  .catch((err) => {
    console.error('\n\u2717 check crashed:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  });
