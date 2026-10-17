const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const elements=new Map(),node=()=>({hidden:true,value:'',disabled:false,placeholder:'',textContent:'',classList:{toggle(){}},replaceChildren(){},querySelectorAll(){return []},focus(){}});
const document={body:{classList:{toggle(){}}},getElementById(id){if(!elements.has(id))elements.set(id,node());return elements.get(id)},addEventListener(){}};
let calls=0,resolveSuggestion;
const context=vm.createContext({document,location:{search:''},URLSearchParams,indexedDB:{open(){return {}}},localStorage:{getItem(){return null}},ResumeScore:{normalize:s=>s.toLowerCase(),contains(){return false}},ResumePDF:{summary:()=>[{id:'s1',text:'React',originalWidth:30}],replacement:()=>({ok:true,width:20})},TailorAI:{suggest:async(key,jd,skills,terms)=>{calls++;assert.equal(key,'sk-test');assert.deepEqual(Array.from(terms),['Python','SQL']);return new Promise(resolve=>resolveSuggestion=resolve);}}});
let source=fs.readFileSync(__dirname+'/../app.js','utf8').replace(/start\(\);\s*$/,'');vm.runInContext(source,context);
vm.runInContext("renderKeywords=()=>{};clearPlan=()=>{state.plan={};};updatePlan=()=>{};planRows=rows=>{globalThis.shown=rows;};scheduleDraft=()=>{};requireKey=async()=> 'sk-test';state.model={};state.capture={simplify:{keywords:[{term:'Python'},{term:'SQL'}]}};",context);
(async()=>{
 const action=elements.get('simplify-suggest').onclick,pending=action();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);assert(elements.get('simplify-suggest').disabled,'disabled while working');await action();assert.equal(calls,1,'double click cannot create another API request');resolveSuggestion([{slotId:'s1',replacement:'SQL'}]);await pending;
 assert.equal(context.shown[0].replacement,'SQL');assert.equal(vm.runInContext('state.source',context),'Simplify');assert(!elements.get('simplify-suggest').disabled);
 vm.runInContext("state.plan={previous:'draft'};requireKey=async()=>{throw Error('Missing API key')};",context);await action();assert.equal(calls,1);assert.equal(vm.runInContext('state.plan.previous',context),'draft','missing key preserves existing draft');
 vm.runInContext("state.capture=null;updateSimplifyActions();",context);assert(elements.get('simplify-suggest').disabled,'no captured keywords disables shortcut');
 vm.runInContext("state.capture={simplify:{keywords:[{term:'Python'}]}};requireKey=async()=>{state.revision++;return 'sk-test'};",context);await action();assert.equal(calls,1,'job change during key retrieval cancels the request');
 console.log('PASS single-click Simplify import → one Luna call → review, busy guard, missing-key draft preservation and disabled state');
})().catch(e=>{console.error(e);process.exit(1)});
