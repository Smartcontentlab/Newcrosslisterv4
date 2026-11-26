const queueElement = document.querySelector('#queue');
const tabElement = document.querySelector('#active-tab');
const statusElement = document.querySelector('#status');
const refreshButton = document.querySelector('#refresh');
const clearButton = document.querySelector('#clear');

const startUrls = {
  poshmark: 'https://poshmark.com/create-listing',
  depop: 'https://www.depop.com/sell/',
  mercari: 'https://www.mercari.com/sell/',
};

let activePlatform = null;

function platformFromUrl(value) {
  try {
    const host = new URL(value).hostname;
    if (host.endsWith('poshmark.com')) return 'poshmark';
    if (host.endsWith('depop.com')) return 'depop';
    if (host.endsWith('mercari.com')) return 'mercari';
  } catch { /* empty */ }
  return null;
}

function titleCase(value) { return value ? value[0].toUpperCase() + value.slice(1) : ''; }
function setStatus(text, kind = '') { statusElement.textContent = text; statusElement.className = `status ${kind}`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activePlatform = platformFromUrl(tab?.url ?? '');
  if (activePlatform) {
    tabElement.innerHTML = `<strong>Active tab: ${titleCase(activePlatform)}.</strong><br>Open the listing form, then choose Fill draft. The extension will stop before save or publish.`;
    try {
      const probe = await chrome.runtime.sendMessage({ type: 'PROBE_SESSION' });
      if (probe.ok) setStatus(`${titleCase(probe.platform)} local session: ${String(probe.session).replace('_', ' ')}.`, probe.session === 'signed_in' ? 'good' : '');
    } catch { setStatus('Open the marketplace listing form to check its local session.'); }
  } else {
    tabElement.innerHTML = '<strong>Open Poshmark, Depop, or Mercari first.</strong><br>The extension can only fill a matching marketplace tab that you have opened yourself.';
    setStatus('');
  }
  return tab;
}

async function loadQueue() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_QUEUE' });
  const queue = response?.queue ?? [];
  queueElement.innerHTML = '';
  if (!queue.length) {
    queueElement.innerHTML = '<div class="empty">No local drafts are queued. Select “Needs posted” items in the CrossLinkOS Draft Board and choose Prepare extension handoff.</div>';
    return;
  }
  queue.forEach((draft) => {
    const card = document.createElement('article');
    card.className = 'card';
    const canFill = activePlatform === draft.marketplace && draft.state === 'ready';
    const action = draft.state === 'ready' ? (canFill ? 'Fill draft in this form' : `Open ${titleCase(draft.marketplace)} listing form`) : draft.state === 'prefilled' ? 'Filled — review in marketplace' : 'Needs attention — retry after form loads';
    const buttonClass = canFill ? 'accent' : 'primary';
    const disabled = draft.state === 'prefilled';
    card.innerHTML = `<div class="top"><span class="platform">${escapeHtml(draft.marketplace[0])} · ${escapeHtml(draft.marketplace)}</span><span class="state ${escapeHtml(draft.state)}">${escapeHtml(String(draft.state).replace('_', ' '))}</span></div><h2>${escapeHtml(draft.title)}</h2><p class="meta">$${Number(draft.price || 0).toFixed(2)} · ${draft.tags.length ? escapeHtml(draft.tags.slice(0, 4).join(' · ')) : 'No tags'}</p><p class="meta">${escapeHtml(draft.photoNotice || 'Upload photos manually in the marketplace form.')}</p><button class="${buttonClass}" data-draft-id="${draft.draftId}" ${disabled ? 'disabled' : ''}>${escapeHtml(action)}</button>`;
    const button = card.querySelector('button');
    button.addEventListener('click', () => handleDraft(draft));
    queueElement.append(card);
  });
}

async function handleDraft(draft) {
  if (activePlatform !== draft.marketplace) {
    await chrome.runtime.sendMessage({ type: 'OPEN_LISTING_FORM', marketplace: draft.marketplace });
    setStatus(`Opening ${titleCase(draft.marketplace)}. Wait for its listing form to load, then choose Fill draft.`, 'good');
    return;
  }
  setStatus(`Filling ${titleCase(draft.marketplace)} form…`);
  const response = await chrome.runtime.sendMessage({ type: 'FILL_DRAFT', draft });
  if (response?.ok) setStatus(response.message || 'Form filled. Review it before you save or publish.', 'good');
  else setStatus(response?.error || response?.message || 'The form could not be filled. No save or publish action was taken.', 'error');
  await loadQueue();
}

