const express = require('express');
const axios = require('axios');
const app = express();
const PORT = 3000;

app.use(express.static('public'));

app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('URL required');

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0'
      },
      maxRedirects: 5,
    });
    let html = response.data;

    // Simple rewrite for relative links to stay inside proxy
    html = html.replace(/(href|src)=["'](?!https?:\/\/)([^"']+)["']/g, '$1="/proxy?url=' + encodeURIComponent(url) + '/$2"');

    res.send(html);
  } catch (err) {
    res.status(500).send('Error fetching the page: ' + err.message);
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
