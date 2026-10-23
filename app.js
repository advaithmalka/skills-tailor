'use strict';
const $=id=>document.getElementById(id),isExtension=!!globalThis.chrome?.runtime?.id;
const viewParams=new URLSearchParams(location.search),isSidebar=viewParams.get('view')==='sidebar';
document.body.classList.toggle('sidebar',isSidebar);
const state={windowId:null,pendingCapture:null,pendingWorkflow:null,ready:false,library:[],selected:null,model:null,keywords:[],capture:null,busy:false,statusTarget:'status',plan:{},source:'',revision:0,fileMode:'add',previewURL:null};
const store={async get(key){if(isExtension)return (await chrome.storage.local.get(key))[key];return JSON.parse(localStorage.getItem(key)||'null');},async set(key,value){if(isExtension)return chrome.storage.local.set({[key]:value});localStorage.setItem(key,JSON.stringify(value));}};
const dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('skills-tailor',1);req.onupgradeneeded=()=>req.result.createObjectStore('resumes',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
async function db(mode,action){const d=await dbPromise;return new Promise((resolve,reject)=>{const tx=d.transaction('resumes',mode),r=action(tx.objectStore('resumes'));let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
const saveResume=r=>db('readwrite',s=>s.put(r)),allResumes=()=>db('readonly',s=>s.getAll()),deleteResume=id=>db('readwrite',s=>s.delete(id));
function clearStatus(){for(const id of ['status','job-status','suggest-status']){const box=$(id);box.hidden=true;box.textContent='';box.classList.toggle('error',false);}}
function status(message,error=false){const box=$(state.statusTarget||'status');box.hidden=!message;box.textContent=message;box.classList.toggle('error',error);box.setAttribute?.('role',error?'alert':'status');box.setAttribute?.('aria-live',error?'assertive':'polite');if(error&&message)box.scrollIntoView?.({block:'nearest',behavior:'smooth'});}
function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function clearPlan(){state.plan={};$('review').hidden=true;$('replacement-rows').replaceChildren();}
function invalidateKeywords(){state.revision++;state.keywords=[];state.source='';clearPlan();$('keyword-editor').hidden=true;renderScore();}
function setBusy(value){state.busy=value;for(const id of ['analyze','suggest','download','resume-select','add-resume','replace-resume','remove-resume','rename-resume','use-simplify','simplify-suggest','import-keywords','add-keyword','reset-changes','manual','open-full-page','open-sidebar','refresh-job'])$(id).disabled=value;for(const input of $('replacement-rows').querySelectorAll('input,button'))input.disabled=value;for(const b of $('editable-chips').querySelectorAll('button'))b.disabled=value;if(!value){updateSimplifyActions();$('resume-select').disabled=!state.library.length;updatePlan();if(state.ready&&state.pendingCapture){const capture=state.pendingCapture;state.pendingCapture=null;applyCapture(capture);}else if(state.ready&&state.pendingWorkflow){const draft=state.pendingWorkflow;state.pendingWorkflow=null;restoreWorkflow(draft).catch(e=>status(e.message,true));}}}
async function task(fn,statusTarget='status'){if(state.busy)return;state.statusTarget=statusTarget;clearStatus();setBusy(true);try{await fn();}catch(e){status(e.message||String(e),true);}finally{setBusy(false);state.statusTarget='status';}}
function libraryOptions(){const sel=$('resume-select');sel.replaceChildren();for(const r of state.library){const o=element('option',r.name);o.value=r.id;sel.append(o);}sel.value=state.selected||'';sel.disabled=!state.library.length;}
async function selectResume(id){state.revision++;state.selected=id;state.model=null;clearPlan();if(!id){$('resume-meta').textContent='Add a PDF to start.';renderScore();return;}
 const r=state.library.find(r=>r.id===id);if(!r){return selectResume(state.library[0]?.id||null);}state.model=await ResumePDF.inspect(new Uint8Array(r.bytes));await store.set('selected-resume',id);libraryOptions();$('resume-meta').textContent=`${r.filename} · ${state.model.doc.getPageCount()} page(s) · ${state.model.slots.length} editable skills · original preserved`;renderKeywords();renderScore();}
const normalize=ResumeScore.normalize,contains=ResumeScore.contains;
function modelText(){return ResumeScore.resumeText(state.model,state.plan);}
function isMatched(term){return contains(modelText(),term);}
function simplifyMatch(term){
 const keyword=state.capture?.simplify?.keywords?.find(k=>normalize(k.term)===normalize(term));
 return typeof keyword?.matched==='boolean'?keyword.matched:null;
}
function simplifyPlanningEvidence(terms){
 return {simplifyMatchedKeywords:terms.filter(term=>simplifyMatch(term)===true),simplifyMissingKeywords:terms.filter(term=>simplifyMatch(term)===false)};
}
function renderScore(){const chosen=state.keywords.filter(k=>k.selected),matched=chosen.filter(k=>isMatched(k.term)).length,score=chosen.length?Math.round(matched/chosen.length*100):null;
 $('score-value').textContent=score??'—';$('ring-value').style.strokeDasharray=`${(score??0)/100*147} 189`;$('score-label').textContent=score===null?'Ready to compare':score>=75?'Strong keyword match':score>=45?'Room to improve':'Low keyword coverage';
 const detail=$('score-detail');detail.replaceChildren();if(score===null)detail.textContent='Add job keywords to see your coverage.';else{detail.append('Matches ',element('b',`${matched} out of ${chosen.length} keywords`),'.');}
 $('score-chips').replaceChildren(...chosen.map(k=>element('span',k.term,'chip'+(isMatched(k.term)?' matched':''))));
 const selected=ResumeScore.compare(state.model,state.plan,chosen.map(k=>k.term));
 renderComparison($('coverage-comparison'),selected,'Selected keyword coverage');
 const capturedTerms=state.capture?.simplify?.keywords?.map(k=>normalize(k.term));if(capturedTerms&&new Set(capturedTerms).size===chosen.length&&chosen.every(k=>capturedTerms.includes(normalize(k.term))))$('coverage-comparison').hidden=true;
 const comp=$('simplify-comparison'),s=state.capture?.simplify;comp.hidden=!s;comp.replaceChildren();if(s){
  comp.append(element('strong','Simplify snapshot','comparison-title'));
  comp.append(element('p',`Simplify reported ${s.score??'—'}/100 · ${s.matched??'?'} of ${s.total} keywords`,'reported-score'));
  const capturedChips=element('div',undefined,'chips');
  for(const keyword of s.keywords){
   const match=simplifyMatch(keyword.term),chip=element('span',keyword.term,'chip'+(match===true?' matched':''));
   chip.title=match===null?'Simplify status unavailable':`Simplify at last refresh: ${match?'matched':'missing'}`;capturedChips.append(chip);
  }
  comp.append(capturedChips);
  const luna=new Set(state.keywords.filter(k=>k.source==='Luna').map(k=>normalize(k.term)));if(luna.size)comp.append(element('p',`Luna overlap: ${s.keywords.filter(k=>luna.has(normalize(k.term))).length} of ${s.keywords.length} Simplify keywords.`,'small'));
  const comparison=element('div');renderComparison(comparison,ResumeScore.compare(state.model,state.plan,s.keywords.map(k=>k.term)),'Local keyword coverage');comp.append(comparison);
  comp.append(element('p','Simplify highlights show its captured matches. Local Before/After use the selected PDF. Upload the tailored PDF to Simplify, then Refresh Simplify to update its matches and weighted score.','small'));
 }}
function renderComparison(container,comparison,label){
 container.replaceChildren();container.hidden=!comparison.before.total;if(container.hidden)return;
 container.append(element('div',label,'comparison-title'));const grid=element('div',undefined,'comparison-grid');
 for(const [title,score]of [['Before',comparison.before],['After draft',comparison.after]]){const cell=element('div',undefined,'comparison-cell');cell.append(element('span',title),element('strong',state.model?score.percent+'%':'—'),element('small',state.model?`${score.matched} of ${score.total} keywords`:'Select a resume'));grid.append(cell);}container.append(grid);
 if(state.model){const delta=comparison.after.percent-comparison.before.percent;container.append(element('div',delta?`${delta>0?'+':''}${delta} percentage points`:'No change yet','comparison-delta'));}
}

function renderKeywords(){const section=$('keyword-editor');section.hidden=!state.keywords.length;const chips=$('editable-chips');chips.replaceChildren();for(const k of state.keywords){const reported=simplifyMatch(k.term),b=element('button',k.term,'chip'+((reported??isMatched(k.term))?' matched':'')+(k.selected?'':' excluded'));b.setAttribute('aria-pressed',String(k.selected));b.setAttribute('aria-label',k.term+' — '+k.source);b.title=(k.evidence?`Evidence: ${k.evidence}\n`:'')+`Source: ${k.source}`+(reported===null?'':`\nSimplify at last refresh: ${reported?'matched':'missing'}`);b.disabled=state.busy;b.addEventListener('click',()=>{k.selected=!k.selected;state.revision++;clearPlan();renderKeywords();renderScore();});chips.append(b);}renderScore();}
function setKeywords(list,source){const seen=new Set();state.keywords=list.filter(k=>k.term&&k.term.length<=80&&!seen.has(normalize(k.term))&&seen.add(normalize(k.term))).slice(0,60);state.source=source;state.revision++;clearPlan();renderKeywords();}
function planRows(proposals=[]){state.plan={};const reasons=new Map(proposals.map(r=>[r.slotId,r]));$('replacement-rows').replaceChildren();for(const slot of state.model.slots){state.plan[slot.id]=reasons.get(slot.id)?.replacement??slot.text;const row=element('div',undefined,'replace-row');row.dataset.id=slot.id;const label=element('label',slot.text,'original');label.htmlFor='slot-'+slot.id;label.append(element('small',slot.category));const input=element('input');input.id='slot-'+slot.id;input.value=state.plan[slot.id];input.autocomplete='off';input.setAttribute('aria-label','Replace '+slot.text);input.dataset.slot=slot.id;input.placeholder='Leave blank to remove';const remove=element('button','Remove','quiet danger remove-skill');remove.type='button';remove.setAttribute('aria-label','Remove '+slot.text);const fit=element('div',undefined,'fit');if(reasons.get(slot.id)?.reason)input.title=reasons.get(slot.id).reason;
 input.addEventListener('input',()=>{state.plan[slot.id]=input.value;updatePlan();renderScore();});remove.onclick=()=>{state.plan[slot.id]=input.value.trim()?'':slot.text;input.value=state.plan[slot.id];updatePlan();renderScore();};row.append(label,input,remove,fit);$('replacement-rows').append(row);}$('review').hidden=false;updatePlan();renderScore();}
function updatePlan(){if(!state.model||$('review').hidden){$('download').disabled=true;return;}let changes=0,deletions=0,invalid=false;
 const plan=Object.entries(state.plan).map(([id,text])=>({id,text}));
 for(const slot of state.model.slots){const row=$('replacement-rows').querySelector(`[data-id="${slot.id}"]`);if(!row)continue;const text=state.plan[slot.id]??slot.text,r=ResumePDF.replacement(state.model,slot.id,text),fit=row.querySelector('.fit'),changed=text.trim()!==slot.text;if(changed)changes++;if(!text.trim())deletions++;row.classList.toggle('changed',changed);row.classList.toggle('invalid',!r.ok);invalid||=!r.ok;row.querySelector('.remove-skill').textContent=text.trim()?'Remove':'Restore';row.querySelector('.remove-skill').setAttribute('aria-label',(text.trim()?'Remove ':'Restore ')+slot.text);fit.textContent=!r.ok?r.error:r.deleted?'Removed · frees space on this line':changed?`${r.width.toFixed(1)} pt · shares this line’s space`:`Original · ${slot.width.toFixed(1)} pt`;}
 let error='';if(!invalid&&changes)try{ResumePDF.validatePlan(state.model,plan);}catch(e){error=e.message;invalid=true;}
 const budgets=$('line-budgets');budgets.replaceChildren();
 if(!state.model.slots.some(slot=>!ResumePDF.replacement(state.model,slot.id,state.plan[slot.id]??slot.text).ok)){
  for(const row of ResumePDF.measureLines(state.model,plan)){const card=element('div',undefined,'line-budget'+(row.width>row.line.width+0.001?' overfull':''));card.append(element('strong',row.line.category),element('span',`${row.width.toFixed(1)} / ${row.line.width.toFixed(1)} pt · ${Math.max(0,row.line.width-row.width).toFixed(1)} pt free`));card.append(element('div',row.items.filter(i=>i.slot).map(i=>i.change?.text??i.slot.text).join(' • ')||'(All skills removed from this line)','line-preview'));budgets.append(card);}
 }
 $('plan-error').textContent=error;$('plan-summary').textContent=changes?`${changes-deletions} edited · ${deletions} removed. Each line must fit before downloading.`:'Edit a skill or remove one to free space for longer wording on the same line.';$('download').disabled=state.busy||invalid||!changes;}
async function requireKey(){const key=await store.get('api-key');if(!key){$('settings').hidden=false;$('api-key').focus();throw new Error('Enter your OpenAI API key in Settings, then try again.');}return key;}
$('settings-toggle').onclick=()=>{$('settings').hidden=!$('settings').hidden;};
$('save-key').onclick=()=>task(async()=>{const key=$('api-key').value.trim();if(!/^sk-\S{10,}$/.test(key))throw new Error('Enter a valid OpenAI API key beginning with sk-.');await store.set('api-key',key);$('api-key').value='';$('api-key').placeholder='Key saved on this device';status('API key saved. Luna is ready.');});
$('forget-key').onclick=()=>task(async()=>{await store.set('api-key',null);$('api-key').value='';$('api-key').placeholder='sk-…';status('API key removed from local storage.');});
$('resume-select').onchange=()=>task(()=>selectResume($('resume-select').value));
$('add-resume').onclick=()=>{state.fileMode='add';$('pdf-file').click();};$('replace-resume').onclick=()=>{state.fileMode='replace';$('pdf-file').click();};
$('pdf-file').onchange=()=>task(async()=>{const f=$('pdf-file').files[0];$('pdf-file').value='';if(!f)return;if(f.size>15*1024*1024)throw new Error('PDF must be under 15 MB.');status('Checking PDF fonts and Skills layout…');const bytes=new Uint8Array(await f.arrayBuffer());await ResumePDF.inspect(bytes);const old=state.library.find(r=>r.id===state.selected);const record={id:state.fileMode==='replace'&&old?old.id:crypto.randomUUID(),name:state.fileMode==='replace'&&old?old.name:f.name.replace(/\.pdf$/i,''),filename:f.name,bytes:bytes.buffer,addedAt:new Date().toISOString()};await saveResume(record);state.library=await allResumes();await selectResume(record.id);status('PDF saved. Its Skills section is compatible with exact-layout editing.');});
$('rename-resume').onclick=()=>{$('rename-area').hidden=false;$('resume-name').value=state.library.find(r=>r.id===state.selected)?.name||'';$('resume-name').focus();};
$('save-name').onclick=()=>task(async()=>{const name=$('resume-name').value.trim();if(!name)throw new Error('Enter a resume name.');const r=state.library.find(r=>r.id===state.selected);if(!r)return;r.name=name;await saveResume(r);libraryOptions();$('rename-area').hidden=true;status('Resume renamed.');});
$('remove-resume').onclick=()=>task(async()=>{const r=state.library.find(r=>r.id===state.selected);if(!r)return;await deleteResume(r.id);state.library=await allResumes();await selectResume(state.library[0]?.id||null);libraryOptions();status('Resume removed from the library. The original file is unchanged. Use Undo removal to restore it.');const b=element('button','Undo removal','quiet');b.onclick=()=>task(async()=>{await saveResume(r);state.library=await allResumes();await selectResume(r.id);status('Resume restored.');});$('status').append(' ',b);});
$('job-description').oninput=()=>{invalidateKeywords();};
$('analyze').onclick=()=>task(async()=>{if(!state.model)throw new Error('Add a compatible resume first.');const jd=$('job-description').value.trim();if(jd.length<500&&/^Start Your Application/im.test(jd)&&/autofill with resume/i.test(jd)&&/apply manually/i.test(jd))throw new Error('This is the application start screen, not the job description. Open the full job posting or paste its description here. Simplify + Luna can still use captured keywords.');if(jd.length<80)throw new Error('Paste at least 80 characters from the job description.');const revision=state.revision,key=await requireKey();status('Luna is extracting job keywords…');const result=await TailorAI.keywords(key,jd,undefined,{onProgress:message=>status(message)});if(revision!==state.revision)throw new Error('The job or resume changed during analysis. Run it again.');if(!result.length)throw new Error('No supported keywords with evidence were returned. Paste more of the requirements or import keywords manually.');setKeywords(result,'Luna');status('Review the keywords, then ask Luna for replacements.');},'job-status');
function updateSimplifyActions(){const available=!!state.capture?.simplify?.keywords?.length;$('use-simplify').disabled=state.busy||!available;$('simplify-suggest').disabled=state.busy||!available||!state.model;}
function importSimplifyKeywords(){const s=state.capture?.simplify;if(!s?.keywords?.length)throw new Error('Open Simplify’s Resume Score panel on the job and choose Refresh Simplify first.');setKeywords(s.keywords.map(k=>({...k,selected:true,source:'Simplify'})),'Simplify');}
$('use-simplify').onclick=()=>{if(state.busy)return;try{importSimplifyKeywords();status('Imported the keywords displayed by Simplify. Review them before continuing.');}catch(e){status(e.message,true);}};
$('simplify-suggest').onclick=()=>task(async()=>{if(!state.model)throw new Error('Select a resume first.');if(!state.capture?.simplify?.keywords?.length)throw new Error('Open Simplify’s Resume Score panel on the job and choose Refresh Simplify first.');const revision=state.revision,key=await requireKey();if(revision!==state.revision)throw new Error('The job or resume changed. Try Simplify + Luna again.');importSimplifyKeywords();await suggestReplacements(key);},'job-status');
$('import-keywords').onclick=()=>{const terms=$('pasted-keywords').value.split(/[,\n]/).map(s=>s.trim()).filter(Boolean);if(!terms.length)return status('Paste at least one keyword.',true);setKeywords(terms.map(term=>({term,source:'Pasted',selected:true})),'Pasted');status('Keywords imported.');};
$('add-keyword').onclick=()=>{const term=$('new-keyword').value.trim();if(!term)return;if(state.keywords.some(k=>normalize(k.term)===normalize(term)))return status('That keyword is already in your list.',true);state.keywords.push({term,source:'You',selected:true});$('new-keyword').value='';state.revision++;clearPlan();renderKeywords();};
async function suggestReplacements(savedKey){if(!state.model)throw new Error('Select a resume first.');const terms=state.keywords.filter(k=>k.selected).map(k=>k.term);if(!terms.length)throw new Error('Select at least one keyword.');const revision=state.revision,key=savedKey??await requireKey();status('Luna is arranging approved keywords within each Skills line…');const slots=ResumePDF.summary(state.model).map(s=>{const printable=terms.map(term=>({term,result:ResumePDF.replacement(state.model,s.id,term)})).filter(k=>k.result.ok);return {...s,allowedKeywords:printable.map(k=>k.term),keywordWidths:Object.fromEntries(printable.map(k=>[k.term,Number((k.result.width??s.originalWidth).toFixed(3))]))};});let repair=null;const proposals=await TailorAI.suggest(key,$('job-description').value,slots,terms,undefined,{...ResumeScore.planningContext(state.model,terms),...simplifyPlanningEvidence(terms),onRepair:result=>{repair=result;},onProgress:message=>status(message),measureOverflow:proposals=>ResumePDF.measureLines(state.model,proposals.map(r=>({id:r.slotId,text:r.replacement}))).filter(r=>r.width>r.line.width+0.001).map(r=>({lineId:r.line.id,category:r.line.category,usedWidth:r.width,maxWidth:r.line.width,excessWidth:r.width-r.line.width,skills:r.items.filter(i=>i.slot).map(i=>({slotId:i.slot.id,text:i.change?.text??i.slot.text}))}))});if(revision!==state.revision)throw new Error('The inputs changed. Ask for suggestions again.');planRows(proposals);status(repair?`Suggestions are ready. Retried once to fix row widths.${repair.removedSkills?' Removed '+repair.removedSkills+' additional lower-priority skill(s) to make the rows fit.':''}`:proposals.length?'Suggestions are ready. Check the replacements below; any fit errors must be fixed before downloading.':'Luna found no suitable replacements. You can edit the Skills slots manually below.');scheduleDraft();}
$('suggest').onclick=()=>task(()=>suggestReplacements(),'suggest-status');
$('reset-changes').onclick=()=>planRows();
$('manual').onclick=()=>{if(state.model)planRows();};
$('download').onclick=()=>task(async()=>{const plan=Object.entries(state.plan).map(([id,text])=>({id,text}));const bytes=await ResumePDF.apply(state.model,plan);const fileName=($('job-name').value.trim()||'tailored')+'-'+(state.library.find(r=>r.id===state.selected)?.name||'resume');const safe=fileName.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,150)||'tailored-resume';const blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob);let downloadId;
 try{if(isExtension){downloadId=await chrome.downloads.download({url,filename:safe+'.pdf',saveAs:false});const listener=delta=>{if(delta.id!==downloadId)return;if(delta.state?.current==='complete'){status('Tailored PDF saved to Downloads. Your master resume is unchanged.');chrome.downloads.onChanged.removeListener(listener);}else if(delta.error){status('Edge interrupted the download. Open Downloads to retry or save the file.',true);chrome.downloads.onChanged.removeListener(listener);}};chrome.downloads.onChanged.addListener(listener);setTimeout(()=>chrome.downloads.onChanged.removeListener(listener),180000);status('Download started. If Edge asks what to do, choose Save. Your master resume is unchanged.');const items=await chrome.downloads.search({id:downloadId});if(items[0]?.state==='complete'){status('Tailored PDF saved to Downloads. Your master resume is unchanged.');chrome.downloads.onChanged.removeListener(listener);}}else{const a=element('a');a.href=url;a.download=safe+'.pdf';document.body.append(a);a.click();a.remove();status('PDF download requested. Check your browser’s Downloads panel. Your master resume is unchanged.');}}finally{setTimeout(()=>URL.revokeObjectURL(url),60000);}
});
// Only workflow data is handed between views. API keys and PDF bytes are never
// included in session drafts; both views share their existing private stores.
function workflowSnapshot(){return {selected:state.selected,jobName:$('job-name').value,description:$('job-description').value,keywords:state.keywords,source:state.source,plan:$('review').hidden?null:state.plan,capture:state.capture};}
function showCaptureSource(){const c=state.capture;$('captured-job').hidden=!c;$('captured-job').textContent=c?'Captured job: '+(c.title||'Untitled job')+'. Click S on another job to switch.':'';}
function applyCapture(capture,{importKeywords=false}={}){
 if(!capture||capture.id&&capture.id===state.capture?.id)return;
 if(state.busy&&!importKeywords){state.revision++;state.pendingCapture=capture;return;}
 if(state.pendingCapture?.id===capture.id)state.pendingCapture=null;
 state.capture=capture;invalidateKeywords();if(importKeywords&&capture.simplify?.keywords?.length)importSimplifyKeywords();$('job-name').value=capture.title||'';$('job-description').value=capture.description||'';
 $('capture-info').textContent=capture.simplify?.keywords?.length?`Captured ${capture.simplify.keywords.length} visible Simplify keywords. Choose Simplify + Luna to get a replacement draft in one click.`:capture.error||'Job text captured where available. Open Simplify’s Resume Score panel and choose Refresh Simplify to import its visible keywords.';
 updateSimplifyActions();showCaptureSource();renderScore();scheduleDraft();
}
async function restoreWorkflow(draft){
 if(!draft||typeof draft.description!=='string')return;
 state.library=await allResumes();libraryOptions();
 if(draft.selected&&state.library.some(r=>r.id===draft.selected)&&draft.selected!==state.selected)await selectResume(draft.selected);
 state.capture=draft.capture||null;$('job-name').value=draft.jobName||'';$('job-description').value=draft.description;
 setKeywords((draft.keywords||[]).map(k=>({...k})),draft.source||'');
 if(draft.plan&&state.model){const proposals=Object.entries(draft.plan).filter(([id])=>state.model.slots.some(s=>s.id===id)).map(([slotId,replacement])=>({slotId,replacement}));planRows(proposals);}
 updateSimplifyActions();
 $('capture-info').textContent=state.capture?.simplify?.keywords?.length?`Captured ${state.capture.simplify.keywords.length} visible Simplify keywords. Choose Simplify + Luna to get a replacement draft in one click.`:'Your workflow is shared with the other view. Click S on a job to capture fresh text and visible Simplify keywords.';
 showCaptureSource();renderScore();
}
let draftTimer;
function scheduleDraft(){if(!isExtension||!isSidebar||!state.ready)return;clearTimeout(draftTimer);draftTimer=setTimeout(()=>chrome.storage.session.set({['sidebar_draft_'+state.windowId]:workflowSnapshot()}).catch(()=>{}),180);}
for(const event of ['input','change','click'])document.addEventListener(event,e=>{if(e.target.id!=='api-key')scheduleDraft();});
$('open-full-page').onclick=()=>task(async()=>{const id=crypto.randomUUID();await chrome.storage.session.set({['handoff_'+id]:workflowSnapshot()});await chrome.tabs.create({url:chrome.runtime.getURL('app.html')+'?handoff='+id});});
$('open-sidebar').onclick=()=>{
 if(state.busy||state.windowId===null)return;
 // Invoke before asynchronous storage work to retain the button's user gesture.
 chrome.sidePanel.open({windowId:state.windowId}).then(()=>chrome.storage.session.set({['sidebar_handoff_'+state.windowId]:{id:crypto.randomUUID(),draft:workflowSnapshot()}})).catch(e=>status(e.message,true));
};
$('refresh-job').onclick=()=>task(async()=>{
 status('Reading the latest visible Simplify keywords…');
 const result=await chrome.runtime.sendMessage({action:'REFRESH_JOB',windowId:state.windowId});
 if(result?.error)throw new Error(result.error);
 if(!result?.capture)throw new Error('The active job changed during refresh. Try again.');
 applyCapture(result.capture,{importKeywords:true});
 const count=result.capture.simplify?.keywords?.length||0;
 status(count?`Refreshed ${count} Simplify keywords. Review them or choose Simplify + Luna for a new draft.`:result.capture.error||'No visible Simplify keywords found. Open Simplify’s Resume Score panel on the job page, then choose Refresh Simplify.',!count);
},'job-status');
async function start(){
 setBusy(true);try{
  state.library=await allResumes();
  libraryOptions();await selectResume((await store.get('selected-resume'))||state.library[0]?.id||null);
  if(isExtension){
   state.windowId=(await chrome.windows.getCurrent()).id;
   $('open-full-page').hidden=!isSidebar;$('open-sidebar').hidden=isSidebar||!chrome.sidePanel?.open;$('refresh-job').hidden=!isSidebar;
   chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='session'||!isSidebar)return;
    const capture=changes['sidebar_capture_'+state.windowId]?.newValue;
    if(capture)applyCapture(capture);
    const handoff=changes['sidebar_handoff_'+state.windowId]?.newValue;
    if(handoff){chrome.storage.session.set({['sidebar_draft_'+state.windowId]:handoff.draft}).then(()=>chrome.storage.session.remove('sidebar_handoff_'+state.windowId)).catch(()=>{});if(state.busy){state.revision++;state.pendingWorkflow=handoff.draft;}else restoreWorkflow(handoff.draft).catch(e=>status(e.message,true));}
   });
   const captureId=viewParams.get('capture'),handoffId=viewParams.get('handoff');
   const keys=['sidebar_draft_'+state.windowId,'sidebar_capture_'+state.windowId,'sidebar_handoff_'+state.windowId];if(captureId)keys.push('capture_'+captureId);if(handoffId)keys.push('handoff_'+handoffId);
   const saved=await chrome.storage.session.get(keys);
   const draft=handoffId?saved['handoff_'+handoffId]:isSidebar?(saved['sidebar_handoff_'+state.windowId]?.draft||saved['sidebar_draft_'+state.windowId]):null;
   if(draft)await restoreWorkflow(draft);
   if(isSidebar&&saved['sidebar_handoff_'+state.windowId]){await chrome.storage.session.set({['sidebar_draft_'+state.windowId]:draft});await chrome.storage.session.remove('sidebar_handoff_'+state.windowId);}
   const latest=captureId?saved['capture_'+captureId]:isSidebar?saved['sidebar_capture_'+state.windowId]:null;
   if(latest&&latest.id!==state.capture?.id)state.pendingCapture=latest;
  }
  if(await store.get('api-key'))$('api-key').placeholder='Key saved on this device';
 }catch(e){status(e.message,true);}finally{state.ready=true;setBusy(false);}
}
start();
