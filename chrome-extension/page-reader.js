// Offers & Sales reader: runs on poshmark.com and depop.com and only READS the page it is on
// (offers or sales lists) when the service worker asks with READ_PAGE. It never clicks Accept,
// Counter, Decline or anything else, and never sends a message.
//
// The marketplaces' page structure changes, so instead of fixed CSS classes it looks for "cards":
// the smallest block that holds one listing link plus a dollar amount, and reads title, amount,
// buyer and the visible words around them.
(() => {
  if (window.__crosslinkosPageReader) return;
  window.__crosslinkosPageReader = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
  const site = location.hostname.includes('depop') ? 'depop' : 'poshmark';
  const LISTING_LINK = site === 'depop' ? "a[href*='/products/']" : "a[href*='/listing/']";
  const MONEY = /\$\s?(\d{1,5}(?:,\d{3})*(?:\.\d{2})?)/g;
  const toNumber = (s) => Number(String(s).replace(/,/g, ''));

  function blocked() {
    if (document.querySelector("iframe[src*='captcha' i], iframe[src*='recaptcha' i], iframe[src*='hcaptcha' i], iframe[src*='arkoselabs' i], .g-recaptcha")) return 'captcha';
    const body = norm(document.body?.innerText).toLowerCase().slice(0, 4000);
    if (/verify (that )?you('| a)re (a )?human|security check/.test(body)) return 'captcha';
    if (/\/login|\/signup|\/log-in|\/signin/.test(location.pathname)) return 'signed_out';
    if (/page (you requested )?(was |is )?not found|404|doesn.t exist|no longer available/.test(`${document.title} ${body.slice(0, 600)}`.toLowerCase())) return 'not_found';
    return null;
  }

  async function scrollSome(rounds = 6) {
    for (let i = 0; i < rounds; i += 1) { window.scrollTo(0, document.body.scrollHeight); await sleep(900 + Math.random() * 700); }
    window.scrollTo(0, 0);
  }

  /** Smallest ancestor of a listing link that also shows a $ amount and holds only that one listing. */
  function cards() {
    const found = new Set();
    for (const link of document.querySelectorAll(LISTING_LINK)) {
      let el = link;
      for (let depth = 0; depth < 8 && el && el !== document.body; depth += 1) {
        const listingLinks = new Set([...el.querySelectorAll(LISTING_LINK)].map((a) => a.getAttribute('href')?.split('?')[0]));
        if (listingLinks.size > 1) break;
        if (/\$\s?\d/.test(el.innerText || '')) { found.add(el); break; }
        el = el.parentElement;
      }
    }
    // Drop cards that contain another card.
    return [...found].filter((c) => ![...found].some((o) => o !== c && c.contains(o)));
  }

  function buyerIn(card) {
    if (site === 'poshmark') {
      const a = [...card.querySelectorAll("a[href*='/closet/']")].map((x) => x.getAttribute('href').split('/')[2]).find(Boolean);
      if (a) return a.split('?')[0];
    } else {
      const a = [...card.querySelectorAll('a[href]')].map((x) => x.getAttribute('href')).find((h) => /^\/[a-z0-9_.-]+\/?$/i.test(h) && !/^\/(products|messages|sellinghub|search|category)\b/i.test(h));
      if (a) return a.replace(/\//g, '');
    }
    const at = /@([a-z0-9_.-]{2,30})/i.exec(card.innerText || '');
    return at ? at[1] : undefined;
  }

  function read(card, mode) {
    const text = norm(card.innerText);
    const link = card.querySelector(LISTING_LINK);
    const href = link?.getAttribute('href') ?? '';
    const listingUrl = href ? new URL(href, location.origin).href.split('?')[0] : undefined;
    const title = norm(link?.getAttribute('title') || link?.querySelector('img')?.getAttribute('alt') || link?.innerText || '')
      || norm(card.querySelector('img')?.getAttribute('alt'));
    const offerAmount = /offer(?:ed|s)?[^$]{0,40}\$\s?(\d{1,5}(?:,\d{3})*(?:\.\d{2})?)/i.exec(text);
    const amounts = [...text.matchAll(MONEY)].map((m) => toNumber(m[1])).filter((n) => n > 0);
    const amount = mode === 'offers' ? (offerAmount ? toNumber(offerAmount[1]) : amounts[0]) : (amounts[0] ?? 0);
    const orderLink = card.querySelector("a[href*='/order/'], a[href*='sold-items/'], a[href*='/receipts/']")?.getAttribute('href');
    return {
      key: orderLink ? orderLink.split('?')[0] : undefined,
      listingUrl, listingTitle: title.slice(0, 200) || undefined,
      amount: amount ?? 0, buyer: buyerIn(card), detail: text.slice(0, 280),
    };
  }

  /** Is this listing still live? Used to confirm a delist actually happened. */
  function listingGone() {
    const stop = blocked();
    if (stop === 'not_found') return { ok: true, gone: true, why: 'listing page not found' };
    if (stop) return { ok: false, stop };
    const head = norm(document.querySelector('main')?.innerText || document.body?.innerText).toLowerCase().slice(0, 3000);
    if (/not for sale|no longer available|this (item|listing) (has been|was) (removed|deleted)|listing (has been )?removed/.test(head)) return { ok: true, gone: true, why: "listing shows not for sale / removed" };
    return { ok: true, gone: false };
  }

  async function readPage(mode) {
    if (mode === 'listing') { await sleep(1500); return listingGone(); }
    const stop = blocked(); if (stop) return { ok: false, stop };
    await sleep(1500);
    await scrollSome(mode === 'sales' ? 4 : 6);
    let rows = cards().map((c) => read(c, mode)).filter((r) => r.amount > 0);
    if (mode === 'offers') {
      // Only offers still waiting on the seller: skip ones the page says are finished.
      rows = rows.filter((r) => /offer/i.test(r.detail) && !/accepted|declined|expired|cancel+ed|withdrawn|you (sent|offered|countered)/i.test(r.detail));
    } else {
      rows = rows.filter((r) => !/cancel+ed|refunded/i.test(r.detail));
    }
    return { ok: true, url: location.href, cardsSeen: cards().length, rows: rows.slice(0, 200) };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'READ_PAGE') return false;
    readPage(message.mode).then(sendResponse).catch((error) => sendResponse({ ok: false, stop: 'error', message: error instanceof Error ? error.message : 'read failed' }));
    return true;
  });
})();
