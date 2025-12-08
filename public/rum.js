/**
 * OpenProfilingAgent RUM (Real User Monitoring) JavaScript Agent
 * Tracks page load times, AJAX requests, and user interactions
 */

(function() {
    'use strict';
    
    // Configuration
    const RUM_CONFIG = {
        agentUrl: window.OPA_RUM_AGENT_URL || '/api/rum',
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
    
    // Get current page URL
    function getPageUrl() {
        return window.location.href;
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
            name: resource.name,
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
                    url: xhr._opaUrl,
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
                        url: url,
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

