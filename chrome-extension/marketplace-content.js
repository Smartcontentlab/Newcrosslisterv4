// Fills an open marketplace listing form from a CrossLinkOS draft.
// It never clicks Save, List, Publish or any other final button.

const platformFromHost = () => {
  const host = window.location.hostname;
  if (host.endsWith('poshmark.com')) return 'poshmark';
  if (host.endsWith('depop.com')) return 'depop';
  if (host.endsWith('mercari.com')) return 'mercari';
  return null;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const norm = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const visible = (element) => Boolean(element && (element.offsetParent !== null || element.getClientRects().length));

function findElement(candidates) {
  for (const selector of candidates) {
    const element = [...document.querySelectorAll(selector)].find((candidate) => visible(candidate) && !candidate.disabled);
    if (element) return element;
  }
  return null;
}

async function waitFor(find, timeout = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const found = find();
    if (found) return found;
    await sleep(120);
  }
  return null;
}

function setNativeValue(element, value) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new Error('Native value setter is unavailable for this field.');
  element.focus();
  setter.call(element, String(value));
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function pressEnter(element) {
  for (const type of ['keydown', 'keypress', 'keyup']) {
    element.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  }
}

/** Best text match among option elements: exact, then starts-with, then contains. */
function pickOption(options, wanted) {
  const target = norm(wanted);
  if (!target) return null;
  const scored = options.map((option) => ({ option, text: norm(option.textContent) })).filter(({ text }) => text);
  return scored.find(({ text }) => text === target)?.option
    ?? scored.find(({ text }) => text.startsWith(`${target} `) || text.startsWith(target))?.option
    ?? scored.find(({ text }) => text.includes(target))?.option
    ?? null;
}

function dataUrlToFile(dataUrl, name) {
  const separator = dataUrl.indexOf(',');
  const type = /:(.*?);/.exec(dataUrl.slice(0, separator))?.[1] ?? 'image/jpeg';
  const binary = atob(dataUrl.slice(separator + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type });
}

/** Puts the handed-off photos into the form's file input; the seller still sees and can reorder them. */
function attachPhotos(photos, selector) {
  if (!Array.isArray(photos) || !photos.length) return null;
  const input = (selector && document.querySelector(selector))
    ?? document.querySelector("input[type='file'][accept*='image' i]")
    ?? document.querySelector("input[type='file']");
  if (!input) return { ok: false, count: 0 };
  const selection = input.multiple ? photos : photos.slice(0, 1);
  const transfer = new DataTransfer();
  selection.forEach((photo, index) => {
    try { transfer.items.add(dataUrlToFile(photo, `listing-photo-${index + 1}.jpg`)); } catch { /* skip a photo the page refuses */ }
  });
  if (!transfer.files.length) return { ok: false, count: 0 };
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, count: transfer.files.length };
}

/** Tracks what was filled and what the seller still has to pick by hand. */
function makeReport() {
  const filled = [];
  const manual = [];
  return {
    filled, manual,
    ok(field) { filled.push(field); },
    skip(field, why) { manual.push(why ? `${field} (${why})` : field); },
  };
}

// ---------------------------------------------------------------- Poshmark
// Mapped from the live create-listing form (Nov 2026): Vue inputs with data-vv-name,
// and custom dropdowns ([data-test=dropdown] > .dropdown__selector, items .dropdown__menu__item).

