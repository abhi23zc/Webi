import { themes, defaults, normalize, applyTheme, avatar } from './config.js'
const $ = id => document.getElementById(id)
let config = normalize(defaults)
try { config = normalize(JSON.parse(localStorage.getItem('webi-widget-branding') || 'null') || defaults) } catch {}
let activeBot = 'default'
let mode = 'design'
let open = true
const frame = $('preview-frame')
const notice = message => { $('notice').textContent = message }
function persist() {
  try { localStorage.setItem(`webi-widget-branding:${activeBot}`, JSON.stringify(config)); $('save-state').textContent = activeBot === 'default' ? 'Saved on this browser' : 'Unsaved changes · click Save chatbot' } catch { $('save-state').textContent = 'Storage unavailable · export to save' }
}
function update() {
  applyTheme($('preview-canvas'), config)
  $('preview-canvas').dataset.position = config.position
  avatar($('brand-avatar'), config); avatar($('launcher-avatar'), config)
  $('launcher-label').textContent = config.launcher
  $('preview-launcher').setAttribute('aria-label', `${open ? 'Close' : 'Open'} ${config.name}`)
  frame.contentWindow.postMessage({ type: 'webi-config', config, mode }, location.origin)
  for (const button of $('themes').children) { const active = button.dataset.theme === config.theme; button.setAttribute('aria-pressed', String(active)); button.querySelector('.theme-check').textContent = active ? '✓' : '' }
}
function fill() {
  for (const key of ['name', 'tagline', 'welcome', 'position', 'radius', 'launcher']) $(key).value = config[key]
  $('suggestions').value = config.suggestions.join('\n')
  update()
}
for (const [key, theme] of Object.entries(themes)) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'theme-option'; button.dataset.theme = key
  button.setAttribute('aria-label', `${theme.label}: ${theme.description}`)
  const swatches = document.createElement('div'); swatches.className = 'theme-swatches'; swatches.setAttribute('aria-hidden', 'true')
  for (const color of [theme.accent, theme.bg, theme.surface]) { const swatch = document.createElement('span'); swatch.style.backgroundColor = color; swatches.append(swatch) }
  const title = document.createElement('strong'); title.textContent = theme.label
  const description = document.createElement('small'); description.textContent = theme.description
  const check = document.createElement('span'); check.className = 'theme-check'; check.setAttribute('aria-hidden', 'true')
  button.append(swatches, title, description, check)
  button.addEventListener('click', () => { config.theme = key; update(); persist() })
  $('themes').append(button)
}
$('branding-form').addEventListener('submit', event => event.preventDefault())
$('branding-form').addEventListener('input', event => {
  const id = event.target.id
  if (id === 'suggestions') config.suggestions = normalize({ ...config, suggestions: event.target.value.split('\n') }).suggestions
  else if (['name', 'tagline', 'welcome', 'position', 'radius', 'launcher'].includes(id)) config = normalize({ ...config, [id]: event.target.value })
  else return
  update(); persist()
})
$('logo-file').addEventListener('change', async event => {
  const file = event.target.files[0]
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 250 * 1024) { notice('Choose a PNG, JPG or WebP image under 250 KB.'); event.target.value = ''; return }
  const reader = new FileReader()
  reader.onload = async () => {
    const logo = normalize({ ...config, logo: reader.result }).logo
    const image = new Image(); image.src = logo
    try { await image.decode(); config.logo = logo; update(); persist(); notice('Logo updated.') } catch { notice('That file could not be read as an image.') }
  }
  reader.readAsDataURL(file)
})
$('remove-logo').addEventListener('click', () => { config.logo = ''; $('logo-file').value = ''; update(); persist(); notice('Logo removed.') })
$('reset').addEventListener('click', () => { config = normalize(defaults); fill(); persist(); notice('Default appearance restored.') })
function download(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
$('export').addEventListener('click', () => download('webi-widget-settings.json', JSON.stringify(config, null, 2), 'application/json'))
$('preview-launcher').addEventListener('click', () => { open = !open; $('preview-widget').hidden = !open; $('preview-launcher').setAttribute('aria-expanded', String(open)); $('preview-launcher').querySelector('.launcher-x').textContent = open ? '×' : '+'; update() })
function setMode(next) { mode = next; $('design-mode').setAttribute('aria-pressed', String(mode === 'design')); $('live-mode').setAttribute('aria-pressed', String(mode === 'live')); $('preview-caption').textContent = mode === 'design' ? 'Design preview · sample conversation only. Choose Test Dify to try real replies.' : 'Live chat · messages are sent to your published Dify app.'; update() }
$('design-mode').addEventListener('click', () => setMode('design'))
$('live-mode').addEventListener('click', () => setMode('live'))
frame.addEventListener('load', update)
window.addEventListener('message', event => { if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === 'webi-ready') update() })
function snippet() {
  let origin
  try { const url = new URL($('embed-origin').value); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error(); origin = url.origin } catch { $('embed-code').value = ''; $('code-notice').textContent = 'Enter a valid widget server origin, such as https://chat.yourbrand.com.'; return '' }
  // Escape HTML-sensitive characters even inside JSON to prevent a script-closing injection.
  const safeJson = JSON.stringify(config, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  const src = `${origin}/embed.js?bot=${encodeURIComponent(activeBot)}`.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const code = activeBot === 'default' ? `<script>\n  window.webiWidgetConfig = ${safeJson};\n</script>\n<script src="${src}" defer></script>` : `<script src="${src}" defer></script>`
  $('embed-code').value = code; $('code-notice').textContent = origin.includes('localhost') ? 'Local testing URL. Replace with your public HTTPS URL before publishing.' : ''
  return code
}
$('get-code').addEventListener('click', () => { $('embed-origin').value ||= location.origin; snippet(); $('embed-dialog').showModal() })
$('embed-origin').addEventListener('input', snippet)
$('embed-dialog').querySelector('.close-dialog').addEventListener('click', () => $('embed-dialog').close())
$('copy-code').addEventListener('click', async () => { const code = snippet(); if (!code) return; try { await navigator.clipboard.writeText(code); $('code-notice').textContent = 'Copied. Paste this into your website before </body>.' } catch { $('embed-code').select(); $('code-notice').textContent = 'Select and copy the code manually.' } })
$('download-code').addEventListener('click', () => { const code = snippet(); if (code) download('webi-widget-embed.html', code, 'text/html') })
fill()
fetch(`/api/status?bot=${encodeURIComponent(activeBot)}`).then(r => r.json()).then(status => { $('connection-status').textContent = status.configured ? status.mode === 'webapp' ? 'Connected through your published Dify web app. Use Test Dify for a real conversation.' : 'API key configured. Use Test Dify to verify a real conversation.' : 'Set DIFY_API_KEY or DIFY_WEBAPP_CODE in branded-widget/.env, then restart the widget server.' }).catch(() => { $('connection-status').textContent = 'Start the widget server with npm start to connect to Dify.' })

window.webiStudio = { config: () => config, select: (id, branding) => { activeBot = id; $('live-mode').disabled = !id; $('get-code').disabled = !id; $('design-mode').setAttribute('aria-pressed', 'true'); $('live-mode').setAttribute('aria-pressed', 'false'); config = normalize(branding); if (id === 'default') { try { config = normalize(JSON.parse(localStorage.getItem('webi-widget-branding:default') || localStorage.getItem('webi-widget-branding') || 'null') || branding) } catch {} } mode = 'design'; frame.src = `/widget.html?preview=1&bot=${encodeURIComponent(id || 'default')}`; fill(); $('save-state').textContent = id === 'default' ? 'Saved on this browser' : 'Save chatbot to publish changes'; } }
