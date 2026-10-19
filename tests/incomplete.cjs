const assert=require('node:assert/strict');require('../ai.js');
const complete=payload=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(payload)}]}]});
const cutoff=request=>({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{output_tokens:request.max_output_tokens,output_tokens_details:{reasoning_tokens:request.max_output_tokens}}});
(async()=>{
 let attempts=0,budgets=[],progress=[];
 const fetcher=async(url,options)=>{const request=JSON.parse(options.body);assert.equal(request.reasoning.effort,'low');assert.equal(request.model,'gpt-6-luna');assert.equal(request.store,false);budgets.push(request.max_output_tokens);attempts++;return{ok:true,json:async()=>attempts===1?cutoff(request):complete({keywords:[{term:'Python',evidence:'Python'}]})};};
 const result=await TailorAI.keywords('sk-test','Use Python',fetcher,{onProgress:m=>progress.push(m)});assert.equal(result[0].term,'Python');assert.equal(attempts,2);assert(budgets[1]>budgets[0]);assert.equal(progress.length,1);
 let plans=0;const suggestions=await TailorAI.suggest('sk-test','Use SQL',[{id:'s1',text:'React'}],['SQL'],async(url,options)=>{plans++;return{ok:true,json:async()=>plans===1?cutoff(JSON.parse(options.body)):complete({replacements:[{slotId:'s1',replacement:'SQL'}]})};});assert.equal(plans,2);assert.equal(suggestions[0].replacement,'SQL');
 let repeated=0;await assert.rejects(()=>TailorAI.keywords('sk-test','Python',async(url,options)=>{repeated++;return{ok:true,json:async()=>cutoff(JSON.parse(options.body))};}),/response limit even after retrying/);assert.equal(repeated,2);assert.equal(TailorAI.lastRequest.incompleteReason,'max_output_tokens');assert.equal(TailorAI.lastRequest.attempts,2);
 for(const reason of ['content_filter',undefined]){let count=0;await assert.rejects(()=>TailorAI.keywords('sk-test','Python',async()=>{count++;return{ok:true,json:async()=>({status:'incomplete',incomplete_details:{reason}})};}),reason?'content filtering':/incomplete/);assert.equal(count,1,'only output-limit cutoffs are retried');}
 assert(!JSON.stringify(TailorAI.lastRequest).includes('sk-test'));
 console.log('PASS reasoning-budget recovery for extraction and planning, exactly one larger retry, progress, reason-specific errors and safe diagnostics');
})().catch(e=>{console.error(e);process.exit(1)});
