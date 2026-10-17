(function(root){
'use strict';
const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
function contains(text,term){text=normalize(text);term=normalize(term);if(!term)return false;let i=-1;while((i=text.indexOf(term,i+1))>=0){const before=text[i-1]||'',after=text[i+term.length]||'';if(!/[a-z0-9]/.test(before)&&!/[a-z0-9+#]/.test(after))return true;}return false;}
function resumeText(model,plan={}){if(!model)return '';const changed=model.slots.filter(s=>plan[s.id]!==undefined&&plan[s.id].trim()!==s.text),removed=new Set(changed.flatMap(s=>s.chars.map(c=>`${c.page}:${c.id}`)));
 return model.pages.map(p=>p.rows.map(row=>row.chars.filter(c=>!removed.has(`${c.page}:${c.id}`)).map(c=>c.text).join('')).join('\n')).join('\n')+'\n'+changed.map(s=>plan[s.id]).join(' • ');}
function coverage(text,terms){const unique=[...new Map(terms.filter(t=>normalize(t)).map(t=>[normalize(t),t])).values()],matched=unique.filter(term=>contains(text,term)).length;return {matched,total:unique.length,percent:unique.length?Math.round(matched/unique.length*100):null};}
function compare(model,plan,terms){return {before:coverage(resumeText(model),terms),after:coverage(resumeText(model,plan),terms)};}
root.ResumeScore={normalize,contains,resumeText,coverage,compare};
})(globalThis);