async function refresh() {
  refreshButton.disabled = true;
  try { await currentTab(); await loadQueue(); }
  finally { refreshButton.disabled = false; }
}

refreshButton.addEventListener('click', refresh);
clearButton.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'CLEAR_QUEUE' });
  setStatus('Local queue cleared. CrossLinkOS draft records were not deleted.');
  await loadQueue();
});

chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'session') void loadQueue(); });
// Follow the active tab, so after "Open … listing form" the button turns into "Fill draft" on its own.
chrome.tabs.onActivated.addListener(() => void refresh());
chrome.tabs.onUpdated.addListener((_tabId, change, tab) => { if (tab.active && (change.status === 'complete' || change.url)) void refresh(); });
void refresh();

// ---------------------------------------------------------------- auto-post
const autoKey = document.querySelector('#auto-key');
const autoToggle = document.querySelector('#auto-toggle');
const autoNow = document.querySelector('#auto-now');
const autoStatus = document.querySelector('#auto-status');
const autoLog = document.querySelector('#auto-log');

function renderAuto(auto) {
  if (!auto) return;
  if (auto.key && !autoKey.value) autoKey.placeholder = `Saved key …${auto.key.slice(-4)}`;
  const posted = auto.postedDate === new Date().toISOString().slice(0, 10) ? auto.postedCount : 0;
  if (auto.paused) { autoToggle.textContent = 'Resume'; autoStatus.textContent = `Paused: ${auto.paused}`; autoStatus.className = 'status error'; }
  else if (auto.enabled) { autoToggle.textContent = 'Turn off auto-post'; autoStatus.textContent = `On. Posted today: ${posted}. Checks for approved drafts every few minutes. It only posts drafts you approved; an empty queue means nothing is approved yet.`; autoStatus.className = 'status good'; }
  else { autoToggle.textContent = 'Turn on auto-post'; autoStatus.textContent = 'Off.'; autoStatus.className = 'status'; }
  autoLog.innerHTML = (auto.log ?? []).slice(0, 8).map((entry) => `<li>${escapeHtml(new Date(entry.at).toLocaleTimeString())} · ${escapeHtml(entry.text)}</li>`).join('');
}

async function loadAuto() { const response = await chrome.runtime.sendMessage({ type: 'AUTO_GET' }); renderAuto(response?.auto); return response?.auto; }

autoToggle.addEventListener('click', async () => {
  autoToggle.disabled = true;
  try {
    const current = await loadAuto();
    const message = current?.paused ? { type: 'AUTO_RESUME' } : { type: 'AUTO_SET', enabled: !current?.enabled, key: autoKey.value.trim() || undefined };
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || 'Auto-post could not be changed.');
    autoKey.value = '';
    renderAuto(response.auto);
  } catch (error) { autoStatus.textContent = error instanceof Error ? error.message : 'Auto-post could not be changed.'; autoStatus.className = 'status error'; }
  finally { autoToggle.disabled = false; }
});
autoNow.addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'AUTO_RUN_NOW' }); autoStatus.textContent = 'Checking for approved drafts…'; });
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.auto) renderAuto(changes.auto.newValue); });
void loadAuto();

// ---------------------------------------------------------- Poshmark Closet Tools
const poshEl = (id) => document.querySelector(`#${id}`);
const poshToggle = poshEl('posh-toggle');
const poshStatus = poshEl('posh-status');

