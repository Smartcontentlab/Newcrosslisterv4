const platformFromHost = () => {
  const host = window.location.hostname;
  if (host.endsWith('poshmark.com')) return 'poshmark';
  if (host.endsWith('depop.com')) return 'depop';
  if (host.endsWith('mercari.com')) return 'mercari';
  return null;
};

const selectors = {
  poshmark: {
    title: ["input[data-vv-name='title']", "input[placeholder*='title' i]", ".title-input input"],
    description: ["textarea[data-vv-name='description']", "textarea[placeholder*='describ' i]", ".description-textarea"],
    price: ["input[data-vv-name='originalPrice']", "input[placeholder*='original price' i]", "input[placeholder*='price' i]"],
    tags: ["input[placeholder*='tag' i]", "input[aria-label*='tag' i]"],
  },
  depop: {
    title: ["input[name='itemName']", "input[aria-label*='title' i]", "input[placeholder*='item name' i]"],
    description: ["textarea[name='description']", "textarea[aria-label*='description' i]", "textarea[placeholder*='describ' i]"],
    price: ["input[name='price']", "input[aria-label*='price' i]", "input[placeholder*='price' i]"],
    tags: ["input[name*='tag' i]", "input[aria-label*='tag' i]", "input[placeholder*='tag' i]"],
  },
  mercari: {
    title: ["input[aria-label*='item name' i]", "input[placeholder*='item name' i]", "input[name='name']"],
    description: ["textarea[aria-label*='description' i]", "textarea[placeholder*='describ' i]", "textarea[name='description']"],
    price: ["input[aria-label*='price' i]", "input[placeholder*='price' i]", "input[name='price']"],
    tags: ["input[aria-label*='tag' i]", "input[placeholder*='tag' i]"],
  },
};

function findElement(candidates) {
  for (const selector of candidates) {
    const element = document.querySelector(selector);
    if (element && !element.disabled) return element;
  }
  return null;
}

function setNativeValue(element, value) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  const setter = descriptor?.set;
  if (!setter) throw new Error('Native value setter is unavailable for this field.');
  element.focus();
  setter.call(element, String(value));
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.blur();
}

function dataUrlToFile(dataUrl, name) {
  const separator = dataUrl.indexOf(',');
  const type = /:(.*?);/.exec(dataUrl.slice(0, separator))?.[1] ?? 'image/jpeg';
  const binary = atob(dataUrl.slice(separator + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type });
}

/**
 * Puts the handed-off photos into the form's file input. The seller still sees
 * every photo in the marketplace's own preview and can remove or reorder them;
 * nothing is saved or published here.
 */
function attachPhotos(photos) {
  if (!Array.isArray(photos) || !photos.length) return null;
  const input = document.querySelector("input[type='file'][accept*='image' i]") ?? document.querySelector("input[type='file']");
  if (!input) return { ok: false, count: 0 };
  const selection = input.multiple ? photos : photos.slice(0, 1);
  const transfer = new DataTransfer();
  selection.forEach((photo, index) => {
    try { transfer.items.add(dataUrlToFile(photo, `listing-photo-${index + 1}.jpg`)); } catch { /* Skip a photo this page refuses. */ }
  });
  if (!transfer.files.length) return { ok: false, count: 0 };
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, count: transfer.files.length };
}

function sessionState() {
  const loginMarker = document.querySelector("input[type='password'], a[href*='login' i], a[href*='signin' i]");
  const formMarker = document.querySelector("textarea, input[placeholder*='price' i], input[aria-label*='price' i]");
  if (formMarker) return 'signed_in';
  if (loginMarker) return 'signed_out';
  return 'unknown';
}

function fillDraft(draft) {
  const platform = platformFromHost();
  if (!platform || platform !== draft.marketplace) return { ok: false, message: 'Open the matching marketplace listing form first.' };
  const config = selectors[platform];
  const missing = [];
  const filled = [];
  for (const [field, value] of [['title', draft.title], ['description', draft.description], ['price', draft.price]]) {
    const element = findElement(config[field]);
    if (!element) { missing.push(field); continue; }
    setNativeValue(element, value);
    filled.push(field);
  }
  const tagElement = findElement(config.tags);
  if (tagElement && Array.isArray(draft.tags) && draft.tags.length) {
    try { setNativeValue(tagElement, draft.tags.join(', ')); filled.push('tags'); } catch { /* Tags are optional and platform widgets vary. */ }
  }
  if (missing.length) return { ok: false, message: `Could not find ${missing.join(', ')}. Wait for the listing form to fully load and try again. No save or publish action was taken.`, filled };
  const photoResult = attachPhotos(draft.photos);
  const photoNote = !photoResult
    ? ' No photos were sent with this draft.'
    : photoResult.ok
      ? ` Attached ${photoResult.count} photo(s) — check them in the form.`
      : ' Photos could not be attached here; add them by hand in this form.';
  return { ok: true, message: `Filled ${filled.join(', ')}. Review all fields, select platform-specific category/shipping details, and manually save or publish when ready.${photoNote}`, filled };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  try {
    if (message?.type === 'PROBE_SESSION') {
      sendResponse({ session: sessionState() });
      return;
    }
    if (message?.type === 'FILL_DRAFT') {
      sendResponse(fillDraft(message.draft));
      return;
    }
    sendResponse({ ok: false, message: 'Unknown content-script request.' });
  } catch (error) {
    sendResponse({ ok: false, message: error instanceof Error ? error.message : 'The marketplace form could not be filled. No save or publish action was taken.' });
  }
});

chrome.runtime.sendMessage({ type: 'SESSION_REPORT', platform: platformFromHost(), session: sessionState() }).catch(() => undefined);
