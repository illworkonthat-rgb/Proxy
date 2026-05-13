const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Universal middleware for cookies and permissive routing headers
app.use(cookieParser());
app.use(cors({ origin: '*', credentials: true }));

// Serve the landing page asset folder explicitly
app.use(express.static(path.join(__dirname, 'public')));

// The Proxy Gateway Engine
const handleProxyLogic = (req, res, next, explicitUrl = null) => {
    let targetUrl = explicitUrl || req.query.url || req.cookies.__active_proxy_target;
    if (!targetUrl) return res.status(400).send('Missing target routing session context.');

    if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(targetUrl);
    } catch (e) {
        return res.status(400).send('Invalid URL format structural specification.');
    }

    const targetOrigin = parsedUrl.origin;

    // Track active target domain in a cookie to resolve relative sub-paths seamlessly
    if (req.query.url) {
        res.cookie('__active_proxy_target', targetOrigin, { path: '/', httpOnly: false, sameSite: 'none', secure: true });
    }

    const proxy = createProxyMiddleware({
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

    // Reconstruct internal paths for assets that bypass the /proxy endpoint
    if (!explicitUrl) {
        req.url = parsedUrl.pathname + parsedUrl.search;
    }
    return proxy(req, res, next);
};

// Explicit router map connection
app.use('/proxy', (req, res, next) => {
    handleProxyLogic(req, res, next);
});

// Catch-all system to trap and re-route relative background assets (/w/load.php)
app.use((req, res, next) => {
    // Let the direct root and landing page assets skip tracking loops
    if (req.path === '/' || req.path.includes('index.html')) {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }

    const sessionOrigin = req.cookies.__active_proxy_target;
    if (sessionOrigin) {
        // Intercept relative asset path breaks and route them through the active proxy session
        const reconstructedAssetUrl = sessionOrigin + req.originalUrl;
        return handleProxyLogic(req, res, next, reconstructedAssetUrl);
    }
    
    next();
});

app.listen(PORT, () => console.log(`Ironclad Engine Live on Port: ${PORT}`));
