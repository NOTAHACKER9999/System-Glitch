const express = require('express');
const axios = require('axios');
const app = express();
const PORT = 3000;

app.use(express.static('public'));

app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL parameter missing');

  try {
    const response = await axios.get(targetUrl, {
      headers: { 'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0' },
      maxRedirects: 5,
    });

    let html = response.data;

    // Rewrite links and forms to stay inside the proxy
    html = html.replace(/(href|src|action)=["'](?!http)([^"']+)["']/g, (match, attr, path) => {
      // Make relative paths absolute with the target domain
      const baseUrl = new URL(targetUrl);
      return `${attr}="/proxy?url=${encodeURIComponent(new URL(path, baseUrl).href)}"`;
    });

    res.send(html);
  } catch (err) {
    res.status(500).send('Error fetching page: ' + err.message);
  }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
