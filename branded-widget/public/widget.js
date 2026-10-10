import { defaults, normalize, applyTheme, avatar } from './config.js'
import { consumeEvents } from './stream.js'
const $ = id => document.getElementById(id)
const botId = new URLSearchParams(location.search).get('bot') || 'default'
const storageKey = `webi-conversation:${botId}`
const preview = new URLSearchParams(location.search).has('preview')
let config = normalize(defaults), mode = preview ? 'design' : 'live', busy = false, controller, taskId = '', stopped = false
let conversationId = '', history = [], userId = crypto.randomUUID()
try { userId = localStorage.getItem('webi-visitor') || userId; localStorage.setItem('webi-visitor', userId); const saved = JSON.parse(localStorage.getItem(storageKey) || (botId === 'default' ? localStorage.getItem('webi-conversation') : null) || '{}'); if (Array.isArray(saved.messages)) { history = saved.messages.filter(m => ['user', 'assistant'].includes(m.role) && typeof m.text === 'string').slice(-100); conversationId = typeof saved.id === 'string' ? saved.id : '' } } catch {}
function persist() { try { localStorage.setItem(storageKey, JSON.stringify({ id: conversationId, messages: history.slice(-100) })) } catch {} }
function message(role, text) {
  const row = document.createElement('div'); row.className = `message-row ${role}`
  const label = document.createElement('div'); label.className = 'message-label'; label.textContent = role === 'user' ? 'You' : config.name
  const bubble = document.createElement('div'); bubble.className = 'message-bubble'; bubble.textContent = text
  row.append(label, bubble); $('messages').append(row)
  $('messages').scrollTop = $('messages').scrollHeight
  return bubble
}
function branding() {
  applyTheme(document.documentElement, config); avatar($('avatar'), config)
  document.title = config.name; document.querySelector('.chat').setAttribute('aria-label', config.name)
  $('chat-name').textContent = config.name; $('tagline').textContent = config.tagline
  $('messages').replaceChildren(); $('suggestions').replaceChildren()
  message('assistant', config.welcome)
  if (mode === 'design') { $('message').placeholder = 'Design preview · try Test Dify'; $('send').disabled = true; $('message').disabled = true; $('new-chat').disabled = true }
  else { for (const item of history) message(item.role, item.text); $('message').placeholder = 'Type your message…'; $('message').disabled = false; $('send').disabled = busy; $('new-chat').disabled = busy }
  for (const text of config.suggestions) { const button = document.createElement('button'); button.type = 'button'; button.className = 'suggestion'; const label = document.createElement('span'); label.textContent = text; const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', 'currentColor'); icon.setAttribute('stroke-width', '1.8'); icon.setAttribute('aria-hidden', 'true'); const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M7 17 17 7M7 7h10v10'); icon.append(path); button.append(label, icon); button.disabled = mode === 'design' || busy; button.addEventListener('click', () => { $('message').value = text; $('chat-form').requestSubmit() }); $('suggestions').append(button) }
  $('suggestions').hidden = mode === 'live' && history.length > 0
  resizeComposer()
}
let parentOrigin = ''
try { if (document.referrer) parentOrigin = new URL(document.referrer).origin } catch {}
window.addEventListener('message', event => {
  if (event.source !== window.parent || !event.data || event.data.type !== 'webi-config') return
  if (parentOrigin && event.origin !== parentOrigin) return
  // Establish a parent only through the embedding window; never accept opaque origins.
  if (!parentOrigin) { if (event.origin === 'null') return; parentOrigin = event.origin }
  if (event.data.botId && event.data.botId !== botId) { showError('Chatbot selection changed. Reload the widget before chatting.'); $('message').disabled = true; $('send').disabled = true; return }
  if (busy) return
  config = normalize(event.data.config)
  mode = preview && event.data.mode === 'design' ? 'design' : 'live'
  $('error').hidden = true; branding()
})
if (window.parent !== window) window.parent.postMessage({ type: 'webi-ready', botId }, parentOrigin || '*')
function setBusy(value) { busy = value; $('send').hidden = value; $('stop').hidden = !value; $('message').disabled = value; $('new-chat').disabled = value; resizeComposer(); for (const b of $('suggestions').children) b.disabled = value }
function showError(text) { $('error').textContent = text; $('error').hidden = false }
$('chat-form').addEventListener('submit', async event => {
  event.preventDefault()
  const query = $('message').value.trim()
  if (!query || busy || mode === 'design') return
  $('error').hidden = true; $('message').value = ''; resizeComposer(); $('suggestions').hidden = true
  message('user', query); history.push({ role: 'user', text: query })
  const bubble = message('assistant', ''); const answer = { role: 'assistant', text: '' }
  history.push(answer); setBusy(true); stopped = false; taskId = ''; controller = new AbortController()
  let ended = false
  try {
    const response = await fetch(`/api/chat?bot=${encodeURIComponent(botId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, userId, conversationId, botId }), signal: controller.signal })
    if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Could not send your message.') }
    if (response.headers.get('X-Webi-Bot-ID') !== botId) throw new Error('Chatbot routing mismatch. Reload the widget and try again.')
    if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('Dify returned an unexpected response.')
    await consumeEvents(response.body, event => {
      if (event.task_id) taskId = event.task_id
      if (event.conversation_id) conversationId = event.conversation_id
      if (event.event === 'error') throw new Error(event.message || 'Dify could not generate a reply.')
      if (['message', 'agent_message'].includes(event.event)) answer.text += event.answer || ''
      if (event.event === 'message_replace') answer.text = event.answer || ''
      if (event.event === 'message_end') ended = true
      const followReply = $('messages').scrollHeight - $('messages').scrollTop - $('messages').clientHeight < 80
      bubble.textContent = answer.text
      if (followReply) $('messages').scrollTop = $('messages').scrollHeight
    })
    if (!ended && !stopped) throw new Error('The reply was interrupted. Please try again.')
  } catch (error) { if (!stopped) showError(error.message || 'Connection lost. Please try again.') }
  finally { if (!answer.text) { bubble.closest('.message-row').remove(); history.pop() } persist(); setBusy(false); $('message').focus() }
})
$('message').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('chat-form').requestSubmit() } })
document.addEventListener('keydown', event => { if (event.key === 'Escape' && parentOrigin) window.parent.postMessage({ type: 'webi-close' }, parentOrigin) })
$('stop').addEventListener('click', async () => {
  const currentTask = taskId
  stopped = true; controller?.abort()
  if (currentTask) { try { const response = await fetch(`/api/stop?bot=${encodeURIComponent(botId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: currentTask, userId, botId }) }); if (!response.ok) showError('Reply display stopped. Dify could not confirm cancellation.') } catch { showError('Reply display stopped. Dify could not confirm cancellation.') } }
})
$('new-chat').addEventListener('click', () => { if (busy) return; history = []; conversationId = ''; persist(); $('error').hidden = true; branding(); $('message').focus() })
branding()

function resizeComposer() { const input = $('message'); input.style.height = '44px'; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; $('send').disabled = busy || mode === 'design' || !input.value.trim() }
$('message').addEventListener('input', resizeComposer)
$('close-chat').hidden = window.parent === window || preview
$('close-chat').addEventListener('click', () => { if (parentOrigin) window.parent.postMessage({ type: 'webi-close' }, parentOrigin) })
resizeComposer()

if (!preview && botId !== 'default') { try { const response = await fetch(`/api/bot?bot=${encodeURIComponent(botId)}`); const data = await response.json(); if (!response.ok) throw Error(data.error); config = normalize(data.branding); branding() } catch (e) { showError(e.message); $('message').disabled = true; $('send').disabled = true } }
