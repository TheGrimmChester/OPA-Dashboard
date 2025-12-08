# RUM (Real User Monitoring) Setup Guide

## Overview

The RUM JavaScript agent automatically tracks page load times, AJAX requests, JavaScript errors, and user interactions in the browser.

## Installation

### Option 1: Automatic Injection (Recommended)

Add the RUM script to your HTML template. The script should be included in the `<head>` or before the closing `</body>` tag:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My App</title>
    <!-- RUM Script -->
    <script>
        window.OPA_RUM_AGENT_URL = '/api/rum';
        window.OPA_RUM_SAMPLE_RATE = 1.0; // 1.0 = 100%, 0.1 = 10%
    </script>
    <script src="/rum.js"></script>
</head>
<body>
    <!-- Your content -->
</body>
</html>
```

### Option 2: Nginx/Apache Injection

You can also inject the RUM script automatically using your web server:

#### Nginx

```nginx
location / {
    # ... your existing config ...
    
    # Inject RUM script before </body>
    sub_filter '</body>' '<script src="/rum.js"></script></body>';
    sub_filter_once on;
}
```

#### Apache

```apache
<Location />
    # Inject RUM script
    AddOutputFilterByType SUBSTITUTE text/html
    Substitute "s|</body>|<script src=\"/rum.js\"></script></body>|ni"
</Location>
```

## Configuration

### Sample Rate

Control how many users are tracked:

```javascript
window.OPA_RUM_SAMPLE_RATE = 0.1; // Track 10% of users
```

### Agent URL

Set the endpoint where RUM data is sent:

```javascript
window.OPA_RUM_AGENT_URL = '/api/rum';
```

### Features

Enable/disable specific tracking features:

```javascript
window.OPA_RUM_CONFIG = {
    trackPageLoad: true,
    trackAjax: true,
    trackErrors: true,
    trackUserInteractions: false
};
```

## Manual Tracking

You can also manually track events:

```javascript
// Track custom event
window.OPA_RUM.trackEvent('button_click', { buttonId: 'submit' });

// Track error
window.OPA_RUM.trackError(new Error('Something went wrong'));
```

## Viewing RUM Data

Access the RUM dashboard at: `/rum`

The dashboard shows:
- Page load time metrics
- DOM ready time
- Total page views
- JavaScript errors
- Performance trends over time

## Data Retention

RUM events are stored in ClickHouse with a 90-day TTL. Adjust this in the schema if needed.

