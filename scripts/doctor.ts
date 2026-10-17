import {config} from 'dotenv';config({path:'.env.local',quiet:true});
import { mkdir,writeFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';
import { Connection } from '@temporalio/client';
export async function doctor(){
  const rows:{service:string;status:string;detail:string}[]=[];
  async function check(service:string,key:string,fn:()=>Promise<unknown>){if(!process.env[key]){rows.push({service,status:'MISSING',detail:key});return;}try{await fn();rows.push({service,status:'OK',detail:'Reachable'});}catch{rows.push({service,status:'UNREACHABLE',detail:'Check binding, network and permissions; secret values suppressed'});}}
  await check('Gemma','LLM_API_KEY',async()=>{const {GemmaClient}=await import('../packages/llm/src/index.js');const c=new GemmaClient();await c.discover();await c.complete('Reply with OK only.');});
  await check('ElevenLabs','ELEVENLABS_API_KEY',async()=>{const r=await fetch('https://api.elevenlabs.io/v1/voices',{headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY!},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();});
  await check('MongoDB','MONGODB_URI',async()=>{const c=await new MongoClient(process.env.MONGODB_URI!,{serverSelectionTimeoutMS:5000}).connect();try{await c.db().command({ping:1});}finally{await c.close();}});
  try{const c=await Connection.connect({address:process.env.TEMPORAL_ADDRESS||'localhost:7233',connectTimeout:5000,...(process.env.TEMPORAL_API_KEY?{apiKey:process.env.TEMPORAL_API_KEY,tls:true}:{})});await c.close();rows.push({service:'Temporal',status:'OK',detail:'Reachable'});}catch{rows.push({service:'Temporal',status:'UNREACHABLE',detail:'Start local Temporal server or configure TEMPORAL_ADDRESS'});}
  for(const [service,key]of [['Sentry','SENTRY_DSN'],['Owner webhook','OWNER_WEBHOOK_URL'],['DigitalOcean','DO_INFERENCE_KEY'],['Owner access','ADMIN_TOKEN']])rows.push({service,status:process.env[key]?'OK':'MISSING',detail:process.env[key]?'Present (not externally verified)':key});
  await mkdir('artifacts',{recursive:true});await writeFile('artifacts/doctor.json',JSON.stringify({at:new Date().toISOString(),checks:rows},null,2));console.table(rows);return rows;
}
if(process.argv[1]?.endsWith('doctor.ts'))await doctor();
