import { normalize, defaults } from './config.js'
const $ = id => document.getElementById(id)
let bots = [], selected = 'default'
async function request(path, options) { const r = await fetch(path, options); const data = await r.json(); if (r.status === 401) { location.href = '/login.html'; throw Error('Sign in required.') } if (!r.ok) throw Error(data.error); return data }
function select(bot) {
  selected = bot.id; $('bot-id').value = bot.id; $('bot-id').disabled = bots.some(b => b.id === selected)
  $('bot-base').value = bot.base || ''; $('bot-mode').value = bot.mode || 'service-api'; $('bot-key').value = ''; $('bot-code').value = bot.webappCode || ''; $('bot-inputs').value = JSON.stringify(bot.inputs || {}, null, 2)
  $('bot-key').placeholder = bot.configured && bot.mode === 'service-api' ? 'Saved key · leave blank to keep' : 'app-…'
  $('bot-connection').hidden = selected === 'default'; $('save-bot').disabled = selected === 'default'
  window.webiStudio.select(selected, bot.branding || defaults)
  $('connection-status').textContent = bot.configured ? 'Connection configured. Choose Test Dify to verify a real conversation.' : 'Add this chatbot’s Dify connection and save before testing.'
  $('manager-notice').textContent = selected === 'default' ? 'Existing chatbot: connection uses server .env; branding remains in your embed code.' : 'Edit branding below, then Save chatbot to publish it.'
}
async function reload(id = selected) {
  bots = (await request('/api/admin/bots')).bots; $('bot-select').replaceChildren()
  for (const b of bots) { const o = document.createElement('option'); o.value = b.id; o.textContent = `${b.branding.name} (${b.id})`; $('bot-select').append(o) }
  $('bot-select').value = id; select(bots.find(b => b.id === id) || bots[0])
}
$('bot-select').addEventListener('change', () => select(bots.find(b => b.id === $('bot-select').value)))
$('add-bot').addEventListener('click', () => { const o = document.createElement('option'); o.value = ''; o.textContent = 'New chatbot'; $('bot-select').append(o); $('bot-select').value = ''; select({ id: '', branding: normalize({ ...defaults, name: 'New assistant', tagline: 'Here to help.', welcome: 'Welcome. How can I help you today?', launcher: 'Chat with us', suggestions: ['How can you help?', 'Tell me more', 'Get started'] }) }); $('bot-id').focus() })
$('save-bot').addEventListener('click', async () => {
  $('save-bot').disabled = true
  try { const data = { id: $('bot-id').value.trim(), base: $('bot-base').value.trim(), mode: $('bot-mode').value, key: $('bot-key').value.trim(), webappCode: $('bot-code').value.trim(), inputs: JSON.parse($('bot-inputs').value), branding: window.webiStudio.config() }; await request('/api/admin/bots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); await reload(data.id); $('manager-notice').textContent = 'Chatbot saved. Its embed code is ready; use Test Dify to verify the connection.' } catch(e) { $('manager-notice').textContent = e.message } finally { $('save-bot').disabled = selected === 'default' }
})
$('logout').addEventListener('click', async () => { await request('/api/admin/logout', {method:'POST'}); location.href='/login.html' })
try { await reload(new URLSearchParams(location.search).get('bot') || 'default') } catch(e) { $('manager-notice').textContent=e.message }
