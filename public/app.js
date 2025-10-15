// Client-side logic for System Glitch
// - Loads DuckDuckGo via proxy on start
// - Keeps address bar in sync using postMessage events from the proxied page (injected script)
// - When user enters a URL or presses Go, load via /proxy/<encoded url>

const PROXY_PREFIX = '/proxy/'

const addressInput = document.getElementById('address')
const viewport = document.getElementById('viewport')
const goBtn = document.getElementById('go')

// Start page: DuckDuckGo via proxy
const ddg = 'https://duckduckgo.com/'
loadTarget(ddg)

// Listen for Enter in address bar
addressInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') navigateFromInput()
})
goBtn.addEventListener('click', navigateFromInput)

function navigateFromInput(){
  let raw = addressInput.value.trim()
  if (!raw) return
  // If it looks like a plain search, send to duckduckgo search
  if (!/^https?:\/\//i.test(raw)) {
    // treat as search query; construct DuckDuckGo search URL
    const q = encodeURIComponent(raw)
    raw = `https://duckduckgo.com/?q=${q}`
  }
  loadTarget(raw)
}

function loadTarget(url) {
  // update address bar to show unproxied link
  addressInput.value = url
  // set iframe src to proxied route (encoded)
  viewport.src = PROXY_PREFIX + encodeURIComponent(url)
}

// Listen for messages from the iframe (injected script posts them)
window.addEventListener('message', (ev) => {
  // Only accept messages we expect
  try {
    const msg = ev.data
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'sysglitch:url' && msg.url) {
      // update address bar to show the real URL inside the iframe
      addressInput.value = msg.url
    } else if (msg.type === 'sysglitch:navigate' && msg.url) {
      // user clicked a link inside the iframe; load it through proxy using parent
      loadTarget(msg.url)
    }
  } catch (e) { /* ignore */ }
})

// Keep address bar clickable to re-load the current entry as proxied
addressInput.addEventListener('dblclick', () => {
  addressInput.select()
})

// Optional: expose a quick "reload" facility by pressing Ctrl+R
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
    viewport.contentWindow.location.reload()
    e.preventDefault()
  }
})
