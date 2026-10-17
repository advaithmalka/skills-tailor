const assert=require('node:assert/strict');require('../ai.js');
const normalize=s=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const skills=[{id:'a',text:'Python'},{id:'b',text:'SQL'},{id:'c',text:'React'},{id:'d',text:'Docker'}];
const mock=replacements=>async()=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({replacements})}]}]})});
const row=(slotId,replacement)=>({slotId,replacement,keyword:replacement,reason:'Relevant'});
async function verify(input){const result=await TailorAI.suggest('sk-test','Python SQL REST APIs',skills,['Python','SQL','REST APIs','React','Docker'],mock(input));assert.equal(new Set(result.map(r=>r.slotId)).size,result.length,'one suggestion per slot');const changes=new Map(result.map(r=>[r.slotId,r.replacement]));const final=skills.map(s=>normalize(changes.get(s.id)??s.text)).filter(Boolean);assert.equal(new Set(final).size,final.length,'suggestions must not duplicate retained or proposed skills');return result;}
(async()=>{
 const existing=await verify([row('c','Python')]);assert(!existing.some(r=>r.slotId==='c'),'redundant proposal keeps original React');
 await verify([row('c','REST APIs'),row('d','REST APIs')]);
 await verify([row('c',' sql '),row('d','SQL')]);
 await verify([row('c','REST APIs'),row('d','rest  apis')]);
 await verify([row('a','SQL'),row('b','React'),row('c','SQL')]);
 await verify([row('c','REST APIs'),row('c','SQL')]);
 const moved=await verify([row('a','SQL'),row('b','REST APIs')]);assert.equal(moved.length,2,'unique skill moves are preserved');
 await verify([row('c','Ｐｙｔｈｏｎ')]);
 const values=['Python','SQL','React','Docker','REST APIs','rest  apis',''];let seed=17;
 for(let i=0;i<200;i++){const input=skills.map(s=>{seed=(seed*1664525+1013904223)>>>0;return row(s.id,values[seed%values.length]);});await verify(input);}
 const removal=await verify([row('c','')]);assert.equal(removal[0].replacement,'','intentional removals preserved');
 console.log('PASS suggestions never duplicate retained skills, new terms, casing/spacing variants or slot IDs; valid moves and removals preserved');
})().catch(e=>{console.error(e);process.exit(1)});
