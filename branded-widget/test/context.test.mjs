import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createWidgetServer } from '../server.mjs'
const user='00000000-0000-4000-8000-000000000001', conversation='00000000-0000-4000-8000-000000000002', answer='00000000-0000-4000-8000-000000000003'
async function listen(s) {await new Promise(r=>s.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${s.address().port}`}
async function close(s) {s.closeAllConnections();await new Promise(r=>s.close(r))}
test('Web App follow-up forwards parent answer ID for booking confirmation',async()=>{
 const calls=[]
 const dify=createServer(async(req,res)=>{
  if(req.url.startsWith('/api/passport')) {res.setHeader('Content-Type','application/json');return res.end('{"access_token":"test-passport"}')}
  let raw='';for await(const c of req)raw+=c;const data=JSON.parse(raw);calls.push(data)
  const text=data.query==='yes' && data.parent_message_id===answer && data.conversation_id===conversation ? 'Demo confirmed in simulation' : 'Please confirm the demo details'
  res.setHeader('Content-Type','text/event-stream');res.end(`data: ${JSON.stringify({event:'message',id:answer,conversation_id:conversation,answer:text})}\n\ndata: ${JSON.stringify({event:'message_end',id:answer,conversation_id:conversation})}\n\n`)
 })
 const base=await listen(dify),server=createWidgetServer({base:base+'/api',key:'',webappCode:'test-code',origin:'http://widget.test'}),url=await listen(server)
 const send=data=>fetch(url+'/api/chat',{method:'POST',headers:{Origin:'http://widget.test','Content-Type':'application/json'},body:JSON.stringify({userId:user,...data})})
 try{
  const first=await send({query:'Book a demo with test details'});assert.equal(first.status,200);await first.text()
  const second=await send({query:'yes',conversationId:conversation,parentMessageId:answer});assert.equal(second.status,200);assert.match(await second.text(),/Demo confirmed in simulation/)
  assert.equal(calls[0].parent_message_id,null);assert.equal(calls[1].parent_message_id,answer)
  assert.equal((await send({query:'yes',conversationId:conversation,parentMessageId:'bad'})).status,400)
 }finally{await close(server);await close(dify)}
})
