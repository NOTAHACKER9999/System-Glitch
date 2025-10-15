const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 3000;

// Proxy DuckDuckGo
app.use(
  '/',
  createProxyMiddleware({
    target: 'https://duckduckgo.com',
    changeOrigin: true,
    selfHandleResponse: false,
    secure: true,
    onProxyReq: (proxyReq, req, res) => {
      // Remove cookies to avoid tracking
      proxyReq.removeHeader('cookie');
    },
    onProxyRes: (proxyRes, req, res) => {
      // Optional: modify headers to allow iframe display
      proxyRes.headers['X-Frame-Options'] = 'ALLOWALL';
      proxyRes.headers['Content-Security-Policy'] = "frame-ancestors *";
    },
  })
);

app.listen(PORT, () => {
  console.log(`DuckDuckGo proxy running at http://localhost:${PORT}`);
});
