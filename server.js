const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const zlib = require('zlib');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', credentials: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/proxy', (req, res, next) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing URL parameter.');

    if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(targetUrl);
    } catch (e) {
        return res.status(400).send('Invalid URL format.');
    }

    const targetOrigin = parsedUrl.origin;
    // Safely deduce the base proxy URL without relying on request headers
    const proxyBaseUrl = `${req.protocol}://${req.get('host')}/proxy?url=`;

    const proxy = createProxyMiddleware({
        target: targetOrigin,
        changeOrigin: true,
        followRedirects: true,
        secure: false,
        selfHandleResponse: true, // Intercept to decompress and fix content loops

        onProxyReq: (proxyReq) => {
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            proxyReq.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8');
            proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9');
            proxyReq.setHeader('Referer', targetOrigin);
            proxyReq.setHeader('Origin', targetOrigin);
            
            // Wipe out cloud headers to prevent loops
            proxyReq.removeHeader('x-forwarded-for');
            proxyReq.removeHeader('x-forwarded-proto');
            proxyReq.removeHeader('x-forwarded-host');
        },

        onProxyRes: (proxyRes, req, res) => {
            delete proxyRes.headers['content-security-policy'];
            delete proxyRes.headers['content-security-policy-report-only'];
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['x-xss-protection'];

            proxyRes.headers['Access-Control-Allow-Origin'] = '*';

            let chunks = [];
            proxyRes.on('data', (chunk) => chunks.push(chunk));
            proxyRes.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const contentType = proxyRes.headers['content-type'] || '';

                // Instantly pass non-text files (images, audio) to prevent pipeline hangs
                if (!contentType.includes('text/html') && !contentType.includes('application/javascript') && !contentType.includes('text/css')) {
                    res.writeHead(proxyRes.statusCode, proxyRes.headers);
                    res.end(buffer);
                    return;
                }

                // Decompress content cleanly
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

                // FIXED LINK REWRITER: Strict matching patterns to prevent loops on internal files
                if (contentType.includes('text/html')) {
                    // Rewrite absolute URLs (https://...)
                    body = body.replace(/(href|src)=["'](https?:\/\/[^"']+)["']/gi, (m, attr, url) => {
                        return `${attr}="${proxyBaseUrl}${encodeURIComponent(url)}"`;
                    });
                    
                    // Rewrite relative root paths (/style.css) safely without parsing text fragments
                    body = body.replace(/(href|src)=["']\/([^\/][^"']*)["']/gi, (m, attr, path) => {
                        return `${attr}="${proxyBaseUrl}${encodeURIComponent(targetOrigin + '/' + path)}"`;
                    });
                }

                delete proxyRes.headers['content-encoding'];
                proxyRes.headers['content-length'] = Buffer.byteLength(body);

                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                res.end(body);
            });
        },
        onError: (err, req, res) => {
            res.status(502).send(`Proxy Connection Error: ${err.message}`);
        }
    });

    req.url = parsedUrl.pathname + parsedUrl.search;
    return proxy(req, res, next);
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Engine active on port ${PORT}`));
