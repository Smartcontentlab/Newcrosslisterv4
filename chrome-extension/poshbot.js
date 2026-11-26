// Poshmark Closet Tools: the schedule. Decides what to do next (share closet, follow back,
// follow the feed's closets and their followers), when, and how much, then hands one short
// session at a time to poshmark-tools.js in a separate Chrome window.
//
// Pacing is meant to look like a person, not a bot:
// - only inside the seller's active hours (default 8am-11pm, her time);
// - daily budgets that vary a little each day (default ~300 shares, ~150 follows, ~100 follow-backs);
// - 6-30 s between actions, 1-3 min between short sessions, a 8-25 min break every 25-45 actions;
// - stops on any CAPTCHA, limit or error and tells the seller; it never solves or skips one.

const ALARM = 'crosslinkos-poshbot';
const DEFAULTS = {
  on: false, paused: '', me: '',
  features: { share: true, follow: true, followBack: true },
  hours: { start: 8, end: 23 },
  caps: { share: 300, follow: 150, followBack: 100 },
  pace: { min: 6, max: 30 },
  day: { date: '', share: 0, follow: 0, followBack: 0, cap: { share: 0, follow: 0, followBack: 0 } },
  sharedAt: {}, closets: { queue: [], done: [], current: '', ownerFollowed: false }, lastFeedAt: 0,
  sinceBreak: 0, breakAfter: 30, tabId: null, windowId: null, log: [],
};
const SHARE_GAP_MS = 3 * 60 * 60 * 1000; // never share the same listing twice within 3 hours
const between = (min, max) => min + Math.random() * (max - min);
const localDate = () => new Date().toLocaleDateString('en-CA');
let running = false;

export async function getPosh() {
  const { posh } = await chrome.storage.local.get('posh');
  const merged = { ...DEFAULTS, ...(posh ?? {}) };
  for (const key of ['features', 'hours', 'caps', 'pace', 'day', 'closets']) merged[key] = { ...DEFAULTS[key], ...(posh?.[key] ?? {}) };
  return merged;
}
async function setPosh(patch) { const next = { ...(await getPosh()), ...patch }; await chrome.storage.local.set({ posh: next }); return next; }
async function log(text) { const p = await getPosh(); await setPosh({ log: [{ at: new Date().toISOString(), text }, ...p.log].slice(0, 60) }); }
function notify(title, message) { try { chrome.notifications.create({ type: 'basic', iconUrl: 'icon-128.png', title, message, priority: 2 }); } catch { /* optional */ } }

async function schedule(seconds) {
  await chrome.alarms.clear(ALARM);
  const p = await getPosh();
  if (p.on && !p.paused) await chrome.alarms.create(ALARM, { delayInMinutes: Math.max(0.1, seconds / 60) });
}

/** Seconds until the active window opens again (0 if open now). */
function secondsUntilActive(hours) {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  if (h >= hours.start && h < hours.end) return 0;
  const next = new Date(now);
  next.setHours(hours.start, Math.floor(between(0, 25)), 0, 0); // start at a slightly different minute each day
  if (h >= hours.end) next.setDate(next.getDate() + 1);
  return Math.max(60, (next - now) / 1000);
}

function newDay(p) {
  const vary = (n) => Math.round(n * between(0.85, 1.05)); // a little different every day
  return { date: localDate(), share: 0, follow: 0, followBack: 0, cap: { share: vary(p.caps.share), follow: vary(p.caps.follow), followBack: vary(p.caps.followBack) } };
}

async function toolTab(url) {
  const p = await getPosh();
  let tab = p.tabId ? await chrome.tabs.get(p.tabId).catch(() => null) : null;
  if (!tab) {
    // Its own small window, so it never takes over the seller's tabs; a visible (not minimised)
    // window keeps Poshmark's menus working.
    const win = await chrome.windows.create({ url, focused: false, width: 520, height: 820, type: 'normal' });
    tab = win.tabs[0];
    await setPosh({ tabId: tab.id, windowId: win.id });
  } else {
    await chrome.tabs.update(tab.id, { url });
  }
  await new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(listener); clearTimeout(timer); resolve(); };
    const listener = (id, change) => { if (id === tab.id && change.status === 'complete') done(); };
    const timer = setTimeout(done, 40_000);
    chrome.tabs.onUpdated.addListener(listener);
  });
  await new Promise((r) => setTimeout(r, between(2500, 4500)));
  return tab.id;
}

