// Runs only on a user-selected tab. Reads visible DOM, never form values or extension internals.
function captureVisibleJob(){
 const roots=[document];for(let i=0;i<roots.length&&i<100;i++)for(const el of roots[i].querySelectorAll('*'))if(el.shadowRoot)roots.push(el.shadowRoot);
 const visible=el=>!!(el.getClientRects().length)&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';
 let simplify=null;
 for(const r of roots){
  const text=r===document?'':r.textContent||'';
  if(!text.includes('Only Matches'))continue;
  const chips=Array.from(r.querySelectorAll('span.rounded-full')).filter(visible).filter(e=>e.className.includes('whitespace-nowrap')&&e.className.includes('border')).map(e=>({term:e.innerText.trim(),matched:e.className.includes('bg-primary-lightest')})).filter(c=>c.term&&c.term.length<80);
  if(!chips.length)continue;
  const match=text.match(/Only Matches\s*(\d+)\s*out of\s*(\d+)\s*keywords?/i);
  const sourceText=Array.from(r.querySelectorAll('*')).filter(e=>e.childElementCount===0&&visible(e)).map(e=>e.textContent.trim()).filter(Boolean).join(' ');
  const scoreMatch=sourceText.match(/\b(\d{1,3})\s+(?:Strong|Good|Low|Medium|High)\s+Resume Match/i);
  simplify={keywords:chips,matched:match?Number(match[1]):null,total:match?Number(match[2]):chips.length,score:scoreMatch?Number(scoreMatch[1]):null};break;
 }
 // Known description containers avoid application forms and private field contents.
 const selectors=['[data-automation-id="jobPostingDescription"]','[data-testid="job-description"]','#job_description','.job__description','#content .content','main article','main'];
 let description='';for(const selector of selectors){const e=document.querySelector(selector);if(e&&visible(e)){description=e.innerText.trim();if(description.length>150)break;}}
 const applyIndex=description.search(/(?:^|\n)\s*Apply for this job\s*(?:\n|$)/i);if(applyIndex>=0)description=description.slice(0,applyIndex);
 return {title:document.querySelector('[data-automation-id="jobPostingHeader"]')?.innerText||document.querySelector('main h1')?.innerText||document.querySelector('h1')?.innerText||document.title,description:description.slice(0,30000),simplify,capturedAt:new Date().toISOString()};
}
if(typeof module!=='undefined')module.exports={captureVisibleJob};
