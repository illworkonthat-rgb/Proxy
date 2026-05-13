const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const cookieParser = require('cookie-parser');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cookieParser());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.static(path.join(__dirname, 'public')));

const runProxyEngine = (req, res, next, forcedUrl = null) => {
    let targetUrl = forcedUrl || req.query.url || req.cookies.__active_proxy_target;
    if (!targetUrl) return res.status(400).send('Proxy Error: Destination missing.');

    if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(targetUrl);
    } catch (e) {
        return res.status(400).send('Proxy Error: Invalid URL structure.');
    }

    const targetOrigin = parsedUrl.origin;
    const proxyBaseUrl = `${req.protocol}://${req.get('host')}/proxy?url=`;

    if (req.query.url) {
        res.cookie('__active_proxy_target', targetOrigin, { path: '/', httpOnly: false, sameSite: 'none', secure: true });
    }

    const middlewareInstance = createProxyMiddleware({
        target: targetOrigin,
        changeOrigin: true,
        followRedirects: true,
        secure: false,
        selfHandleResponse: true, // Tells the server to unpack the data and strip hidden script blocks

        onProxyReq: (proxyReq) => {
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
            proxyReq.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8');
            proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9');
            proxyReq.setHeader('Referer', targetOrigin);
            proxyReq.setHeader('Origin', targetOrigin);
        },

        onProxyRes: (proxyRes, req, res) => {
            // Strip structural security layers instantly
            delete proxyRes.headers['content-security-policy'];
            delete proxyRes.headers['content-security-policy-report-only'];
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['x-xss-protection'];

            let chunks = [];
            proxyRes.on('data', (chunk) => chunks.push(chunk));
            proxyRes.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const contentType = proxyRes.headers['content-type'] || '';

                // Pass binary assets right through to avoid stream freezes
                if (!contentType.includes('text/html')) {
                    res.writeHead(proxyRes.statusCode, proxyRes.headers);
                    res.end(buffer);
                    return;
                }

                // Decompress the incoming data stream safely
                let body = '';
                try {
                    const encoding = proxyRes.headers['content-encoding'];
                    if (encoding === 'br') body = zlib.brotliDecompressSync(buffer).toString('utf-8');
                    else if (encoding === 'gzip') body = zlib.gunzipSync(buffer).toString('utf-8');
                    else if (encoding === 'deflate') body = zlib.inflateSync(buffer).toString('utf-8');
                    else body = buffer.toString('utf-8');
                } catch (err) {
                    body = buffer.toString('utf-8');
                }

                // INJECTION AGENT: Breaks JavaScript anti-frame checks right inside the browser
                const antiFrameBusterScript = `
                    <script>
                        // Prevent the page from checking if it is embedded in an iframe
                        Object.defineProperty(window, 'top', { get: function() { return window.self; } });
                        Object.defineProperty(window, 'parent', { get: function() { return window.self; } });
                        Object.defineProperty(document, 'referrer', { get: function() { return ''; } });
                    </script>
                `;

                // Inject our script agent and force the URL baseline rewriting path rules
                body = body.replace(/<head>/i, `<head>${antiFrameBusterScript}<base href="${targetOrigin}/">`);

                // Dynamic link rewriter fallback pattern
                body = body.replace(/(href|src)=["']\/([^\/][^"']*)["']/gi, (m, attr, path) => {
                    return `${attr}="${proxyBaseUrl}${encodeURIComponent(targetOrigin + '/' + path)}"`;
                });

                delete proxyRes.headers['content-encoding'];
                proxyRes.headers['content-length'] = Buffer.byteLength(body);

                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                res.end(body);
            });
        }
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
        return runProxyEngine(req, res, next, activeSessionOrigin + req.originalUrl);
    }
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
