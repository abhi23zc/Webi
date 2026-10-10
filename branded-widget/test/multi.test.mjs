import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { createWidgetServer } from '../server.mjs'
async function listen(s) { await new Promise(r => s.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${s.address().port}` }
async function close(s) { s.closeAllConnections(); await new Promise(r => s.close(r)) }
test('authenticated bot management persists connections and isolates routing without exposing keys', async () => {
 const dir=await mkdtemp(join(tmpdir(),'webi-bots-')), file=join(dir,'bots.json'), seen=[]
 const upstream=createServer(async(req,res)=>{seen.push(req.headers.authorization);res.setHeader('Content-Type','text/event-stream');res.end('data: {"event":"message_end"}\n\n')})
 const base=await listen(upstream), options={storeFile:file,password:'test-only-long-password',origin:'http://widget.test',key:''}
 const server=createWidgetServer(options), url=await listen(server)
 const send=(path,data,cookie='')=>fetch(url+path,{method:'POST',headers:{Origin:options.origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)})
 try {
 assert.equal((await fetch(url+'/api/admin/bots')).status,401)
 assert.equal((await fetch(url+'/')).status,200) // fetch follows redirect to public login
 assert.equal((await send('/api/admin/login',{password:'wrong'})).status,401)
 const login=await send('/api/admin/login',{password:options.password}), cookie=login.headers.get('set-cookie').split(';')[0]
 for(const id of ['sales','support']) { const r=await send('/api/admin/bots',{id,base:base+'/v1',mode:'service-api',key:'secret-'+id,inputs:{},branding:{name:id}},cookie);assert.equal(r.status,200);assert.equal((await r.text()).includes('secret-'),false) }
 const list=await fetch(url+'/api/admin/bots',{headers:{Cookie:cookie}}); assert.equal((await list.text()).includes('secret-'),false)
 const publicBot=await fetch(url+'/api/bot?bot=sales');assert.equal(publicBot.headers.get('access-control-allow-origin'),'*');assert.equal((await publicBot.text()).includes('secret-'),false)
 for(const bot of ['sales','support']) { const r=await send('/api/chat?bot='+bot,{query:'hello',userId:'00000000-0000-4000-8000-000000000001'});assert.equal(r.status,200);await r.text() }
 assert.deepEqual(seen,['Bearer secret-sales','Bearer secret-support'])
 assert.equal((await send('/api/chat?bot=missing',{})).status,404)
 const restart=createWidgetServer(options), next=await listen(restart);try{assert.equal((await (await fetch(next+'/api/bot?bot=sales')).json()).branding.name,'sales')}finally{await close(restart)}
 const csrf=await fetch(url+'/api/admin/bots',{method:'POST',headers:{Origin:'http://evil.test',Cookie:cookie},body:'{}'});assert.equal(csrf.status,403)
 await send('/api/admin/logout',{},cookie);assert.equal((await fetch(url+'/api/admin/bots',{headers:{Cookie:cookie}})).status,401)
 } finally {await close(server);await close(upstream);await rm(dir,{recursive:true,force:true})}
})
