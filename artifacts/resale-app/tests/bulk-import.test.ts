import assert from "node:assert/strict";
import { parseCsv, rowsFromCsv, mapCondition, parsePrice, photoNumber, groupPhotos, itemBody, batchLabel, MAX_IMPORT_PHOTOS } from "../src/lib/bulk-import";

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; console.log("ok  -", name); } catch (e) { console.error("FAIL -", name, "\n", e); process.exitCode = 1; } };

const SHEET = [
  "#,Title,Description,Brand,Category,Subcategory,Department,Size,Color,Condition,Suggested price,Price basis,Checks before posting",
  '01,Dark Navy Straight Leg Utility Cargo Pants,"Dark navy utility pants, straight legs.",,Clothing,Pants,Men,,Navy,Excellent/Like new,$30,"12 Posh sold, $18-40",Check brand and size tag',
  '2,Lululemon Run Back On Track Blue Hooded Pullover,"Heathered blue pullover.\nFaint marks on the sleeve.",lululemon,Clothing,Hoodies,Women,6,Blue,Good,35,"30 Posh sold, median $32",',
  '05,"Nasty Gal Plus Size Plunge Halter Floral Maxi Dress US 22","Says ""new"" on tag.",Nasty Gal,Clothing,Dresses,Women,22,Floral,New with tags,$40.00,,',
].join("\r\n");

test("csv: quotes, doubled quotes, commas and line breaks inside fields", () => {
  const rows = parseCsv('a,b\n"x, y","say ""hi""\nthere"\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'say "hi"\nthere']]);
});
test("csv: BOM and blank lines are ignored", () => {
  assert.deepEqual(parseCsv("﻿a,b\n\n1,2\n"), [["a", "b"], ["1", "2"]]);
});
test("sheet: rows map to fields, numbers padded, price parsed", () => {
  const { rows, problems } = rowsFromCsv(SHEET);
  assert.equal(rows.length, 3);
  assert.deepEqual(problems, []);
  assert.equal(rows[0].number, "01");
  assert.equal(rows[1].number, "02");
  assert.equal(rows[1].brand, "lululemon");
  assert.equal(rows[1].description, "Heathered blue pullover.\nFaint marks on the sleeve.");
  assert.equal(rows[0].price, 30);
  assert.equal(rows[2].price, 40);
  assert.equal(rows[0].checks, "Check brand and size tag");
  assert.equal(rows[0].priceBasis, "12 Posh sold, $18-40");
  assert.equal(rows[2].description, 'Says "new" on tag.');
});
test("sheet: conditions map to the app's five values", () => {
  const { rows } = rowsFromCsv(SHEET);
  assert.deepEqual(rows.map((r) => r.condition), ["like_new", "good", "new"]);
  assert.equal(mapCondition("Excellent"), "like_new");
  assert.equal(mapCondition("NWT"), "new");
  assert.equal(mapCondition("Fair - stains"), "fair");
  assert.equal(mapCondition(""), "good");
  assert.equal(mapCondition("Like new"), "like_new");
});
test("sheet: missing title column, missing price and duplicates are reported", () => {
  assert.equal(rowsFromCsv("#,Brand\n1,Nike").rows.length, 0);
  const { rows, problems } = rowsFromCsv("#,Title,Price\n1,Shirt,\n1,Shirt again,5\n3,,5");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].price, 0);
  assert.equal(problems.length, 3);
});
test("price: common spellings", () => {
  assert.equal(parsePrice("$1,250.00"), 1250);
  assert.equal(parsePrice("USD 45"), 45);
  assert.equal(parsePrice("about 19.5"), 19.5);
  assert.equal(parsePrice("TBD"), 0);
});
test("photos: number comes from the item folder, then a loose file name", () => {
  assert.equal(photoNumber("VibeHuntingSF Listing Photos/01 Navy Cargo Pants/08_Tape_Metric_Start.jpg"), "01");
  assert.equal(photoNumber("VibeHuntingSF Listing Photos/14 Black Crushed Velvet Dress/Originals/IMG_2231.jpg"), "14");
  assert.equal(photoNumber("07_front.jpg"), "07");
  assert.equal(photoNumber("IMG_0042.jpg"), "");
  assert.equal(photoNumber("Photos/IMG_0042.jpg"), "");
});
test("photos: grouped in natural order, originals left out, capped at eight", () => {
  const files = [
    "P/02 Pullover/10_Back.jpg", "P/02 Pullover/2_Hood.jpg", "P/02 Pullover/01_Front_Cover.jpg", "P/02 Pullover/Originals/IMG_1.jpg",
    "P/02 Pullover/notes.txt", "P/02 Pullover/._01_Front_Cover.jpg",
    "P/03 Jeans/Originals/IMG_9.jpg",
    ...Array.from({ length: 11 }, (_, i) => `P/05 Dress/${String(i + 1).padStart(2, "0")}.jpg`),
  ].map((path) => ({ path }));
  const groups = groupPhotos(files);
  assert.deepEqual(groups.get("02")!.map((f) => f.path.split("/").pop()), ["01_Front_Cover.jpg", "2_Hood.jpg", "10_Back.jpg"]);
  assert.deepEqual(groups.get("03")!.map((f) => f.path.split("/").pop()), ["IMG_9.jpg"], "originals used when nothing else");
  assert.equal(groups.get("05")!.length, MAX_IMPORT_PHOTOS);
});
test("item body: draft status, seller copy for each marketplace, checks in private notes", () => {
  const { rows } = rowsFromCsv(SHEET);
  const photo = { id: "p1", original: "https://x/1.jpg", active: "original" as const, processingStatus: "original" as const, name: "01.jpg", createdAt: "2026-11-21T00:00:00Z" };
  const body = itemBody(rows[0], [photo], "IMP1121");
  assert.equal(body.status, "draft");
  assert.equal(body.condition, "like_new");
  assert.equal(body.price, 30);
  assert.equal(body.sku, "IMP1121-01");
  assert.equal(body.brand, undefined);
  assert.equal(body.photoRecords.length, 1);
  assert.match(body.notes, /Check before posting: Check brand and size tag/);
  const copy = body.marketplaceDetails.platformCopy as Record<string, { title: string; description: string }>;
  assert.equal(copy.poshmark.title, rows[0].title);
  assert.equal(copy.poshmark.description, rows[0].description);
  assert.ok(copy.depop.description.startsWith(rows[0].title + "\n\n"));
  assert.equal(body.marketplaceDetails.department, "Men");
  assert.equal(body.marketplaceDetails.quantity, "1");
});
test("batch label", () => {
  assert.equal(batchLabel(new Date(2026, 10, 21)), "IMP1121");
});

console.log(`\n${passed} bulk import checks passed`);
