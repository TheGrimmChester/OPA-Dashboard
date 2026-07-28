// Orchestration logic for rum-demo.html. Kept as an external same-origin file
// so it runs under the production CSP (default-src 'self', no 'unsafe-inline').
(function () {
  'use strict';
  var logEl = document.getElementById('log');
  function log(msg) {
    var line = '[' + new Date().toLocaleTimeString() + '] ' + msg + '\n';
    if (logEl) logEl.textContent += line;
    // eslint-disable-next-line no-console
    console.log('[rum-demo]', msg);
  }

  // --- AJAX activity: same-origin /api calls (populate ajax_requests) ---
  function callApi(path, label) {
    var t0 = performance.now();
    return fetch(path, { headers: { 'Accept': 'application/json' } })
      .then(function (res) {
        var ms = Math.round(performance.now() - t0);
        log(label + ' -> ' + res.status + ' (' + ms + 'ms)');
        return res;
      })
      .catch(function (err) {
        log(label + ' -> network error: ' + err.message);
      });
  }

  function runApiBurst() {
    log('Firing API calls...');
    callApi('/api/services/metadata', 'GET /api/services/metadata');
    callApi('/api/rum/metrics', 'GET /api/rum/metrics');
    callApi('/api/rum/metrics?window=1h', 'GET /api/rum/metrics?window=1h');
    // Deliberate 404 so an error / 4xx AJAX entry is recorded.
    callApi('/api/this-endpoint-does-not-exist', 'GET /api/this-endpoint-does-not-exist (expect 404)');
  }

  // --- Forced layout shift (CLS): inject a late, un-sized image ---
  function forceLayoutShift() {
    setTimeout(function () {
      var slot = document.getElementById('cls-slot');
      if (!slot) return;
      var img = document.createElement('img');
      // No width/height attributes => the browser reflows when it paints,
      // shifting everything below it and producing a measurable CLS.
      img.alt = 'late banner';
      img.src = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='820'%20height='140'%3E%3Crect%20width='820'%20height='140'%20fill='%23f59e0b'/%3E%3Ctext%20x='410'%20y='82'%20font-family='sans-serif'%20font-size='24'%20fill='%23111'%20text-anchor='middle'%3ELate%20banner%20(causes%20CLS)%3C/text%3E%3C/svg%3E";
      img.className = 'late-banner';
      slot.appendChild(img);
      log('Injected late un-sized image (layout shift).');
    }, 900);
  }

  // --- Wire up buttons ---
  var fetchBtn = document.getElementById('btn-fetch');
  if (fetchBtn) fetchBtn.addEventListener('click', runApiBurst);

  var errBtn = document.getElementById('btn-error');
  if (errBtn) errBtn.addEventListener('click', function () {
    log('Raising an uncaught error...');
    // Deferred so it is genuinely uncaught (reaches window "error"), not
    // swallowed by this click handler.
    setTimeout(function () {
      throw new Error('OPA RUM demo: intentional uncaught error at ' + Date.now());
    }, 0);
  });

  var flushBtn = document.getElementById('btn-flush');
  if (flushBtn) flushBtn.addEventListener('click', function () {
    if (window.OpaRum && typeof window.OpaRum.flush === 'function') {
      window.OpaRum.flush();
      log('Called window.OpaRum.flush().');
    } else {
      log('window.OpaRum.flush() not available (is /opa-rum.js loaded & not sampled out?).');
    }
  });

  // --- Kick things off after load ---
  window.addEventListener('load', function () {
    log('Page loaded. OpaRum present: ' + !!window.OpaRum);
    forceLayoutShift();
    // Small delay so the initial navigation/resource timings settle first.
    setTimeout(runApiBurst, 300);
  });
})();
