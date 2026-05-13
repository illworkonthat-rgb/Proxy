const express = require('express');
const cors = require('cors');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cookieParser());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.static(path.join(__dirname, 'public')));

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
        selfHandleResponse: true, 

        onProxyReq: (proxyReq) => {
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
            proxyReq.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8');
            proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9');
            proxyReq.setHeader('Referer', targetOrigin);
            proxyReq.setHeader('Origin', targetOrigin);
            
            proxyReq.removeHeader('x-forwarded-for');
            proxyReq.removeHeader('x-forwarded-proto');
            proxyReq.removeHeader('x-forwarded-host');
        },

        onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
            delete proxyRes.headers['content-security-policy'];
            delete proxyRes.headers['content-security-policy-report-only'];
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['x-xss-protection'];

            if (proxyRes.headers['set-cookie']) {
                proxyRes.headers['set-cookie'] = proxyRes.headers['set-cookie'].map(cookie => 
                    cookie.replace(/Secure/gi, '').replace(/SameSite=Lax|SameSite=Strict/gi, 'SameSite=None')
                );
            }
            res.setHeader('Access-Control-Allow-Origin', '*');

            const contentType = proxyRes.headers['content-type'] || '';
            
            // If it is text/html, inject a browser-side URL baseline fix to prevent serverless drops
            if (contentType.includes('text/html')) {
                let htmlContent = responseBuffer.toString('utf8');
                
                // Dynamically inject a <base> tag at the top of <head> to force asset routing rules
                const baseTaghtml = `<head><base href="${targetOrigin}/">`;
                htmlContent = htmlContent.replace(/<head>/i, baseTaghtml);
                
                return Buffer.from(htmlContent);
            }
            
            return responseBuffer;
        })
    });

    if (!forcedUrl) {
        req.url = parsedUrl.pathname + parsedUrl.search;
    }
    return middlewareInstance(req, res, next);
};

app.use('/proxy', (req, res, next) => {
    runProxyEngine(req, res, next);
});

app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/index.html') {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }

    const activeSessionOrigin = req.cookies.__active_proxy_target;
    if (activeSessionOrigin && req.path !== '/favicon.ico') {
        const reconstructedAssetUrl = activeSessionOrigin + req.originalUrl;
        return runProxyEngine(req, res, next, reconstructedAssetUrl);
    }
    
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
app.listen(PORT, () => console.log(`Proxy listening on port ${PORT}`));
