import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    // Build the DuckDuckGo URL to fetch
    const url = 'https://duckduckgo.com' + (req.query.u || '');

    // Fetch DuckDuckGo page
    const response = await fetch(url, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Node.js Proxy',
      },
    });

    // Get body as text
    let body = await response.text();

    // Rewrite headers to allow iframe display
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");

    // Rewrite links to stay in proxy
    body = body.replace(/href="\/?/g, 'href="/api/proxy?u=/');
    body = body.replace(/action="\/?/g, 'action="/api/proxy?u=/');

    // Send the page
    res.status(200).send(body);
  } catch (err) {
    res.status(500).send('Proxy error: ' + err.message);
  }
}
