/**
 * OpenProfilingAgent RUM (Real User Monitoring) JavaScript Agent
 * Tracks page load times, AJAX requests, and user interactions
 */

(function() {
    'use strict';
    
    // Resolve the agent endpoint. Prefer a same-origin default; only honor the
    // configurable global override when it stays same-origin so a compromised or
    // hijacked global cannot exfiltrate telemetry (and any query-string tokens)
    // to a third-party host.
    function resolveAgentUrl() {
        const fallback = '/api/rum';
        const configured = window.OPA_RUM_AGENT_URL;
        if (!configured) return fallback;
        try {
            const resolved = new URL(configured, window.location.href);
            if (resolved.origin === window.location.origin) {
                return resolved.pathname + resolved.search;
            }
        } catch (e) {
            // Invalid URL - fall through to the safe default.
        }
        return fallback;
    }

    // Strip query strings from a URL, keeping only origin + path. Falls back to
    // scrubbing known-sensitive params if the URL cannot be fully parsed. This
    // prevents tokens/apikeys/session ids in query strings from being beaconed.
    function sanitizeUrl(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
        try {
            const u = new URL(rawUrl, window.location.href);
            // Keep only the path (drop query string and fragment entirely).
            return u.origin + u.pathname;
        } catch (e) {
            // Relative or malformed URL: scrub known-sensitive params in place.
            const idx = rawUrl.search(/[?#]/);
            return idx === -1 ? rawUrl : rawUrl.slice(0, idx);
        }
    }

    // Configuration
    const RUM_CONFIG = {
        agentUrl: resolveAgentUrl(),
        sampleRate: window.OPA_RUM_SAMPLE_RATE || 1.0,
        trackPageLoad: true,
        trackAjax: true,
        trackErrors: true,
        trackUserInteractions: false, // Can be enabled for detailed tracking
    };
    
    // State
    let sessionId = generateSessionId();
    let pageViewId = generateId();
    let startTime = performance.now();
    let navigationTiming = null;
    let resourceTiming = [];
    let ajaxRequests = [];
    let errors = [];
    
    // Initialize
    if (Math.random() > RUM_CONFIG.sampleRate) {
        return; // Skip tracking based on sample rate
    }
    
    // Generate session ID (persists across page loads)
    function generateSessionId() {
        let sessionId = sessionStorage.getItem('opa_session_id');
        if (!sessionId) {
            sessionId = generateId();
            sessionStorage.setItem('opa_session_id', sessionId);
        }
        return sessionId;
    }
    
    // Generate unique ID
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }
    
    // Get current page URL (query string stripped to avoid leaking tokens)
    function getPageUrl() {
        return sanitizeUrl(window.location.href);
    }
    
    // Get user agent
    function getUserAgent() {
        return navigator.userAgent;
    }
    
    // Get viewport size
    function getViewportSize() {
        return {
            width: window.innerWidth || document.documentElement.clientWidth,
            height: window.innerHeight || document.documentElement.clientHeight
        };
    }
    
    // Collect performance timing
    function collectPerformanceTiming() {
        if (!window.performance || !window.performance.timing) {
            return null;
        }
        
        const timing = window.performance.timing;
        const navigation = window.performance.navigation;
        
        return {
            // Navigation timing
            navigationStart: timing.navigationStart,
            domLoading: timing.domLoading,
            domInteractive: timing.domInteractive,
            domContentLoaded: timing.domContentLoadedEventStart,
            domComplete: timing.domComplete,
            loadEventStart: timing.loadEventStart,
            loadEventEnd: timing.loadEventEnd,
            
            // Calculated metrics
            dns: timing.domainLookupEnd - timing.domainLookupStart,
            connect: timing.connectEnd - timing.connectStart,
            request: timing.responseStart - timing.requestStart,
            response: timing.responseEnd - timing.responseStart,
            dom: timing.domComplete - timing.domInteractive,
            load: timing.loadEventEnd - timing.loadEventStart,
            
            // Total page load time
            total: timing.loadEventEnd - timing.navigationStart,
            
            // Navigation type
            type: navigation ? navigation.type : 0, // 0=navigate, 1=reload, 2=back_forward, 255=reserved
        };
    }
    
    // Collect resource timing
    function collectResourceTiming() {
        if (!window.performance || !window.performance.getEntriesByType) {
            return [];
        }
        
        const resources = window.performance.getEntriesByType('resource');
        return resources.map(resource => ({
            name: sanitizeUrl(resource.name),
            type: resource.initiatorType,
            duration: resource.duration,
            size: resource.transferSize || 0,
            startTime: resource.startTime,
        })).slice(0, 50); // Limit to 50 resources
    }
    
    // Track AJAX requests
    function trackAjax() {
        if (!RUM_CONFIG.trackAjax) return;
        
        // Override XMLHttpRequest
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;
        
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            this._opaMethod = method;
            this._opaUrl = url;
            this._opaStartTime = performance.now();
            return originalOpen.apply(this, [method, url, ...args]);
        };
        
        XMLHttpRequest.prototype.send = function(...args) {
            const xhr = this;
            
            xhr.addEventListener('loadend', function() {
                const duration = performance.now() - xhr._opaStartTime;
                ajaxRequests.push({
                    method: xhr._opaMethod,
                    url: sanitizeUrl(xhr._opaUrl),
                    status: xhr.status,
                    duration: duration,
                    size: xhr.responseText ? xhr.responseText.length : 0,
                });
            });
            
            return originalSend.apply(this, args);
        };
        
        // Override fetch
        if (window.fetch) {
            const originalFetch = window.fetch;
            window.fetch = function(...args) {
                const startTime = performance.now();
                const url = typeof args[0] === 'string' ? args[0] : args[0].url;
                const method = args[1] && args[1].method ? args[1].method : 'GET';
                
                return originalFetch.apply(this, args).then(response => {
                    const duration = performance.now() - startTime;
                    ajaxRequests.push({
                        method: method,
                        url: sanitizeUrl(url),
                        status: response.status,
                        duration: duration,
                        size: 0, // Fetch doesn't expose response size easily
                    });
                    return response;
                });
            };
        }
    }
    
    // Track JavaScript errors
    function trackErrors() {
        if (!RUM_CONFIG.trackErrors) return;
        
        window.addEventListener('error', function(event) {
            errors.push({
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error ? event.error.stack : null,
            });
        });
        
        window.addEventListener('unhandledrejection', function(event) {
            errors.push({
                message: 'Unhandled Promise Rejection: ' + (event.reason ? event.reason.toString() : 'Unknown'),
                filename: '',
                lineno: 0,
                colno: 0,
                stack: event.reason && event.reason.stack ? event.reason.stack : null,
            });
        });
    }
    
    // ---- Core Web Vitals (LCP, CLS, FID, INP, FCP, TTFB) via PerformanceObserver ----
    var webVitals = { lcp: null, cls: 0, fid: null, inp: null, fcp: null, ttfb: null };
    function initWebVitals() {
        try {
            var nav = window.performance && window.performance.getEntriesByType && window.performance.getEntriesByType('navigation')[0];
            if (nav) webVitals.ttfb = Math.round(nav.responseStart);
        } catch (e) {}
        if (!('PerformanceObserver' in window)) return;
        var obs = function (type, cb, opts) {
            try { new PerformanceObserver(cb).observe(Object.assign({ type: type, buffered: true }, opts || {})); } catch (e) {}
        };
        obs('paint', function (l) { l.getEntries().forEach(function (e) { if (e.name === 'first-contentful-paint') webVitals.fcp = Math.round(e.startTime); }); });
        obs('largest-contentful-paint', function (l) { var es = l.getEntries(); var last = es[es.length - 1]; if (last) webVitals.lcp = Math.round(last.renderTime || last.loadTime || last.startTime); });
        obs('layout-shift', function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) webVitals.cls += e.value; }); });
        obs('first-input', function (l) { var e = l.getEntries()[0]; if (e && webVitals.fid == null) webVitals.fid = Math.round(e.processingStart - e.startTime); });
        obs('event', function (l) { l.getEntries().forEach(function (e) { if (e.duration && (webVitals.inp == null || e.duration > webVitals.inp)) webVitals.inp = Math.round(e.duration); }); }, { durationThreshold: 40 });
    }
    function snapshotWebVitals() {
        return { lcp: webVitals.lcp, cls: Math.round(webVitals.cls * 1000) / 1000, fid: webVitals.fid, inp: webVitals.inp, fcp: webVitals.fcp, ttfb: webVitals.ttfb };
    }

    // Send RUM data to agent
    function sendRUMData() {
        const viewport = getViewportSize();
        const perfTiming = collectPerformanceTiming();
        const resources = collectResourceTiming();

        const rumData = {
            type: 'rum',
            session_id: sessionId,
            page_view_id: pageViewId,
            page_url: getPageUrl(),
            user_agent: getUserAgent(),
            viewport: viewport,
            navigation_timing: perfTiming,
            web_vitals: snapshotWebVitals(),
            resource_timing: resources,
            ajax_requests: ajaxRequests,
            errors: errors,
            timestamp: Date.now(),
        };
        
        // Send via beacon API (fires even if page is unloading)
        if (navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(rumData)], { type: 'application/json' });
            navigator.sendBeacon(RUM_CONFIG.agentUrl, blob);
        } else {
            // Fallback to fetch
            fetch(RUM_CONFIG.agentUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rumData),
                keepalive: true,
            }).catch(() => {
                // Ignore errors - we don't want to break the page
            });
        }
    }
    
    // Start Core Web Vitals observers as early as possible (buffered:true also
    // captures entries dispatched before this point).
    initWebVitals();

    // Send a final beacon (with settled LCP/CLS/INP) when the page is hidden.
    var sentFinal = false;
    function sendFinal() { if (!sentFinal) { sentFinal = true; sendRUMData(); } }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') sendFinal(); });
    window.addEventListener('pagehide', sendFinal);

    // Initialize tracking
    if (RUM_CONFIG.trackPageLoad) {
        // Wait for page load
        if (document.readyState === 'complete') {
            setTimeout(sendRUMData, 0);
        } else {
            window.addEventListener('load', function() {
                setTimeout(sendRUMData, 1000); // Wait 1s for all resources to load
            });
        }
    }
    
    if (RUM_CONFIG.trackAjax) {
        trackAjax();
    }
    
    if (RUM_CONFIG.trackErrors) {
        trackErrors();
    }
    
    // Send data before page unload
    window.addEventListener('beforeunload', function() {
        sendRUMData();
    });
    
    // Expose API for manual tracking
    window.OPA_RUM = {
        trackEvent: function(name, data) {
            // Custom event tracking
        },
        trackError: function(error) {
            errors.push({
                message: error.message || String(error),
                stack: error.stack,
            });
        },
    };
})();