async function ask(tabId, message) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try { return await chrome.tabs.sendMessage(tabId, message); } catch { await new Promise((r) => setTimeout(r, 1500)); }
  }
  return { ok: false, stop: 'error', message: 'The Poshmark page did not answer.' };
}

function pickTask(p) {
  const left = {
    share: p.features.share ? p.day.cap.share - p.day.share : 0,
    followBack: p.features.followBack ? p.day.cap.followBack - p.day.followBack : 0,
    follow: p.features.follow ? p.day.cap.follow - p.day.follow : 0,
  };
  const total = Object.values(left).reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const [task, n] of Object.entries(left)) { if (n <= 0) continue; roll -= n; if (roll <= 0) return task; }
  return Object.keys(left).find((k) => left[k] > 0);
}

async function stopFor(reason, detail) {
  const words = {
    captcha: 'Poshmark is showing a CAPTCHA / security check. Solve it in the Poshmark window, then press Resume.',
    limit: 'Poshmark said to slow down (a limit or "try again later"). Closet Tools paused; wait an hour or two, then press Resume.',
    signed_out: 'You are signed out of Poshmark in Chrome. Sign in, then press Resume.',
    error: `Something went wrong on Poshmark${detail ? `: ${detail}` : ''}. Paused to be safe; press Resume to try again.`,
  };
  const message = words[reason] ?? words.error;
  await setPosh({ paused: message });
  await chrome.alarms.clear(ALARM);
  await log(`Paused: ${message}`);
  notify('CrossLinkOS Closet Tools paused', message);
}

export async function tick() {
  if (running) return;
  let p = await getPosh();
  if (!p.on || p.paused) return;
  running = true;
  try {
    const wait = secondsUntilActive(p.hours);
    if (wait > 0) { await schedule(wait); return; }
    if (p.day.date !== localDate()) p = await setPosh({ day: newDay(p) });
    const task = pickTask(p);
    if (!task) { await log('Done for today: daily limits reached.'); await schedule(secondsUntilActive({ ...p.hours, end: 0 }) || 6 * 3600); return; }

    if (!p.me) {
      const tabId = await toolTab('https://poshmark.com/feed');
      const who = await ask(tabId, { type: 'POSH_TASK', task: 'whoami' });
      if (!who.ok) { await stopFor(who.stop, who.message); return; }
      if (!who.me) { await stopFor('signed_out'); return; }
      p = await setPosh({ me: who.me });
    }
    const pace = { minPause: p.pace.min, maxPause: p.pace.max };
    const session = (left) => Math.max(1, Math.min(left, Math.round(between(6, 16))));

    if (task === 'share') {
      const cutoff = Date.now() - SHARE_GAP_MS;
      const skip = Object.entries(p.sharedAt).filter(([, at]) => at > cutoff).map(([id]) => id);
      const tabId = await toolTab(`https://poshmark.com/closet/${p.me}?availability=available`);
      const result = await ask(tabId, { type: 'POSH_TASK', task: 'share', max: session(p.day.cap.share - p.day.share), skip, ...pace });
      const sharedAt = Object.fromEntries(Object.entries(p.sharedAt).filter(([, at]) => at > Date.now() - 24 * 3600 * 1000));
      for (const id of result.shared ?? []) sharedAt[id] = Date.now();
      const n = (result.shared ?? []).length;
      p = await setPosh({ sharedAt, day: { ...p.day, share: p.day.share + n }, sinceBreak: p.sinceBreak + n });
      await log(n ? `Shared ${n} listing${n === 1 ? '' : 's'} to followers.` : 'Nothing to share right now (all shared in the last 3 hours).');
      if (result.stop && result.stop !== 'stopped') { await stopFor(result.stop, result.message); return; }
    } else if (task === 'followBack') {
      const tabId = await toolTab(`https://poshmark.com/closet/${p.me}/followers`);
      const result = await ask(tabId, { type: 'POSH_TASK', task: 'follow', max: session(p.day.cap.followBack - p.day.followBack), ...pace });
      const n = result.followed ?? 0;
      // Nobody new to follow back: stop spending today's follow-back budget on it.
      p = await setPosh({ day: { ...p.day, followBack: n ? p.day.followBack + n : p.day.cap.followBack }, sinceBreak: p.sinceBreak + n });
      await log(n ? `Followed back ${n} new follower${n === 1 ? '' : 's'}.` : 'No new followers to follow back for now.');
      if (result.stop && result.stop !== 'stopped') { await stopFor(result.stop, result.message); return; }
    } else {
      let closets = p.closets;
      if (!closets.current && !closets.queue.length) {
        const tabId = await toolTab('https://poshmark.com/feed');
        const feed = await ask(tabId, { type: 'POSH_TASK', task: 'feed', me: p.me });
        if (!feed.ok || feed.stop) { await stopFor(feed.stop || 'error', feed.message); return; }
        const fresh = (feed.closets ?? []).filter((c) => !closets.done.includes(c));
        closets = { ...closets, queue: fresh };
        await setPosh({ closets, lastFeedAt: Date.now() });
        await log(`Found ${fresh.length} closets in your feed to work through.`);
        if (!fresh.length) { p = await setPosh({ day: { ...p.day, follow: p.day.cap.follow } }); await schedule(between(60, 180)); return; }
      }
      if (!closets.current) closets = { ...closets, current: closets.queue[0], queue: closets.queue.slice(1), ownerFollowed: false };
      const closetName = closets.current;
      let followed = 0; let stop = null; let exhausted = false;
      if (!closets.ownerFollowed) {
        const tabId = await toolTab(`https://poshmark.com/closet/${closets.current}`);
        const owner = await ask(tabId, { type: 'POSH_TASK', task: 'follow', max: 1, ...pace });
        followed += owner.followed ?? 0; stop = owner.stop;
        closets = { ...closets, ownerFollowed: true };
      }
      if (!stop) {
        const tabId = await toolTab(`https://poshmark.com/closet/${closets.current}/followers`);
        const result = await ask(tabId, { type: 'POSH_TASK', task: 'follow', max: session(p.day.cap.follow - p.day.follow - followed), ...pace });
        followed += result.followed ?? 0; stop = result.stop; exhausted = Boolean(result.exhausted);
      }
      if (exhausted) closets = { ...closets, done: [...closets.done, closets.current].slice(-500), current: '' };
      p = await setPosh({ closets, day: { ...p.day, follow: p.day.follow + followed }, sinceBreak: p.sinceBreak + followed });
      await log(`Followed ${followed} from @${closetName}'s closet${exhausted ? ' (done with that closet)' : ''}.`);
      if (stop && stop !== 'stopped') { await stopFor(stop); return; }
    }

    if (p.sinceBreak >= p.breakAfter) {
      const minutes = Math.round(between(8, 25));
      await setPosh({ sinceBreak: 0, breakAfter: Math.round(between(25, 45)) });
      await log(`Taking a ${minutes}-minute break.`);
      await schedule(minutes * 60);
    } else {
      await schedule(between(60, 180));
    }
  } catch (error) {
    await stopFor('error', error instanceof Error ? error.message : '');
  } finally { running = false; }
}

