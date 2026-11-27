// Offers & Sales watch: a few times a day (inside the Closet Tools active hours) it opens a small
// Chrome window, reads Poshmark's and Depop's offers and sales pages (read only), and sends what it
// found to CrossLinkOS, which shows everything on one "Offers & Sales" page. New sales are recorded
// there automatically (item marked sold, delist task for the other site). It never answers an offer.
import { getAuto } from './autopost.js';
import { getPosh, isPoshBusy } from './poshbot.js';

const API = 'https://crosslinkos.vercel.app/api';
const ALARM = 'crosslinkos-offers-watch';
const EVERY_HOURS = [2.5, 4]; // a check every 2.5 to 4 hours

/** Pages to read. If a site moves its page, the next URL in the list is tried. */
const PAGES = {
  poshmark: {
    offers: ['https://poshmark.com/offers/my_offers', 'https://poshmark.com/news'],
    sales: ['https://poshmark.com/order/sales'],
  },
  depop: {
    offers: ['https://www.depop.com/sellinghub/offers/', 'https://www.depop.com/messages/'],
    sales: ['https://www.depop.com/sellinghub/sold-items/'],
  },
};

const between = (min, max) => min + Math.random() * (max - min);
let running = false;

export async function getWatch() {
  const { watch } = await chrome.storage.local.get('watch');
  return { on: true, lastRun: 0, nextRun: 0, log: [], summary: '', ...(watch ?? {}) };
}
async function setWatch(patch) { const next = { ...(await getWatch()), ...patch }; await chrome.storage.local.set({ watch: next }); return next; }
async function log(text) { const w = await getWatch(); await setWatch({ log: [{ at: new Date().toISOString(), text }, ...w.log].slice(0, 40) }); }
function notify(title, message) { try { chrome.notifications.create({ type: 'basic', iconUrl: 'icon-128.png', title, message, priority: 2 }); } catch { /* optional */ } }

async function api(path, key, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `CrossLinkOS answered ${response.status}.`);
  return data;
}

function inHours(hours) { const h = new Date().getHours(); return h >= hours.start && h < hours.end; }

async function openAndRead(windowState, url, mode) {
  if (!windowState.tabId) {
    const win = await chrome.windows.create({ url, focused: false, width: 520, height: 820, type: 'normal' });
    windowState.tabId = win.tabs[0].id; windowState.windowId = win.id;
  } else {
    await chrome.tabs.update(windowState.tabId, { url });
  }
  await new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(listener); clearTimeout(timer); resolve(); };
    const listener = (id, change) => { if (id === windowState.tabId && change.status === 'complete') done(); };
    const timer = setTimeout(done, 40_000);
    chrome.tabs.onUpdated.addListener(listener);
  });
  await new Promise((r) => setTimeout(r, between(2500, 4000)));
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try { return await chrome.tabs.sendMessage(windowState.tabId, { type: 'READ_PAGE', mode }); } catch { await new Promise((r) => setTimeout(r, 1500)); }
  }
  return { ok: false, stop: 'error', message: 'the page did not answer' };
}

/** Reads one site: the first page per mode that loads. Returns null when the site needs the seller. */
async function readSite(windowState, siteName) {
  const result = { offers: [], sales: [], offersComplete: false, notes: [] };
  for (const mode of ['offers', 'sales']) {
    let done = false;
    for (const url of PAGES[siteName][mode]) {
      const page = await openAndRead(windowState, url, mode);
      if (page.ok) {
        result[mode] = page.rows;
        if (mode === 'offers') result.offersComplete = /my_offers|sellinghub\/offers/.test(url) && page.rows.length > 0;
        result.notes.push(`${mode} ${page.rows.length}`);
        done = true; break;
      }
      if (page.stop === 'captcha' || page.stop === 'signed_out') return { stop: page.stop };
      // not_found / error: try the next page for this mode
    }
    if (!done) result.notes.push(`${mode} page not found`);
  }
  return result;
}

