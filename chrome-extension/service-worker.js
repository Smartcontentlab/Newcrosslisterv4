const CROSS_LINK_ORIGIN = 'https://newcrosslisterv4000.vercel.app';
const MARKETPLACES = ['poshmark', 'depop', 'mercari'];

const startUrls = {
  poshmark: 'https://poshmark.com/create-listing',
  depop: 'https://www.depop.com/sell/',
  mercari: 'https://www.mercari.com/sell/',
};

function isMarketplace(value) {
  return MARKETPLACES.includes(value);
}

function platformFromUrl(value) {
  try {
    const host = new URL(value).hostname;
    if (host.endsWith('poshmark.com')) return 'poshmark';
    if (host.endsWith('depop.com')) return 'depop';
    if (host.endsWith('mercari.com')) return 'mercari';
  } catch { /* empty */ }
  return null;
}

async function getState() {
  const result = await chrome.storage.session.get(['queue', 'connections', 'lastHandoffAt']);
  return {
    queue: Array.isArray(result.queue) ? result.queue : [],
    connections: result.connections && typeof result.connections === 'object' ? result.connections : {},
    lastHandoffAt: result.lastHandoffAt,
  };
}

async function publishToCrossLinkOS(message) {
  const tabs = await chrome.tabs.query({ url: `${CROSS_LINK_ORIGIN}/*` });
  await Promise.all(tabs.map(async (tab) => {
    if (tab.id) {
      try { await chrome.tabs.sendMessage(tab.id, message); } catch { /* The bridge is not loaded in this tab yet. */ }
    }
  }));
}

async function queueDrafts(payload) {
  if (!payload || !Array.isArray(payload.drafts)) throw new Error('The handoff did not include a draft queue.');
  const drafts = payload.drafts.filter((draft) => draft && Number.isInteger(draft.draftId) && Number.isInteger(draft.itemId) && isMarketplace(draft.marketplace) && typeof draft.title === 'string' && typeof draft.description === 'string' && Number.isFinite(Number(draft.price))).map((draft) => ({
    itemId: draft.itemId,
    draftId: draft.draftId,
    marketplace: draft.marketplace,
    title: draft.title.slice(0, 140),
    description: draft.description.slice(0, 5000),
    tags: Array.isArray(draft.tags) ? draft.tags.filter((tag) => typeof tag === 'string').slice(0, 25) : [],
    price: Number(draft.price),
    photoCount: Number(draft.photoCount) || 0,
    photoNotice: typeof draft.photoNotice === 'string' ? draft.photoNotice.slice(0, 240) : '',
    state: 'ready',
    receivedAt: new Date().toISOString(),
  }));
  if (!drafts.length) throw new Error('No valid ready P/D/M drafts were selected.');
  await chrome.storage.session.set({ queue: drafts, lastHandoffAt: new Date().toISOString() });
  return { count: drafts.length };
}

async function updateQueueEntry(draftId, patch) {
  const state = await getState();
  const queue = state.queue.map((draft) => draft.draftId === draftId ? { ...draft, ...patch } : draft);
  await chrome.storage.session.set({ queue });
  return queue.find((draft) => draft.draftId === draftId) ?? null;
}

async function reportSession(platform, session) {
  if (!isMarketplace(platform)) return;
  const state = await getState();
  const connections = { ...state.connections, [platform]: { session, checkedAt: new Date().toISOString() } };
  await chrome.storage.session.set({ connections });
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'QUEUE_DRAFTS') {
      const result = await queueDrafts(message.payload);
      sendResponse({ ok: true, ...result });
      return;
    }
    if (message?.type === 'GET_QUEUE') {
      const state = await getState();
      sendResponse({ ok: true, ...state });
      return;
    }
    if (message?.type === 'CLEAR_QUEUE') {
      await chrome.storage.session.set({ queue: [] });
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'OPEN_LISTING_FORM') {
      if (!isMarketplace(message.marketplace)) throw new Error('Unsupported marketplace.');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await chrome.tabs.update(tab.id, { url: startUrls[message.marketplace] });
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'PROBE_SESSION') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab found.');
      const platform = platformFromUrl(tab.url ?? '');
      if (!platform) throw new Error('Open Poshmark, Depop, or Mercari in the active tab first.');
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'PROBE_SESSION', platform });
      if (result?.session) await reportSession(platform, result.session);
      sendResponse({ ok: true, platform, session: result?.session ?? 'unknown' });
      return;
    }
    if (message?.type === 'SESSION_REPORT') {
      await reportSession(message.platform, message.session);
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'FILL_DRAFT') {
      const draft = message.draft;
      if (!draft || !isMarketplace(draft.marketplace)) throw new Error('Invalid draft request.');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab found.');
      const platform = platformFromUrl(tab.url ?? '');
      if (platform !== draft.marketplace) throw new Error(`Open the ${draft.marketplace} listing form first, then choose Fill draft.`);
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'FILL_DRAFT', draft });
      const status = result?.ok ? 'prefilled' : 'needs_attention';
      await updateQueueEntry(draft.draftId, { state: status, lastAttemptAt: new Date().toISOString(), result: result?.message ?? '' });
      await publishToCrossLinkOS({ type: 'FILL_STATUS', update: { draftId: draft.draftId, status } });
      sendResponse({ ok: Boolean(result?.ok), status, message: result?.message ?? 'The marketplace form could not be filled.' });
      return;
    }
    sendResponse({ ok: false, error: 'Unknown extension request.' });
  })().catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Unexpected extension error.' }));
  return true;
});
