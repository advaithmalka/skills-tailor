importScripts('capture.js');

// Capture remains tied to the tab that received the toolbar gesture, not whichever
// tab is active after a sidebar or a full-page view finishes opening.
const pendingCapture = new Map();
async function captureJob(tab) {
  const id = crypto.randomUUID();
  pendingCapture.set(tab.windowId, id);
  let capture = { title: tab.title || '', description: '', simplify: null };
  if (tab.id && /^https?:/.test(tab.url || '')) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, func: captureVisibleJob,
      });
      capture = results[0]?.result || capture;
    } catch {
      capture.error = 'Click the S toolbar icon on the job page to grant access, or paste the description and keywords.';
    }
  } else {
    capture.error = 'Open a job page and click S to capture its description and visible Simplify keywords.';
  }
  Object.assign(capture, { id, tabId: tab.id, windowId: tab.windowId });
  if (pendingCapture.get(tab.windowId) !== id) return null;
  await chrome.storage.session.set({
    ['capture_' + id]: capture,
    ['sidebar_capture_' + tab.windowId]: capture,
  });
  return capture;
}

chrome.action.onClicked.addListener(tab => {
  // Start both operations before the first await: sidePanel.open must retain the
  // toolbar's user gesture, and scraping must still target the original job tab.
  const captured = captureJob(tab);
  const opened = chrome.sidePanel?.open
    ? chrome.sidePanel.open({ windowId: tab.windowId }) : Promise.reject(new Error('Sidebar unavailable'));
  opened.catch(async () => {
    const capture = await captured;
    if (capture) await chrome.tabs.create({
      url: chrome.runtime.getURL('app.html') + '?capture=' + capture.id,
    });
  });
  captured.catch(error => console.error('Job capture failed:', error.message));
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('app.html'))) return;
  if (message.action !== 'REFRESH_JOB') return;
  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, windowId: message.windowId });
    if (!tab) throw new Error('No active job tab found.');
    return captureJob(tab);
  })().then(capture => respond({ capture })).catch(error => respond({ error: error.message }));
  return true;
});
