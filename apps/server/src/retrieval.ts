import type {Business} from '../../../packages/core/src/config.js';import type {Store} from '../../../packages/core/src/store.js';
export type Source={sourceId:string;text:string;score?:number};
export function chunks(b:Business):Source[]{return [...b.services.map(s=>({sourceId:`service:${s.id}`,text:`${s.name}: £${s.price}, ${s.duration} minutes. ${s.description}`})),...b.faqs.map((f,i)=>({sourceId:`faq:${i}`,text:`${f.question} ${f.answer}`})),{sourceId:'policy:cancellation',text:b.policies.cancellation},{sourceId:'policy:deposits',text:b.policies.deposits},{sourceId:'area',text:b.serviceArea}];}
let embedding:any;let failed=false;
export async function embed(text:string):Promise<number[]|null>{
  if(process.env.EMBEDDING_PROVIDER==='keyword'||failed)return null;
  try{if(!embedding){const {pipeline,env}=await import('@huggingface/transformers');env.cacheDir=process.env.EMBEDDING_CACHE||'/workspace/.cache/embeddings';embedding=await pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{dtype:'q8'});}const output=await embedding(text,{pooling:'mean',normalize:true});return Array.from(output.data);}catch{failed=true;return null;}
}
export async function indexKnowledge(store:Store,b:Business){
  const sources=chunks(b);for(const source of sources){const vector=await embed(source.text);await store.db.collection('knowledge').updateOne({businessId:b.id,sourceId:source.sourceId},{$set:{...source,businessId:b.id,vector,model:vector?'Xenova/all-MiniLM-L6-v2':'keyword',dimensions:vector?.length||0}},{upsert:true});}
  if(store.mode==='atlas'&&sources.length){const vector=await embed(sources[0].text);if(vector){try{await store.db.collection('knowledge').createSearchIndex({name:'knowledge_vector',type:'vectorSearch',definition:{fields:[{type:'vector',path:'vector',numDimensions:vector.length,similarity:'cosine'},{type:'filter',path:'businessId'}]}});}catch{/* Existing index or unsupported deployment: keyword retrieval remains explicit. */}}}
}
export async function retrieve(store:Store,b:Business,query:string){
  const vector=store.mode==='atlas'?await embed(query):null;
  if(vector){try{const found=await store.db.collection('knowledge').aggregate<Source>([{$vectorSearch:{index:'knowledge_vector',path:'vector',queryVector:vector,numCandidates:50,limit:4,filter:{businessId:b.id}}},{$project:{_id:0,sourceId:1,text:1,score:{$meta:'vectorSearchScore'}}}]).toArray();if(found.length)return {mode:'atlas-vector',sources:found};}catch{/* Fall back, never claim vector results. */}}
  const words=query.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];return {mode:'keyword',sources:chunks(b).map(s=>({...s,score:words.reduce((n,w)=>n+(s.text.toLowerCase().includes(w)?1:0),0)})).filter(s=>s.score>0).sort((a,b)=>b.score-a.score).slice(0,4)};
}
