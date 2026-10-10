import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { normalize } from './public/config.js'
export function management({ file, password, origin, fallback }) {
  const sessions = new Map(), attempts = new Map()
  const salt = randomBytes(16), expected = password ? scryptSync(password, salt, 32) : null
  let queue = Promise.resolve()
  const read = async () => { try { return JSON.parse(await readFile(file, 'utf8')) } catch (e) { if (e.code === 'ENOENT') return []; throw e } }
  const bots = async () => [{ ...fallback, id: 'default', branding: normalize(fallback.branding) }, ...await read()]
  const safe = b => ({ id: b.id, branding: b.branding, base: b.base, mode: b.key ? 'service-api' : 'webapp', configured: Boolean(b.key || b.webappCode), webappCode: b.webappCode || '', inputs: b.inputs })
  const reply = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
  const auth = req => { const token = /(?:^|;\s*)webi_session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1]; const entry = sessions.get(token); if (!entry || entry < Date.now()) { sessions.delete(token); return false } return true }
  const body = async req => { let data = ''; for await (const c of req) { data += c; if (data.length > 400000) throw Error('Request too large.') } return JSON.parse(data) }
  async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/admin/')) return false
    if (!password) { reply(res, 503, { error: 'Set STUDIO_PASSWORD on the server and restart to enable chatbot management.' }); return true }
    if (req.method !== 'GET' && req.headers.origin !== origin) { reply(res, 403, { error: 'Request origin is not allowed.' }); return true }
    if (url.pathname === '/api/admin/login' && req.method === 'POST') {
      const now = Date.now(), ip = req.socket.remoteAddress
      for (const [k,v] of attempts) if (v.until < now) attempts.delete(k)
      const attempt = attempts.get(ip) || { count: 0, until: now + 900000 }; attempts.set(ip, attempt)
      if (++attempt.count > 10 || attempts.size > 10000) { reply(res, 429, { error: 'Too many login attempts. Try again in 15 minutes.' }); return true }
      const data = await body(req)
      if (typeof data.password !== 'string' || data.password.length > 1024 || !timingSafeEqual(scryptSync(data.password, salt, 32), expected)) { reply(res, 401, { error: 'Incorrect password.' }); return true }
      for (const [k,v] of sessions) if (v < now) sessions.delete(k)
      if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value)
      const token = randomBytes(32).toString('hex'); sessions.set(token, now + 8 * 3600000)
      res.setHeader('Set-Cookie', `webi_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${origin.startsWith('https:') ? '; Secure' : ''}`)
      reply(res, 200, { ok: true }); return true
    }
    if (!auth(req)) { reply(res, 401, { error: 'Sign in to manage chatbots.' }); return true }
    if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
      const token = /webi_session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1]; sessions.delete(token)
      res.setHeader('Set-Cookie', 'webi_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); reply(res, 200, { ok: true }); return true
    }
    if (url.pathname === '/api/admin/bots' && req.method === 'GET') { reply(res, 200, { bots: (await bots()).map(safe) }); return true }
    if (url.pathname === '/api/admin/bots' && req.method === 'POST') {
      const data = await body(req)
      if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(data.id || '') || data.id === 'default') { reply(res, 400, { error: 'Use a unique bot ID with lowercase letters, numbers and hyphens. The default bot uses .env settings.' }); return true }
      let endpoint; try { endpoint = new URL(data.base); if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Error() } catch { reply(res, 400, { error: 'Enter a valid Dify API endpoint.' }); return true }
      if (!data.inputs || typeof data.inputs !== 'object' || Array.isArray(data.inputs)) { reply(res, 400, { error: 'Inputs must be a JSON object.' }); return true }
      const task = queue.then(async () => {
        const list = await read(), old = list.find(b => b.id === data.id)
        const key = data.mode === 'service-api' ? (data.key || old?.key || '') : ''
        const webappCode = data.mode === 'webapp' ? String(data.webappCode || '').trim() : ''
        if (!key && !webappCode) throw Error('Provide an API key or published Web App code.')
        if (webappCode && !/^[a-zA-Z0-9_-]{1,200}$/.test(webappCode)) throw Error('Enter only the Web App code, not its full URL.')
        const bot = { id: data.id, base: endpoint.href.replace(/\/$/, ''), key, webappCode, inputs: data.inputs, branding: normalize(data.branding) }
        const next = [...list.filter(b => b.id !== bot.id), bot]; if (next.length > 100) throw Error('Maximum 100 chatbots.')
        await mkdir(dirname(file), { recursive: true }); await writeFile(`${file}.tmp`, JSON.stringify(next), { mode: 0o600 }); await rename(`${file}.tmp`, file); return bot
      }); queue = task.catch(() => {})
      try { reply(res, 200, { bot: safe(await task) }) } catch (e) { reply(res, 400, { error: e.message }) } return true
    }
    reply(res, 404, { error: 'Not found.' }); return true
  }
  return { bots, handle, auth }
}
