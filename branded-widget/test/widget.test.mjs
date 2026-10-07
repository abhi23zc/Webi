import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createWidgetServer } from '../server.mjs'
import { normalize, safeLogo, themes } from '../public/config.js'
import { consumeEvents } from '../public/stream.js'

const userId = '00000000-0000-4000-8000-000000000001'
const conversationId = '00000000-0000-4000-8000-000000000002'
async function listen(server) { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}` }
async function close(server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
test('configuration validates presets, limits user input, and rejects executable logos', () => {
  assert.equal(Object.keys(themes).length, 8)
  assert.equal(normalize(null).name, 'Dineezy Assistant')
  assert.equal(normalize({ theme: '__proto__', position: 'elsewhere', name: 'x'.repeat(200) }).name.length, 60)
  assert.equal(normalize({ theme: '__proto__' }).theme, 'light')
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'file:///etc/passwd']) assert.equal(safeLogo(url), '')
  assert.equal(safeLogo('https://example.com/logo.png'), 'https://example.com/logo.png')
  assert.equal(normalize({ suggestions: [null, '', 'one', 'two', 'three', 'four'] }).suggestions.length, 3)
})
test('SSE parser reconstructs split UTF-8 and CRLF frames', async () => {
  const bytes = new TextEncoder().encode('data: {"event":"message","answer":"Hello 👋"}\r\n\r\ndata: {"event":"message_end"}\n\n')
  const events = []
  const stream = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close() } })
  await consumeEvents(stream, event => events.push(event))
  assert.equal(events[0].answer, 'Hello 👋')
  assert.equal(events[1].event, 'message_end')
})
test('server proxies real Dify-shaped requests and streams without exposing its key', async () => {
  let requestBody, authorization, stopPath
  const upstream = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk
    requestBody = JSON.parse(body); authorization = req.headers.authorization
    if (req.url.endsWith('/stop')) { stopPath = req.url; res.setHeader('Content-Type', 'application/json'); return res.end('{"result":"success"}') }
    res.setHeader('Content-Type', 'text/event-stream')
    res.write(`data: ${JSON.stringify({ event: 'message', answer: 'Hello', conversation_id: conversationId })}\n\n`)
    res.end('data: {"event":"message_end"}\n\n')
  })
  const base = await listen(upstream)
  const server = createWidgetServer({ base: `${base}/v1`, key: 'server-secret-test', origin: 'http://widget.test', inputs: '{"department":"sales"}' })
  const origin = await listen(server)
  try {
    const response = await fetch(`${origin}/api/chat`, { method: 'POST', headers: { Origin: 'http://widget.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'hello', userId, conversationId }) })
    const content = await response.text()
    assert.equal(response.status, 200); assert.match(content, /message_end/); assert.equal(content.includes('server-secret-test'), false)
    assert.equal(authorization, 'Bearer server-secret-test')
    assert.deepEqual(requestBody, { query: 'hello', user: userId, conversation_id: conversationId, inputs: { department: 'sales' }, response_mode: 'streaming' })
    const stop = await fetch(`${origin}/api/stop`, { method: 'POST', headers: { Origin: 'http://widget.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: conversationId, userId }) })
    assert.equal(stop.status, 200); assert.equal(stopPath, `/v1/chat-messages/${conversationId}/stop`)
    const evil = await fetch(`${origin}/api/chat`, { method: 'POST', headers: { Origin: 'http://evil.test' }, body: '{}' }); assert.equal(evil.status, 403)
    const invalid = await fetch(`${origin}/api/chat`, { method: 'POST', headers: { Origin: 'http://widget.test' }, body: JSON.stringify({ query: 'hey', userId: '../../bad' }) }); assert.equal(invalid.status, 400)
    const traversal = await fetch(`${origin}/.env`); assert.equal(traversal.status, 404)
    const module = await fetch(`${origin}/config.js`); assert.equal(module.headers.get('access-control-allow-origin'), '*')
    const status = await fetch(`${origin}/api/status`); assert.deepEqual(await status.json(), { configured: true, mode: 'service-api' }); assert.equal(status.headers.get('access-control-allow-origin'), null)
  } finally { await close(server); await close(upstream) }
})
test('missing API key returns a useful setup error', async () => {
  const server = createWidgetServer({ key: '', origin: 'http://widget.test' })
  const base = await listen(server)
  try { const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { Origin: 'http://widget.test' }, body: '{}' }); assert.equal(response.status, 503); assert.match((await response.json()).error, /DIFY_API_KEY/) } finally { await close(server) }
})
test('published web-app mode keeps passports server-side and isolates visitors', async () => {
  const sessions = [], calls = []
  const upstream = createServer(async (req, res) => {
    if (req.url.startsWith('/api/passport')) {
      const user = new URL(req.url, 'http://dify.test').searchParams.get('user_id')
      sessions.push(user); assert.equal(req.headers['x-app-code'], 'public-test-code')
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ access_token: `passport-${user}` }))
    }
    let body = ''; for await (const chunk of req) body += chunk
    calls.push({ headers: req.headers, body: JSON.parse(body) })
    res.setHeader('Content-Type', 'text/event-stream'); res.end('data: {"event":"message","answer":"Hello"}\n\ndata: {"event":"message_end"}\n\n')
  })
  const base = await listen(upstream)
  const server = createWidgetServer({ key: '', webappCode: 'public-test-code', base: `${base}/api`, origin: 'http://widget.test' })
  const origin = await listen(server)
  try {
    for (const visitor of [userId, userId, conversationId]) {
      const response = await fetch(`${origin}/api/chat`, { method: 'POST', headers: { Origin: 'http://widget.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'hi', userId: visitor }) })
      assert.equal(response.status, 200); assert.equal((await response.text()).includes('passport-'), false)
    }
    assert.deepEqual(sessions, [userId, conversationId])
    assert.equal(calls[0].headers['x-app-passport'], `passport-${userId}`)
    assert.equal(calls[2].headers['x-app-passport'], `passport-${conversationId}`)
    assert.equal(calls[0].headers.authorization, undefined)
    assert.deepEqual(calls[0].body, { query: 'hi', inputs: {}, response_mode: 'streaming', conversation_id: null })
    assert.deepEqual(await (await fetch(`${origin}/api/status`)).json(), { configured: true, mode: 'webapp' })
  } finally { await close(server); await close(upstream) }
})