const POSHMARK_CONDITION = {
  new: 'New With Tags', new_with_tags: 'New With Tags', nwt: 'New With Tags',
  like_new: 'Like New', new_without_tags: 'Like New',
  good: 'Good', fair: 'Fair', poor: 'Fair',
};
const POSHMARK_COLORS = ['Red', 'Pink', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Gold', 'Silver', 'Black', 'Gray', 'White', 'Cream', 'Brown', 'Tan'];
const COLOR_ALIASES = { grey: 'Gray', navy: 'Blue', denim: 'Blue', beige: 'Tan', khaki: 'Tan', ivory: 'Cream', burgundy: 'Red', maroon: 'Red', olive: 'Green', lavender: 'Purple', magenta: 'Pink', multi: null, multicolor: null };

function poshmarkDropdown(placeholder) {
  return [...document.querySelectorAll('[data-test=dropdown]')]
    .find((dropdown) => visible(dropdown) && dropdown.querySelector('.dropdown__selector')?.textContent.includes(placeholder)) ?? null;
}

async function poshmarkChoose(dropdown, wanted) {
  if (!dropdown || !wanted) return false;
  const selector = dropdown.querySelector('.dropdown__selector');
  if (!dropdown.querySelector('.dropdown__menu--expanded')) selector?.click();
  const option = await waitFor(() => pickOption([...dropdown.querySelectorAll('.dropdown__menu__item')].filter(visible), wanted), 2500);
  if (!option) { document.body.click(); return false; }
  // The click handler sits on the inner link, not the <li>.
  (option.querySelector('.dropdown__link') ?? option).click();
  await sleep(450);
  return true;
}

/** Size is a grid of buttons (with Standard/Plus/Petite/... tabs) confirmed by a Done button. */
async function poshmarkSize(size, sizeType) {
  const dropdown = await waitFor(() => poshmarkDropdown('Select Size'), 2000);
  if (!dropdown || !size) return false;
  dropdown.querySelector('.dropdown__selector')?.click();
  await waitFor(() => dropdown.querySelector('button.multi-size-selector__button'), 2000);
  if (sizeType) {
    const tab = [...dropdown.querySelectorAll('.navigation--horizontal__link')].find((link) => norm(link.textContent) === norm(sizeType));
    if (tab) { tab.click(); await sleep(400); }
  }
  const buttons = [...dropdown.querySelectorAll('button.multi-size-selector__button')].filter(visible);
  const button = buttons.find((candidate) => norm(candidate.textContent) === norm(size));
  if (!button) { document.body.click(); return false; }
  button.click();
  await sleep(250);
  [...dropdown.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === 'Done')?.click();
  await sleep(400);
  return true;
}

/**
 * Focusing the price opens Poshmark's "Listing Price" pop-up: its own price box, the
 * Automate Offers switch (on by default, and then it needs a lowest price), and
 * original price. Filled from the seller's Smart Sell settings in CrossLinkOS. "Done"
 * only closes this pop-up; it does not list the item.
 */
async function fillPoshmarkPriceModal(draft, details, report) {
  const modal = await waitFor(() => [...document.querySelectorAll('.listing-price-suggestion-modal')].find(visible) ?? null, 2500);
  if (!modal) return;
  const listPrice = Math.round(Number(draft.price));
  const modalPrice = modal.querySelector('#listing-price-modal-listing-price-input');
  if (modalPrice) setNativeValue(modalPrice, listPrice);

  const original = modal.querySelector("input[id^='listing-price-modal-original']");
  if (original && Number(details.originalPrice) > 0) { setNativeValue(original, Math.round(Number(details.originalPrice))); report.ok('original price'); }

  const mode = details.poshSmartSellMode || 'off';
  const toggle = modal.querySelector("input[data-test='toggle-input']");
  let lowest = null;
  if (mode === 'minimum_price' && Number(details.poshMinimumPrice) > 0) lowest = Math.round(Number(details.poshMinimumPrice));
  if (mode === 'floor_percent' && Number(details.poshMinimumPrice) > 0) lowest = Math.round(listPrice * (1 - Number(details.poshMinimumPrice) / 100));
  if (lowest !== null && lowest < listPrice) {
    if (toggle && !toggle.checked) modal.querySelector("label[data-test='toggle-switch']")?.click();
    const lowestInput = await waitFor(() => modal.querySelector("input[name='inputMinimumPrice']"), 1500);
    if (lowestInput) { setNativeValue(lowestInput, lowest); report.ok(`automate offers (lowest $${lowest})`); }
  } else if (mode === 'off' && toggle?.checked) {
    modal.querySelector("label[data-test='toggle-switch']")?.click();
    report.ok('automate offers off');
  } else {
    report.skip('lowest offer price', 'type it in the price pop-up or switch off Automate Offers');
  }
  if (details.poshShippingDiscount) report.skip('shipping discount', `choose ${details.poshShippingDiscount} in the price pop-up`);

  await sleep(400);
  const done = [...modal.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Done');
  if (done && !done.disabled) { done.click(); await sleep(400); }
  else report.skip('price pop-up', 'finish it and press Done');
}

function poshmarkColors(value) {
  return String(value ?? '').split(/[,/&+]| and /i).map((part) => norm(part)).filter(Boolean).map((part) => {
    if (part in COLOR_ALIASES) return COLOR_ALIASES[part];
    return POSHMARK_COLORS.find((color) => part.split(' ').includes(color.toLowerCase())) ?? null;
  }).filter(Boolean).filter((color, index, list) => list.indexOf(color) === index).slice(0, 2);
}

async function fillPoshmark(draft) {
  const report = makeReport();
  const details = draft.details ?? {};

  const title = findElement(["input[data-vv-name='title']"]);
  if (title) { setNativeValue(title, draft.title.slice(0, 80)); report.ok('title'); } else report.skip('title', 'field not found');

  const description = findElement(["textarea[data-vv-name='description']"]);
  if (description) { setNativeValue(description, draft.description.slice(0, 1500)); report.ok('description'); } else report.skip('description', 'field not found');

  // Category: department first (Women/Men/Kids/Home/Pets/Electronics), then the category inside it.
  const department = details.department;
  const category = details.category;
  if (department || category) {
    const categoryDropdown = poshmarkDropdown('Select Category');
    let chosen = false;
    if (categoryDropdown) {
      chosen = department ? await poshmarkChoose(categoryDropdown, department) : true;
      if (chosen && category) chosen = await poshmarkChoose(categoryDropdown, category) || await poshmarkChoose(poshmarkDropdown('Select Category') ?? categoryDropdown, category);
    }
    if (chosen) report.ok('category'); else report.skip('category', department ? `pick ${department} › ${category ?? ''}` : 'pick it');
  } else report.skip('category', 'no department/category saved in CrossLinkOS');

  if (details.subcategory) {
    if (await poshmarkChoose(await waitFor(() => poshmarkDropdown('Select Subcategory'), 1500), details.subcategory)) report.ok('subcategory');
    else report.skip('subcategory', `pick ${details.subcategory}`);
  }

  // Size only appears once a category is set.
  if (details.size) {
    if (await poshmarkSize(details.size, details.sizeType)) report.ok('size');
    else report.skip('size', `pick ${details.size}`);
  } else report.skip('size');

  const condition = POSHMARK_CONDITION[norm(details.condition).replace(/ /g, '_')];
  if (condition && await poshmarkChoose(poshmarkDropdown('Select Condition'), condition)) report.ok('condition');
  else report.skip('condition');

  if (details.brand) {
    const brand = findElement(["input[placeholder*='Brand' i]"]);
    if (brand) {
      brand.click(); // opens the suggestion list
      setNativeValue(brand, details.brand.slice(0, 50));
      const box = brand.closest('.dropdown') ?? document;
      const suggestion = await waitFor(() => [...box.querySelectorAll('.dropdown__link')].filter(visible)
        .find((option) => norm(option.textContent) === norm(details.brand)) ?? null, 2500);
      suggestion?.click();
      report.ok(suggestion ? 'brand' : 'brand (typed; pick it from the list if Poshmark asks)');
    } else report.skip('brand', 'field not found');
  } else report.skip('brand');

  const colors = poshmarkColors([details.color, details.secondaryColor].filter(Boolean).join(', '));
  if (colors.length) {
    const colorDropdown = poshmarkDropdown('Select up to 2 colors');
    let picked = 0;
    for (const color of colors) {
      if (colorDropdown && !colorDropdown.querySelector('.dropdown__menu--expanded')) colorDropdown.querySelector('.dropdown__selector')?.click();
      const option = await waitFor(() => pickOption([...(colorDropdown?.querySelectorAll('.dropdown__menu__item, li') ?? [])].filter(visible), color), 1500);
      if (option) { (option.querySelector('.dropdown__link') ?? option).click(); picked += 1; await sleep(250); }
    }
    document.body.click();
    if (picked) report.ok('color'); else report.skip('color', `pick ${colors.join(', ')}`);
  } else if (details.color) report.skip('color', `"${details.color}" isn't a Poshmark color`);

  // Style tags: up to 3, each committed with Enter.
  const tagInput = findElement(["input[data-vv-name='style-tag-input']"]);
  const tags = (draft.tags ?? []).slice(0, 3);
  if (tagInput && tags.length) {
    for (const tag of tags) { setNativeValue(tagInput, tag.slice(0, 30)); pressEnter(tagInput); await sleep(200); }
    report.ok('style tags');
  }

  const price = findElement(["input[data-vv-name='listingPrice']"]);
  if (price) {
    price.click();
    setNativeValue(price, Math.round(Number(draft.price)));
    report.ok('price');
    await fillPoshmarkPriceModal(draft, details, report);
  } else report.skip('price', 'field not found');

  const photos = attachPhotos(draft.photos, '#img-file-input');
  return finish(report, photos, ['title', 'description', 'price']);
}

// ------------------------------------------------------------------- Depop
// Mapped from the live /products/create form (Nov 2026). There is no title field: the
// description's first line acts as the title. Dropdowns are typeable comboboxes:
// #<key>-input, #<key>-toggle-button, #<key>-menu with [role=option] items. Category
// options are grouped under headers such as "Women > Tops".

const DEPOP_CONDITION = { new: 'Brand new', new_with_tags: 'Brand new', like_new: 'Like new', new_without_tags: 'Like new', excellent: 'Used - Excellent', good: 'Used - Good', fair: 'Used - Fair', poor: 'Used - Fair' };
const DEPOP_COLOR_ALIASES = { gray: 'Grey', navy: 'Navy', beige: 'Tan', ivory: 'Cream', maroon: 'Burgundy', olive: 'Khaki', multicolor: 'Multi', 'multi color': 'Multi' };

/** Opens a Depop combobox and returns its options, each with the group header it sits under. */
async function depopOptions(key) {
  const toggle = document.getElementById(`${key}-toggle-button`);
  const menu = document.getElementById(`${key}-menu`);
  if (!toggle || !menu) return null;
  if (!menu.querySelector('[role=option]')) toggle.click();
  await waitFor(() => menu.querySelector('[role=option]'), 2500);
  const options = [];
  let header = '';
  for (const node of menu.querySelectorAll('*')) {
    if (node.children.length || !node.textContent.trim()) continue;
    const option = node.closest('[role=option]');
    if (!option) { header = node.textContent.trim(); continue; }
    if (!options.some((entry) => entry.option === option)) options.push({ option, header });
  }
  return options;
}

function depopClose(key) {
  const menu = document.getElementById(`${key}-menu`);
  if (menu?.querySelector('[role=option]')) document.getElementById(`${key}-toggle-button`)?.click();
}

async function depopSelect(key, wanted, headerFilter) {
  if (!wanted) return false;
  const options = await depopOptions(key);
  if (!options?.length) { depopClose(key); return false; }
  const pool = headerFilter ? options.filter(({ header }) => headerFilter(norm(header))) : options;
  const match = pickOption((pool.length ? pool : options).map(({ option }) => option), wanted);
  if (!match) { depopClose(key); return false; }
  match.click();
  await sleep(500);
  return true;
}

/** Brand list is huge: type to filter, then take the exact (or closest) suggestion. */
async function depopBrand(brand) {
  const input = document.getElementById('brand-input');
  if (!input || !brand) return false;
  input.click();
  setNativeValue(input, brand);
  const option = await waitFor(() => pickOption([...document.querySelectorAll('#brand-menu [role=option]')], brand), 2500);
  if (!option) return false;
  option.click();
  await sleep(400);
  return true;
}

function depopDescription(draft) {
  const hashtags = (draft.tags ?? []).map((tag) => `#${String(tag).replace(/[^A-Za-z0-9]/g, '').toLowerCase()}`).filter((tag) => tag.length > 1).slice(0, 5);
  const firstLine = draft.description.trim().toLowerCase().startsWith(draft.title.trim().toLowerCase()) ? '' : `${draft.title.trim()}\n\n`;
  const tail = hashtags.length ? `\n\n${hashtags.join(' ')}` : '';
  return `${firstLine}${draft.description.trim()}`.slice(0, 1000 - tail.length) + tail;
}

async function fillDepop(draft) {
  const report = makeReport();
  const details = draft.details ?? {};

  const description = findElement(['textarea#description', "textarea[name='description']"]);
  if (description) { setNativeValue(description, depopDescription(draft)); report.ok('description + hashtags'); report.ok('title'); } else report.skip('description', 'field not found');

  const department = norm(details.department);
  const category = details.category;
  const leaf = details.subcategory || category;
  if (leaf) {
    const inDepartment = department ? (header) => header.startsWith(department) : null;
    const inCategory = (header) => (!department || header.startsWith(department)) && (!category || header.includes(norm(category)));
    const chosen = await depopSelect('group', leaf, details.subcategory && category ? inCategory : inDepartment);
    if (chosen) report.ok('category'); else report.skip('category', `pick ${[details.department, category, details.subcategory].filter(Boolean).join(' › ')}`);
  } else report.skip('category');

  if (details.brand) { if (await depopBrand(details.brand)) report.ok('brand'); else report.skip('brand', `"${details.brand}" not in Depop's list, so pick or leave blank`); }

  const condition = DEPOP_CONDITION[norm(details.condition).replace(/ /g, '_')];
  if (condition && await depopSelect('condition', condition)) report.ok('condition'); else report.skip('condition');

  const colors = [details.color, details.secondaryColor].filter(Boolean).join(',').split(/[,/&+]| and /i).map((part) => norm(part)).filter(Boolean);
  let colorPicked = 0;
  for (const color of colors.slice(0, 2)) {
    if (await depopSelect('colour', DEPOP_COLOR_ALIASES[color] ?? color)) colorPicked += 1;
  }
  if (colorPicked) report.ok('color'); else if (colors.length) report.skip('color', `pick ${colors.join(', ')}`);

  // Size and the attribute boxes only appear once a category is chosen.
  if (details.size) {
    await waitFor(() => document.getElementById('variants-toggle-button'), 2000);
    if (await depopSelect('variants', details.size)) report.ok('size'); else report.skip('size', `pick ${details.size}`);
  }
  if (details.material && document.getElementById('attributes.material-toggle-button')) {
    if (await depopSelect('attributes.material', details.material)) report.ok('material');
  }
  for (const key of ['source', 'age', 'style']) {
    if (details[key] && await depopSelect(key, details[key])) report.ok(key);
  }

  const quantity = document.getElementById('quantity__input');
  if (quantity && Number(details.quantity) > 1) { setNativeValue(quantity, Math.round(Number(details.quantity))); report.ok('quantity'); }
  const sku = document.getElementById('SKU__input');
  if (sku && details.sku) { setNativeValue(sku, details.sku.slice(0, 50)); report.ok('sku'); }

  const price = findElement(['#priceAmount__input', "input[data-testid='priceAmount__input']"]);
  if (price) { setNativeValue(price, Number(draft.price).toFixed(2)); report.ok('price'); } else report.skip('price', 'field not found');

  report.skip('shipping', 'Depop Shipping is preselected, so check the package size');
  const photos = attachPhotos(draft.photos, '#upload-input__input');
  return finish(report, photos, ['description', 'price']);
}

// ----------------------------------------------------------- Mercari (basic)
// Mercari blocks its sell form until the account finishes ID verification, so this
// has not been re-mapped against the live form yet; it fills the text fields only.

const basicSelectors = {
  mercari: {
    title: ["input[aria-label*='item name' i]", "input[placeholder*='item name' i]", "input[name='name']", "input[data-testid*='Title' i]"],
    description: ["textarea[aria-label*='description' i]", "textarea[placeholder*='describ' i]", "textarea[name='description']", "textarea[data-testid*='Description' i]"],
    price: ["input[aria-label*='price' i]", "input[placeholder*='price' i]", "input[name='price']", "input[data-testid*='Price' i]"],
    tags: ["input[aria-label*='tag' i]", "input[placeholder*='tag' i]"],
  },
};

async function fillBasic(platform, draft) {
  const report = makeReport();
  const config = basicSelectors[platform];
  for (const [field, value] of [['title', draft.title], ['description', draft.description], ['price', draft.price]]) {
    const element = findElement(config[field]);
    if (element) { setNativeValue(element, value); report.ok(field); } else report.skip(field, 'field not found');
  }
  const tagElement = findElement(config.tags);
  if (tagElement && draft.tags?.length) { try { setNativeValue(tagElement, draft.tags.join(', ')); report.ok('tags'); } catch { /* optional */ } }
  report.skip('category, brand, size, condition, shipping');
  return finish(report, attachPhotos(draft.photos), ['title', 'description', 'price']);
}

// ------------------------------------------------------------------ common

function finish(report, photoResult, essentials) {
  const missingEssential = essentials.filter((field) => !report.filled.includes(field));
  const photoNote = !photoResult ? ' No photos were sent with this draft.'
    : photoResult.ok ? ` Attached ${photoResult.count} photo(s), so check them in the form.`
      : ' Photos could not be attached here; add them by hand.';
  const manualNote = report.manual.length ? ` Still to do by hand: ${report.manual.join(', ')}.` : '';
  if (missingEssential.length) {
    return { ok: false, filled: report.filled, manual: report.manual, message: `Could not find ${missingEssential.join(', ')}. Wait for the form to finish loading and try again. Nothing was saved or published.${manualNote}` };
  }
  return { ok: true, filled: report.filled, manual: report.manual, message: `Filled ${report.filled.join(', ')}.${manualNote}${photoNote} Review everything, then press the marketplace's own List/Post button when you're ready.` };
}

function sessionState() {
  const loginMarker = document.querySelector("input[type='password'], a[href*='login' i], a[href*='signin' i]");
  const formMarker = document.querySelector("textarea, input[placeholder*='price' i], input[aria-label*='price' i], input[data-vv-name='listingPrice']");
  if (formMarker) return 'signed_in';
  if (loginMarker || /\/login/.test(window.location.pathname)) return 'signed_out';
  return 'unknown';
}

async function fillDraft(draft) {
  const platform = platformFromHost();
  if (!platform || platform !== draft.marketplace) return { ok: false, message: 'Open the matching marketplace listing form first.' };
  if (platform === 'poshmark') return fillPoshmark(draft);
  if (platform === 'depop') return fillDepop(draft);
  return fillBasic(platform, draft);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PROBE_SESSION') {
    sendResponse({ session: sessionState() });
    return false;
  }
  if (message?.type === 'FILL_DRAFT') {
    fillDraft(message.draft)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: `${error instanceof Error ? error.message : 'The form could not be filled.'} Nothing was saved or published.` }));
    return true; // keep the channel open for the async fill
  }
  sendResponse({ ok: false, message: 'Unknown content-script request.' });
  return false;
});

chrome.runtime.sendMessage({ type: 'SESSION_REPORT', platform: platformFromHost(), session: sessionState() }).catch(() => undefined);
