import {test,expect} from 'vitest';import {TestWorkflowEnvironment} from '@temporalio/testing';import {Worker,Runtime,DefaultLogger} from '@temporalio/worker';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';import {mkdir,writeFile} from 'node:fs/promises';
Runtime.install({logger:new DefaultLogger('ERROR')});
test('Temporal timers, signals, retry compensation and lead cancellation',async()=>{
 let env:TestWorkflowEnvironment;let timeSkipping=true;
 try{env=await TestWorkflowEnvironment.createTimeSkipping();}catch{timeSkipping=false;env=await TestWorkflowEnvironment.createFromExistingServer({address:process.env.TEMPORAL_ADDRESS||'localhost:7233'});}
 const events:string[]=[];let attempts=0;const taskQueue=`test-${randomUUID()}`;
 const worker=await Worker.create({connection:env.nativeConnection,taskQueue,workflowsPath:fileURLToPath(new URL('../apps/worker/src/workflows.ts',import.meta.url)),activities:{reserve:async()=>({start:new Date(Date.now()+50).toISOString(),status:'booked'}),send:async(id:string,kind:string)=>{if(id==='fail'&&kind==='confirmation'){attempts++;throw Error('Synthetic failure');}events.push(`${id}:${kind}`);return true;},mark:async(_id:string,status:string)=>status,recoverLead:async()=>{events.push('lead');return 'queued';}}});
 try{await worker.runUntil(async()=>{
  const ok=await env.client.workflow.start('BookingLifecycleWorkflow',{workflowId:randomUUID(),taskQueue,args:['ok',1e8]});await ok.signal('bookingAction','confirm');expect(await ok.result()).toBe('completed');
  const fail=await env.client.workflow.execute('BookingLifecycleWorkflow',{workflowId:randomUUID(),taskQueue,args:['fail',1e8]});expect(fail).toBe('needs_attention');expect(attempts).toBe(4);
  const noShow=await env.client.workflow.execute('BookingLifecycleWorkflow',{workflowId:randomUUID(),taskQueue,args:['no-show',1e8]});expect(noShow).toBe('no_show');expect(events).toContain('no-show:follow_up');
  const lead=await env.client.workflow.start('LeadRecoveryWorkflow',{workflowId:randomUUID(),taskQueue,args:['call',1000]});await lead.signal('stopLead');expect(await lead.result()).toBe('cancelled');expect(events).not.toContain('lead');
 });await mkdir('artifacts/temporal',{recursive:true});await writeFile('artifacts/temporal/tests.json',JSON.stringify({passed:true,timeSkipping,events,confirmationFailureAttempts:attempts},null,2));}finally{await env.teardown();}
});
