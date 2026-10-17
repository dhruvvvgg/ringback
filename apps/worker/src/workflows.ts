import {proxyActivities,defineSignal,defineQuery,setHandler,condition} from '@temporalio/workflow';
import type * as activities from './activities.js';
const a=proxyActivities<typeof activities>({startToCloseTimeout:'15 seconds',retry:{initialInterval:'100 milliseconds',backoffCoefficient:2,maximumAttempts:4}});
export const bookingSignal=defineSignal<[string]>('bookingAction');export const statusQuery=defineQuery<string>('status');export const stopLead=defineSignal('stopLead');
export async function BookingLifecycleWorkflow(appointmentId:string,scale=1){
 let status='reserving',action='';setHandler(statusQuery,()=>status);setHandler(bookingSignal,v=>{action=v;});
 const booking=await a.reserve(appointmentId);if(booking.status==='cancelled')return 'cancelled';
 try{await a.send(appointmentId,'confirmation');}catch{status='needs_attention';await a.mark(appointmentId,status);await a.send(appointmentId,'owner_attention');return status;}
 status='confirmed';await a.mark(appointmentId,status);
 const reminderWait=Math.max(0,(Date.parse(booking.start)-Date.now()-86400000)/Math.max(1,scale));
 await condition(()=>action==='cancel'||action==='reschedule',reminderWait);
 if(action==='cancel'||action==='reschedule'){status=action==='cancel'?'cancelled':'rescheduled';await a.mark(appointmentId,status);return status;}
 await a.send(appointmentId,'reminder');status='reminded';await a.mark(appointmentId,status);
 const grace=Math.max(100,(Date.parse(booking.start)+1800000-Date.now())/Math.max(1,scale));
 await condition(()=>action!=='',grace);
 status=action==='cancel'?'cancelled':action==='reschedule'?'rescheduled':action==='confirm'?'completed':'no_show';
 await a.mark(appointmentId,status);if(status==='no_show')await a.send(appointmentId,'follow_up');return status;
}
export async function LeadRecoveryWorkflow(callId:string,delay=3600000){let stopped=false;setHandler(stopLead,()=>{stopped=true;});setHandler(statusQuery,()=>stopped?'cancelled':'waiting');await condition(()=>stopped,delay);if(stopped)return 'cancelled';return a.recoverLead(callId);}
