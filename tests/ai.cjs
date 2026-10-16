const assert=require('node:assert/strict');require('../ai.js');
(async()=>{
 let payload;
 const mock=data=>async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(opts.body);assert.equal(payload.model,'gpt-6-luna');assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);return{ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(data)}]}]})};};
 const jd='We use Python and SQL to analyze data.';
 const keywords=await TailorAI.keywords('sk-test',jd,mock({keywords:[{term:'Python',evidence:'“Python”'},{term:'Madeup',evidence:'not in posting'}]}));
 assert.equal(keywords.length,1);assert.equal(keywords[0].term,'Python');
 const replacements=await TailorAI.suggest('sk-test',jd,[{id:'s1',text:'MATLAB',maxCharacters:6,maxWidth:30}],['Python'],mock({replacements:[{slotId:'s1',replacement:'Python',keyword:'Python',reason:'Required'},{slotId:'invented',replacement:'Python',keyword:'Python',reason:''},{slotId:'s1',replacement:'Fake',keyword:'Python',reason:''}]}));assert.equal(replacements.length,1);
 await assert.rejects(()=>TailorAI.call('', '', {}, {},mock({})),/API key/);
 await assert.rejects(()=>TailorAI.keywords('sk-test',jd,async()=>({ok:false,status:401,json:async()=>({})})),/key was rejected/);
 await assert.rejects(()=>TailorAI.keywords('sk-test',jd,async()=>({ok:true,json:async()=>({status:'incomplete'})})),/incomplete/);
 console.log('PASS Luna request contract, grounded keywords, approved replacement filtering, missing key, API errors, incomplete responses');
})().catch(e=>{console.error(e);process.exit(1)});