export async function runWatch({ manual = false } = {}) {
  if (running) { if (manual) await log('Already checking; one moment.'); return; }
  const w = await getWatch();
  if (!manual && !w.on) return;
  const auto = await getAuto();
  if (!auto.key) { await log('Paste your CrossLinkOS access key in "Auto-post approved drafts" below first; offers are saved with it.'); await scheduleWatch(); return; }
  if (isPoshBusy()) { await log('Closet Tools is mid-session; checking offers in a few minutes.'); await chrome.alarms.create(ALARM, { delayInMinutes: 5 }); return; }
  running = true;
  const windowState = { tabId: 0, windowId: 0 };
  const summary = [];
  try {
    if (manual) await log('Checking Poshmark and Depop offers and sales now (a small window will open, then close).');
    for (const siteName of ['poshmark', 'depop']) {
      const found = await readSite(windowState, siteName);
      const label = siteName === 'poshmark' ? 'Poshmark' : 'Depop';
      if (found.stop) {
        const why = found.stop === 'captcha' ? 'is showing a CAPTCHA (solve it there, then Check now)' : 'is signed out in Chrome (sign in, then Check now)';
        await log(`${label} ${why}.`); notify('CrossLinkOS: offers check needs you', `${label} ${why}.`);
        summary.push(`${label}: needs you`); continue;
      }
      const sync = await api('/offers/sync', auto.key, { marketplace: siteName, offersComplete: found.offersComplete, offers: found.offers, sales: found.sales });
      await log(`${label}: ${found.notes.join(', ')}${sync.firstSalesRead ? ' (past sales saved as history)' : ''}.`);
      summary.push(`${label}: ${found.offers.length} offer${found.offers.length === 1 ? '' : 's'}`);
      // Recorded sales get their "delist it now" alert from refreshDelists below.
      for (const sale of (sync.newSales ?? []).filter((s) => !s.recorded)) {
        notify(`Sold on ${label}: $${sale.amount}`, `${sale.title}. Open Offers & Sales in CrossLinkOS to pick which item it was.`);
      }
      if (sync.newOffers?.length) notify(`${sync.newOffers.length} new offer${sync.newOffers.length === 1 ? '' : 's'} on ${label}`, sync.newOffers.slice(0, 3).map((o) => `$${o.amount} · ${o.title}`).join('\n'));
      if (sync.bothSites) await log(`${sync.bothSites} item${sync.bothSites === 1 ? ' has' : 's have'} offers on both sites. Compare them in Offers & Sales.`);
    }
    await setWatch({ lastRun: Date.now(), summary: summary.join(' · ') });
    await refreshDelists();
    await verifyDelists(windowState);
  } catch (error) {
    await log(`Check failed: ${error instanceof Error ? error.message : 'unknown problem'}. Will try again later.`);
  } finally {
    if (windowState.windowId) await chrome.windows.remove(windowState.windowId).catch(() => undefined);
    running = false;
    await scheduleWatch();
  }
}

export async function scheduleWatch() {
  const w = await getWatch();
  await chrome.alarms.clear(ALARM);
  if (!w.on) return;
  const minutes = between(EVERY_HOURS[0], EVERY_HOURS[1]) * 60;
  await setWatch({ nextRun: Date.now() + minutes * 60_000 });
  await chrome.alarms.create(ALARM, { delayInMinutes: minutes });
}

export async function setWatchOn(on) {
  const w = await setWatch({ on });
  await log(on ? 'Offers & Sales watch on.' : 'Offers & Sales watch off.');
  await scheduleWatch();
  return w;
}

export function registerOffersWatch() {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALARM) return;
    const posh = await getPosh();
    if (!inHours(posh.hours)) { await chrome.alarms.create(ALARM, { delayInMinutes: 30 }); return; }
    void runWatch();
  });
  const ensure = async () => { const w = await getWatch(); if (w.on && !(await chrome.alarms.get(ALARM))) await chrome.alarms.create(ALARM, { delayInMinutes: 2 }); };
  chrome.runtime.onStartup.addListener(() => { void ensure(); });
  chrome.runtime.onInstalled.addListener(() => { void ensure(); });
}

// ---------------------------------------------------------- Sold -> delist alerts
// Every sale (recorded by hand, by Hermes or by the watch) creates a "delist from <other site>"
// task. These alerts make sure none is missed: a desktop alert per new task, a red count on the
// extension icon, a list at the top of the side panel, and a check that the listing really is gone.
const DELIST_ALARM = 'crosslinkos-delists';
const siteLabel = (m) => ({ poshmark: 'Poshmark', depop: 'Depop', mercari: 'Mercari' }[m] ?? m ?? 'another site');

