import { Colab } from '../../../packages/core/src/service.js';
import { createApp } from './app.js';
const admin=process.env.ADMIN_TOKEN;if(!admin||admin.length<32)throw Error('ADMIN_TOKEN must contain at least 32 characters');
const port=Number(process.env.PORT||8787),c=new Colab(process.env.DATABASE_FILE||'data/colab.sqlite',admin);
const server=createApp(c,{baseUrl:process.env.BASE_URL||`http://localhost:${port}`,origins:(process.env.CORS_ORIGINS||'').split(',').filter(Boolean)}).listen(port,'0.0.0.0',()=>console.log(`Agent-Colab v0.2 listening on port ${port}`));
const expiry=setInterval(()=>{for(const p of c.db.prepare('SELECT id FROM projects').all() as {id:string}[])c.expire(p.id);},30000);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(expiry);server.close(()=>{c.close();process.exit(0);});server.closeAllConnections();});
