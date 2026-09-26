'use strict';

/**
 * Hello Kulti - zero-dependency static server.
 *
 * Serves ./public on port 3000 (override with PORT / HOST).
 * No third-party packages: only Node core modules.
 */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const SERVICE = 'hello-kulti';
const STARTED_AT = Date.now();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

/* Inline pre-paint theme script in public/index.html, pinned by hash so the CSP
 * can stay free of 'unsafe-inline'. scripts/check.js verifies this stays in sync. */
const INLINE_SCRIPT_HASHES = ['sha256-ZOgd1ntGT7VCeKny761s6COsPdviW6AdntEE6gziJyc='];

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self' " + INLINE_SCRIPT_HASHES.map((h) => "'" + h + "'").join(' '),
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'"
].join('; ');

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Cross-Origin-Opener-Policy': 'same-origin'
};

function baseHeaders(extra) {
  return Object.assign({}, SECURITY_HEADERS, extra || {});
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2) + '\n';
  res.writeHead(
    status,
    baseHeaders({
      'Content-Type': MIME_TYPES['.json'],
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store'
    })
  );
  if (res.req && res.req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(body);
}

function sendText(res, status, text, type) {
  const body = Buffer.from(text, 'utf8');
  res.writeHead(
    status,
    baseHeaders({
      'Content-Type': type || MIME_TYPES['.txt'],
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    })
  );
  if (res.req && res.req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(body);
}

/** Resolve a URL pathname to a real file inside PUBLIC_DIR (or null). */
function resolveStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_err) {
    return null; // malformed percent-encoding
  }
  if (decoded.includes('\0')) return null;

  const relative = decoded.replace(/^\/+/, '');
  const resolved = path.resolve(PUBLIC_DIR, relative);

  // Containment check: never escape PUBLIC_DIR.
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) {
    return null;
  }
  return resolved;
}

function etagFor(stat) {
  return (
    'W/"' +
    createHash('sha1')
      .update(String(stat.size) + ':' + String(stat.mtimeMs))
      .digest('hex')
      .slice(0, 20) +
    '"'
  );
}

function streamFile(req, res, filePath, stat, status) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES[ext] || 'application/octet-stream';
  const etag = etagFor(stat);
  const headers = baseHeaders({
    'Content-Type': type,
    'Content-Length': stat.size,
    'Last-Modified': stat.mtime.toUTCString(),
    ETag: etag,
    // HTML revalidates every load; assets are cheap to re-fetch too.
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
  });

  const code = status || 200;
  if (code === 200 && req.headers['if-none-match'] === etag) {
    res.writeHead(304, baseHeaders({ ETag: etag }));
    res.end();
    return;
  }

  res.writeHead(code, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    // Headers already sent: just terminate the response.
    res.destroy();
  });
  stream.pipe(res);
}

async function tryServeFile(req, res, pathname) {
  let candidate = resolveStaticPath(pathname);
  if (!candidate) return false;

  let stat = null;
  try {
    stat = await fsp.stat(candidate);
    if (stat.isDirectory()) {
      candidate = path.join(candidate, 'index.html');
      stat = await fsp.stat(candidate);
    }
  } catch (_err) {
    return false;
  }
  if (!stat.isFile()) return false;

  streamFile(req, res, candidate, stat);
  return true;
}

async function notFound(req, res) {
  const page = path.join(PUBLIC_DIR, '404.html');
  try {
    const stat = await fsp.stat(page);
    if (stat.isFile()) {
      streamFile(req, res, page, stat, 404);
      return;
    }
  } catch (_err) {
    /* fall through to text 404 */
  }
  sendText(res, 404, '404 - Not Found\n', MIME_TYPES['.txt']);
}

async function handleRequest(req, res) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendJson(res, 405, { error: 'method_not_allowed', allow: ['GET', 'HEAD'] });
    return;
  }

  let pathname = '/';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch (_err) {
    sendText(res, 400, '400 - Bad Request\n', MIME_TYPES['.txt']);
    return;
  }

  if (pathname === '/health' || pathname === '/healthz') {
    sendJson(res, 200, {
      status: 'ok',
      service: SERVICE,
      uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
      port: server?.address()?.port ?? null,
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (pathname === '/api/greeting') {
    const hour = new Date().getHours();
    const timeOfDay =
      hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    sendJson(res, 200, {
      message: 'Hello Kulti',
      timeOfDay,
      endpoint: '/api/greeting',
      iso: new Date().toISOString()
    });
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  const served = await tryServeFile(req, res, pathname);
  if (!served) {
    // Blocked traversal or genuinely missing file -> 404, never leak source.
    await notFound(req, res);
  }
}

let server = null;

function createServer() {
  const srv = http.createServer((req, res) => {
    handleRequest(req, res).catch(() => {
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal_error' });
      } else {
        res.destroy();
      }
    });
  });
  srv.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });
  return srv;
}

function start(port, host) {
  const listenPort = port === undefined ? Number(process.env.PORT) || DEFAULT_PORT : port;
  const listenHost = host || DEFAULT_HOST;

  server = createServer();
  server.listen(listenPort, listenHost, () => {
    const addr = server.address();
    console.log(`Hello Kulti running at http://localhost:${addr.port} (${listenHost})`);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} received - shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  start();
}

module.exports = {
  DEFAULT_PORT,
  PUBLIC_DIR,
  MIME_TYPES,
  createServer,
  handleRequest,
  resolveStaticPath,
  start
};
