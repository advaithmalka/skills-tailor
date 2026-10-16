importScripts('capture.js');
chrome.action.onClicked.addListener(async tab=>{
 let capture={title:tab.title||'',description:'',simplify:null};
 if(tab.id&&/^https?:/.test(tab.url||''))try{const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:captureVisibleJob});capture=results[0]?.result||capture;}catch{capture.error='Page capture unavailable. Paste the job description and keywords instead.';}
 const id=crypto.randomUUID();await chrome.storage.session.set({['capture_'+id]:capture});
 await chrome.tabs.create({url:chrome.runtime.getURL('app.html')+'?capture='+id});
});
