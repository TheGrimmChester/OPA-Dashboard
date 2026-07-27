# OPA RUM Beacon

`opa-rum.js` is a tiny, dependency-free Real User Monitoring beacon. Drop it on any
page and it collects real-browser performance and reliability data, then ships it to
the OPA agent for the dashboard's **Browser RUM** views.

The dashboard serves it at **`/opa-rum.js`** (from `public/opa-rum.js`).

## What it captures

- **Core Web Vitals** — LCP, CLS, INP, FID, FCP, TTFB (via `PerformanceObserver`).
- **Navigation timing** — DNS, connect, request/response, DOM processing, total load.
- **Resource timing** — per-resource name, type, duration, and size (capped, query
  strings stripped).
- **AJAX requests** — `fetch()` and `XMLHttpRequest` calls with method, URL, status,
  and duration (so 4xx/5xx and slow calls show up).
- **JavaScript errors** — uncaught errors and unhandled promise rejections.
- **Sessions** — a session id (persisted in `sessionStorage`) plus a per-load page-view
  id, so events can be stitched into sessions.

URLs are sanitized (query strings dropped) before sending, so tokens/ids in query
params are not beaconed.

## Include it

### Option A — script tag with `data-*` attributes (recommended)

Put it in `<head>` so the observers and AJAX/error hooks register early. Copy-paste:

```html
<script
  src="https://your-dashboard.example.com/opa-rum.js"
  data-endpoint=""
  data-organization-id="KtBteaXLMGcBQDF3Ov8tmg=="
  data-project-id="LmDJSlcleQoQNEVk8bKL9Q=="
  data-sample-rate="1"
  data-debug="false"></script>
```

Leave `data-endpoint` **empty** to post to the **same origin** (the beacon appends
`/api/rum`). Set it to an absolute origin (e.g. `https://your-dashboard.example.com`)
when the monitored site is on a different host.

### Option B — `window.OPA_RUM_CONFIG`

Set config before the script loads. Handy when values come from a template or bundler:

```html
<script>
  window.OPA_RUM_CONFIG = {
    endpoint: '',                               // same origin
    organizationId: 'KtBteaXLMGcBQDF3Ov8tmg==',
    projectId: 'LmDJSlcleQoQNEVk8bKL9Q==',
    sampleRate: 1,
    debug: false
  };
</script>
<script src="https://your-dashboard.example.com/opa-rum.js"></script>
```

## Config options

| `data-*` attribute      | `OPA_RUM_CONFIG` key | Default | Meaning |
|-------------------------|----------------------|---------|---------|
| `data-endpoint`         | `endpoint`           | same origin | Base origin the beacon POSTs to. Empty = current origin. `/api/rum` is appended. |
| `data-organization-id`  | `organizationId`     | —       | Public organization id (see tenant model). |
| `data-project-id`       | `projectId`          | —       | Public project id (see tenant model). |
| `data-sample-rate`      | `sampleRate`         | `1`     | Fraction of sessions to record, `0`–`1` (`0.1` = 10%). |
| `data-debug`            | `debug`              | `false` | `true` logs beacon activity to the console. |

## Tenant model

Data is attributed to a tenant with two **public** identifiers:

- **organizationId** — which organization the traffic belongs to.
- **projectId** — which project within that organization.

These are safe to embed in client-side HTML: they are public routing keys (base64
handles such as `KtBteaXLMGcBQDF3Ov8tmg==`), not secrets or API keys. The beacon
attaches them to every payload so the agent can route the data to the right
project. Grab the pair for your project from the dashboard's tenant/project settings.

## Delivery

The beacon batches events and POSTs them as JSON to **`<endpoint>/api/rum`** using
**`navigator.sendBeacon()`** when the page is hidden (`visibilitychange` → hidden and
`pagehide`), so the final payload with settled Core Web Vitals is sent even as the tab
closes. Call `window.OpaRum.flush()` to send immediately (e.g. before a client-side
route change in a SPA).

On the OPA dashboard, `/api/*` is proxied by nginx to the agent, so an empty
`data-endpoint` (same origin) is all you need when the beacon is served from the
dashboard.

## Try it

Open **`/rum-demo.html`** (served from `public/`). It loads the beacon, generates
Core Web Vitals, resource/nav timing, AJAX (including a deliberate 404), and JS
errors, with buttons to throw an error and flush on demand.

> **CSP note:** the production dashboard sends a strict `Content-Security-Policy`
> (`default-src 'self'`, no `'unsafe-inline'`). The beacon itself loads fine (same-origin
> script) and same-origin `sendBeacon`/`fetch` are allowed, but `rum-demo.html`'s inline
> demo script/styles are blocked under that policy. Run the demo via `npm run dev`
> (Vite proxies `/api` to the agent) or `npm run preview`, or temporarily allow
> `'unsafe-inline'`, to exercise the inline logic.
