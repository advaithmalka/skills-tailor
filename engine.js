/* Skills-only PDF editor. No PDF JavaScript or embedded actions are executed. */
(function(root){
'use strict';
const P=root.PDFLib, FK=root.fontkit;
const fail=m=>{throw new Error(m);};
const num=o=>o?.asNumber?.();
const nm=o=>o?.decodeText?.() ?? o?.toString?.().replace(/^\//,'');
const bytesToText=b=>{let s=''; for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return s;};
const textToBytes=s=>Uint8Array.from(s,c=>c.charCodeAt(0));
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
const fmt=n=>Number(n.toFixed(7)).toString();
function lookup(d,k){return d?.lookup?.(P.PDFName.of(k));}
function decodeStream(s){if(s?.getUnencodedContents)return s.getUnencodedContents(); if(s instanceof P.PDFRawStream)return P.decodePDFRawStream(s).decode();fail('Unsupported PDF stream.');}
// PDF lexical parser: strings, hex strings, arrays, names, numbers, dictionaries.
function lex(s){
 let i=0; const white=c=>!c||/[\x00\t\n\f\r ]/.test(c), delim=c=>white(c)||/[()[\]<>/%]/.test(c);
 function skip(){while(i<s.length){if(white(s[i]))i++;else if(s[i]==='%'){while(i<s.length&&!/[\r\n]/.test(s[i]))i++;}else break;}}
 function token(){skip();const start=i,c=s[i++]; if(c===undefined)return null;
  if(c==='('){let depth=1,a=[];while(i<s.length&&depth){let ch=s[i++];if(ch==='\\'){ch=s[i++];if(ch==='\r'){if(s[i]==='\n')i++;continue;}if(ch==='\n')continue;if(/[0-7]/.test(ch)){let oct=ch;for(let n=0;n<2&&/[0-7]/.test(s[i]||'x');n++)oct+=s[i++];a.push(parseInt(oct,8)&255);}else a.push(({n:10,r:13,t:9,b:8,f:12})[ch]??ch.charCodeAt(0));}else if(ch==='('){depth++;a.push(40);}else if(ch===')'){depth--;if(depth)a.push(41);}else{if(ch==='\r'){if(s[i]==='\n')i++;ch='\n';}a.push(ch.charCodeAt(0));}}if(depth)fail('Unclosed PDF string.');return {type:'str',bytes:Uint8Array.from(a),start,end:i};}
  if(c==='<'&&s[i]!=='<'){let h='';while(i<s.length&&s[i]!=='>')h+=s[i++];if(s[i++]!=='>')fail('Unclosed PDF hex string.');h=h.replace(/\s/g,'');if(h.length%2)h+='0';if(/[^a-f\d]/i.test(h))fail('Invalid PDF hex text.');return {type:'str',bytes:Uint8Array.from(h.match(/../g)||[],x=>parseInt(x,16)),start,end:i};}
  if(c==='['){let arr=[];while(true){skip();if(s[i]===']'){i++;break;}if(i>=s.length)fail('Unclosed PDF array.');arr.push(token());}return {type:'array',value:arr,start,end:i};}
  if(c==='<'&&s[i]==='<'){i++;let depth=1;while(depth&&i<s.length){skip();if(s.slice(i,i+2)==='>>'){i+=2;depth--;}else if(s.slice(i,i+2)==='<<'){i+=2;depth++;}else token();}return {type:'dict',start,end:i};}
  if(c==='/'){while(i<s.length&&!delim(s[i]))i++;return {type:'name',value:s.slice(start+1,i).replace(/#([a-f\d]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16))),start,end:i};}
  while(i<s.length&&!delim(s[i]))i++;
  const v=s.slice(start,i);return {type:/^[+\-]?(?:\d+\.?\d*|\.\d+)$/.test(v)?'num':'op',value:/^[+\-]?(?:\d+\.?\d*|\.\d+)$/.test(v)?Number(v):v,start,end:i};
 }
 const out=[];while(i<s.length){const t=token();if(t)out.push(t);}return out;
}
function cmap(text){
 const out=new Map();const utf=h=>{if(h.length%4)fail('Unsupported Unicode font mapping.');let s='';for(let i=0;i<h.length;i+=4)s+=String.fromCharCode(parseInt(h.slice(i,i+4),16));return s;};
 for(const b of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))for(const m of b[1].matchAll(/<([a-f\d]+)>\s*<([a-f\d]+)>/gi))out.set(parseInt(m[1],16),utf(m[2]));
 for(const b of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))for(const m of b[1].matchAll(/<([a-f\d]+)>\s*<([a-f\d]+)>\s*(<([a-f\d]+)>|\[([^\]]*)\])/gi)){
  const a=parseInt(m[1],16),z=parseInt(m[2],16);if(z-a>65536)fail('Font mapping too large.');const vals=m[5]?[...m[5].matchAll(/<([a-f\d]+)>/gi)].map(x=>utf(x[1])):null;
  for(let c=a;c<=z;c++)out.set(c,vals?vals[c-a]:utf((parseInt(m[4],16)+c-a).toString(16).padStart(m[4].length,'0')));
 }
 return out;
}
function fontInfo(dict,name){
 const subtype=nm(lookup(dict,'Subtype')), type0=subtype==='Type0';
 if(!['TrueType','Type0','Type1'].includes(subtype))return null;
 const base=nm(lookup(dict,'BaseFont'))||name;
 if(type0&&nm(lookup(dict,'Encoding'))!=='Identity-H')return null;
 const desc=type0?lookup(dict,'DescendantFonts')?.lookup(0):dict;if(!desc)return null;
 const fd=lookup(desc,'FontDescriptor'),file=lookup(fd,'FontFile2')||lookup(fd,'FontFile3');let glyphFont=null;
 if(file){try{glyphFont=FK.create(decodeStream(file));}catch{}}
 const map=new Map(),to=lookup(dict,'ToUnicode');
 if(to){for(const [k,v]of cmap(bytesToText(decodeStream(to))))map.set(k,v);}
 else if(!type0){
  const enc=lookup(dict,'Encoding'),encName=enc instanceof P.PDFName?nm(enc):nm(lookup(enc,'BaseEncoding'));
  if(encName&&encName!=='WinAnsiEncoding')return null;
  if(enc instanceof P.PDFDict&&lookup(enc,'Differences'))return null;
  const dec=new TextDecoder('windows-1252');for(let c=0;c<256;c++)map.set(c,dec.decode(Uint8Array.of(c)));
 }
 const widths=new Map();let defaultWidth=0;
 if(type0){defaultWidth=num(lookup(desc,'DW'))??1000;const w=lookup(desc,'W');if(w)for(let i=0;i<w.size();){const first=num(w.lookup(i++)),next=w.lookup(i++);if(next instanceof P.PDFArray){for(let n=0;n<next.size();n++)widths.set(first+n,num(next.lookup(n)));}else{const last=num(next),val=num(w.lookup(i++));for(let n=first;n<=last;n++)widths.set(n,val);}}}
 else{const first=num(lookup(dict,'FirstChar'))??0,w=lookup(dict,'Widths');if(w)for(let i=0;i<w.size();i++)widths.set(first+i,num(w.lookup(i)));defaultWidth=num(lookup(fd,'MissingWidth'))??0;}
 const reverse=new Map();for(const[k,v]of map)if(v&&[...v].length===1&&widths.has(k)&&widths.get(k)>0&&!reverse.has(v))reverse.set(v,k);
 return {name,base,type0,map,reverse,widths,defaultWidth,glyphFont,unit:type0?2:1};
}
function readPage(doc,page,index){
 const fonts=new Map(),fontDict=lookup(page.node.Resources(),'Font');
 if(fontDict)for(const[key]of fontDict.entries()){const name=nm(key);try{const f=fontInfo(fontDict.lookup(key),name);if(f)fonts.set(name,f);}catch{}}
 const contents=page.node.Contents();let raw=[];
 if(contents instanceof P.PDFArray)for(let i=0;i<contents.size();i++)raw.push(bytesToText(decodeStream(contents.lookup(i))));else if(contents)raw.push(bytesToText(decodeStream(contents)));
 const source=raw.join('\n'),tokens=lex(source),shows=[],chars=[],stack=[];
 let st={font:null,size:0,tc:0,tw:0,scale:1,rise:0,lead:0,tm:[1,0,0,1,0,0],lm:[1,0,0,1,0,0],ctm:[1,0,0,1,0,0],color:'0 g',unsupported:false};
 const cp=()=>({...st,tm:[...st.tm],lm:[...st.lm],ctm:[...st.ctm]});
 let args=[];
 const translated=(tx,ty,m)=>[m[0],m[1],m[2],m[3],m[4]+tx*m[0]+ty*m[2],m[5]+tx*m[1]+ty*m[3]];
 function show(parts,start,end,operator){
  const f=fonts.get(st.font);let flat=[];
  for(const part of parts){if(part.type==='num'){st.tm=translated(-part.value/1000*st.size*st.scale,0,st.tm);continue;}if(part.type!=='str')fail('Unsupported text array.');
   const glyphs=[];for(let off=0;off<part.bytes.length;off+=(f?.unit||1)){
    const code=f?.type0?(part.bytes[off]*256+part.bytes[off+1]):part.bytes[off],text=f?.map.get(code)??'\uFFFD',w=f?.widths.get(code)??f?.defaultWidth??0;
    const advance=(w/1000*st.size+st.tc+(text===' '?st.tw:0))*st.scale;
    const x=st.tm[4]*st.ctm[0]+st.tm[5]*st.ctm[2]+st.ctm[4],y=st.tm[4]*st.ctm[1]+st.tm[5]*st.ctm[3]+st.ctm[5]+st.rise;
    const ch={id:chars.length,text,x,y,width:advance,size:st.size,font:st.font,code,w,compensation:w+(st.tc+(text===' '?st.tw:0))*1000/st.size,part,off,show:null,page:index,editable:!!f&&st.tm[0]===1&&st.tm[1]===0&&st.tm[2]===0&&st.tm[3]===1&&st.ctm.join(',')==='1,0,0,1,0,0'&&st.scale===1&&st.rise===0&&!st.unsupported,color:st.color,tc:st.tc,tw:st.tw};
    chars.push(ch);glyphs.push(ch);flat.push(ch);st.tm=translated(advance,0,st.tm);
   }part.glyphs=glyphs;
  }
  const record={parts,start,end,operator,chars:flat};flat.forEach(c=>c.show=record);shows.push(record);
 }
 for(const t of tokens){if(t.type!=='op'){args.push(t);continue;}const v=args.map(x=>x.value),op=t.value;
  switch(op){
   case'q':stack.push(cp());break;case'Q':if(stack.length)st=stack.pop();else fail('Invalid PDF graphics state.');break;
   case'cm':{const [a,b,c,d,e,f]=v,m=st.ctm;st.ctm=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c+m[2]*d,m[1]*c+m[3]*d,m[0]*e+m[2]*f+m[4],m[1]*e+m[3]*f+m[5]];break;}
   case'BT':st.tm=[1,0,0,1,0,0];st.lm=[...st.tm];break;
   case'Tf':st.font=v[0];st.size=v[1];break;case'Tm':st.tm=[...v];st.lm=[...v];break;
   case'Td':case'TD':if(op==='TD')st.lead=-v[1];st.lm=translated(v[0],v[1],st.lm);st.tm=[...st.lm];break;
   case'T*':st.lm=translated(0,-st.lead,st.lm);st.tm=[...st.lm];break;
   case'Tc':st.tc=v[0];break;case'Tw':st.tw=v[0];break;case'Tz':st.scale=v[0]/100;break;case'Ts':st.rise=v[0];break;case'TL':st.lead=v[0];break;
   case'Tr':if(v[0]!==0)st.unsupported=true;break;
   case'g':case'rg':case'k':st.color=v.join(' ')+' '+op;break;
   case'Tj':show([args[0]],args[0].start,t.end,op);break;
   case'TJ':show(args[0].value,args[0].start,t.end,op);break;
   case"'":case'"':st.unsupported=true;break;
   case'BI':fail('PDFs with inline images need a fresh text-based PDF export.');
  }
  args=[];
 }
 // Rows preserve actual positions; no guessed spaces are inserted inside skills.
 const rows=[];for(const c of chars){let r=rows.find(r=>Math.abs(r.y-c.y)<0.65);if(!r){r={y:c.y,chars:[]};rows.push(r);}r.chars.push(c);}
 rows.sort((a,b)=>b.y-a.y);for(const r of rows){r.chars.sort((a,b)=>a.x-b.x||a.id-b.id);r.text=r.chars.map(c=>c.text).join('');}
 return {index,page,source,fonts,shows,chars,rows};
}
async function inspect(bytes){
 if(bytes.length>15*1024*1024)fail('PDF must be under 15 MB.');
 const doc=await P.PDFDocument.load(bytes,{updateMetadata:false});
 if(doc.isEncrypted)fail('Password-protected PDFs are unsupported.');
 if(doc.getForm().getFields().some(f=>f.constructor.name==='PDFSignature'))fail('Signed PDFs cannot be edited without invalidating their signature.');
 if(doc.getPageCount()>8)fail('Please use a resume with at most 8 pages.');
 const pages=doc.getPages().map((p,i)=>readPage(doc,p,i)),slots=[],categories=[],lines=[];let section=false,found=0;
 for(const pg of pages)for(const row of pg.rows){
  if(/^\s*(?:TECHNICAL\s+)?SKILLS\s*$/i.test(row.text)){section=true;found++;continue;}
  if(!section)continue;
  if(!row.text.trim())continue;
  const colon=row.text.indexOf(':');if(colon<0){section=false;continue;}
  const label=row.text.slice(0,colon).trim();if(!label||label.length>50)fail('Unsupported Skills category label.');
  const content=row.chars.slice(colon+1),lineId='p'+pg.index+'r'+lines.length,firstSlot=slots.length;
  let chunk=[];const add=()=>{while(chunk.length&&/^\s+$/.test(chunk[0].text))chunk.shift();while(chunk.length&&/^\s+$/.test(chunk.at(-1).text))chunk.pop();if(!chunk.length)return;
   if(chunk.some(c=>!c.editable||c.text==='\uFFFD'))fail('The Skills text uses unsupported positioning, encoding, or fonts. Please export a fresh text-based PDF.');
   if(chunk.some(c=>c.size!==chunk[0].size||c.color!==chunk[0].color))fail('Mixed text styles inside a skill cannot be edited safely.');
   const slot={id:'p'+pg.index+'s'+slots.length,page:pg.index,lineId,category:label,text:chunk.map(c=>c.text).join(''),chars:[...chunk],x:chunk[0].x,y:row.y,size:chunk[0].size,color:chunk[0].color,width:chunk.at(-1).x+chunk.at(-1).width-chunk[0].x};
   if(slot.text.length>90||slot.width<=0)fail('Could not safely identify individual Skills entries.');slots.push(slot);chunk=[];
  };
  for(const c of content){if(/[•·]/.test(c.text)){add();chunk=[];}else chunk.push(c);}add();categories.push({label,page:pg.index,y:row.y});
  const entries=slots.slice(firstSlot);if(entries.length){
   const first=entries[0],last=entries.at(-1);
   const start=content.findIndex(c=>c.id===first.chars[0].id),end=content.findIndex(c=>c.id===last.chars.at(-1).id);
   const chars=content.slice(start,end+1);
   if(chars.some(c=>!c.editable))fail('The Skills line separators use unsupported positioning or fonts.');
   const gaps=entries.slice(1).map((next,i)=>{const prev=entries[i],a=chars.findIndex(c=>c.id===prev.chars.at(-1).id)+1,b=chars.findIndex(c=>c.id===next.chars[0].id),x=prev.x+prev.width;return {width:next.x-x,chars:chars.slice(a,b),x};});
   if(gaps.some(g=>g.width<0||!g.chars.some(c=>/[•·]/.test(c.text))))fail('Could not safely identify Skills separators.');
   lines.push({id:lineId,page:pg.index,category:label,y:row.y,x:first.x,width:last.x+last.width-first.x,slots:entries,chars,gaps});
  }
 }
 if(found!==1||!slots.length)fail('Could not identify one supported Skills section. Use a text PDF with category labels and bullet-separated skills.');
 if(slots.length>120)fail('Too many Skills entries.');
 return {doc,pages,slots,categories,lines,bytes};
}
function summary(model){return model.slots.map(s=>({id:s.id,lineId:s.lineId,category:s.category,text:s.text,originalWidth:Number(s.width.toFixed(2)),separatorWidth:Number((model.lines.find(l=>l.id===s.lineId).gaps[0]?.width||0).toFixed(2)),maxWidth:Number(model.lines.find(l=>l.id===s.lineId).width.toFixed(2))}));}
function replacement(model,id,text){
 const slot=model.slots.find(s=>s.id===id);if(!slot)return {ok:false,error:'Unknown skill slot.'};
 text=text.trim();if(text===slot.text)return {ok:true,unchanged:true,text,slot};
 if(!text)return {ok:true,deleted:true,text:'',width:0,slot};
 if(/[\r\n•·]/.test(text))return {ok:false,error:'Enter one skill without bullets or line breaks.'};
 if([...text].length>200)return {ok:false,error:'Keep each skill under 200 characters.'};
 const pg=model.pages[slot.page],candidates=[...pg.fonts.values()].filter(f=>f.glyphFont&&f.base.replace(/^[A-Z]{6}\+/,'')===pg.fonts.get(slot.chars[0].font)?.base.replace(/^[A-Z]{6}\+/,''));
 const missing=new Set();
 for(const font of candidates){let codes=[],width=0,valid=true;for(const ch of text){const code=font.reverse.get(ch);if(code===undefined||!font.glyphFont.hasGlyphForCodePoint(ch.codePointAt(0))){valid=false;missing.add(ch);break;}codes.push(code);width+=font.widths.get(code)/1000*slot.size;}
  if(valid){const line=model.lines.find(l=>l.id===slot.lineId);if(width>line.width+0.001)return {ok:false,error:`Too wide for the entire line (${width.toFixed(1)} / ${line.width.toFixed(1)} pt).`};return {ok:true,text,slot,font,width,codes};}
 }
 return {ok:false,error:missing.size?`Original font cannot print: ${[...missing].join(' ')}. Edit this skill; fonts are never substituted.`:'Original embedded font cannot safely encode a replacement.'};
}
function validatePlan(model,plan){
 if(!Array.isArray(plan))fail('Invalid change plan.');const seen=new Set(),out=[];
 for(const row of plan){if(seen.has(row.id))fail('Each existing skill can be replaced only once.');seen.add(row.id);const r=replacement(model,row.id,String(row.text??''));if(!r.ok)fail(r.error);if(!r.unchanged)out.push(r);}
 const final=model.slots.map(s=>out.find(r=>r.slot.id===s.id)?.text??s.text),normalized=final.filter(Boolean).map(s=>s.toLowerCase());
 if(new Set(normalized).size!==normalized.length)fail('The final Skills section contains duplicate skills. Choose another replacement.');layoutLines(model,out);return out;
}
// Compact only edited Skills lines; each keeps its original start, baseline,
// fonts and right edge. Gaps reuse the original separator glyphs and spacing.
function layoutLines(model,changes,enforce=true){
 const byId=new Map(changes.map(r=>[r.slot.id,r])),out=[];
 for(const line of model.lines){
  if(!line.slots.some(s=>byId.has(s.id)))continue;
  const items=[];let x=line.x;
  for(const slot of line.slots){
   const change=byId.get(slot.id);if(change?.deleted)continue;
   if(items.length){const index=line.slots.indexOf(slot),gap=line.gaps[Math.max(0,index-1)];items.push({gap,x});x+=gap.width;}
   const width=change?change.width:slot.width;
   items.push({slot,change,x});x+=width;
  }
  const width=x-line.x;
  if(enforce&&width>line.width+0.001)fail(`${line.category} line is ${(width-line.width).toFixed(1)} pt too wide (${width.toFixed(1)} / ${line.width.toFixed(1)} pt). Remove another skill on this line or shorten a skill.`);
  out.push({line,items,width});
 }
 return out;
}
function measureLines(model,plan){const changes=plan.map(r=>replacement(model,r.id,String(r.text??''))).filter(r=>r.ok&&!r.unchanged);const rows=layoutLines(model,changes,false);return model.lines.map(line=>rows.find(r=>r.line.id===line.id)||{line,width:line.width,items:line.slots.map(slot=>({slot,x:slot.x}))});}
function layout(model,plan){return layoutLines(model,validatePlan(model,plan));}
async function apply(model,plan){
 const changes=validatePlan(model,plan);if(!changes.length)fail('Choose at least one skill change before downloading.');
 const lines=layoutLines(model,changes);
 // Always reload the immutable master; tailored copies never become the source.
 const target=await P.PDFDocument.load(model.bytes,{updateMetadata:false});
 const removed=new Set(lines.flatMap(r=>r.line.chars.map(c=>`${c.page}:${c.id}`)));
 for(const pg of model.pages){const edits=[];
  for(const show of pg.shows){if(!show.chars.some(c=>removed.has(`${c.page}:${c.id}`)))continue;
   const parts=[];for(const part of show.parts){if(part.type==='num'){parts.push(fmt(part.value));continue;}
    let run=[];const flush=()=>{if(run.length){parts.push('<'+hex(Uint8Array.from(run))+'>');run=[];}};
    for(const c of part.glyphs){if(removed.has(`${c.page}:${c.id}`)){flush();parts.push(fmt(-c.compensation));}else for(let j=0;j<(pg.fonts.get(c.font)?.unit||1);j++)run.push(part.bytes[c.off+j]);}flush();
   }
   edits.push({start:show.start,end:show.end,value:'['+parts.join(' ')+'] TJ'});
  }
  let content=pg.source;for(const e of edits.sort((a,b)=>b.start-a.start))content=content.slice(0,e.start)+e.value+content.slice(e.end);
  let additions='\n';
  function paint(font,size,color,x,y,codes){const b=[];for(const c of codes){if(font.type0)b.push(c>>8,c&255);else b.push(c);}additions+=`q BT /${font.name} ${fmt(size)} Tf 0 Tc 0 Tw 100 Tz 0 Ts 0 Tr ${color} 1 0 0 1 ${fmt(x)} ${fmt(y)} Tm <${hex(Uint8Array.from(b))}> Tj ET Q\n`;}
  function original(chars,dx){for(const c of chars)paint(pg.fonts.get(c.font),c.size,c.color,c.x+dx,c.y,[c.code]);}
  for(const row of lines.filter(r=>r.line.page===pg.index))for(const item of row.items){
   if(item.gap)original(item.gap.chars,item.x-item.gap.x);
   else if(item.change){const r=item.change;paint(r.font,r.slot.size,r.slot.color,item.x,r.slot.y,r.codes);}
   else original(item.slot.chars,item.x-item.slot.x);
  }
  const stream=target.context.flateStream(textToBytes('q\n'+content+'\nQ\n'+additions));target.getPage(pg.index).node.set(P.PDFName.of('Contents'),target.context.register(stream));
 }
 return target.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false});
}
root.ResumePDF={inspect,summary,replacement,validatePlan,layout,measureLines,apply,lex};
})(globalThis);
