// Auto-post mode: posts drafts the seller approved in CrossLinkOS (or through Hermes),
// one at a time, in the seller's own signed-in Chrome.
//
// Safety rules:
// - Only drafts with status "approved" are posted. Nothing else is touched.
// - A draft is posted only when every required field filled and its photos attached;
//   otherwise it goes back to CrossLinkOS as "Needs attention" with the reason.
// - CAPTCHA or security check: auto-post pauses and tells the seller. It never tries to solve it.
// - Spaced 2 to 5 minutes apart, at most DAILY_LIMIT posts a day, pauses after 2 failures in a row.

const API = 'https://crosslinkos.vercel.app/api';
const ALARM = 'crosslinkos-autopost';
const DAILY_LIMIT = 25;
const START_URLS = { poshmark: 'https://poshmark.com/create-listing', depop: 'https://www.depop.com/products/create/' };
const REQUIRED = {
  poshmark: (draft) => ['title', 'description', 'price', 'category', 'condition', ...(draft.details?.size ? ['size'] : [])],
  depop: (draft) => ['description', 'price', 'category', 'condition', ...(draft.details?.size ? ['size'] : [])],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const today = () => new Date().toISOString().slice(0, 10);
let busy = false;

export async function getAuto() {
  const { auto } = await chrome.storage.local.get('auto');
  return { key: '', enabled: false, paused: '', postedDate: '', postedCount: 0, failuresInRow: 0, log: [], ...(auto ?? {}) };
}
async function setAuto(patch) {
  const next = { ...(await getAuto()), ...patch };
  await chrome.storage.local.set({ auto: next });
  return next;
}
async function log(text) {
  const auto = await getAuto();
  await setAuto({ log: [{ at: new Date().toISOString(), text }, ...auto.log].slice(0, 30) });
}
function notify(title, message) {
  try { chrome.notifications.create({ type: 'basic', iconUrl: 'icon-128.png', title, message, priority: 2 }); } catch { /* notifications are optional */ }
}

async function api(path, key, init = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `CrossLinkOS answered ${response.status}.`);
  return body;
}

export async function scheduleNext(minMinutes = 2, maxMinutes = 5) {
  const auto = await getAuto();
  await chrome.alarms.clear(ALARM);
  if (auto.enabled && !auto.paused) await chrome.alarms.create(ALARM, { delayInMinutes: minMinutes + Math.random() * (maxMinutes - minMinutes) });
}

export async function setEnabled(enabled, key) {
  const patch = { enabled, paused: '', failuresInRow: 0 };
  if (typeof key === 'string') patch.key = key.trim();
  const auto = await setAuto(patch);
  if (enabled && !auto.key) { await setAuto({ enabled: false }); throw new Error('Paste your CrossLinkOS access key first.'); }
  if (enabled) {
    try { await api('/autopilot/review?status=approved', auto.key); }
    catch (error) { await setAuto({ enabled: false }); throw new Error(`CrossLinkOS did not accept the key: ${error instanceof Error ? error.message : 'unknown problem'}`); }
    await log('Auto-post turned on.'); await scheduleNext(0.1, 0.2);
  }
  else { await chrome.alarms.clear(ALARM); await log('Auto-post turned off.'); }
  return getAuto();
}

function waitForTabLoad(tabId, timeoutMs = 45_000) {
  return new Promise((resolve) => {
    const done = (ok) => { chrome.tabs.onUpdated.removeListener(listener); clearTimeout(timer); resolve(ok); };
    const listener = (id, change) => { if (id === tabId && change.status === 'complete') done(true); };
    const timer = setTimeout(() => done(false), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => { if (tab.status === 'complete') done(true); }).catch(() => done(false));
  });
}

async function sendToTab(tabId, message, attempts = 8) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await chrome.tabs.sendMessage(tabId, message); } catch { await sleep(1500); }
  }
  throw new Error('The marketplace page did not answer. It may still be loading.');
}

