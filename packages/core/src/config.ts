import { z } from 'zod';
import { DateTime } from 'luxon';
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const BusinessConfig = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,60}$/), name: z.string().min(2).max(120), vertical: z.enum(['plumbing','salon','tutor','other']),
  timezone: z.string().refine(v => DateTime.now().setZone(v).isValid, 'Invalid timezone'), languages: z.array(z.string()).default(['en']),
  hours: z.record(z.string(), z.array(z.object({open:time,close:time}).refine(x=>x.open<x.close,'Closing time must follow opening time'))),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
  services: z.array(z.object({id:z.string().min(1),name:z.string().min(1),duration:z.number().int().min(5).max(480),price:z.number().min(0),description:z.string(),requiresAddress:z.boolean().default(false)})).min(1),
  resources: z.array(z.object({id:z.string().min(1),name:z.string().min(1)})).min(1), bufferMinutes:z.number().int().min(0).max(120).default(10),
  serviceArea:z.string(),policies:z.object({cancellation:z.string(),deposits:z.string()}),faqs:z.array(z.object({question:z.string(),answer:z.string()})),
  emergencyRules:z.array(z.object({keywords:z.array(z.string()),definition:z.string()})),escalationContact:z.string(),tone:z.string(),greeting:z.string(),
}).superRefine((b,ctx)=>{for(const list of [b.services,b.resources]) if(new Set(list.map(v=>v.id)).size!==list.length)ctx.addIssue({code:'custom',message:'IDs must be unique'});});
export type Business = z.infer<typeof BusinessConfig>;
export const demos: Business[] = [
  {id:'copper-pipe',name:'Copper & Cloud Plumbing',vertical:'plumbing',serviceArea:'Fictional Northbank district',services:[{id:'repair',name:'Plumbing visit',duration:60,price:85,description:'Assessment and minor repairs; parts quoted separately.',requiresAddress:true}],emergencyRules:[{keywords:['gas leak','smell gas','burst pipe','flooding'],definition:'Potential danger: leave the unsafe area and contact local emergency services.'}]},
  {id:'juniper',name:'Juniper Moon Salon',vertical:'salon',serviceArea:'Fictional Willow Quarter',services:[{id:'cut',name:'Haircut',duration:45,price:35,description:'Consultation, cut and finish.',requiresAddress:false}],emergencyRules:[{keywords:['allergic reaction','cannot breathe'],definition:'Seek immediate emergency medical assistance.'}]},
  {id:'orbit',name:'Little Orbit Maths',vertical:'tutor',serviceArea:'Online lessons',services:[{id:'lesson',name:'Maths lesson',duration:60,price:25,description:'One-to-one school maths support.',requiresAddress:false}],emergencyRules:[{keywords:['in danger','unsafe'],definition:'Contact a trusted adult and local emergency services if in immediate danger.'}]},
].map(b=>BusinessConfig.parse({...b,timezone:'Europe/London',languages:['en','hi'],hours:Object.fromEntries([1,2,3,4,5].map(d=>[d,[{open:'09:00',close:'19:00'}]])),holidays:[],resources:[{id:'primary',name:'Demo team'}],bufferMinutes:10,policies:{cancellation:'Cancel at least 24 hours before your visit.',deposits:'No deposit required.'},faqs:[{question:'Are you a real business?',answer:'This is a fictional demo business. No real services are provided.'}],escalationContact:'Demo owner inbox',tone:'Warm, concise and honest',greeting:'How can I help today?'}));
