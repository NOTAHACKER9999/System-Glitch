// api/proxy.js
import { PassThrough } from 'stream'

export default async function handler(req, res) {
  try {
    // Get encoded target from query `u`
    const raw = req.query.u || ''
    const target = decodeURIComponent(raw)

    if (!target || !/^https?:\/\//i.test(target)) {
      res.status(400).send('Invalid target URL. Use /proxy/<encoded-url> where <encoded-url> = encodeURIComponent(url)')
      return
    }

    // Build fetch options
    const init = {
      method: req.method,
      headers: sanitizeRequestHeaders(req.headers),
      redirect: 'manual'
    }

    // attach body for methods other than GET/HEAD
    if (!['GET', 'HEAD'].includes(req.method.toUpperCase())) {
      init.body = req
    }

    const upstream = await fetch(target, init)

    // copy headers
    const headers = {}
    upstream.headers.forEach((v, k) => (headers[k.toLowerCase()] = v))

    // rewrite redirects to point through our proxy
    if (headers.location) {
      try {
        const resolved = new URL(headers.location, target).href
        headers.location = '/proxy/' + encodeURIComponent(resolved)
      } catch (e) { /* ignore */ }
    }

    // strip framing/CSP headers that would block iframes
    delete headers['content-security-policy']
    delete headers['x-frame-options']
    delete headers['frame-options']

    // Set x-system-glitch marker
    headers['x-system-glitch'] = '1'

    const contentType = (headers['content-type'] || '').toLowerCase()

    if (contentType.includes('text/html')) {
      let html = await upstream.text()

      // Naive attribute rewrite: href/src absolute urls -> proxied /proxy/<encoded>
      html = html.replace(/(href|src)=("|'|)(https?:\/\/[^"'>\s]+)/gi, (m, attr, q, url) => {
        try {
          return `${attr}=${q}/proxy/${encodeURIComponent(url)}`
        } catch {
          return m
        }
      })

      // Inject small script to message parent about URL + intercept clicks
      const injection = `
<script>
  (function(){
    try {
      function report(){ window.parent.postMessage({type:'sysglitch:url', url: window.location.href}, '*') }
      report()
      window.addEventListener('popstate', report)
      window.addEventListener('hashchange', report)
      document.addEventListener('click', function(e){
        var a = e.target.closest && e.target.closest('a')
        if(!a) return
        if(a.target && a.target.toLowerCase()==='_blank') return
        var href = a.href
        if(!href) return
        e.preventDefault()
        window.parent.postMessage({type:'sysglitch:navigate', url: href}, '*')
      }, true)
    } catch(e){}
  })()
</script>
</body>`

      if (html.lastIndexOf('</body>') !== -1) {
        html = html.replace(/<\/body>/i, injection)
      } else {
        html += injection
      }

      // send HTML
      Object.entries(headers).forEach(([k, v]) => {
        if (k === 'content-type') return
        res.setHeader(k, v)
      })
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.status(upstream.status).send(html)
      return
    }

    // Non-HTML: stream the response
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v))
    res.status(upstream.status)

    // Stream binary bodies using Node stream if available
    const upstreamBody = await upstream.arrayBuffer()
    const stream = new PassThrough()
    stream.end(Buffer.from(upstreamBody))
    stream.pipe(res)
  } catch (err) {
    console.error('proxy error', err)
    res.status(502).send('System Glitch proxy error: ' + String(err.message || err))
  }
}

function sanitizeRequestHeaders(headers) {
  const out = {}
  for (const [k, v] of Object.entries(headers || {})) {
    const lk = k.toLowerCase()
    if (['host', 'connection', 'content-length'].includes(lk)) continue
    out[k] = v
  }
  return out
         }