export async function getDelists() {
  const { delists } = await chrome.storage.local.get('delists');
  return { tasks: [], seen: [], checkedAt: 0, ...(delists ?? {}) };
}
async function setDelists(patch) { const next = { ...(await getDelists()), ...patch }; await chrome.storage.local.set({ delists: next }); return next; }
async function setBadge(count) {
  try { await chrome.action.setBadgeText({ text: count ? String(count) : '' }); await chrome.action.setBadgeBackgroundColor({ color: '#c62828' }); } catch { /* optional */ }
}

export async function refreshDelists({ notifyNew = true } = {}) {
  const auto = await getAuto();
  if (!auto.key) return getDelists();
  const all = await api('/workflow/delisting-tasks', auto.key);
  const pending = (Array.isArray(all) ? all : []).filter((t) => ['pending', 'in_progress', 'failed'].includes(t.status));
  const state = await getDelists();
  const seen = new Set(state.seen);
  for (const task of pending) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    if (!notifyNew) continue;
    try {
      chrome.notifications.create(`delist-${task.id}`, {
        type: 'basic', iconUrl: 'icon-128.png', priority: 2, requireInteraction: true,
        title: `Sold on ${siteLabel(task.soldOn)}${task.soldFor ? `: $${task.soldFor}` : ''} · delist it from ${siteLabel(task.marketplace)}`,
        message: `${task.itemTitle}. Remove it from ${siteLabel(task.marketplace)} now so it can't sell twice.`,
        buttons: [{ title: task.listingUrl ? `Open the ${siteLabel(task.marketplace)} listing` : 'Open CrossLinkOS Orders' }],
      });
    } catch { /* optional */ }
  }
  const next = await setDelists({ tasks: pending, seen: [...seen].slice(-400), checkedAt: Date.now() });
  await setBadge(pending.length);
  return next;
}

export async function markDelisted(id, note) {
  const auto = await getAuto();
  if (!auto.key) throw new Error('Paste your access key in Auto-post first.');
  await api(`/workflow/delisting-tasks/${id}`, auto.key, { status: 'completed', note: note ?? 'Confirmed delisted in the extension.' }, 'PATCH');
  return refreshDelists({ notifyNew: false });
}

/** Opens each pending listing (read only) and closes the task when the page shows it is gone. */
export async function verifyDelists(sharedWindow) {
  const state = await getDelists();
  const toCheck = state.tasks.filter((t) => t.listingUrl);
  if (!toCheck.length) return { checked: 0, closed: 0 };
  const windowState = sharedWindow ?? { tabId: 0, windowId: 0 };
  let closed = 0;
  try {
    for (const task of toCheck) {
      const page = await openAndRead(windowState, task.listingUrl, 'listing');
      if (page.ok && page.gone) {
        await markDelisted(task.id, `Checked ${new Date().toLocaleString()}: ${page.why}.`);
        await log(`Delist confirmed: ${task.itemTitle} is no longer live on ${siteLabel(task.marketplace)}.`);
        closed += 1;
      } else if (page.ok) {
        await log(`Still live on ${siteLabel(task.marketplace)}: ${task.itemTitle}. Delist it there.`);
      }
    }
  } finally {
    if (!sharedWindow && windowState.windowId) await chrome.windows.remove(windowState.windowId).catch(() => undefined);
  }
  return { checked: toCheck.length, closed };
}

export function registerDelistAlerts() {
  const openFor = async (notificationId) => {
    if (!notificationId.startsWith('delist-')) return;
    const id = Number(notificationId.slice(7));
    const task = (await getDelists()).tasks.find((t) => t.id === id);
    await chrome.tabs.create({ url: task?.listingUrl || 'https://crosslinkos.vercel.app/offers' });
    chrome.notifications.clear(notificationId);
  };
  chrome.notifications.onClicked.addListener((id) => { void openFor(id); });
  chrome.notifications.onButtonClicked.addListener((id) => { void openFor(id); });
  chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === DELIST_ALARM) void refreshDelists().catch(() => undefined); });
  const ensure = async () => { await chrome.alarms.create(DELIST_ALARM, { delayInMinutes: 1, periodInMinutes: 20 }); };
  chrome.runtime.onStartup.addListener(() => { void ensure(); });
  chrome.runtime.onInstalled.addListener(() => { void ensure(); });
}
