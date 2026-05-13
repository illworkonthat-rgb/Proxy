const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', credentials: true }));

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Bypass Proxy</title></head>
        <body style="font-family:sans-serif; text-align:center; padding:50px;">
            <h2>Enter URL to Bypass Connection Refusal</h2>
            <input type="text" id="url" placeholder="https://example.com" style="width:70%; padding:10px;">
            <button onclick="go()" style="padding:10px;">Go</button>
            <script>
                function go() {
                    const t = document.getElementById('url').value;
                    if(t) window.location.href = '/proxy?url=' + encodeURIComponent(t);
                }
            </script>
        </body>
        </html>
    `);
});

app.use('/proxy', (req, res, next) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing URL');
    try {
        const parsed = new URL(targetUrl);
        const proxy = createProxyMiddleware({
            target: parsed.origin,
            changeOrigin: true,
            followRedirects: true,
            secure: false,
            onProxyReq: (pReq) => {
                pReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            },
            onProxyRes: (pRes) => {
                delete pRes.headers['content-security-policy'];
                delete pRes.headers['x-frame-options'];
            }
        });
        req.url = parsed.pathname + parsed.search;
        return proxy(req, res, next);
    } catch { return res.status(400).send('Invalid URL'); }
});

app.listen(PORT, () => console.log('Proxy running'));
