/**
 * Bulk import: turns a price sheet (CSV) plus a folder of photos into draft items.
 *
 * Pure functions only, so they can be tested without a browser. The page in
 * pages/bulk-import.tsx does the file picking, photo resizing and saving.
 *
 * Sheet columns (header names are matched loosely, case and punctuation ignored):
 *   # | Title | Description | Brand | Category | Subcategory | Department | Size | Color |
 *   Condition | Suggested price | Original price | Checks before posting | Price basis
 * Only "#" and "Title" are required. Photos are matched to a row by the number at the
 * start of their folder name ("01 Navy Cargo Pants/01_Front_Cover.jpg") or, for loose
 * files, at the start of the file name ("01-02.jpg"). Photos keep file-name order.
 */

export type ImportCondition = 'new' | 'like_new' | 'good' | 'fair' | 'poor';

export type ImportRow = {
  /** Item number as written in the sheet, normalised to two digits ("1" -> "01"). */
  number: string;
  title: string;
  description: string;
  brand: string;
  category: string;
  subcategory: string;
  department: string;
  size: string;
  color: string;
  condition: ImportCondition;
  /** The condition text as written in the sheet, shown in the preview. */
  conditionText: string;
  price: number;
  originalPrice: string;
  checks: string;
  priceBasis: string;
};

export type ParsedSheet = { rows: ImportRow[]; problems: string[] };

export const MAX_IMPORT_PHOTOS = 8;
const IMAGE_FILE = /\.(jpe?g|png|webp)$/i;

/** RFC 4180 style CSV: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') { field += '"'; index += 1; } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field === '') { quoted = true; continue; }
    if (char === ',') { row.push(field); field = ''; continue; }
    if (char === '\r') continue;
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += char;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

const key = (header: string) => header.toLowerCase().replace(/[^a-z0-9#]/g, '');

/** Which sheet header feeds which field. The first match wins. */
const COLUMNS: Record<keyof Omit<ImportRow, 'condition' | 'price'> | 'price' | 'condition', string[]> = {
  number: ['#', 'no', 'number', 'item', 'itemnumber', 'item#'],
  title: ['title', 'listingtitle', 'name'],
  description: ['description', 'desc', 'listingdescription'],
  brand: ['brand'],
  category: ['category'],
  subcategory: ['subcategory', 'type'],
  department: ['department', 'gender', 'dept'],
  size: ['size', 'taggedsize'],
  color: ['color', 'colour'],
  condition: ['condition'],
  conditionText: [],
  price: ['suggestedprice', 'price', 'listprice', 'askingprice'],
  originalPrice: ['originalprice', 'msrp', 'retailprice', 'retail'],
  checks: ['checksbeforeposting', 'checks', 'checkbeforeposting', 'tocheck'],
  priceBasis: ['pricebasis', 'basis', 'pricebasissoldcomps', 'comps'],
};

/** Maps the sheet's condition words to the app's five conditions. Unknown text becomes "good" (the safe middle). */
export function mapCondition(text: string): ImportCondition {
  const value = text.toLowerCase();
  if (/\bnwt\b|new with tags|brand new|^new$/.test(value.trim())) return 'new';
  if (/like new|excellent|\beuc\b|nwot|new without tags|mint/.test(value)) return 'like_new';
  if (/\bpoor\b|damaged|for parts/.test(value)) return 'poor';
  if (/\bfair\b/.test(value)) return 'fair';
  return 'good';
}

/** "$45", "45.00", "USD 45" -> 45. Anything else -> 0 (the seller fills it in later). */
export function parsePrice(text: string): number {
  const match = /(\d+(?:[.,]\d{1,2})?)/.exec(text.replace(/,(?=\d{3}\b)/g, ''));
  return match ? Number(match[1].replace(',', '.')) : 0;
}

export function normaliseNumber(text: string): string {
  const digits = /\d+/.exec(text)?.[0];
  return digits ? digits.padStart(2, '0') : '';
}

