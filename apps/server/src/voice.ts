import type {Store} from '../../../packages/core/src/store.js';
export class Voice {
 private models:any[]=[];private voiceId='';private queue=Promise.resolve();
 constructor(private store:Store){}
 get enabled(){return !!process.env.ELEVENLABS_API_KEY;}
 private async request(path:string,init:RequestInit={}){const response=await fetch(`https://api.elevenlabs.io/v1/${path}`,{...init,headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY!,...init.headers},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`Voice provider unavailable (${response.status})`);return response;}
 async discover(){if(!this.enabled)throw Error('ELEVENLABS_API_KEY missing');this.models=await(await this.request('models')).json() as any[];const voices=await(await this.request('voices')).json() as any;this.voiceId=process.env.ELEVENLABS_VOICE_ID||voices.voices?.find((v:any)=>v.category==='premade')?.voice_id||'';if(!this.voiceId)throw Error('No library voice available');return {models:this.models.map(m=>({id:m.model_id,tts:m.can_do_text_to_speech,stt:m.can_do_speech_to_text})),voiceId:this.voiceId};}
 async transcribe(audio:Blob,duration:number){if(!this.models.length)await this.discover();const model=this.models.find(m=>m.can_do_speech_to_text||/scribe/.test(m.model_id));if(!model)throw Error('No speech-to-text model advertised');const form=new FormData();form.append('model_id',model.model_id);form.append('file',audio,'turn.webm');const start=performance.now();const body=await(await this.request('speech-to-text',{method:'POST',body:form})).json() as {text:string};await this.store.db.collection('usage').updateOne({kind:'voice'},{$inc:{seconds:duration}},{upsert:true});return {text:body.text,ms:performance.now()-start};}
 async *speak(text:string){
  if(!this.models.length)await this.discover();const model=this.models.find(m=>m.can_do_text_to_speech);if(!model)throw Error('No TTS model advertised');
  const before=this.queue;let release!:()=>void;this.queue=new Promise(r=>release=r);await before;
  try{const usage=await this.store.db.collection('usage').findOne({kind:'voice'});const budget=Number(process.env.ELEVENLABS_CHAR_BUDGET||150000);if((usage?.characters||0)+text.length>budget)throw Error('Voice budget exhausted');await this.store.db.collection('usage').updateOne({kind:'voice'},{$inc:{characters:text.length}},{upsert:true});}finally{release();}
  const response=await this.request(`text-to-speech/${encodeURIComponent(this.voiceId)}/stream`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,model_id:model.model_id})});if(!response.body)throw Error('No audio');for await(const chunk of response.body as any as AsyncIterable<Uint8Array>)yield chunk;
 }
}
