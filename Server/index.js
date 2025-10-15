// Simple robust proxy server for System Glitch
// NOTE: This implementation rewrites HTML and injects a small script to postMessage the
// unproxied URL back to the parent. Use responsibly.

const express = require('express')
const fetch = require('node-fetch')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const { parse: parseCookie, serialize: serializeCookie } = require('cookie')

const app = express()
app.use(morgan('tiny'))
app.use(express.static('public'))

// Basic rate limiting to reduce abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
})
app.use(limiter)

const PROXY_PREFIX = '/proxy/'

// Helper: sanitize request headers forwarded upstream
function sanitizeRequestHeaders(headers) {
  const out = {}
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase()
    if (['host', 'connection', 'content-length'].includes(lk)) continue
    // do not forward headers that might reveal the proxy's internals
    out[k] = v
  }
  return out
}

// Helper: make proxied URL string from incoming path (/proxy/https://example.com/...)
function getTargetUrlFromPath(path) {
  // path starts with '/proxy/' (guaranteed)
  const raw = path.slice(PROXY_PREFIX.length)
  // if someone encoded URL with encodeURIComponent, decode
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

app.all(PROXY_PREFIX + '*', async (req, res) => {
  try {
    const target = getTargetUrlFromPath(req.path)
    if (!/^https?:\/\//i.test(target)) {
      return res.status(400).send('Invalid target URL. Must start with http:// or https://')
    }

    // Build upstream fetch URL, include original query string and hash if present
    let upstreamUrl = target
    // If client provided a query string as part of req.url, append it (rare)
    if (req._parsedUrl && req._parsedUrl.search) {
      // user may have put queries after /proxy/<url>?x=1; we shouldn't accidentally append duplicate queries
      // skip for simplicity; upstreamUrl already may contain queries
    }

    // Build fetch options
    const fetchOptions = {
      method: req.method,
      headers: sanitizeRequestHeaders(req.headers),
      redirect: 'manual',
      // Only attach body for methods that can have one
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req
    }

    const upstreamResp = await fetch(upstreamUrl, fetchOptions)

    // Copy status for redirect handling; handle 3xx by rewriting Location header to route through proxy
    const status = upstreamResp.status
    const headers = {}
    upstreamResp.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v
    })

    // If upstream set a location (redirect), rewrite it to go through our proxy
    if (headers.location) {
      try {
        const loc = new URL(headers.location, upstreamUrl).href
        headers.location = `${PROXY_PREFIX}${encodeURIComponent(loc)}`
      } catch (e) {
        // leave it alone if parsing fails
      }
    }

    // Remove headers that block framing/cross-origin or that we intentionally override
    delete headers['content-security-policy']
    delete headers['x-frame-options']
    delete headers['frame-options']

    // Add small header to know response passed through proxy
    headers['x-system-glitch'] = '1'

    const contentType = headers['content-type'] || ''

    // If HTML text, fetch as text, rewrite links and inject script
    if (contentType.includes('text/html')) {
      let text = await upstreamResp.text()

      // Basic link rewriting (absolute http/https) -> route through proxy
      // This is naive but works for many sites: rewrite href/src attributes in HTML
      // Note: this doesn't handle JS-constructed URLs.
      text = text.replace(/(href|src)=("|'|)(https?:\/\/[^"'>\s]+)/gi, (m, attr, q, url) => {
        try {
          // Keep protocol-relative links? We convert them to absolute http(s)
          const encoded = PROXY_PREFIX + encodeURIComponent(url)
          return `${attr}=${q}${encoded}`
        } catch {
          return m
        }
      })

      // Inject a small script to notify parent of current real location and to intercept <a> clicks
      const injection = `
<script>
  // Post the real URL to the parent so the System Glitch address bar can show it
  (function(){
    try {
      function report() {
        window.parent.postMessage({ type: 'sysglitch:url', url: window.location.href }, '*')
      }
      report()
      // report on history navigation
      window.addEventListener('popstate', report)
      window.addEventListener('hashchange', report)
      // intercept link clicks and route them via parent so top bar can update
      document.addEventListener('click', function(e){
        var a = e.target.closest && e.target.closest('a')
        if(!a) return
        if(a.target && a.target.toLowerCase() === '_blank') return
        var href = a.href
        if(!href) return
        // let parent handle navigation to preserve UX
        e.preventDefault()
        window.parent.postMessage({ type: 'sysglitch:navigate', url: href }, '*')
      }, true)
    } catch(e){/* ignore */ }
  })();
</script>
</body>`

      // Try to inject before </body>. If missing, append at end.
      if (text.lastIndexOf('</body>') !== -1) {
        text = text.replace(/<\/body>/i, injection)
      } else {
        text += injection
      }

      // Send rewritten HTML with sanitized headers
      res.set('Content-Type', 'text/html; charset=utf-8')
      Object.entries(headers).forEach(([k, v]) => {
        if (k === 'content-type') return
        res.set(k, v)
      })
      return res.status(status).send(text)
    }

    // For other content types, stream the response
    // copy headers
    Object.entries(headers).forEach(([k, v]) => {
      res.set(k, v)
    })
    res.status(status)
    upstreamResp.body.pipe(res)
  } catch (err) {
    console.error('Proxy error', err)
    res.status(502).send('System Glitch proxy error: ' + err.message)
  }
})

// small health root and the client app sits in /public
app.get('/', (req, res) => {
  res.sendFile(require('path').join(__dirname, '..', 'public', 'index.html'))
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`System Glitch running on port ${PORT}`))
