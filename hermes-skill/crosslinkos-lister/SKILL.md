---
name: crosslinkos-lister
description: Turn item photo folders in ~/Listings into CrossLinkOS resale listings for Poshmark, Depop and Mercari - read photos, research prices, write drafts, ask Shay to approve, then hand approved drafts to the Chrome extension to post. Use when Shay mentions listing, new items, her Listings folder, CrossLinkOS, Poshmark or Depop posting, or replies "approve" / "skip" to a listing summary.
version: 1.0.0
platforms: [linux]
metadata:
  hermes:
    tags: [resale, poshmark, depop, mercari, crosslinkos]
    category: business
---

# CrossLinkOS lister

Shay resells clothing. Each folder in `~/Listings` is one item, named like the listing should read
("Lululemon Align Leggings Black 6"). This skill takes each new folder to a researched, priced
listing that waits for her approval, and approved listings get posted by the CrossLinkOS Chrome
extension in her own Chrome.

All CrossLinkOS work goes through the helper script. It prints JSON. Run it with the terminal tool:

```
python3 ~/.hermes/skills/business/crosslinkos-lister/scripts/crosslinkos.py <command>
```

(Below, `cl` means that whole command.)

## The loop (run on each scheduled check, and whenever Shay asks)

1. **Find new items**: `cl scan`. Skip folders with `"stillSyncing": true`; their photos are
   still arriving. If nothing is new, go to step 5.
2. **Send each new folder**: `cl ingest "<folder name>"`. This takes about 30 to 60 seconds. It reads the
   photos with AI, picks the cover (the best whole-item front view, never a tag or label shot),
   reads the tag photos for brand and size, creates the item, and writes Poshmark/Depop/Mercari drafts.
   Mention the chosen cover (`coverPhoto`) in the approval summary. If Shay says a cover is wrong
   (`cover 12 3` = make photo 3 the cover), run `cl cover 12 3`. A photo she names starting with
   "cover" or "00_" is always used as the cover. Note `photoRead.unsure`
   and each draft's `stillNeeds`.
3. **Research each item** with web search (see "Research rules"), then save what you found:
   ```
   cl update <id> --price 38 --original-price 98 --department Women --subcategory Leggings \
     --research "Sold comps: $32, $35, $40 (Poshmark sold, Nov 2026). Retail $98 (lululemon.com)."
   ```
   Add `--size`, `--brand`, `--condition` or `--measurements` only when you verified them.
   Saving updates every draft's "still needs" by itself; a draft with nothing missing becomes Ready to push.
4. If a draft still needs something you could not verify (often size or condition), leave it empty
   and say so in the summary. Never guess.
5. **Ask for approval**: `cl review --status ready`, then send Shay ONE message with the `summary`
   lines (one per item: title, price, original price, size, draft status). End with:
   "Reply `approve all`, `approve 12 14`, `skip 13`, or `change 12 price 45`."
   Do not repeat items you already asked about unless something changed.
6. **Act on her reply**:
   - `approve all` / `approve 12 14`: `cl approve <id>` for each. Report what `notReady` says.
   - `approve 12 poshmark`: `cl approve 12 --only poshmark`
   - `change 12 price 45` (or any field): `cl update 12 --price 45`, then confirm.
   - `skip 13`: do nothing; it stays in CrossLinkOS as Ready to push.
   - `undo 12`: `cl unapprove 12`
   - `use title 12`: `cl update 12 --title "<the title you proposed>"`
7. Approved drafts are posted by the Chrome extension (auto-post must be on there), spaced a few
   minutes apart. Later, `cl review --status published` and `cl review --status needs_attention`
   show what went live and what got stuck. Tell Shay about anything stuck, with the reason.
   Then run `cl tidy`: folders whose item is Live on Poshmark and Depop move into `posted/`.
   Only Poshmark and Depop are posted for now; never approve Mercari.

## Title check (for each item, during research)

Shay's doc titles are her words, so never change one silently. Check it, and only PROPOSE changes:
1. Search sold and active listings for the same item (Poshmark, eBay sold, Depop, Google Shopping)
   and note the words buyers and top sellers use: brand, the brand's style or product name, item type,
   size, color, key feature (e.g. "Align", "Fit 1", "7/8", "High Rise").
