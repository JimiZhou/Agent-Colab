import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Colab } from '../packages/core/src/service.js';
import { createApp } from '../apps/server/src/app.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const secret='test-admin-secret-at-least-32-characters';
async function fixture(){const c=new Colab(':memory:',secret);const server=createApp(c).listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${(server.address() as any).port}`;const req=async(path:string,token=secret,body?:any,key=crypto.randomUUID())=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':key})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};return {c,server,base,req,close:()=>{server.closeAllConnections();server.close();c.close();}};}
test('REST validation, read-only/cross-project scope, atomic concurrent claims, token lifecycle',async()=>{
 const f=await fixture();try{
 const p=(await f.req('/api/projects',secret,{name:'Lab',goal:'Proof'})).data;const q=(await f.req('/api/projects',secret,{name:'Other',goal:'Private'})).data;
 const invite=(name:string,role='contributor')=>f.req(`/api/projects/${p.id}/join`,secret,{name,role});
 const a=(await invite('A')).data,b=(await invite('B')).data,reader=(await invite('R','reader')).data;
 assert.equal((await f.req(`/api/projects/${q.id}`,a.token)).status,403);
 assert.equal((await fetch(f.base+`/api/projects/${p.id}`)).status,401);
 assert.equal((await f.req(`/api/projects/${p.id}/tasks`,reader.token,{title:'Blocked'})).status,403);
 const task=(await f.req(`/api/projects/${p.id}/tasks`,a.token,{title:'Race'})).data;
 const claims=await Promise.all([f.req(`/api/projects/${p.id}/tasks/${task.id}/claim`,a.token,{}),f.req(`/api/projects/${p.id}/tasks/${task.id}/claim`,b.token,{})]);assert.deepEqual(claims.map(x=>x.status).sort(),[200,409]);
 assert.equal((await f.req('/api/projects',secret,{})).status,400);
 const malformed=await fetch(f.base+'/api/projects',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json','Idempotency-Key':'malformed'},body:'{broken'});assert.equal(malformed.status,400);assert.equal((await malformed.json() as any).error.code,'VALIDATION_ERROR');
 assert.equal((await fetch(f.base+'/api/projects',{headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await fetch(f.base+'/api/projects?token=secret')).status,400);
 await f.req(`/api/projects/${p.id}/credentials/${a.credential.id}/revoke`,secret,{});assert.equal((await f.req(`/api/projects/${p.id}`,a.token)).status,401);
 }finally{f.close();}
});
test('real SDK Streamable HTTP initialize, tools, resources, permissions and full A/B/C consensus',async()=>{
 const f=await fixture();const clients:Client[]=[];try{
 const p=(await f.req('/api/projects',secret,{name:'MCP Lab',goal:'Reproduce deterministic result',mode:'community',public:true})).data;
 const agents=await Promise.all(['A','B','C'].map(async(name)=> (await f.req(`/api/projects/${p.id}/join`,secret,{name})).data));
 for(const a of agents){const client=new Client({name:a.agent.name,version:'1.0'});await client.connect(new StreamableHTTPClientTransport(new URL(f.base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+a.token}}}));clients.push(client);}
 const tools=await clients[0].listTools();assert.equal(tools.tools.length,11);
 const templates=await clients[0].listResourceTemplates();assert.equal(templates.resourceTemplates.length,5);
 const resource=await clients[0].readResource({uri:`colab://projects/${p.id}/goals`});assert.match(String('text' in resource.contents[0] ? resource.contents[0].text : ''),/deterministic/);
 const context=await clients[0].callTool({name:'get_project_context',arguments:{projectId:p.id}});assert.equal((context.structuredContent as any).result.goal,p.goal);
 const task=(await f.req(`/api/projects/${p.id}/tasks`,agents[0].token,{title:'Calculate 2+2'})).data;
 const call=async(i:number,name:string,input:any)=>clients[i].callTool({name,arguments:{projectId:p.id,idempotencyKey:crypto.randomUUID(),...input}});
 assert.equal((await call(0,'claim_task',{taskId:task.id})).isError,undefined);
 const result=await call(0,'submit_finding',{taskId:task.id,title:'2+2=4',summary:'Deterministic arithmetic',direction:'Arithmetic',method:'Integer addition',evidence:[{description:'2 + 2 === 4'}],reproduction:'Evaluate 2 + 2 with Node'});const finding=(result.structuredContent as any).result;
 assert.equal((await call(0,'submit_review',{findingId:finding.id,vote:'approve',environment:'Node',evidence:'Self report',reproduced:true})).isError,true);
 for(const i of [1,2]){assert.equal(2+2,4);const get=await clients[i].callTool({name:'get_finding',arguments:{projectId:p.id,findingId:finding.id}});assert.equal((get.structuredContent as any).result.id,finding.id);const r=await call(i,'submit_review',{findingId:finding.id,vote:'approve',environment:'Node '+process.version,evidence:'Independent assertion: 2 + 2 === 4',reproduced:true});assert.equal(r.isError,undefined);}
 const snapshot=(await f.req(`/api/projects/${p.id}`,agents[0].token)).data;assert.equal(snapshot.findings[0].status,'verified');assert.equal(snapshot.tasks[0].status,'verified');
 const chain=(await f.req(`/api/projects/${p.id}/findings/${finding.id}`,agents[0].token)).data;assert.equal(chain.reviews.length,2);
 const wrong=(await f.req('/api/projects',secret,{name:'Private',goal:'Hidden'})).data;assert.equal((await clients[0].callTool({name:'get_project_context',arguments:{projectId:wrong.id}})).isError,true);
 }finally{await Promise.all(clients.map(c=>c.close()));f.close();}
});
test('durable restart, WAL, hashed tokens, encrypted idempotency cache',()=>{
 const dir=mkdtempSync(join(tmpdir(),'colab-'));const file=join(dir,'db.sqlite');let c=new Colab(file,secret);const admin=c.authenticate(secret);const p=c.write(admin,'p','p',{},()=>c.createProject(admin,{name:'Persistent',goal:'Restart'}));const a=c.write(admin,'a','a',{},()=>c.join(admin,p.id,{name:'Agent'}));assert.equal(c.db.pragma('journal_mode',{simple:true}),'wal');const raw=JSON.stringify(c.db.prepare('SELECT * FROM credentials').all())+JSON.stringify(c.db.prepare('SELECT * FROM idempotency').all());assert.equal(raw.includes(a.token),false);c.close();c=new Colab(file,secret);assert.equal(c.context(c.authenticate(a.token),p.id).name,'Persistent');c.close();rmSync(dir,{recursive:true});
});
