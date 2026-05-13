const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ironclad Bypass Proxy</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; max-width: 700px; margin: 80px auto; padding: 20px; text-align: center; }
                h2 { color: #38bdf8; font-size: 28px; margin-bottom: 20px; }
                input { width: 80%; padding: 14px; font-size: 16px; border: 2px solid #334155; border-radius: 8px; background: #1e293b; color: white; outline: none; }
                button { padding: 14px 28px; font-size: 16px; font-weight: bold; cursor: pointer; background: #0284c7; color: white; border: none; border-radius: 8px; margin-top: 15px; }
                .note { color: #64748b; font-size: 13px; margin-top: 25px; }
            </style>
        </head>
        <body>
            <h2>Unrestricted Web Proxy</h2>
            <p style="color: #94a3b8; margin-bottom: 30px;">Bypasses connection refusals, frame walls, and hosting blocks automatically.</p>
            <input type="text" id="urlInput" placeholder="example.com or https://site.com">
            <br>
            <button onclick="navigate()">Launch Site</button>
            <p class="note">Links, styles, images, and submission routing are rewritten on the fly.</p>

            <script>
                function navigate() {
                    let target = document.getElementById('urlInput').value.trim();
                    if (!target) return alert('Please enter a target URL');
                    // FIX: Cleaned regex check for the browser environment
                    if (!/^https?:\\/\\//i.test(target)) {
                        target = 'https://' + target;
                    }
                    window.location.href = '/proxy?url=' + encodeURIComponent(target);
                }
                document.getElementById('urlInput').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') navigate();
                });
            </script>
        </body>
        </html>
    `);
});

app.use('/proxy', (req, res, next) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('System Error: Destination URL parameter is missing.');

    if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(targetUrl);
    } catch (e) {
        return res.status(400).send('System Error: Invalid URL string format.');
    }

    const targetOrigin = parsedUrl.origin;
    const proxyBaseUrl = `${req.protocol}://${req.get('host')}/proxy?url=`;

    const proxy = createProxyMiddleware({
        target: targetOrigin,
        changeOrigin: true,
        followRedirects: true,
        secure: false, 
        selfHandleResponse: true, 

        onProxyReq: (proxyReq, req, res) => {
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            proxyReq.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8');
            proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9');
            proxyReq.setHeader('Referer', targetOrigin);
            proxyReq.setHeader('Origin', targetOrigin);

            proxyReq.removeHeader('x-forwarded-for');
            proxyReq.removeHeader('x-forwarded-proto');
            proxyReq.removeHeader('x-forwarded-host');
        },

        onProxyRes: (proxyRes, req, res) => {
            delete proxyRes.headers['content-security-policy'];
            delete proxyRes.headers['content-security-policy-report-only'];
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['x-xss-protection'];
            delete proxyRes.headers['clear-site-data'];

            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';

            let originalResponseBody = Buffer.from([]);

            proxyRes.on('data', (data) => {
                originalResponseBody = Buffer.concat([originalResponseBody, data]);
            });

            proxyRes.on('end', () => {
                const contentType = proxyRes.headers['content-type'] || '';
                
                if (!contentType.includes('text/html') && !contentType.includes('application/javascript') && !contentType.includes('text/css')) {
                    res.writeHead(proxyRes.statusCode, proxyRes.headers);
                    res.end(originalResponseBody);
                    return;
                }

                // FIX: Full decompression handling including Brotli (br)
                let decompressedData;
                try {
                    const encoding = proxyRes.headers['content-encoding'];
                    if (encoding === 'br') {
                        decompressedData = zlib.brotliDecompressSync(originalResponseBody).toString('utf-8');
                    } else if (encoding === 'gzip') {
                        decompressedData = zlib.gunzipSync(originalResponseBody).toString('utf-8');
                    } else if (encoding === 'deflate') {
                        decompressedData = zlib.inflateSync(originalResponseBody).toString('utf-8');
                    } else {
                        decompressedData = originalResponseBody.toString('utf-8');
                    }
                } catch (err) {
                    decompressedData = originalResponseBody.toString('utf-8');
                }

                let rewrittenBody = decompressedData;

                if (contentType.includes('text/html')) {
                    rewrittenBody = rewrittenBody.replace(/(href|src)=["'](https?:\/\/[^"']+)["']/gi, (match, attr, url) => {
                        return `${attr}="${proxyBaseUrl}${encodeURIComponent(url)}"`;
                    });

                    rewrittenBody = rewrittenBody.replace(/(href|src)=["']\/([^"']+)["']/gi, (match, attr, path) => {
                        const fullyQualifiedUrl = `${targetOrigin}/${path}`;
                        return `${attr}="${proxyBaseUrl}${encodeURIComponent(fullyQualifiedUrl)}"`;
                    });
                }

                delete proxyRes.headers['content-encoding'];
                proxyRes.headers['content-length'] = Buffer.byteLength(rewrittenBody);

                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                res.end(rewrittenBody);
            });
        },

        onError: (err, req, res) => {
            res.status(502).send(`
                <body style="font-family:sans-serif; background:#0f172a; color:#f8fafc; text-align:center; padding-top:100px;">
                    <h2 style="color:#ef4444;">Target Connection Dropped</h2>
                    <p style="color:#94a3b8;">The website actively refused to process the proxy server request.</p>
                    <small style="color:#64748b;">Reason: ${err.message}</small>
                    <br><br>
                    <button onclick="window.location.href='/'" style="padding:10px 20px; cursor:pointer;">Return Home</button>
                </body>
            `);
        }
    });

    req.url = parsedUrl.pathname + parsedUrl.search;
    return proxy(req, res, next);
});

app.use((req, res) => {
    res.redirect('/');
});

app.listen(PORT, () => console.log(`Ironclad Engine Online on Port: ${PORT}`));
