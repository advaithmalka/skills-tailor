const fs=require('node:fs');
const assert=require('node:assert/strict');
global.PDFLib=require('../vendor/pdf-lib.min.js');
global.fontkit=require('../vendor/fontkit.umd.min.js');
require('../engine.js');require('../ai.js');
(async()=>{
 const doc=await PDFLib.PDFDocument.create();doc.registerFontkit(fontkit);
 const font=await doc.embedFont(fs.readFileSync(__dirname+'/fixtures/Vera.ttf'),{subset:false});
 const page=doc.addPage([1100,800]);
 page.drawText('Example Candidate — Synthetic Test Resume',{x:40,y:740,size:14,font});
 page.drawText('SKILLS',{x:40,y:170,size:12,font});
 const rows=[
  'Programming languages: Python • JavaScript • C • C++ • Java • SQL • HTML • CSS • R • MATLAB',
  'AI/ML: PyTorch • TensorFlow • vLLM • LangChain • Hugging Face • Scikit-Learn • ChromaDB • Computer Vision',
  'Cloud & Tools: AWS • Docker • Kubernetes • React • Node.js • Flask • ElasticSearch • Linux • Git • CI/CD • Agile'
 ];
 rows.forEach((text,i)=>page.drawText(text,{x:40,y:145-i*22,size:10,font}));
 const bytes=await doc.save({useObjectStreams:false});const model=await ResumePDF.inspect(bytes);
 assert.equal(model.slots.length,29);
 const variant='synthetic';
 const slot=t=>model.slots.find(s=>s.text===t).id;
 const suggestions=await TailorAI.suggest('sk-test','SQL and Go',ResumePDF.summary(model),['SQL','Go'],async()=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({replacements:[{slotId:slot('React'),replacement:'SQL'},{slotId:slot('Kubernetes'),replacement:'Go'},{slotId:slot('Flask'),replacement:'Go'}]})}]}]})}));
 const checked=ResumePDF.validatePlan(model,suggestions.map(r=>({id:r.slotId,text:r.replacement})));
 assert.equal(checked.length,1,'actual PDF suggestion flow drops existing and newly repeated skills before review');
 assert.equal(checked[0].text,'Go');

 const plan=pairs=>pairs.map(([a,text])=>({id:slot(a),text}));
 const check=(a,b)=>ResumePDF.replacement(model,slot(a),b);
 assert.equal(check('Python','').ok,true,'blank deletes');
 assert.equal(check('Python','data structures').ok,true,'longer terms use shared row budget');
 assert.equal(check('Python','Py\nthon').ok,false);
 assert.equal(check('Kubernetes','🧪').ok,false,'font coverage enforced');
 assert.throws(()=>ResumePDF.validatePlan(model,plan([['Java','Bash'],['Java','Go']])),/only once/);
 assert.throws(()=>ResumePDF.validatePlan(model,plan([['JavaScript','Python']])),/duplicate/);
 assert.throws(()=>ResumePDF.validatePlan(model,plan([['JavaScript','Computer  Vision']])),/duplicate/,'spacing variants across lines are duplicates');
 await assert.rejects(()=>ResumePDF.apply(model,[]),/at least one/);
 const long=plan([['Python','data structures']]);
 assert.throws(()=>ResumePDF.validatePlan(model,long),/line.*too wide/,'long skill cannot overflow');
 assert.throws(()=>ResumePDF.validatePlan(model,[...long,...plan([['ElasticSearch','']])]),/line.*too wide/,'space cannot be borrowed from another line');
 const shared=plan([['Python','data structures'],['MATLAB',''],['C++',''],['LangChain','OpenAI'],['CI/CD','']]);
 const result=await ResumePDF.apply(model,shared),edited=await ResumePDF.inspect(result);
 assert(edited.slots.some(s=>s.text==='data structures'));
 for(const word of ['Python','MATLAB','C++','LangChain','CI/CD'])assert(!edited.slots.some(s=>s.text===word),word+' removed/replaced');
 for(const word of ['JavaScript','Java','SQL','HTML','CSS','R','OpenAI'])assert(edited.slots.some(s=>s.text===word),word+' remains readable');
 for(const line of edited.lines){const source=model.lines.find(l=>l.category===line.category);assert(Math.abs(source.x-line.x)<0.001);assert(line.x+line.width<=source.x+source.width+0.001,'right edge bounded');assert.equal(line.chars.filter(c=>/[•·]/.test(c.text)).length,line.slots.length-1,'no dangling separators');}
 const moved=new Set(model.lines.filter(l=>shared.some(r=>l.slots.some(s=>s.id===r.id))).flatMap(l=>l.chars.map(c=>c.id)));
 for(const c of model.pages[0].chars.filter(c=>!moved.has(c.id)))assert(edited.pages[0].chars.some(d=>d.text===c.text&&d.font===c.font&&Math.abs(d.x-c.x)<0.001&&Math.abs(d.y-c.y)<0.001),'all glyphs outside edited Skills lines preserved');
 const one=plan(model.lines[0].slots.slice(1).map(s=>[s.text,'']));
 const single=await ResumePDF.inspect(await ResumePDF.apply(model,one));assert.equal(single.lines[0].slots.length,1,'single-skill row supported');assert(!single.lines[0].chars.some(c=>/[•·]/.test(c.text)));
 const empty=plan(model.lines[0].slots.map(s=>[s.text,'']));const blank=await ResumePDF.inspect(await ResumePDF.apply(model,empty));assert(!blank.slots.some(s=>s.category===model.lines[0].category),'entire row may be removed, keeping its label');
 const measured=ResumePDF.measureLines(model,long).find(l=>l.line.id===model.slots[0].lineId);assert(measured.width>measured.line.width,'UI receives overflow budget');
 if(process.env.QA_DIR){fs.mkdirSync(process.env.QA_DIR,{recursive:true});fs.writeFileSync(process.env.QA_DIR+'/'+variant+'.pdf',result);fs.writeFileSync(process.env.QA_DIR+'/'+variant+'-original.pdf',bytes);}
 console.log('PASS',variant,': shared line widths, longer terms, deletions, separators, font validation, immutable outer text');

})().catch(e=>{console.error(e);process.exit(1)});
