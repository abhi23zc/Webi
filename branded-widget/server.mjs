import { management } from './management.mjs'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'public')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)) }
async function readJson(req) {
  let body = ''
  for await (const chunk of req) { body += chunk; if (body.length > 16000) throw new Error('Request is too large.') }
  return JSON.parse(body)
}
export function createWidgetServer(options = {}) {
  const key = options.key ?? process.env.DIFY_API_KEY
  const webappCode = options.webappCode ?? process.env.DIFY_WEBAPP_CODE
  const useWebapp = Boolean(webappCode && !key)
  const base = (options.base ?? process.env.DIFY_API_URL ?? `http://localhost/${useWebapp ? 'api' : 'v1'}`).replace(/\/$/, '')
  const origin = options.origin ?? process.env.PUBLIC_ORIGIN ?? 'http://localhost:3100'
  const inputs = JSON.parse(options.inputs ?? process.env.DIFY_INPUTS_JSON ?? '{}')
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) throw new Error('DIFY_INPUTS_JSON must be an object.')
  const manager = management({ file: options.storeFile ?? process.env.BOTS_FILE ?? resolve(dirname(root), 'data/bots.json'), password: options.password ?? process.env.STUDIO_PASSWORD, origin, fallback: { key, webappCode, base, inputs } })
  const windows = new Map()
  const passports = new Map()
  async function getPassport(userId, signal, bot, refresh = false) {
    const { base, webappCode } = bot
    const passportId = `${bot.id}:${base}:${webappCode}:${userId}`
    const now = Date.now()
    for (const [id, entry] of passports) if (now > entry.until) passports.delete(id)
    const saved = passports.get(passportId)
    if (saved && !refresh) return saved.token
    const response = await fetch(`${base}/passport?user_id=${encodeURIComponent(userId)}`, { headers: { 'X-App-Code': webappCode }, signal })
    if (!response.ok) throw new Error('Published web-app access is unavailable.')
    const data = await response.json()
    if (typeof data.access_token !== 'string') throw new Error('Dify did not return a web-app passport.')
    if (passports.size >= 10000) passports.delete(passports.keys().next().value)
    passports.set(passportId, { token: data.access_token, until: now + 5 * 60000 })
    return data.access_token
  }
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    const url = new URL(req.url, origin)
    const path = url.pathname
    try {
      if (await manager.handle(req, res, url)) return
      const botId = url.searchParams.get('bot') || 'default'
      const bot = (await manager.bots()).find(b => b.id === botId)
      if ((path === '/api/bot' || path === '/api/chat' || path === '/api/stop' || path === '/api/status') && !bot) return json(res, 404, { error: 'Chatbot not found.' })
      const { key, webappCode, base, inputs } = bot || {}
      const useWebapp = Boolean(webappCode && !key)
      if (path === '/api/bot' && req.method === 'GET') { res.setHeader('Access-Control-Allow-Origin', '*'); return json(res, 200, { id: bot.id, branding: bot.branding }) }
      if (path === '/api/status' && req.method === 'GET') return json(res, 200, { configured: Boolean(key || webappCode), mode: useWebapp ? 'webapp' : 'service-api' })
      if (path === '/api/chat' || path === '/api/stop') {
        if (req.method !== 'POST') return json(res, 405, { error: 'Use POST.' })
        if (req.headers.origin !== origin) return json(res, 403, { error: 'Request origin is not allowed.' })
        if (!key && !webappCode) return json(res, 503, { error: 'The chatbot is not connected yet. Add DIFY_API_KEY or DIFY_WEBAPP_CODE to the server .env file.' })
        let data
        try { data = await readJson(req) } catch { return json(res, 400, { error: 'Invalid request body.' }) }
        if (data.botId && data.botId !== botId) return json(res, 409, { error: 'Chatbot routing mismatch. Reload the widget.' })
        if (!uuid.test(data.userId ?? '')) return json(res, 400, { error: 'Invalid visitor ID.' })
        if (path === '/api/chat' && (typeof data.query !== 'string' || !data.query.trim() || data.query.length > 4000 || (data.conversationId && !uuid.test(data.conversationId)))) return json(res, 400, { error: 'Enter a message up to 4,000 characters.' })
        if (path === '/api/stop' && !uuid.test(data.taskId ?? '')) return json(res, 400, { error: 'Invalid task ID.' })
        // Bound rate-limit memory and key by network address (never trust client forwarded headers).
        const now = Date.now()
        for (const [id, entry] of windows) if (now > entry.until) windows.delete(id)
        const id = req.socket.remoteAddress
        const entry = windows.get(id) ?? { count: 0, until: now + 60000 }
        if (++entry.count > 30 || windows.size >= 10000) return json(res, 429, { error: 'Too many requests. Please try again in a minute.' })
        windows.set(id, entry)
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 180000)
        res.on('close', () => controller.abort())
        try {
          const stop = path === '/api/stop'
          const headers = { 'Content-Type': 'application/json' }
          if (useWebapp) { headers['X-App-Code'] = webappCode; headers['X-App-Passport'] = await getPassport(data.userId, controller.signal, bot) }
          else headers.Authorization = `Bearer ${key}`
          const payload = stop ? {} : { query: data.query.trim(), inputs, response_mode: 'streaming', conversation_id: data.conversationId || null }
          if (!useWebapp) { payload.user = data.userId; if (!stop) payload.conversation_id ||= '' }
          const requestUpstream = () => fetch(`${base}/chat-messages${stop ? `/${encodeURIComponent(data.taskId)}/stop` : ''}`, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal })
          let upstream = await requestUpstream()
          if (useWebapp && upstream.status === 401) { await upstream.body?.cancel(); headers['X-App-Passport'] = await getPassport(data.userId, controller.signal, bot, true); upstream = await requestUpstream() }
          if (!upstream.ok) { await upstream.body?.cancel(); return json(res, upstream.status, { error: upstream.status === 401 ? 'Dify rejected the API key. Check your server configuration.' : `Dify could not complete the request (${upstream.status}). Check the published Chatflow and its required inputs.` }) }
          res.setHeader('X-Webi-Bot-ID', botId)
          res.writeHead(200, { 'Content-Type': stop ? 'application/json' : 'text/event-stream', 'Cache-Control': 'no-cache, no-store', 'X-Accel-Buffering': 'no' })
          await pipeline(Readable.fromWeb(upstream.body), res)
        } catch { if (!res.headersSent && !res.destroyed) json(res, 502, { error: 'Unable to reach Dify. Check DIFY_API_URL and published web-app access, then try again.' }); else res.end() }
        finally { clearTimeout(timeout) }
        return
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' })
      const files = new Set(['index.html', 'builder.js', 'builder.css', 'widget.html', 'widget.js', 'widget.css', 'config.js', 'stream.js', 'embed.js', 'demo.html', 'manage.js', 'login.html'])
      const name = path === '/' ? 'index.html' : path.slice(1)
      if (!files.has(name)) return json(res, 404, { error: 'Not found.' })
      if (name === 'index.html' && !manager.auth(req)) { res.writeHead(302, { Location: '/login.html' }); return res.end() }
      if (name === 'index.html' || name === 'login.html') res.setHeader('X-Frame-Options', 'DENY')
      const file = await readFile(resolve(root, name))
      const ext = name.slice(name.lastIndexOf('.'))
      // Public modules are imported by the launcher on a different website origin.
      // This header is deliberately limited to static assets, never the API.
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.writeHead(200, { 'Content-Type': `${mime[ext]}; charset=utf-8`, 'Cache-Control': 'no-cache' })
      res.end(req.method === 'HEAD' ? undefined : file)
    } catch { if (!res.headersSent) json(res, 500, { error: 'The widget server encountered a problem.' }); else res.end() }
  })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3100)
  createWidgetServer().listen(port, '0.0.0.0', () => console.log(`Widget studio: http://localhost:${port}`))
}