export async function setPoshSettings(patch) {
  const p = await getPosh();
  const next = await setPosh({
    ...(patch.features ? { features: { ...p.features, ...patch.features } } : {}),
    ...(patch.hours ? { hours: { ...p.hours, ...patch.hours } } : {}),
    ...(patch.caps ? { caps: { ...p.caps, ...patch.caps }, day: { ...p.day, date: '' } } : {}),
  });
  return next;
}

export async function startPosh() {
  const p = await setPosh({ on: true, paused: '' });
  await log('Closet Tools turned on.');
  await schedule(5);
  return p;
}
export async function stopPosh() {
  const p = await setPosh({ on: false });
  await chrome.alarms.clear(ALARM);
  if (p.tabId) chrome.tabs.sendMessage(p.tabId, { type: 'POSH_STOP' }).catch(() => undefined);
  await log('Closet Tools turned off.');
  return p;
}
export async function resumePosh() {
  const p = await setPosh({ paused: '' });
  await log('Resumed.');
  await schedule(5);
  return p;
}

export function registerPoshbot() {
  chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === ALARM) void tick(); });
  const ensure = async () => { const p = await getPosh(); if (p.on && !p.paused && !(await chrome.alarms.get(ALARM))) await schedule(30); };
  chrome.runtime.onStartup.addListener(() => { void ensure(); });
  chrome.runtime.onInstalled.addListener(() => { void ensure(); });
  chrome.windows.onRemoved.addListener(async (windowId) => { const p = await getPosh(); if (p.windowId === windowId) await setPosh({ tabId: null, windowId: null }); });
  void ensure();
}
