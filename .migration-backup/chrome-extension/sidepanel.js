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
void refresh();