/** Fill, check, then press List / Post step by step until the listing page appears. */
async function postOne(draft) {
  // In front: Chrome barely runs background tabs (menus don't open, forms don't finish loading).
  const tab = await chrome.tabs.create({ url: START_URLS[draft.marketplace], active: true });
  try {
    await waitForTabLoad(tab.id);
    await sleep(2500);
    const fill = await sendToTab(tab.id, { type: 'FILL_DRAFT', draft });
    if (!fill?.ok) return { ok: false, keepTab: tab.id, message: fill?.message ?? 'The form could not be filled.' };
    const missing = REQUIRED[draft.marketplace](draft).filter((field) => !fill.filled.includes(field));
    if (missing.length) return { ok: false, keepTab: tab.id, message: `Not posted: ${missing.join(', ')} did not fill. ${fill.manual?.length ? `To do by hand: ${fill.manual.join(', ')}.` : ''}`.trim() };
    if (draft.photos?.length && !fill.photos) return { ok: false, keepTab: tab.id, message: 'Not posted: the photos could not be attached.' };
    await sleep(2000 + Math.random() * 2000); // let the form settle, like a person checking it
    let lastReason = '';
    let clicked = false;
    for (let step = 0; step < 12; step += 1) {
      const result = await sendToTab(tab.id, { type: 'AUTO_STEP', platform: draft.marketplace }, 4).catch(() => ({ state: 'waiting', reason: 'Page is changing.' }));
      if (result.state === 'done') return { ok: true, url: result.url, tabId: tab.id };
      if (result.state === 'captcha') return { ok: false, captcha: true, keepTab: tab.id, message: `${draft.marketplace} is showing a CAPTCHA or security check.` };
      if (result.state === 'blocked') return { ok: false, keepTab: tab.id, message: result.reason };
      if (result.state === 'clicked') clicked = true;
      lastReason = result.reason ?? lastReason;
      await sleep(result.state === 'clicked' ? 4000 : 2500);
    }
    // Last look: the marketplace may have opened the new listing without the page settling.
    const finalUrl = (await chrome.tabs.get(tab.id).catch(() => null))?.url ?? '';
    if (/poshmark\.com\/listing\/|depop\.com\/products\/(?!create|edit)/i.test(finalUrl)) return { ok: true, url: finalUrl.split(/[?#]/)[0], tabId: tab.id };
    // After a List/Post click it may well be live: never re-post it automatically.
    return { ok: false, keepTab: tab.id, message: clicked
      ? `It may have posted, but the listing page did not open, so the link is missing. Check your ${draft.marketplace} closet; if it is there, paste its link on the Draft Board and press I reviewed and published it.`
      : `Not posted. ${lastReason} Check the open ${draft.marketplace} tab.`.trim() };
  } catch (error) {
    return { ok: false, keepTab: tab.id, message: error instanceof Error ? error.message : 'Auto-post failed.' };
  }
}

export async function runOnce() {
  if (busy) return;
  const auto = await getAuto();
  if (!auto.enabled || auto.paused || !auto.key) return;
  busy = true;
  try {
    const count = auto.postedDate === today() ? auto.postedCount : 0;
    if (count >= DAILY_LIMIT) { await log(`Daily limit of ${DAILY_LIMIT} posts reached. Continuing tomorrow.`); await scheduleNext(60, 90); return; }
    const { next } = await api('/autopilot/queue', auto.key);
    if (!next) { await scheduleNext(4, 6); return; }
    await log(`Posting "${next.title}" to ${next.marketplace}…`);
    const result = await postOne(next);
    if (result.ok) {
      await api(`/autopilot/drafts/${next.draftId}/result`, auto.key, { method: 'POST', body: JSON.stringify({ ok: true, url: result.url }) });
      await setAuto({ postedDate: today(), postedCount: count + 1, failuresInRow: 0 });
      await log(`Posted "${next.title}" to ${next.marketplace}: ${result.url}`);
      setTimeout(() => { chrome.tabs.remove(result.tabId).catch(() => undefined); }, 8000);
      await scheduleNext(2, 5);
      return;
    }
    await api(`/autopilot/drafts/${next.draftId}/result`, auto.key, { method: 'POST', body: JSON.stringify({ ok: false, message: result.message.slice(0, 480) }) }).catch(() => undefined);
    await log(`Not posted ("${next.title}", ${next.marketplace}): ${result.message}`);
    if (result.captcha) {
      await setAuto({ paused: `${result.message} Solve it in the open tab, then press Resume.` });
      notify('CrossLinkOS auto-post paused', `${result.message} Solve it in the open tab, then press Resume in the extension.`);
      return;
    }
    const failures = (await getAuto()).failuresInRow + 1;
    if (failures >= 2) {
      await setAuto({ failuresInRow: failures, paused: 'Two posts in a row did not go through. Check the open tabs, then press Resume.' });
      notify('CrossLinkOS auto-post paused', 'Two posts in a row did not go through. Check the open tabs, then press Resume.');
      return;
    }
    await setAuto({ failuresInRow: failures });
    await scheduleNext(2, 5);
  } catch (error) {
    await log(`Auto-post check failed: ${error instanceof Error ? error.message : 'unknown problem'}`);
    await scheduleNext(5, 8);
  } finally { busy = false; }
}

/** If auto-post is on but no check is scheduled (Chrome restarted, or the extension was reloaded or updated), schedule one. */
async function ensureScheduled() {
  const auto = await getAuto();
  if (!auto.enabled || auto.paused) return;
  if (!(await chrome.alarms.get(ALARM))) await scheduleNext(0.2, 0.5);
}

export function registerAutopost() {
  chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === ALARM) void runOnce(); });
  chrome.runtime.onStartup.addListener(() => { void ensureScheduled(); });
  chrome.runtime.onInstalled.addListener(() => { void ensureScheduled(); });
  void ensureScheduled(); // every time the service worker wakes
}
