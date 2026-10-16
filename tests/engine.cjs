const fs=require('node:fs');
const assert=require('node:assert/strict');
global.PDFLib=require('../vendor/pdf-lib.min.js');
global.fontkit=require('../vendor/fontkit.umd.min.js');
require('../engine.js');
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
 const slot=t=>model.slots.find(s=>s.text===t).id;
 const check=(a,b)=>ResumePDF.replacement(model,slot(a),b);
 assert.equal(check('JavaScript','TypeScript').ok,false,'character count does not establish printed fit');
 assert.equal(check('Python','longer-than-original').ok,false);
 assert.equal(check('Kubernetes','🧪').ok,false,'font glyph coverage enforced');
 assert.equal(check('Kubernetes','Terraform').ok,true);
 assert.equal(check('Python','').ok,false);
 assert.equal(check('Python','Py\nthon').ok,false);
 assert.throws(()=>ResumePDF.validatePlan(model,[{id:slot('Java'),text:'Java'},{id:slot('Java'),text:'Bash'}]),/only once/);
 assert.throws(()=>ResumePDF.validatePlan(model,[{id:slot('JavaScript'),text:'Python'}]),/duplicate/);
 await assert.rejects(()=>ResumePDF.apply(model,[]),/at least one/);
 const plan=[['LangChain','OpenAI'],['Scikit-Learn','Pandas'],['C++','Go'],['Kubernetes','Terraform'],['CI/CD','CD']].map(([a,b])=>({id:slot(a),text:b}));
 const edited=await ResumePDF.inspect(await ResumePDF.apply(model,plan));
 for(const r of plan)assert(edited.slots.some(s=>s.text===r.text));
 const removed=new Set(plan.flatMap(c=>model.slots.find(s=>s.id===c.id).chars.map(g=>g.id)));
 for(const c of model.pages[0].chars.filter(c=>!removed.has(c.id)))assert(edited.pages[0].chars.some(d=>d.text===c.text&&d.font===c.font&&Math.abs(d.x-c.x)<0.001&&Math.abs(d.y-c.y)<0.001),'untouched glyph preserved');
 console.log('PASS synthetic PDF: 29 slots, fit/font validation, plan checks, unchanged glyph positions');
})().catch(e=>{console.error(e);process.exit(1)});
