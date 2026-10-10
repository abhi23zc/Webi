;(async function () {
  const script = document.currentScript
  if (!script || document.getElementById('webi-floating-widget')) return
  const origin = new URL(script.src).origin
  const { normalize, applyTheme, avatar } = await import(`${origin}/config.js`)
  if (document.getElementById('webi-floating-widget')) return
  const botId = new URL(script.src).searchParams.get('bot') || 'default'
  const response = await fetch(`${origin}/api/bot?bot=${encodeURIComponent(botId)}`)
  if (!response.ok) throw Error('Chatbot not found')
  const saved = await response.json()
  const config = normalize({ ...saved.branding, ...window.webiWidgetConfig })
  const host = document.createElement('div'); host.id = 'webi-floating-widget'
  const shadow = host.attachShadow({ mode: 'open' })
  applyTheme(host, config)
  const css = document.createElement('style')
  css.textContent = `:host{all:initial;position:fixed;${config.position}:24px;bottom:24px;z-index:2147483640;font-family:system-ui,sans-serif;color:var(--text);color-scheme:normal}*{box-sizing:border-box}button{font:inherit;cursor:pointer}button:focus-visible{outline:3px solid var(--accent);outline-offset:4px}.launcher{display:flex;align-items:center;gap:10px;background:var(--accent);color:var(--onAccent);border:0;border-radius:50px;padding:10px 15px 10px 10px;font-size:13px;box-shadow:0 8px 28px #0003}.avatar{width:34px;height:34px;border-radius:50%;overflow:hidden;display:grid;place-items:center;font-size:17px;font-weight:600;background:#ffffff20}.avatar img{width:100%;height:100%;object-fit:contain}.symbol{display:grid;place-items:center;margin-left:5px}.symbol svg{width:20px;height:20px}.panel{position:absolute;${config.position}:0;bottom:76px;width:400px;max-width:calc(100vw - 32px);height:620px;max-height:calc(100dvh - 125px);border-radius:var(--radius);background:var(--bg);box-shadow:0 20px 70px #0003;border:1px solid var(--border);overflow:hidden}.panel iframe{border:0;width:100%;height:100%;display:block}[hidden]{display:none!important}@media(max-width:480px){:host{${config.position}:16px;bottom:16px}.panel{position:fixed;inset:12px;width:calc(100vw - 24px);height:calc(100dvh - 24px);max-height:none}.launcher[aria-expanded=true]{visibility:hidden}}@media(prefers-reduced-motion:no-preference){.panel{animation:appear .2s ease}@keyframes appear{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}}`
  const panel = document.createElement('section'); panel.className = 'panel'; panel.id = 'webi-chat-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', config.name)
  const frame = document.createElement('iframe'); frame.title = config.name; frame.referrerPolicy = 'origin'; frame.allow = 'clipboard-write'; frame.src = `${origin}/widget.html?bot=${encodeURIComponent(botId)}`
  panel.append(frame)
  const button = document.createElement('button'); button.type = 'button'; button.className = 'launcher'; button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', panel.id); button.setAttribute('aria-label', `Open ${config.name}`)
  const image = document.createElement('span'); image.className = 'avatar'; image.setAttribute('aria-hidden', 'true'); avatar(image, config)
  const label = document.createElement('span'); label.textContent = config.launcher
  const symbol = document.createElement('span'); symbol.className = 'symbol'; symbol.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5Z"/></svg>'; symbol.setAttribute('aria-hidden', 'true')
  button.append(image, label, symbol)
  const sendConfig = () => frame.contentWindow.postMessage({ type: 'webi-config', config, mode: 'live' }, origin)
  frame.addEventListener('load', sendConfig)
  function toggle(value) { panel.hidden = !value; button.setAttribute('aria-expanded', String(value)); button.setAttribute('aria-label', `${value ? 'Close' : 'Open'} ${config.name}`); symbol.firstElementChild.innerHTML = value ? '<path d="m6 6 12 12M6 18 18 6"/>' : '<path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-4-.9L3 21l.9-5A9 9 0 1 1 21 12Z"/>';  if (value) frame.focus(); else button.focus() }
  button.addEventListener('click', () => toggle(panel.hidden))
  shadow.addEventListener('keydown', event => { if (event.key === 'Escape') toggle(false) })
  window.addEventListener('message', event => { if (event.origin !== origin || event.source !== frame.contentWindow) return; if (event.data?.type === 'webi-ready') sendConfig(); if (event.data?.type === 'webi-close') toggle(false) })
  shadow.append(css, panel, button)
  document.body.append(host)
})().catch(() => console.error('Webi widget could not load. Check the widget server URL and your website content security policy.'))