function renderPosh(p) {
  if (!p) return;
  poshEl('posh-share').checked = p.features.share;
  poshEl('posh-follow').checked = p.features.follow;
  poshEl('posh-followback').checked = p.features.followBack;
  for (const [id, value] of [['posh-cap-share', p.caps.share], ['posh-cap-follow', p.caps.follow], ['posh-cap-followback', p.caps.followBack], ['posh-start', p.hours.start], ['posh-end', p.hours.end]]) {
    const el = poshEl(id); if (document.activeElement !== el) el.value = value;
  }
  const today = p.day.date === new Date().toLocaleDateString('en-CA') ? p.day : { share: 0, follow: 0, followBack: 0, cap: p.caps };
  const counts = `Today: ${today.share}/${today.cap.share || p.caps.share} shares, ${today.follow}/${today.cap.follow || p.caps.follow} follows, ${today.followBack} follow-backs.`;
  if (p.paused) { poshToggle.textContent = 'Resume'; poshStatus.textContent = `Paused: ${p.paused}`; poshStatus.className = 'status error'; }
  else if (p.on) { poshToggle.textContent = 'Stop Closet Tools'; poshStatus.textContent = `On${p.me ? ` for @${p.me}` : ''}. ${counts}`; poshStatus.className = 'status good'; }
  else { poshToggle.textContent = 'Start Closet Tools'; poshStatus.textContent = `Off. ${counts}`; poshStatus.className = 'status'; }
  poshEl('posh-log').innerHTML = (p.log ?? []).slice(0, 10).map((e) => `<li>${escapeHtml(new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))} · ${escapeHtml(e.text)}</li>`).join('');
}
async function poshSend(message) { const r = await chrome.runtime.sendMessage(message); if (r?.posh) renderPosh(r.posh); return r; }
const numberOf = (id, fallback) => { const n = Number(poshEl(id).value); return Number.isFinite(n) && n >= 0 ? n : fallback; };
async function savePoshSettings() {
  await poshSend({ type: 'POSH_SETTINGS', patch: {
    features: { share: poshEl('posh-share').checked, follow: poshEl('posh-follow').checked, followBack: poshEl('posh-followback').checked },
    caps: { share: numberOf('posh-cap-share', 300), follow: numberOf('posh-cap-follow', 150), followBack: numberOf('posh-cap-followback', 100) },
    hours: { start: Math.min(23, numberOf('posh-start', 8)), end: Math.min(24, Math.max(1, numberOf('posh-end', 23))) },
  } });
}
for (const id of ['posh-share', 'posh-follow', 'posh-followback', 'posh-cap-share', 'posh-cap-follow', 'posh-cap-followback', 'posh-start', 'posh-end']) poshEl(id).addEventListener('change', () => { void savePoshSettings(); });
poshToggle.addEventListener('click', async () => {
  const { posh } = await chrome.runtime.sendMessage({ type: 'POSH_GET' });
  if (posh.paused) await poshSend({ type: 'POSH_RESUME' });
  else if (posh.on) await poshSend({ type: 'POSH_STOP_ALL' });
  else { await savePoshSettings(); await poshSend({ type: 'POSH_START' }); }
});
poshEl('posh-now').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'POSH_RUN_NOW' }); poshStatus.textContent = 'Starting a session…'; });
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.posh) renderPosh(changes.posh.newValue && { ...changes.posh.newValue }); });
void chrome.runtime.sendMessage({ type: 'POSH_GET' }).then((r) => renderPosh(r?.posh));

// ---------------------------------------------------------- Offers & Sales watch
const watchEl = (id) => document.querySelector(`#${id}`);
const timeOf = (ms) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
function renderWatch(w) {
  if (!w) return;
  watchEl('watch-on').checked = w.on;
  const last = w.lastRun ? `Last checked ${timeOf(w.lastRun)}${w.summary ? ` (${w.summary})` : ''}.` : 'Not checked yet.';
  const next = w.on && w.nextRun ? ` Next check around ${timeOf(w.nextRun)}.` : '';
  watchEl('watch-status').textContent = `${w.on ? 'On.' : 'Off.'} ${last}${next}`;
  watchEl('watch-status').className = w.on ? 'status good' : 'status';
  watchEl('watch-log').innerHTML = (w.log ?? []).slice(0, 8).map((e) => `<li>${escapeHtml(new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))} · ${escapeHtml(e.text)}</li>`).join('');
}
watchEl('watch-on').addEventListener('change', async (event) => { const r = await chrome.runtime.sendMessage({ type: 'WATCH_SET', on: event.target.checked }); renderWatch(r?.watch); });
watchEl('watch-now').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'WATCH_RUN_NOW' }); watchEl('watch-status').textContent = 'Checking now…'; });
watchEl('watch-open').addEventListener('click', () => { void chrome.tabs.create({ url: 'https://crosslinkos.vercel.app/offers' }); });
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.watch) renderWatch(changes.watch.newValue); });
void chrome.runtime.sendMessage({ type: 'WATCH_GET' }).then((r) => renderWatch(r?.watch));
