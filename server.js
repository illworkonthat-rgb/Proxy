const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cookieParser());
app.use(cors({ origin: '*', credentials: true }));

// Express middleware handling landing assets
app.use(express.static(path.join(__dirname, 'public')));

// Explicit Engine Proxy Handler
const runProxyEngine = (req, res, next, forcedUrl = null) => {
    let targetUrl = forcedUrl || req.query.url || req.cookies.__active_proxy_target;
    if (!targetUrl) return res.status(400).send('Proxy Session Error: No website address supplied.');

    if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(targetUrl);
    } catch (e) {
        return res.status(400).send('Proxy Entry Error: Invalid URL structure.');
    }

    const targetOrigin = parsedUrl.origin;

    // Save target origin in a cookie to resolve background assets without infinite loops
    if (req.query.url) {
        res.cookie('__active_proxy_target', targetOrigin, { path: '/', httpOnly: false, sameSite: 'none', secure: true });
    }

    const middlewareInstance = createProxyMiddleware({
        target: targetOrigin,
        changeOrigin: true,
        followRedirects: true,
        secure: false,
        cookieDomainRewrite: "",
        cookiePathRewrite: "",
        onProxyReq: (proxyReq) => {
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
            proxyReq.setHeader('Accept', '*/*');
            proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9');
            proxyReq.setHeader('Referer', targetOrigin);
            proxyReq.setHeader('Origin', targetOrigin);
            
            proxyReq.removeHeader('x-forwarded-for');
            proxyReq.removeHeader('x-forwarded-proto');
            proxyReq.removeHeader('x-forwarded-host');
        },
        onProxyRes: (proxyRes) => {
            delete proxyRes.headers['content-security-policy'];
            delete proxyRes.headers['content-security-policy-report-only'];
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['x-xss-protection'];

            if (proxyRes.headers['set-cookie']) {
                proxyRes.headers['set-cookie'] = proxyRes.headers['set-cookie'].map(cookie => 
                    cookie.replace(/Secure/gi, '').replace(/SameSite=Lax|SameSite=Strict/gi, 'SameSite=None')
                );
            }
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        }
    });

    if (!forcedUrl) {
        req.url = parsedUrl.pathname + parsedUrl.search;
    }
    return middlewareInstance(req, res, next);
};

// Route mapping configuration
app.use('/proxy', (req, res, next) => {
    runProxyEngine(req, res, next);
});

// SERVERLESS LOOP GATEKEEPER: Handles static UI files vs trailing background site assets
app.use((req, res, next) => {
    // Explicitly serve index.html if the path points to root
    if (req.path === '/' || req.path === '/index.html') {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }

    // Direct background assets to the engine only if a proxy session is actively running
    const activeSessionOrigin = req.cookies.__active_proxy_target;
    if (activeSessionOrigin && req.path !== '/favicon.ico') {
        const reconstructedAssetUrl = activeSessionOrigin + req.originalUrl;
        return runProxyEngine(req, res, next, reconstructedAssetUrl);
    }
    
    // If no active session, send back to landing screen instead of throwing 500 crashes
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export the application configuration for Vercel's serverless handler layer
module.exports = app;
app.listen(PORT, () => console.log(`Proxy listening on port ${PORT}`));
