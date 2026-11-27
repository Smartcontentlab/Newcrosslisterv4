// Poshmark Closet Tools: the hands. Runs inside a poshmark.com tab and does one short session of
// actions that the service worker (poshbot.js) asks for: share listings to followers, or follow
// people. It clicks Poshmark's own buttons, found by what they say ("Share", "To My Followers",
// "Follow"), with human pauses between actions. It stops the moment Poshmark shows a CAPTCHA,
// a limit or an error message, and never tries to get around one.
(() => {
  if (window.__crosslinkosPoshTools) return;
  window.__crosslinkosPoshTools = true;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const between = (min, max) => min + Math.random() * (max - min);
  const norm = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const text = (el) => norm(el?.innerText || el?.textContent || el?.getAttribute?.('aria-label') || '');
  let stopRequested = false;

  async function waitFor(find, timeoutMs = 6000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) { const found = find(); if (found) return found; await sleep(200); }
    return null;
  }

  /** Something Poshmark shows when it wants the account to slow down: never push past it. */
  function blocker() {
    if (document.querySelector("iframe[src*='captcha' i], iframe[src*='recaptcha' i], iframe[src*='hcaptcha' i], iframe[src*='arkoselabs' i], [id*='captcha' i], .g-recaptcha")) return 'captcha';
    const modals = [...document.querySelectorAll("[role='dialog'], .modal, [class*='modal' i], [class*='toast' i], [class*='flash' i], [class*='alert' i]")].filter(visible);
    const said = modals.map((m) => text(m)).join(' ');
    if (/verify (that )?you('| a)re (a )?human|captcha|security check|unusual activity/.test(said)) return 'captcha';
    if (/(reached|exceeded).{0,30}limit|too many|slow down|try again later|temporarily (blocked|restricted|unavailable)|something went wrong|action (is )?blocked|not allowed right now/.test(said)) return 'limit';
    if (/\/login|\/signup/.test(location.pathname)) return 'signed_out';
    return null;
  }

  /** Human pause between actions, cut short (and reported) if Poshmark shows a blocker meanwhile. */
  async function humanPause(minS, maxS) {
    const end = Date.now() + between(minS, maxS) * 1000;
    while (Date.now() < end) {
      if (stopRequested) return 'stopped';
      const found = blocker();
      if (found) return found;
      await sleep(500);
    }
    return null;
  }

  async function scrollToLoad(maxItems, countFn, rounds = 30) {
    let last = -1;
    for (let i = 0; i < rounds && countFn() < maxItems; i += 1) {
      const now = countFn();
      if (now === last && i > 2) break;
      last = now;
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(between(1200, 2200));
    }
    window.scrollTo(0, 0);
  }

  /** The signed-in seller's Poshmark username, from whatever the page offers. */
  function myUsername() {
    const handle = (h) => (h && /^[A-Za-z0-9_.-]{2,40}$/.test(h) ? h : null);
    // 0. The header's own "@username" link to the seller's closet (what Poshmark shows in Nov 2026).
    const at = [...document.querySelectorAll("header a[href^='/closet/'], nav a[href^='/closet/'], a[href^='/closet/']")]
      .find((a) => /^@/.test((a.textContent || '').trim()));
    const fromAt = handle(at?.getAttribute('href')?.split('/closet/')[1]?.split(/[/?#]/)[0]);
    if (fromAt) return fromAt;
    // 1. Poshmark's "ui" cookie holds the signed-in user's display handle (dh).
    try {
      const raw = document.cookie.split('; ').find((c) => c.startsWith('ui='));
      if (raw) { const ui = JSON.parse(decodeURIComponent(raw.slice(3))); const h = handle(ui?.dh); if (h) return h; }
    } catch { /* not there or not JSON */ }
    // 2. The account menu's "My Closet" link (textContent also reads the hidden dropdown).
    const closetLinks = [...document.querySelectorAll("a[href^='/closet/'], a[href*='poshmark.com/closet/']")];
    const mine = closetLinks.find((a) => /my closet/i.test(a.textContent || a.getAttribute('aria-label') || a.getAttribute('title') || ''))
      || document.querySelector("a[href*='/closet/'][data-et-name='closet' i], a[href*='/closet/'][data-et-name='my_closet' i], header a[href*='/closet/'] img[class*='avatar' i]")?.closest('a');
    const fromLink = handle(mine?.getAttribute('href')?.split('/closet/')[1]?.split(/[/?#]/)[0]);
    if (fromLink) return fromLink;
    // 3. The header avatar link usually points at the seller's own closet.
    const avatar = [...document.querySelectorAll("header a[href*='/closet/'], nav a[href*='/closet/']")].find((a) => a.querySelector('img'));
    return handle(avatar?.getAttribute('href')?.split('/closet/')[1]?.split(/[/?#]/)[0]);
  }

  // ------------------------------------------------------------------ share

  const listingId = (tile) => {
    const href = tile.querySelector("a[href*='/listing/']")?.getAttribute('href') ?? '';
    return href.split('?')[0].split('-').pop() || null;
  };
  // One tile per listing: built from each listing's own Share button, so page wrappers that hold
  // many listings never count as a tile.
  const listingTiles = () => {
    const tiles = new Set();
    for (const share of document.querySelectorAll("[data-et-name='share']")) {
      let tile = share.closest(".tile-grid-redesign, [class*='tiles_container__tile'], .card, .tile");
      if (!tile) { tile = share; while (tile && !tile.querySelector("a[href*='/listing/']")) tile = tile.parentElement; }
      if (tile && tile !== document.body && tile.querySelector("a[href*='/listing/']")) tiles.add(tile);
    }
    return [...tiles];
  };

  function shareButtonIn(tile) {
    return tile.querySelector("[data-et-name='share']") || tile.querySelector("[aria-label*='share' i], [class*='share' i] button, button[class*='share' i], i[class*='share' i]")
      || [...tile.querySelectorAll('button, a, i, span')].find((el) => text(el) === 'share');
  }
  const toFollowersOption = () => [...document.querySelectorAll("[data-et-name='share_to_followers']")].find(visible)
    || [...document.querySelectorAll("[role='dialog'] *, .modal *, [class*='modal' i] *, [class*='share' i] *, .dropdown__link")]
      .find((el) => visible(el) && /^(share )?to (my )?followers$/.test(text(el)));

  async function shareSession({ max, skip, minPause, maxPause }) {
    const shared = [];
    await scrollToLoad(400, () => listingTiles().length);
    const tiles = listingTiles().filter((t) => {
      const id = listingId(t);
      return id && !skip.includes(id) && !/sold|not for sale/.test(text(t.querySelector("[class*='inventory' i], [class*='sold' i]")));
    });
    // Oldest-shared first: the bottom of the closet goes back to the top.
    for (const tile of tiles.reverse().slice(0, max)) {
      if (stopRequested) return { shared, stop: 'stopped' };
      const block = blocker(); if (block) return { shared, stop: block };
      tile.scrollIntoView({ block: 'center' });
      await sleep(between(600, 1400));
      const button = shareButtonIn(tile);
      if (!button) continue;
      (button.closest('button, a, [role="button"]') || button).click();
      const option = await waitFor(toFollowersOption, 5000);
      if (!option) { const b = blocker(); if (b) return { shared, stop: b }; document.body.click(); continue; }
      (option.closest('a, button, li, [role="button"]') || option).click();
      await sleep(between(1200, 2200));
      const after = blocker(); if (after) return { shared, stop: after };
      shared.push(listingId(tile));
      const paused = await humanPause(minPause, maxPause); if (paused) return { shared, stop: paused };
    }
    return { shared, stop: null, exhausted: tiles.length <= max };
  }

  // ------------------------------------------------------------------ follow

  const followButtons = () => {
    const own = [...document.querySelectorAll("button[data-et-name='follow_user']")].filter((el) => visible(el) && text(el) === 'follow');
    if (own.length) return own;
    return [...document.querySelectorAll("button, [role='button'], a.btn, a[class*='follow' i]")].filter((el) => visible(el) && text(el) === 'follow');
  };

  async function followSession({ max, minPause, maxPause }) {
    let followed = 0;
    const done = new WeakSet();
    for (let round = 0; round < 25 && followed < max; round += 1) {
      const buttons = followButtons().filter((b) => !done.has(b));
      if (!buttons.length) {
        const before = followButtons().length;
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(between(1500, 2500));
        if (!followButtons().filter((b) => !done.has(b)).length && before === followButtons().length) break;
        continue;
      }
      for (const button of buttons) {
        if (followed >= max) break;
        if (stopRequested) return { followed, stop: 'stopped' };
        const block = blocker(); if (block) return { followed, stop: block };
        done.add(button);
        button.scrollIntoView({ block: 'center' });
        await sleep(between(500, 1200));
        button.click();
        await sleep(between(1000, 1800));
        const after = blocker(); if (after) return { followed, stop: after };
        if (text(button) === 'follow') continue; // didn't take; don't count it
        followed += 1;
        const paused = await humanPause(minPause, maxPause); if (paused) return { followed, stop: paused };
      }
    }
    return { followed, stop: null, exhausted: followed < max };
  }

  /** Sellers of the listings in the feed: the people to follow, and whose followers to follow next.
   *  Feed tiles don't show the seller, so each listing page is read (a normal page load, paced). */
  async function feedClosets({ me }) {
    await scrollToLoad(60, () => document.querySelectorAll("a[href*='/listing/']").length, 4);
    const listings = [...new Set([...document.querySelectorAll("a[href*='/listing/']")].map((a) => a.getAttribute('href').split('?')[0]))].slice(0, 24);
    const sellers = new Set();
    for (const href of listings) {
      if (stopRequested || sellers.size >= 15) break;
      const block = blocker(); if (block) return { closets: [...sellers], stop: block };
      try {
        const html = await fetch(href, { credentials: 'include' }).then((r) => (r.ok ? r.text() : ''));
        const seller = [...html.matchAll(/href="\/closet\/([A-Za-z0-9_.-]+)/g)].map((m) => m[1]).find((n) => n.toLowerCase() !== String(me).toLowerCase());
        if (seller) sellers.add(seller);
      } catch { /* skip that listing */ }
      await sleep(between(1200, 2600));
    }
    return { closets: [...sellers], stop: blocker() };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'POSH_STOP') { stopRequested = true; sendResponse({ ok: true }); return false; }
    if (message?.type !== 'POSH_TASK') return false;
    stopRequested = false;
    (async () => {
      try {
        const block = blocker();
        if (block) { sendResponse({ ok: false, stop: block }); return; }
        const me = myUsername();
        if (message.task === 'whoami') sendResponse({ ok: true, me });
        else if (message.task === 'share') sendResponse({ ok: true, me, ...(await shareSession(message)) });
        else if (message.task === 'follow') sendResponse({ ok: true, me, ...(await followSession(message)) });
        else if (message.task === 'feed') sendResponse({ ok: true, me, ...(await feedClosets({ me: message.me || me })) });
        else sendResponse({ ok: false, stop: 'error', message: 'Unknown task' });
      } catch (error) {
        sendResponse({ ok: false, stop: 'error', message: error instanceof Error ? error.message : 'Poshmark tools failed' });
      }
    })();
    return true;
  });
})();
