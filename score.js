(function(root){
'use strict';
const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
function contains(text,term){text=normalize(text);term=normalize(term);if(!term)return false;let i=-1;while((i=text.indexOf(term,i+1))>=0){const before=text[i-1]||'',after=text[i+term.length]||'';if(!/[a-z0-9]/.test(before)&&!/[a-z0-9+#]/.test(after))return true;}return false;}
function resumeText(model,plan={}){if(!model)return '';const changed=model.slots.filter(s=>plan[s.id]!==undefined&&plan[s.id].trim()!==s.text),removed=new Set(changed.flatMap(s=>s.chars.map(c=>`${c.page}:${c.id}`)));
 return model.pages.map(p=>p.rows.map(row=>row.chars.filter(c=>!removed.has(`${c.page}:${c.id}`)).map(c=>c.text).join('')).join('\n')).join('\n')+'\n'+changed.map(s=>plan[s.id]).join(' • ');}
// Project descriptions support methods even when the exact keyword is absent.
// Other sections are searched locally; only their matched keyword names are sent.
function planningContext(model,terms){
 const outsideSkills=resumeText(model,Object.fromEntries((model?.slots||[]).map(s=>[s.id,''])));
 const coveredKeywords=terms.filter(term=>contains(outsideSkills,term)),projectEvidence=[];
 let inProjects=false;
 for(const page of model?.pages||[])for(const row of page.rows){
  const text=(row.text??row.chars.map(c=>c.text).join('')).trim();
  if(/^(?:(?:selected|technical|academic|personal|relevant)\s+)?projects?\s*:?$/i.test(text)){inProjects=true;continue;}
  if(/^(?:(?:technical|professional|relevant|work|research|volunteer|leadership|additional)\s+)?(?:skills|experience|education|employment|summary|profile|certifications?|awards?|publications?|activities|interests|coursework|languages)\s*:?$/i.test(text)){inProjects=false;continue;}
  if(inProjects&&text)projectEvidence.push(text);
 }
 return {coveredKeywords,projectEvidence};
}
function coverage(text,terms){const unique=[...new Map(terms.filter(t=>normalize(t)).map(t=>[normalize(t),t])).values()],matched=unique.filter(term=>contains(text,term)).length;return {matched,total:unique.length,percent:unique.length?Math.round(matched/unique.length*100):null};}
function compare(model,plan,terms){return {before:coverage(resumeText(model),terms),after:coverage(resumeText(model,plan),terms)};}
root.ResumeScore={normalize,contains,resumeText,planningContext,coverage,compare};
})(globalThis);
