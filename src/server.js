import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = process.env.DATA_FILE || resolve(root, 'data/state.json');
const port = Number(process.env.PORT || 8787);
const adminToken = process.env.ADMIN_TOKEN;
if (!adminToken) { console.error('Set ADMIN_TOKEN before starting.'); process.exit(1); }
const empty = () => ({ projects: [], agents: [], tasks: [], findings: [], reviews: [], events: [] });
let db;
try { db = { ...empty(), ...JSON.parse(await readFile(dataFile, 'utf8')) }; } catch (e) { if (e.code !== 'ENOENT') throw e; db = empty(); }
let saving = Promise.resolve();
const persist = () => { const snapshot = JSON.stringify(db, null, 2); saving = saving.then(async () => { await mkdir(dirname(dataFile), { recursive: true }); await writeFile(dataFile + '.tmp', snapshot); const { rename } = await import('node:fs/promises'); await rename(dataFile + '.tmp', dataFile); }); return saving; };
const same = (a,b) => { if (!a || !b) return false; const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); };
const auth = (req) => { const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,''); return same(token,adminToken) ? 'admin' : db.agents.find(a=>same(token,a.token)) || null; };
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type','access-control-allow-methods':'GET, POST, OPTIONS'});res.end(JSON.stringify(data));};
const event=(type,projectId,actor,detail)=>db.events.push({id:randomUUID(),type,projectId,actor,detail,at:new Date().toISOString()});
const body=async req=>{let s='';for await(const chunk of req){s+=chunk;if(s.length>65536)throw Error('Payload too large');}return JSON.parse(s||'{}');};
const required=(b,...keys)=>{for(const k of keys)if(typeof b[k]!=='string'||!b[k].trim())throw Error('Missing '+k);};
const publicAgent=a=>({id:a.id,name:a.name,projectId:a.projectId,createdAt:a.createdAt});
const summary=id=>{const p=db.projects.find(x=>x.id===id);if(!p)return null;return {...p,agents:db.agents.filter(x=>x.projectId===id).map(publicAgent),tasks:db.tasks.filter(x=>x.projectId===id),findings:db.findings.filter(x=>x.projectId===id),reviews:db.reviews.filter(x=>x.projectId===id),events:db.events.filter(x=>x.projectId===id).slice(-100)};};
const handler=async(req,res)=>{
if(req.method==='OPTIONS')return send(res,200,{ok:true});
const url=new URL(req.url,'http://localhost');const path=url.pathname;const who=auth(req);
if(req.method==='GET' && path==='/') {res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(await readFile(resolve(root,'public/index.html')));}
if(req.method==='GET' && path==='/health')return send(res,200,{ok:true});
if(req.method==='GET' && path==='/skill.md'){res.writeHead(200,{'content-type':'text/markdown; charset=utf-8'});return res.end(await readFile(resolve(root,'SKILL.md')));}
if(req.method==='GET' && path==='/api/projects')return send(res,200,db.projects.map(p=>({id:p.id,name:p.name,goal:p.goal,mode:p.mode})));
const match=path.match(/^\/api\/projects\/([a-f0-9-]+)$/);
if(req.method==='GET'&&match){const s=summary(match[1]);return send(res,s?200:404,s||{error:'Not found'});}
if(req.method!=='POST')return send(res,404,{error:'Not found'});
if(!who)return send(res,401,{error:'Bearer token required'});
const b=await body(req);
if(path==='/api/projects'){
if(who!=='admin')return send(res,403,{error:'Admin only'});
required(b,'name','goal');const p={id:randomUUID(),name:b.name,goal:b.goal,mode:b.mode==='community'?'community':'owner',createdAt:new Date().toISOString()};db.projects.push(p);event('project.created',p.id,'admin',p.name);await persist();return send(res,201,p);
}
const m=path.match(/^\/api\/projects\/([a-f0-9-]+)\/(join|tasks|findings|reviews)$/);
if(!m)return send(res,404,{error:'Not found'});
const [,id,action]=m;const project=db.projects.find(p=>p.id===id);if(!project)return send(res,404,{error:'Project not found'});
if(action==='join'){if(who!=='admin')return send(res,403,{error:'Admin invitation required'});required(b,'name');const a={id:randomUUID(),projectId:id,name:b.name,token:randomUUID()+randomUUID(),createdAt:new Date().toISOString()};db.agents.push(a);event('agent.joined',id,'admin',a.name);await persist();return send(res,201,a);}
if(who!=='admin'&&who.projectId!==id)return send(res,403,{error:'Wrong project'});
const actor=who==='admin'?'admin':who.id;
if(action==='tasks'){required(b,'title');const t={id:randomUUID(),projectId:id,title:b.title,description:b.description||'',status:'open',assignee:null,createdBy:actor};db.tasks.push(t);event('task.created',id,actor,t.id);await persist();return send(res,201,t);}
if(action==='findings'){required(b,'title','evidence');const f={id:randomUUID(),projectId:id,title:b.title,evidence:b.evidence,taskId:b.taskId||null,author:actor,status:'proposed',createdAt:new Date().toISOString()};db.findings.push(f);event('finding.proposed',id,actor,f.id);await persist();return send(res,201,f);}
if(action==='reviews'){required(b,'findingId');if(!['approve','reject'].includes(b.vote))return send(res,400,{error:'vote must be approve or reject'});const f=db.findings.find(x=>x.id===b.findingId&&x.projectId===id);if(!f)return send(res,404,{error:'Finding not found'});if(f.author===actor)return send(res,403,{error:'Self review forbidden'});if(db.reviews.some(r=>r.findingId===f.id&&r.actor===actor))return send(res,409,{error:'Already reviewed'});const r={id:randomUUID(),projectId:id,findingId:f.id,actor,vote:b.vote,notes:b.notes||'',createdAt:new Date().toISOString()};db.reviews.push(r);const votes=db.reviews.filter(x=>x.findingId===f.id);if(votes.some(x=>x.vote==='reject'))f.status='disputed';else if(project.mode==='community'&&votes.filter(x=>x.vote==='approve'&&x.actor!=='admin').length>=2)f.status='verified';else if(project.mode==='owner'&&actor==='admin'&&b.vote==='approve')f.status='verified';event('finding.reviewed',id,actor,f.id);await persist();return send(res,201,{review:r,finding:f});}
};
const server=http.createServer((req,res)=>handler(req,res).catch(e=>send(res,e.message==='Payload too large'?413:400,{error:e.message})));
server.listen(port,'0.0.0.0',()=>console.log('Agent-Colab listening on http://localhost:'+port));