2. Propose a better title only if it adds a real search term or fixes a problem. Keep her facts.
   Poshmark max 80 characters. Depop has no title (the first line of the description is used).
   Never put the size in a title: Poshmark and Depop have their own size field. The script removes
   a size from the end of a title by itself (on ingest and on `--title`).
3. Flag anything to take out: words that can get a listing removed or reported, like "dupe",
   "inspired by", "like Lululemon", or another brand's name for a no-name item; keyword lists;
   "NWT" or "new" on worn items; a brand or size her seller notes say is unconfirmed; emojis or ALL CAPS.
4. In the approval message, show proposals as: `#3 title → "PacSun Skinniest Active Stretch Black Jeans 32x32 Slim"`
   (one short reason). She replies `use title 3` -> `cl update 3 --title "<proposed>"`, or ignores it.
   The same goes for a description problem (`--description`). Updating title or description rewrites
   the drafts automatically; an item that was approved goes back to Ready to push, so ask again.

## Research rules

- **Price**: look up SOLD listings, not asking prices: Poshmark sold, eBay sold or completed, and
  Mercari sold for the same brand + item + size. Use 3 to 6 comparable sales. Suggest a list price a
  little above the median, because buyers make offers. Use her price endings: under $25, end in 9 ($19);
  otherwise land just under a bracket ($24, $49, $99, $249) when the comps support it.
  Put the comps and links in `--research`.
- **Original price**: the brand's retail price for that item (brand site, or a retailer listing).
  Poshmark requires it. If you cannot find it, use a typical retail price for that brand and item
  type, and say "estimated" in `--research`.
- **Measurements**: never invent them. If you find the brand's size chart, you may use
  `--measurements "Per brand size chart: waist 26in, inseam 25in"`. Otherwise leave empty and
  tell Shay which items would benefit from a quick tape-measure check.
- **Brand, size, condition**: only from the photos (tags, labels), `info.txt`, or Shay.
- If the photos or the folder name don't match (wrong item, blurry), stop on that item and ask.

## Batch folders and the descriptions doc

Shay often drops a whole batch: `~/Listings/<Batch>/01_Navy_Cargo_Pants/`, `02_…`, plus a
`posted/` folder and a `.docx` of her written descriptions. `scan` lists items inside batches
(as `Batch/01_Navy_Cargo_Pants`), the number is dropped from the title, and `ingest` uses her
description section from the .docx (matched by number or name). Her description always beats
AI copy; Brand / Size / Price lines in it count like info.txt. Once an item is Live on both Poshmark and
Depop, `cl tidy` moves its folder into the batch's `posted/` folder (Shay's rule; no need to ask).

### Shay's styled descriptions doc (VibeHuntingSF format)

Each item is a Heading 1 ("01  Navy Cargo Pants") followed by a MarketplaceTitle, a
MarketplaceDescription and notes lines ("Suggested tags · …", "Measurements · …", "Seller notes · …").
`ingest` uses her title and description word for word on every platform (no AI rewrite), her
suggested tags, and saves the measurements and seller notes on the item. The doc has NO price,
original price, condition or department, so for every item:
- research price and original price as usual;
- set `--brand`, `--size`, `--department` and `--subcategory` from her title and the photo read
  (e.g. "Aritzia Cream Cashmere Crewneck Cardigan M" -> --brand Aritzia --size M --department Women);
- condition defaults to Good. Her seller notes often say to check condition, so put each item's
  condition in the approval summary and let her correct it (`change 3 condition like new`);
- if her seller notes say the brand or size is unconfirmed (items like 01, 11, 14), say so in the
  summary instead of guessing.

## info.txt (optional, in an item folder)

Shay can drop an `info.txt` next to the photos. Its values beat the photo reader:
```
price: 38
cost: 4
original price: 98
condition: like new
size: 6
notes: tiny pill on inner thigh
```

## Never

- Never approve on Shay's behalf unless she has said, in this conversation, to auto-approve, and
  then only items with nothing in `stillNeeds` and a researched price.
- Never post, edit or delete on Poshmark/Depop/Mercari directly. Posting belongs to the extension.
- Never solve or bypass a CAPTCHA. If the extension pauses for one, tell Shay.
- Never share the access key (in ~/.config/crosslinkos/env) or put it in a message.
