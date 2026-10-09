import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Colab } from '../packages/core/src/service.js';
const [source,target]=process.argv.slice(2);if(!source||!target)throw Error('Usage: npm run migrate -- legacy-state.json destination.sqlite');
const legacy=JSON.parse(readFileSync(source,'utf8'));const c=new Colab(target,process.env.ADMIN_TOKEN||randomUUID());
if((c.db.prepare('SELECT count(*) n FROM projects').get() as any).n)throw Error('Destination must be empty; original JSON is never modified');
const admin={credentialId:'migration',participantId:'admin',admin:true};
c.db.transaction(()=>{
 const participantMap=new Map<string,string>();
 for(const p of legacy.projects||[]){const ownerId=randomUUID();c.db.prepare('INSERT INTO participants VALUES(?,?)').run(ownerId,JSON.stringify({id:ownerId,name:'Legacy owner'}));c.db.prepare('INSERT INTO projects VALUES(?,?,?)').run(p.id,ownerId,JSON.stringify({...p,ownerId,public:false,threshold:2,summary:'Imported legacy project; review identity and reissue credentials',stage:'Imported'}));c.db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(p.id,ownerId,'owner');
 for(const a of (legacy.agents||[]).filter((a:any)=>a.projectId===p.id)){const participantId=randomUUID();participantMap.set(a.id,participantId);c.db.prepare('INSERT INTO participants VALUES(?,?)').run(participantId,JSON.stringify({id:participantId,name:a.name,identityUnverified:true}));c.db.prepare('INSERT INTO agents VALUES(?,?,?)').run(a.id,participantId,JSON.stringify({id:a.id,participantId,name:a.name,harness:'legacy',createdAt:a.createdAt,lastActive:null}));c.db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(p.id,participantId,'contributor');}
 for(const t of (legacy.tasks||[]).filter((t:any)=>t.projectId===p.id))c.db.prepare('INSERT INTO tasks VALUES(?,?,?)').run(t.id,p.id,JSON.stringify({...t,status:'open',assignee:null,dependencies:[],kind:'research'}));
 for(const f of (legacy.findings||[]).filter((f:any)=>f.projectId===p.id)){const author=participantMap.get(f.author)||ownerId;const item={...f,author,agentId:f.author==='admin'?undefined:f.author,legacyStatus:f.status,status:'proposed',recognition:'pending',reproduction:'unverified',evidence:[{description:f.evidence}],method:'Legacy import',summary:f.title,direction:'Legacy',reproductionSteps:'See legacy evidence'};c.db.prepare('INSERT INTO findings VALUES(?,?,?,?)').run(f.id,p.id,author,JSON.stringify(item));c.db.prepare('INSERT INTO evidence VALUES(?,?,?)').run(randomUUID(),f.id,JSON.stringify(item.evidence[0]));}
 for(const e of (legacy.events||[]).filter((e:any)=>e.projectId===p.id))c.db.prepare('INSERT INTO events(id,project_id,data) VALUES(?,?,?)').run(e.id,p.id,JSON.stringify(e));
 // Historical reviews are retained as audit data, not counted as independent votes.
 c.event(p.id,admin,'legacy.imported',{reviews:(legacy.reviews||[]).filter((r:any)=>r.projectId===p.id),credentialsInvalidated:true,identityReconciliationRequired:true});
 }
}).immediate();c.close();console.log('Imported into SQLite; all legacy tokens invalidated. Reconcile participants before issuing credentials.');