export function rowsFromCsv(text: string): ParsedSheet {
  const table = parseCsv(text);
  const problems: string[] = [];
  if (table.length < 2) return { rows: [], problems: ['The sheet has no item rows under its header.'] };
  const headers = table[0].map(key);
  const column = (field: keyof typeof COLUMNS) => headers.findIndex((header) => COLUMNS[field].includes(header));
  const at = Object.fromEntries((Object.keys(COLUMNS) as Array<keyof typeof COLUMNS>).map((field) => [field, column(field)])) as Record<keyof typeof COLUMNS, number>;
  if (at.number < 0) problems.push('No "#" column was found, so photos cannot be matched to items.');
  if (at.title < 0) return { rows: [], problems: [...problems, 'No "Title" column was found.'] };

  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  table.slice(1).forEach((cells, index) => {
    const cell = (field: keyof typeof COLUMNS) => (at[field] >= 0 ? (cells[at[field]] ?? '').trim() : '');
    const title = cell('title');
    const line = index + 2;
    if (!title) { problems.push(`Row ${line} has no title and was skipped.`); return; }
    const number = normaliseNumber(cell('number')) || String(index + 1).padStart(2, '0');
    if (seen.has(number)) { problems.push(`Item ${number} appears twice; only the first row is used.`); return; }
    seen.add(number);
    const conditionText = cell('condition');
    const price = parsePrice(cell('price'));
    if (!price) problems.push(`Item ${number} has no price; it will be saved at $0 for you to fill in.`);
    rows.push({
      number, title, description: cell('description'), brand: cell('brand'), category: cell('category'), subcategory: cell('subcategory'),
      department: cell('department'), size: cell('size'), color: cell('color'), condition: mapCondition(conditionText), conditionText,
      price, originalPrice: cell('originalPrice') ? String(parsePrice(cell('originalPrice')) || '') : '', checks: cell('checks'), priceBasis: cell('priceBasis'),
    });
  });
  return { rows, problems };
}

/** Item number a photo belongs to, from its folder ("01 Navy Cargo Pants/…") or its own name ("01_…" when loose). */
export function photoNumber(path: string): string {
  const parts = path.split('/').filter(Boolean);
  // A folder's leading number is the item number; check the innermost folder first.
  for (let index = parts.length - 2; index >= 0; index -= 1) {
    const match = /^(\d{1,3})(?:\D|$)/.exec(parts[index]);
    if (match) return match[1].padStart(2, '0');
  }
  if (parts.length === 1) {
    const match = /^(\d{1,3})[\s_-]/.exec(parts[0]);
    if (match) return match[1].padStart(2, '0');
  }
  return '';
}

export type PhotoRef = { path: string; size?: number };

/**
 * Groups photos by item number, in natural file-name order, at most eight per item.
 * Files in an "Originals" sub-folder are left out (they are the unedited camera files)
 * unless an item has no other photos.
 */
export function groupPhotos<T extends PhotoRef>(files: T[]): Map<string, T[]> {
  const byNumber = new Map<string, { main: T[]; originals: T[] }>();
  for (const file of files) {
    if (!IMAGE_FILE.test(file.path) || /(^|\/)\._/.test(file.path)) continue;
    const number = photoNumber(file.path);
    if (!number) continue;
    const bucket = byNumber.get(number) ?? { main: [], originals: [] };
    (/(^|\/)originals?\//i.test(file.path) ? bucket.originals : bucket.main).push(file);
    byNumber.set(number, bucket);
  }
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const name = (file: T) => file.path.split('/').pop() ?? file.path;
  const result = new Map<string, T[]>();
  for (const [number, bucket] of byNumber) {
    const chosen = (bucket.main.length ? bucket.main : bucket.originals).sort((a, b) => collator.compare(name(a), name(b)));
    result.set(number, chosen.slice(0, MAX_IMPORT_PHOTOS));
  }
  return result;
}

export type ImportPhotoRecord = {
  id: string; original: string; active: 'original'; processingStatus: 'original'; name: string; createdAt: string;
};

/**
 * The body for POST /api/workflow/items. The sheet's title and description are saved
 * as the seller's own copy for every marketplace, so drafts use them word for word
 * (Depop has no title box, so its description starts with the title line).
 */
export function itemBody(row: ImportRow, photos: ImportPhotoRecord[], batch: string) {
  const description = row.description;
  const copy = (title: string, body: string) => ({ title, description: body, hashtags: [] as string[] });
  const notes = [row.checks && `Check before posting: ${row.checks}`, row.priceBasis && `Price basis: ${row.priceBasis}`, `Imported from sheet, item ${row.number}.`].filter(Boolean).join('\n');
  return {
    title: row.title,
    description: description || undefined,
    brand: row.brand || undefined,
    category: row.category || 'Clothing',
    size: row.size || undefined,
    color: row.color || undefined,
    sku: `${batch}-${row.number}`,
    notes,
    condition: row.condition,
    status: 'draft' as const,
    price: row.price,
    cost: 0,
    photos: [] as string[],
    photoRecords: photos,
    tags: [] as string[],
    marketplaceDetails: {
      department: row.department,
      subcategory: row.subcategory,
      quantity: '1',
      originalPrice: row.originalPrice,
      importedFrom: { batch, number: row.number },
      platformCopy: description
        ? {
            poshmark: copy(row.title, description),
            mercari: copy(row.title, description),
            depop: copy(row.title, `${row.title}\n\n${description}`),
          }
        : {},
    },
  };
}

/** Short batch label used in each item's SKU, e.g. "IMP1121" for Nov 21. */
export function batchLabel(date = new Date()): string {
  return `IMP${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}
