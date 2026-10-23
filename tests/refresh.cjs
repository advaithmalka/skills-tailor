const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const elements=new Map(),node=()=>({hidden:true,value:'',disabled:false,textContent:'',classList:{toggle(){}},replaceChildren(){},querySelectorAll(){return []}});
const document={body:{classList:{toggle(){}}},getElementById(id){if(!elements.has(id))elements.set(id,node());return elements.get(id)},addEventListener(){}};
let requests=0,resolveCapture,reloads=0;
const context=vm.createContext({document,location:{search:'?view=sidebar',reload(){reloads++;}},URLSearchParams,indexedDB:{open(){return {}}},ResumeScore:{normalize:s=>s.toLowerCase()},chrome:{runtime:{id:'test',sendMessage:async message=>{assert.equal(message.action,'REFRESH_JOB');assert.equal(message.windowId,7);requests++;return new Promise(resolve=>resolveCapture=resolve);}}}});
vm.runInContext(fs.readFileSync(__dirname+'/../app.js','utf8').replace(/start\(\);\s*$/,''),context);
vm.runInContext("renderKeywords=()=>{};renderScore=()=>{};updatePlan=()=>{};scheduleDraft=()=>{};state.ready=true;state.windowId=7;state.selected='master';state.model={id:'master-model'};state.capture={id:'old',title:'Old job'};state.keywords=[{term:'Old',selected:true}];state.plan={old:'old draft'};",context);
const snapshot=expression=>JSON.parse(vm.runInContext('JSON.stringify('+expression+')',context));
(async()=>{
 const action=elements.get('refresh-job').onclick,pending=action();
 assert.equal(requests,1);assert(elements.get('refresh-job').disabled);await action();assert.equal(requests,1,'double click does not repeat capture');
 // Storage notification arrives before the refresh response, as in the extension.
 vm.runInContext("globalThis.fresh={id:'new',title:'Current job',description:'Latest job text',simplify:{keywords:[{term:'SQL',matched:false},{term:'Python',matched:true}]}};applyCapture(fresh);",context);
 assert.equal(snapshot('state.pendingCapture.id'),'new');
 resolveCapture({capture:vm.runInContext('fresh',context)});await pending;
 assert.deepEqual(snapshot('state.keywords.map(k=>k.term)'),['SQL','Python'],'refresh imports latest chips immediately');
 assert.deepEqual(snapshot('state.keywords.map(k=>k.matched)'),[false,true],'refresh preserves matched/missing flags');
 assert.deepEqual(snapshot('state.plan'),{},'stale draft is cleared');assert.equal(snapshot('state.source'),'Simplify');assert.equal(snapshot('state.pendingCapture'),null);
 assert.equal(snapshot('state.selected'),'master');assert.equal(snapshot('state.model.id'),'master-model');assert.equal(elements.get('job-description').value,'Latest job text');assert.equal(reloads,0,'sidebar never reloads');
 assert.match(elements.get('job-status').textContent,/Refreshed 2 Simplify keywords/);assert(!elements.get('refresh-job').disabled);
 vm.runInContext('applyCapture(fresh)',context);assert.deepEqual(snapshot('state.keywords.map(k=>k.term)'),['SQL','Python'],'late duplicate storage event cannot clear imported chips');
 const missing=action();resolveCapture({capture:{id:'missing',title:'Job',description:'Job text',simplify:null}});await missing;
 assert.deepEqual(snapshot('state.keywords'),[],'missing panel does not leave stale keywords');assert.match(elements.get('job-status').textContent,/No visible Simplify keywords/);
 const failure=action();resolveCapture({error:'Capture failed'});await failure;assert.match(elements.get('job-status').textContent,/Capture failed/);assert.equal(snapshot('state.capture.id'),'missing','failed refresh preserves previous capture');
 console.log('PASS in-place Simplify refresh, automatic keyword import, storage-event race, stale-draft clearing, missing-panel feedback, busy guard and capture errors');
})().catch(e=>{console.error(e);process.exit(1)});
