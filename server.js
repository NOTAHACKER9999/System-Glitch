const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

// Function to rewrite URLs so navigation stays on the proxy
function rewriteHTML(html) {
  // Rewrite all DuckDuckGo links to go through proxy
  html = html.replace(/href="\/?/g, 'href="/?u=');
  html = html.replace(/action="\/?/g, 'action="/?u=');
  
  // Optional: inline scripts to avoid external redirects
  html = html.replace(/window\.location/g, 'console.log("redirect blocked")');
  
  return html;
}

// Proxy endpoint
app.get('/', async (req, res) => {
  try {
    // Determine target URL
    let target = 'https://duckduckgo.com';
    if (req.query.u) {
      target = 'https://duckduckgo.com' + decodeURIComponent(req.query.u);
    }

    // Fetch DuckDuckGo page
    const response = await fetch(target, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Node.js Proxy',
      },
    });

    let body = await response.text();
    body = rewriteHTML(body);

    // Serve inside a full-page wrapper (like an iframe)
    res.send(`
      <html>
        <head>
          <meta charset="UTF-8">
          <title>DuckDuckGo Proxy</title>
          <style>
            body, html { margin: 0; padding: 0; height: 100%; }
            iframe { width: 100%; height: 100%; border: none; }
          </style>
        </head>
        <body>
          ${body}
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Proxy error: ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`DuckDuckGo proxy running at http://localhost:${PORT}`);
});
