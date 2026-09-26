# Hello Kulti

A polished, responsive **Hello Kulti** landing page served by a **zero-dependency
Node.js HTTP server** on **port 3000**.

No frameworks, no bundler, no build step, no `npm install` — just Node core modules
and the platform.

```
npm start          # http://localhost:3000
npm test           # 50 zero-dependency assertions
```

## Requirements

- Node.js **≥ 18** (the server itself only needs Node ≥ 16 syntax; the check script
  uses the global `fetch` from Node 18+).

## Layout

```
server.js             zero-dependency HTTP server (static + JSON endpoints)
public/index.html     the page (semantic markup, one <h1>, skip link)
public/styles.css     mobile-first responsive stylesheet (dark + light themes)
public/app.js         progressive enhancement: theme toggle, live health, copy, reveals
public/favicon.svg    inline SVG icon
public/404.html       styled not-found page
scripts/check.js      automated checks (npm test)
package.json          scripts + engine metadata, no dependencies
```

## Server

`server.js` exports `createServer`, `start`, `handleRequest` and `resolveStaticPath`,
and starts listening when run directly.

| Env var | Default | Meaning                |
| ------- | ------- | ---------------------- |
| `PORT`  | `3000`  | TCP port               |
| `HOST`  | `0.0.0.0` | Bind address         |

Behaviour:

- Static files are served from `public/` with correct `Content-Type`, `ETag`,
  `Last-Modified` and conditional `304` responses.
- Every request resolves inside `public/`; `../` and percent-encoded traversal
  attempts return a `404` and never leak source.
- Security headers on every response: `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Cross-Origin-Opener-Policy` and a strict
  `Content-Security-Policy` (no `unsafe-inline` — the single inline pre-paint theme
  script is allowed by SHA-256 hash, and the check suite verifies that the hash and
  the markup stay in sync).
- `SIGINT` / `SIGTERM` shut the server down cleanly.

### Endpoints

| Method    | Path                | Response                                 |
| --------- | ------------------- | ---------------------------------------- |
| `GET`     | `/`                 | The Hello Kulti page                     |
| `GET`     | `/health`           | `{ "status": "ok", "uptimeSeconds": … }` |
| `GET`     | `/api/greeting`     | `{ "message": "Hello Kulti", … }`        |
| `GET`     | `/styles.css`, `/app.js`, `/favicon.svg` | Static assets   |
| any       | anything else       | `404` (styled)                           |
| non-GET/HEAD | any              | `405` + `Allow: GET, HEAD`               |

```bash
curl -s localhost:3000/api/greeting
curl -s localhost:3000/health
```

## Front end

- Fluid type and spacing via `clamp()`, grid cards using `auto-fit` /
  `minmax()`, and a dedicated small-screen breakpoint — holds up from 320 px to
  ultrawide.
- Dark and light palettes follow `prefers-color-scheme`, with an in-page toggle that
  persists to `localStorage` and an inline pre-paint script so there is no theme
  flash.
- Accessibility: semantic landmarks, skip link, visible `:focus-visible` rings,
  text-based status pill (`aria-live`), and full `prefers-reduced-motion` support.
- JavaScript is progressive enhancement only: the page is readable and navigable
  with JS disabled (no hidden-by-default content, no inline handlers).

## Checks

`npm test` boots the server on an ephemeral port and verifies (**50 assertions**):

- project shape: zero dependencies, `start`/`test` scripts, default port `3000`
- markup: `lang`, viewport meta, single `<h1>`, asset links, balanced tags, no inline
  handlers or `style` attributes, no cross-origin assets
- styles: media queries, `clamp()`, theme support, reduced motion, mobile breakpoint
- HTTP: status codes, content types, `ETag`/`304`, `HEAD`, `/health`,
  `/api/greeting`, styled `404`, `405`, security headers, CSP hash validity
- safety: traversal attempts (`../`, `%2e%2e%2f`, …) and `/package.json` all return
  `404` without leaking source

## Licence

MIT. Built for the Kulti session.
