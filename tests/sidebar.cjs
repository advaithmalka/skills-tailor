const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const tick=()=>new Promise(r=>setImmediate(r));
function setup({sidePanel=true}={}){
 const events=[],saved={},handlers={};const resolvers=[];
 const chrome={
  runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>handlers.message=f}},
  action:{onClicked:{addListener:f=>handlers.click=f}},
  storage:{session:{set:async v=>{events.push('store');Object.assign(saved,v);}}},
  scripting:{executeScript:args=>{events.push(['capture',args.target.tabId]);return new Promise(r=>resolvers.push(r));}},
  tabs:{create:async args=>events.push(['tab',args.url]),query:async q=>{events.push(['query',q.windowId]);return[{id:23,windowId:q.windowId,url:'https://jobs.example/second'}];}},
 };
 if(sidePanel)chrome.sidePanel={open:opts=>{events.push(['open',opts.windowId]);return Promise.resolve();}};
 let count=0;
 vm.runInNewContext(fs.readFileSync(__dirname+'/../background.js','utf8'),{chrome,crypto:{randomUUID:()=>String(++count)},importScripts:()=>{},captureVisibleJob:function(){},console});
 return{handlers,events,saved,resolve:(data,index=resolvers.length-1)=>resolvers[index]([{result:data}])};
}
(async()=>{
 const s=setup();s.handlers.click({id:11,windowId:7,url:'https://jobs.example/one'});
 assert.deepEqual(s.events,[['capture',11],['open',7]],'sidebar opens synchronously while scraping targets original job');
 s.resolve({title:'One',description:'Job text',simplify:{keywords:[{term:'Python',matched:true}]}});await tick();
 assert.equal(s.saved.sidebar_capture_7.tabId,11);assert.equal(s.saved.sidebar_capture_7.simplify.keywords[0].term,'Python');
 assert(!s.events.some(e=>e[0]==='tab'),'normal toolbar click never creates a tab');
 let response;const accepted=s.handlers.message({action:'REFRESH_JOB',windowId:7},{id:'test',url:'chrome-extension://test/app.html?view=sidebar'},r=>response=r);
 assert.equal(accepted,true);await tick();assert.deepEqual(s.events.at(-1),['capture',23]);s.resolve({title:'Two',description:'Updated',simplify:{keywords:[{term:'SQL',matched:false}]}});await tick();assert.equal(response.capture.tabId,23);assert.equal(s.saved.sidebar_capture_7.title,'Two');
 assert.equal(s.handlers.message({action:'REFRESH_JOB',windowId:8},{id:'other',url:'https://attacker.test'},()=>{}),undefined);
 const f=setup({sidePanel:false});f.handlers.click({id:12,windowId:8,url:'https://jobs.example/fallback'});f.resolve({title:'Fallback',simplify:null});await tick();assert(f.events.some(e=>e[0]==='tab'&&e[1].includes('?capture=')),'full-page fallback when sidebar unsupported');
 const race=setup();race.handlers.click({id:1,windowId:2,url:'https://jobs.example/old'});race.handlers.click({id:2,windowId:2,url:'https://jobs.example/new'});
 race.resolve({title:'New'},1);await tick();race.resolve({title:'Old'},0);await tick();assert.equal(race.saved.sidebar_capture_2.title,'New','late response never replaces newer job');
 const manifest=JSON.parse(fs.readFileSync(__dirname+'/../manifest.json'));assert(manifest.permissions.includes('sidePanel'));assert.equal(manifest.side_panel.default_path,'app.html?view=sidebar');
 assert(fs.readFileSync(__dirname+'/../app.js','utf8').includes("$('ring-value').style.strokeDasharray"));
 console.log('PASS sidebar gesture, original-tab scraping, visible Simplify payload, window scoping, refresh, sender checks and full-page fallback');
})().catch(e=>{console.error(e);process.exit(1)});
