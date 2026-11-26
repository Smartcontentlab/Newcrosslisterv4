#!/usr/bin/env python3
"""CrossLinkOS helper for Hermes: turns item photo folders into CrossLinkOS listings.

Each folder inside LISTINGS_DIR (default ~/Listings) is one item, named the way you want
the listing titled, e.g. ~/Listings/Lululemon Align Leggings Black 6/. A batch folder of item
folders works too (~/Listings/VibeHuntingSF_Batch/01_Navy_Cargo_Pants/): the leading number
is dropped from the title, "posted" and "platform-tools" folders are skipped, and a .docx of
descriptions in the batch folder is matched to each item by number or name.
Optional: an info.txt in the folder with lines like
    price: 38
    cost: 4
    original price: 98
    condition: like new
    size: 6
    notes: tiny pill on inner thigh

Commands (all print JSON, so Hermes can read the result):
    scan                         folders not yet sent to CrossLinkOS
    ingest FOLDER                read photos, create the item, write the P/D/M drafts
    ingest-all                   send every new folder (drafts only; nothing is approved or posted)
    recopy ID… | all             rewrite each site's title + description with the generator (retries timeouts)
    item ID                      one item with its drafts (no photos)
    update ID [--price ...]      save research (price, original price, sizes, notes)
    redraft ID                   rewrite the drafts after big changes
    review [--status ready]      items waiting for approval, with what each draft still needs
    approve ID [--only poshmark] approve Ready to push drafts for auto-post
    unapprove ID                 take approved drafts back to Ready to push
    cover ID N                   make photo N the cover of an item already sent
    rephoto ID                   re-pick an item's photos from its folder (white backgrounds + labels)
    tidy                         move folders that are Live on Poshmark and Depop into posted/

Settings (environment or ~/.config/crosslinkos/env):
    CROSSLINKOS_KEY   access key from CrossLinkOS Settings > Access keys (required)
    CROSSLINKOS_API   default https://crosslinkos.vercel.app/api
    LISTINGS_DIR      default ~/Listings

Needs Python 3.10+ and Pillow (Ubuntu: sudo apt install python3-pil).
iPhone HEIC photos also need: sudo apt install libheif-examples   (or pip pillow-heif)
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from xml.etree import ElementTree
from datetime import datetime, timezone
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover - checked at runtime
    sys.exit(json.dumps({"error": "Pillow is missing. Install it with: sudo apt install python3-pil"}))

try:  # optional HEIC support through Python
    from pillow_heif import register_heif_opener  # type: ignore

    register_heif_opener()
    HEIF_PY = True
except Exception:
    HEIF_PY = False

PHOTO_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
MARKER = ".crosslinkos.json"
MAX_STORED = 12  # Poshmark takes up to 16; Depop's first 8 are used there
STORED_SIDE, STORED_BYTES = 1200, 240_000  # each stored photo; 12 of them stay under the 4.5 MB request limit
READ_SIDE, READ_BYTES = 768, 120_000  # photos sent to the AI reader (server limit 170k characters)


def load_env() -> None:
    env_file = Path.home() / ".config" / "crosslinkos" / "env"
    if env_file.exists():
        values: dict[str, str] = {}
        for line in env_file.read_text().splitlines():  # a later line wins, so appending a setting works
            if "=" in line and not line.strip().startswith("#"):
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
        for key, value in values.items():
            os.environ.setdefault(key, value)


load_env()
API = os.environ.get("CROSSLINKOS_API", "https://crosslinkos.vercel.app/api").rstrip("/")
LISTINGS_DIR = Path(os.path.expanduser(os.environ.get("LISTINGS_DIR", "~/Listings")))


def fail(message: str, code: int = 1) -> None:
    print(json.dumps({"error": message}, indent=2))
    sys.exit(code)


class ApiError(Exception):
    pass


def api(method: str, path: str, body: dict | None = None, timeout: int = 90, soft: bool = False) -> dict:
    key = os.environ.get("CROSSLINKOS_KEY", "").strip()
    if not key:
        fail("CROSSLINKOS_KEY is not set. Create a key in CrossLinkOS Settings > Access keys and put it in ~/.config/crosslinkos/env")
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(f"{API}{path}", data=data, method=method, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read().decode() or "{}"
                return json.loads(raw)
        except urllib.error.HTTPError as error:
            text = error.read().decode(errors="replace")
            try:
                message = json.loads(text).get("error", text)
            except Exception:
                message = text[:300]
            if error.code in (502, 503, 504) and attempt < 2:
                time.sleep(5 * (attempt + 1))
                continue
            if soft:
                raise ApiError(message)
            fail(f"CrossLinkOS {method} {path} answered {error.code}: {message}")
        except urllib.error.URLError as error:
            if attempt < 2:
                time.sleep(5)
                continue
            if soft:
                raise ApiError(str(error.reason))
            fail(f"Could not reach CrossLinkOS: {error.reason}")
    return {}


# ----------------------------------------------------------------- photos

def open_image(path: Path) -> Image.Image:
    if path.suffix.lower() in (".heic", ".heif") and not HEIF_PY:
        converter = shutil.which("heif-convert") or shutil.which("heif-dec")
        if not converter:
            raise RuntimeError("HEIC photo needs: sudo apt install libheif-examples")
        out = Path(tempfile.mkdtemp()) / (path.stem + ".jpg")
        subprocess.run([converter, str(path), str(out)], check=True, capture_output=True)
        path = out
    image = Image.open(path)
    image = ImageOps.exif_transpose(image)  # phone photos keep their rotation in EXIF
    return image.convert("RGB")


def to_data_url(image: Image.Image, side: int, max_bytes: int) -> str:
    image = image.copy()
    image.thumbnail((side, side))
    quality = 85
    while True:
        buffer = io.BytesIO()
        image.save(buffer, "JPEG", quality=quality, optimize=True)
        if buffer.tell() <= max_bytes or quality <= 40:
            if buffer.tell() > max_bytes:  # still too big: shrink the picture itself
                image.thumbnail((int(image.width * 0.8), int(image.height * 0.8)))
                quality = 70
                continue
            return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()
        quality -= 8


def folder_photos(folder: Path) -> list[Path]:
    return sorted([p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in PHOTO_EXT and not p.name.startswith(".")], key=lambda p: p.name.lower())


def read_info(folder: Path) -> dict:
    info: dict[str, str] = {}
    for name in ("info.txt", "notes.txt", "info.md"):
        file = folder / name
        if file.exists():
            for line in file.read_text(errors="replace").splitlines():
                if ":" in line:
                    key, value = line.split(":", 1)
                    raw = re.sub(r"[^a-z]", "", key.lower())
                    info[INFO_KEYS.get(raw, raw)] = value.strip()
                elif line.strip():
                    info["notes"] = (info.get("notes", "") + " " + line.strip()).strip()
    return info


def number(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"\d+(?:\.\d+)?", value.replace(",", ""))
    return float(match.group()) if match else None


CONDITIONS = {"newwithouttags": "like_new", "new": "new", "nwt": "new", "newwithtags": "new", "likenew": "like_new", "nwot": "like_new", "excellent": "like_new", "euc": "like_new", "good": "good", "guc": "good", "fair": "fair", "poor": "poor"}


def resolve_folder(name: str) -> Path:
    path = Path(os.path.expanduser(name))
    if not path.is_absolute():
        path = LISTINGS_DIR / name
    if not path.is_dir():
        fail(f"Folder not found: {path}")
    return path


# ----------------------------------------------------------------- commands

IGNORED = {"posted", "done", "sold", "archive", "archived", "listed"}


def ignored(folder: Path) -> bool:
    name = folder.name.lower()
    return name.startswith((".", "_", "platform-tools")) or name in IGNORED


def item_folders() -> list[Path]:
    """Item folders directly in LISTINGS_DIR, plus items inside batch folders (a folder of item folders)."""
    found: list[Path] = []
    for folder in sorted(p for p in LISTINGS_DIR.iterdir() if p.is_dir() and not ignored(p)):
        if folder_photos(folder):
            found.append(folder)
        else:
            found.extend(sorted(s for s in folder.iterdir() if s.is_dir() and not ignored(s) and folder_photos(s)))
    return found


def cmd_scan(_args) -> None:
    if not LISTINGS_DIR.exists():
        fail(f"{LISTINGS_DIR} does not exist yet. Create it and add one folder per item (or a batch folder of item folders).")
    new, done = [], 0
    for folder in item_folders():
        photos = folder_photos(folder)
        if (folder / MARKER).exists():
            done += 1
            continue
        # Skip a folder still receiving photos (changed in the last 2 minutes).
        settling = time.time() - max(p.stat().st_mtime for p in photos) < 120
        doc = batch_doc(folder)
        new.append({"folder": str(folder.relative_to(LISTINGS_DIR)), "title": clean_title(folder.name), "photos": len(photos), "stillSyncing": settling, "descriptionsDoc": doc.name if doc else None})
    print(json.dumps({"listingsDir": str(LISTINGS_DIR), "new": new, "alreadySent": done}, indent=2))


# ------------------------------------------------- titles and the batch descriptions doc

LETTER_SIZES = r"(?:XXS|XS|S|M|L|XL|XXL|XXXL|[2-5]XL|S/P|M/P|L/P|OS|One Size|X-?Small|Small|Medium|Large|X-?Large|XX-?Large)"


def strip_size(title: str, size: str | None = None) -> str:
    """Sizes go in each marketplace's size field, not the title: 'Cardigan M' -> 'Cardigan'.

    Letter sizes, 'US 22', '32 x 32' and '12 Regular' are removed from the end of the title. A bare
    number is removed only when it is the item's size, so model numbers like 'Air Force 1' stay.
    """
    text = title.strip()
    patterns = [
        rf"(?:\s+|\s*[-,|]\s*)(?:size\s+|sz\s+)?{LETTER_SIZES}$",
        r"(?:\s+|\s*[-,|]\s*)(?:size\s+|sz\s+)?(?:US|UK|EU)\s*\d{1,2}(?:\.\d)?$",
        r"(?:\s+|\s*[-,|]\s*)\d{2}\s*[xX]\s*\d{2}$",
        r"(?:\s+|\s*[-,|]\s*)\d{1,2}\s*(?:Regular|Short|Long|Petite|Tall|R|S|L|P|T)$",
        r"(?:\s+|\s*[-,|]\s*)size\s+\S+$",
    ]
    if size and size.strip():
        patterns.append(r"(?:\s+|\s*[-,|]\s*)" + re.escape(size.strip()) + r"$")
    for _ in range(3):
        before = text
        for pattern in patterns:
            candidate = re.sub(pattern, "", text, flags=re.IGNORECASE).strip()
            if candidate and len(candidate.split()) >= 2:
                text = candidate
        if text == before:
            break
    return text


def same_size(a: str, b: str) -> bool:
    """'M' == 'Medium' == 'Size M'; '32 x 32' == '32x32'; 'US 22' == '22'; 'S/P' == 'S'."""
    def canon(value: str) -> str:
        text = re.sub(r"^(?:size|sz|us|uk|eu)\s*", "", value.strip().lower())
        text = re.sub(r"\s*/\s*p$|\s*\(.*\)$|\s+(?:regular|reg|short|long|petite|tall)$", "", text)
        text = re.sub(r"\s*x\s*", "x", text)
        words = {"extra small": "xs", "x-small": "xs", "x small": "xs", "small": "s", "medium": "m", "med": "m", "large": "l", "x-large": "xl", "x large": "xl", "extra large": "xl", "xx-large": "xxl", "2xl": "xxl", "3xl": "xxxl", "one size": "os"}
        return words.get(text, text).replace(" ", "")
    return canon(a) == canon(b)


def clean_title(name: str) -> str:
    """'01_Navy_Cargo_Pants' -> 'Navy Cargo Pants' (the number only orders the batch)."""
    text = re.sub(r"^\s*#?\d{1,3}\s*[\s_.)\-]+", "", name)
    return re.sub(r"\s+", " ", text.replace("_", " ")).strip() or name


def item_number(name: str) -> int | None:
    match = re.match(r"^\s*#?(\d{1,3})(?=[\s_.)\-])", name)
    return int(match.group(1)) if match else None


def batch_doc(folder: Path) -> Path | None:
    for place in (folder, folder.parent):
        docs = sorted(place.glob("*.docx")) + sorted(place.glob("*.txt")) if place != folder else sorted(place.glob("*.docx"))
        docs = [d for d in docs if not d.name.startswith((".", "~$")) and d.name.lower() not in ("info.txt", "notes.txt")]
        if docs:
            return docs[0]
    return None


def doc_paragraphs(path: Path) -> list[tuple[str, str]]:
    """(style, text) for each paragraph. Word styles such as MarketplaceTitle tell the parts apart."""
    if path.suffix.lower() == ".txt":
        return [("", line.strip()) for line in path.read_text(errors="replace").splitlines()]
    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    with zipfile.ZipFile(path) as archive:
        root = ElementTree.fromstring(archive.read("word/document.xml"))
    paragraphs = []
    for para in root.iter(f"{ns}p"):
        style = para.find(f"{ns}pPr/{ns}pStyle")
        text = "".join(node.text or "" for node in para.iter(f"{ns}t")).replace("\u00a0", " ").strip()
        paragraphs.append((style.get(f"{ns}val") if style is not None else "", text))
    return paragraphs


def words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if len(w) > 1}


def doc_section(folder: Path) -> dict:
    """This item's part of the batch descriptions doc.

    Returns {doc, text, title, description, tags, notes}. With Shay's styled doc (Heading1 "01  Navy
    Cargo Pants", then MarketplaceTitle, MarketplaceDescription and ListingNotes lines such as
    "Suggested tags · …"), each part is taken exactly. A plain doc gives just the text under the heading.
    """
    doc = batch_doc(folder)
    result: dict = {"doc": doc.name if doc else None, "text": "", "title": "", "description": "", "tags": [], "notes": []}
    if not doc:
        return result
    try:
        paras = doc_paragraphs(doc)
    except Exception:  # noqa: BLE001
        return result
    siblings = [s for s in folder.parent.iterdir() if s.is_dir() and not ignored(s)]

    def heading_for(style: str, text: str) -> Path | None:
        if not text or len(text) > 120 or style in ("MarketplaceTitle", "MarketplaceDescription", "ListingNotes", "ListingReference"):
            return None
        number = item_number(text) or (int(m.group(1)) if (m := re.match(r"^\s*(?:item|listing)\s*#?\s*(\d{1,3})", text, re.I)) else None)
        best, best_score = None, 0.0
        for sibling in siblings:
            title_words = words(clean_title(sibling.name))
            overlap = len(title_words & words(text)) / max(1, len(title_words))
            score = overlap + (1.0 if number is not None and number == item_number(sibling.name) else 0.0)
            if score > best_score:
                best, best_score = sibling, score
        return best if best_score >= 0.6 else None

    is_heading = lambda style, text: style.lower().startswith("heading") or bool(item_number(text))  # noqa: E731
    heads = [(i, heading_for(s, x)) for i, (s, x) in enumerate(paras)]
    mine = [i for i, s in heads if s == folder]
    if not mine:
        return result
    start = mine[0]
    end = next((i for i, (s, x) in enumerate(paras) if i > start and x and is_heading(s, x)), len(paras))
    section = paras[start + 1:end]
    for style, text in section:
        if not text:
            continue
        label, _, value = text.partition(" · ")
        if style == "MarketplaceTitle":
            result["title"] = text
        elif style == "MarketplaceDescription":
            result["description"] = (result["description"] + "\n\n" + text).strip()
        elif label.strip().lower() == "suggested tags":
            result["tags"] = [tag.strip() for tag in value.split(",") if tag.strip()][:20]
        elif style in ("ListingNotes", "ListingReference") or value:
            result["notes"].append(text)
    result["text"] = "\n".join(x for _, x in section if x)[:5000]
    if not result["description"] and not result["title"]:
        result["description"] = result["text"]  # plain doc: everything under the heading
    return result


INFO_KEYS = {
    "price": "price", "listprice": "price", "listingprice": "price", "askingprice": "price", "suggestedprice": "price", "suggestedlistingprice": "price",
    "lowestprice": "lowest", "lowest": "lowest", "lowestofferprice": "lowest", "lowestoffer": "lowest", "minimumprice": "lowest", "floorprice": "lowest", "floor": "lowest", "smartsell": "lowest", "smartpricing": "lowest", "automateoffers": "lowest",
    "cost": "cost", "originalprice": "originalprice", "msrp": "originalprice", "retail": "originalprice", "retailprice": "originalprice",
    "condition": "condition", "size": "size", "brand": "brand", "color": "color", "colour": "color", "measurements": "measurements",
    "material": "material", "department": "department", "category": "category", "subcategory": "subcategory",
}


NOTE_LABELS = {"internalnotes", "internalnote", "privatenotes", "notetoself", "suggestedtags", "tags", "hashtags", "measurements", "sellernotes", "notes", "note", "reference", "productreference", "photos", "comps", "soldcomps", "research", "todo", "styleno", "stylenumber", "sku"}
NOTE_LINE = re.compile(r"^\s*[-*•]?\s*([A-Za-z][A-Za-z /()#]{1,30}?)\s*(?::|·)\s*\S")


def buyer_description(text: str) -> str:
    """The part of Shay's text a buyer should read: her notes and settings lines (prices, tags,
    measurements to take, seller notes, condition...) are taken out, whatever the doc's styling."""
    kept = []
    in_notes = False
    for line in text.splitlines():
        heading = re.sub(r"[^a-z]", "", line.lower())
        # A notes heading on its own line ("Internal notes", "Seller notes:", "Notes") hides everything
        # under it until a blank line or the next heading.
        if heading and len(line.strip()) <= 40 and (heading in NOTE_LABELS or heading.endswith(("notes", "note")) or heading in ("internal", "private", "forme", "pricing", "prices")):
            in_notes = True
            continue
        if in_notes:
            if not line.strip():
                in_notes = False
            continue
        if re.search(r"\(\s*(?:internal|private|note to self|for me)\b[^)]*\)", line, re.I):
            line = re.sub(r"\(\s*(?:internal|private|note to self|for me)\b[^)]*\)", "", line, flags=re.I).rstrip()
        match = NOTE_LINE.match(line)
        label = re.sub(r"[^a-z]", "", match.group(1).lower()) if match else ""
        if match and (label in INFO_KEYS or label in NOTE_LABELS or label.endswith(("price", "notes", "tags"))):
            continue
        if re.match(r"^\s*(product archive|.*\breference\b.*|.*resale comparison.*)$", line, re.I) and len(line) < 80:
            continue  # her link captions ("Product archive · Blue resale comparison")
        kept.append(line)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip()


def info_from_text(text: str) -> dict:
    """Lines like "Listing price · $45", "Lowest price: $35" or "Condition · Like new" in Shay's doc or info.txt."""
    info: dict[str, str] = {}
    for line in text.splitlines():
        match = re.match(r"^\s*[-*•]?\s*([A-Za-z][A-Za-z /()]{1,30}?)\s*(?::|·)\s*(.+)$", line)
        if not match:
            continue
        key = INFO_KEYS.get(re.sub(r"[^a-z]", "", match.group(1).lower()))
        value = match.group(2).strip()
        if not key or not value:
            continue
        if key == "measurements" and (re.search(r"not provided|unconfirmed|need|measure ", value, re.I) or not re.search(r"\d", value)):
            continue  # her notes on what still needs measuring, not measurements
        if key in ("size", "brand") and re.search(r"unconfirmed|need|check|tagged", value, re.I):
            continue
        info.setdefault(key, value)
    return info


def draft_summary(drafts: list[dict]) -> dict:
    out = {}
    for draft in drafts:
        labels = {f["key"]: f.get("label", f["key"]) for f in draft.get("requiredFields", [])}
        out[draft["marketplace"]] = {"id": draft["id"], "status": draft["status"], "stillNeeds": [labels.get(k, k) for k in draft.get("missingFields", [])], "copy": draft.get("copyOrigin")}
    return out


def cmd_ingest(args) -> None:
    folder = resolve_folder(args.folder)
    if (folder / MARKER).exists() and not args.force:
        fail(f"{folder.name} was already sent (item {json.loads((folder / MARKER).read_text()).get('itemId')}). Use --force to send it again.")
    paths = folder_photos(folder)
    if not paths:
        fail(f"No photos in {folder}")
    images, roles, names, photo_notes, skipped = pick_photos(paths, args.keep_order)
    stored = [to_data_url(image, STORED_SIDE, STORED_BYTES) for image in images]
    # Read the cover plus up to two tag/label photos: the labels carry brand and size.
    tag_positions = [pos for pos, role in enumerate(roles) if role and role["view"] in ("tag", "label")][:2]
    read_positions = [0] + tag_positions + [pos for pos in range(1, len(images)) if pos not in tag_positions]
    to_read = [to_data_url(images[pos], READ_SIDE, READ_BYTES) for pos in read_positions[:3]]

    section = doc_section(folder)
    info = {**info_from_text(section["text"]), **read_info(folder)}  # info.txt beats the descriptions doc
    title = section["title"] or clean_title(folder.name)
    hints = {"title": strip_size(title)}
    if info.get("brand"):
        hints["brand"] = info["brand"]
    read = api("POST", "/workflow/photo-read", {"photos": to_read, "hints": hints}, timeout=90)
    facts = {k: read.get(k) for k in ("title", "brand", "model", "category", "subcategory", "department", "color", "secondaryColor", "material", "pattern", "style", "size") if read.get(k)}
    if read.get("flaws"):
        facts["flaws"] = read["flaws"]
    # Size cross-check: the size Shay wrote (doc title tail, Size line or info.txt) vs. the tag in the photos.
    written_title = section["title"] or clean_title(folder.name)
    title_size = written_title[len(strip_size(written_title)):].strip(" -,|") or None
    written_size = info.get("size") or title_size
    photo_size = read.get("size") or None
    size_check = {"written": written_size, "fromPhotos": photo_size, "status": "ok"}
    if written_size and photo_size and not same_size(written_size, photo_size):
        size_check["status"] = "MISMATCH: confirm before approving"
    elif written_size and not photo_size:
        size_check["status"] = "tag not readable in photos; using the written size"
    elif photo_size and not written_size:
        size_check["status"] = "no size written; using the tag in the photos"
    elif not written_size and not photo_size:
        size_check["status"] = "no size anywhere: ask Shay"
    for key in ("brand", "size", "department", "subcategory", "category", "color"):
        if info.get(key):
            facts[key] = info[key]  # the seller's own notes beat the photo reader
    if written_size and "size" not in info:
        facts["size"] = written_size

    body = {"folder": title, "photos": stored, "facts": facts}
    body["folder"] = strip_size(title, facts.get("size") or info.get("size"))
    if section["title"]:
        body["title"] = strip_size(section["title"], facts.get("size") or info.get("size"))[:80]
    if section["description"]:
        # Her description is the generator's source; her notes and settings lines never reach buyers.
        buyer_text = buyer_description(section["description"])
        if buyer_text:
            body["description"] = buyer_text
    if section["tags"]:
        body["tags"] = section["tags"]
    if number(info.get("price")) is not None:
        body["price"] = number(info["price"])
    if number(info.get("cost")) is not None:
        body["cost"] = number(info["cost"])
    if info.get("condition"):
        body["condition"] = CONDITIONS.get(re.sub(r"[^a-z]", "", info["condition"].lower()), "good")
    notes = [info["notes"]] if info.get("notes") else []
    notes += section["notes"]
    if notes:
        body["notes"] = "\n".join(notes)[:2000]
    created = api("POST", "/autopilot/items", body, timeout=60)
    item_id = created["id"]

    extra = {}
    if number(info.get("originalprice") or info.get("msrp") or info.get("retail")) is not None:
        extra["originalPrice"] = str(int(number(info.get("originalprice") or info.get("msrp") or info.get("retail"))))
    extra["sizeCheck"] = size_check
    lowest, list_price = number(info.get("lowest")), number(info.get("price"))
    if lowest is not None and (list_price is None or lowest < list_price):
        # Poshmark Automate Offers: accept offers down to this price. Mercari's smart pricing floor gets it too.
        extra.update({"poshSmartSellMode": "minimum_price", "poshMinimumPrice": str(int(round(lowest))), "mercariSmartPriceFloor": str(int(round(lowest)))})
    if info.get("measurements"):
        patch_item(item_id, {"measurements": info["measurements"]}, extra)
    elif extra:
        patch_item(item_id, {}, extra)

    drafts = [] if args.no_drafts else generate_drafts(item_id)[0]
    (folder / MARKER).write_text(json.dumps({"itemId": item_id, "sentAt": datetime.now(timezone.utc).isoformat()}))
    print(json.dumps({
        "itemId": item_id, "title": created["title"], "photosSent": len(stored), "photosSkipped": skipped, "coverPhoto": photo_notes["cover"],
        "photoOrder": [{"file": name, "view": (role or {}).get("view")} for name, role in zip(names, roles)], "photosLeftOut": photo_notes["leftOut"],
        "photoRead": {"facts": facts, "unsure": read.get("unsure", []), "aiModel": read.get("aiModel")},
        "sizeCheck": size_check, "fromInfoTxt": info, "fromDoc": {"doc": section["doc"], "title": section["title"], "tags": len(section["tags"]), "notes": section["notes"]} if section["doc"] else None, "weightLb": created.get("weight"),
        "drafts": draft_summary(drafts), "next": "Research the price and original price, then run: update ITEM --price N --original-price N",
    }, indent=2))


ROLE_SIDE, ROLE_BYTES = 512, 60_000


MAX_LOOKED_AT = 24
KEEP_ANY_BACKGROUND = ("tag", "label", "measurement")


def white_background(image) -> bool:
    """True for the edited, white-background shots: the photo's outer edge is almost all near-white."""
    small = image.copy()
    small.thumbnail((96, 96))
    w, h = small.size
    pixels = small.load()
    ring = [pixels[x, y] for x in range(w) for y in (0, 1, h - 2, h - 1)] + [pixels[x, y] for y in range(h) for x in (0, 1, w - 2, w - 1)]
    white = sum(1 for r, g, b in ring if min(r, g, b) >= 222 and max(r, g, b) - min(r, g, b) <= 18)
    return white / max(1, len(ring)) >= 0.8


def photo_roles(images: list) -> list:
    small = [to_data_url(image, ROLE_SIDE, ROLE_BYTES) for image in images]
    roles: list = []
    for start in range(0, len(small), 4):
        chunk = small[start:start + 4]
        try:
            roles += api("POST", "/autopilot/photo-roles", {"photos": chunk}, timeout=75, soft=True).get("roles") or [None] * len(chunk)
        except Exception:  # noqa: BLE001
            roles += [None] * len(chunk)
    return roles


def pick_photos(paths: list[Path], keep_order: bool):
    """Shay's rule: every photo in the item folder goes up; nothing from its Originals subfolder
    (folder_photos never looks inside subfolders). The cover is the best whole-item front view,
    preferring a white-background shot, or a photo she named cover*/00_*; the rest keep her order.

    Returns (images, roles, names, notes, skipped). At most MAX_STORED photos.
    """
    opened, skipped = [], []
    for path in paths[:MAX_LOOKED_AT]:
        try:
            opened.append((path.name, open_image(path)))
        except Exception as error:  # noqa: BLE001
            skipped.append(f"{path.name}: {error}")
    if not opened:
        fail(f"None of the photos could be opened. {'; '.join(skipped)}")
    names = [name for name, _ in opened]
    images = [image for _, image in opened]
    roles = photo_roles(images) if len(images) > 1 and not keep_order else [None] * len(images)
    white = [white_background(image) for image in images]
    named = [bool(re.search(r"label|tag|measure|tape|size|flaw", name, re.I)) for name in names]
    notes = {"leftOut": [], "cover": ""}
    marked = next((i for i, name in enumerate(names) if name.lower().startswith(("cover", "00_", "00-", "00 "))), None)
    candidates = [i for i in range(len(images)) if not named[i] and not (roles[i] and roles[i]["view"] in KEEP_ANY_BACKGROUND)] or list(range(len(images)))
    if marked is not None:
        cover, notes["cover"] = marked, f"{names[marked]} (picked by Shay)"
    elif keep_order or not any(roles):
        cover = candidates[0]
        notes["cover"] = f"{names[cover]} (folder order)"
    else:
        cover = max(candidates, key=lambda i: ((roles[i] or {}).get("cover", -50) + (3 if white[i] else 0), -i))
        role = roles[cover] or {}
        notes["cover"] = f"{names[cover]} ({str(role.get('view', 'photo')).replace('_', ' ')}{', whole item' if role.get('wholeItem') else ''}{', white background' if white[cover] else ''})"
    order = [cover] + [i for i in range(len(images)) if i != cover]
    if len(order) > MAX_STORED:
        notes["leftOut"] += [names[i] + " (over the 12-photo limit)" for i in order[MAX_STORED:]]
        order = order[:MAX_STORED]
    return [images[i] for i in order], [roles[i] for i in order], [names[i] for i in order], notes, skipped


def patch_item(item_id: int, fields: dict, details: dict, remove: list | None = None) -> dict:
    item = api("GET", f"/workflow/items/{item_id}")["item"]
    body = dict(fields)
    if details or remove:
        merged = dict(item.get("marketplaceDetails") or {})
        merged.update(details)
        for key in remove or []:
            merged.pop(key, None)  # e.g. saved word-for-word copy, so the generator writes fresh copy
        body["marketplaceDetails"] = merged
    return api("PATCH", f"/workflow/items/{item_id}", body) if body else item


def cmd_item(args) -> None:
    data = api("GET", f"/workflow/items/{args.id}")
    item = data["item"]
    item.pop("photos", None)
    item["photoCount"] = len(item.pop("photoRecords", []) or [])
    print(json.dumps({"item": item, "drafts": draft_summary(data["drafts"])}, indent=2, default=str))


def cmd_update(args) -> None:
    fields: dict = {}
    details: dict = {}
    if args.price is not None:
        fields["price"] = args.price
    if args.cost is not None:
        fields["cost"] = args.cost
    for name in ("title", "brand", "size", "color", "category", "measurements", "condition", "description"):
        value = getattr(args, name)
        if value:
            fields[name] = CONDITIONS.get(re.sub(r"[^a-z]", "", value.lower()), value) if name == "condition" else value
    if fields.get("title") and not args.keep_size:
        fields["title"] = strip_size(fields["title"], args.size)
    if args.weight is not None:
        fields["weight"] = args.weight
    if args.original_price is not None:
        details["originalPrice"] = str(int(round(args.original_price)))
    if args.size:
        details["sizeCheck"] = {"written": args.size, "status": "confirmed by Shay"}
    if args.lowest is not None:
        details.update({"poshSmartSellMode": "minimum_price", "poshMinimumPrice": str(int(round(args.lowest))), "mercariSmartPriceFloor": str(int(round(args.lowest)))})
    for name in ("department", "subcategory", "material", "style"):
        value = getattr(args, name)
        if value:
            details[name] = value
    if args.research:
        details["priceResearch"] = {"summary": args.research[:1500], "at": datetime.now(timezone.utc).isoformat(), "by": "hermes"}
    if not fields and not details:
        fail("Nothing to update. Pass at least one option, e.g. --price 38")
    copy_changed = bool(fields.get("title") or fields.get("description"))
    patch_item(args.id, fields, details, remove=["platformCopy"] if copy_changed else None)
    if args.redraft or copy_changed:  # the generator rewrites each site's copy from the new title/description
        generate_drafts(args.id)
    cmd_item(args)


def cmd_redraft(args) -> None:
    drafts, _ = generate_drafts(args.id)
    print(json.dumps({"itemId": args.id, "drafts": draft_summary(drafts)}, indent=2))


def cmd_review(args) -> None:
    query = f"?status={args.status}" if args.status else ""
    items = api("GET", f"/autopilot/review{query}")["items"]
    lines = []
    for entry in items:
        parts = []
        for market, draft in entry["drafts"].items():
            need = f" (needs {', '.join(draft['stillNeeds'])})" if draft["stillNeeds"] else ""
            parts.append(f"{market[0].upper()}: {draft['status']}{need}")
        original = f", orig ${entry['originalPrice']}" if entry.get("originalPrice") else ""
        lines.append(f"#{entry['id']} {entry['title']} | ${entry['price']:.0f}{original} | size {entry.get('size') or '?'} | {'; '.join(parts) or 'no drafts'}")
    print(json.dumps({"count": len(items), "summary": lines, "items": items}, indent=2, default=str))


def cmd_tidy(args) -> None:
    """Move each sent folder into its batch's posted/ folder once Poshmark and Depop are both Live."""
    moved, waiting = [], []
    for folder in item_folders():
        marker = folder / MARKER
        if not marker.exists():
            continue
        item_id = json.loads(marker.read_text()).get("itemId")
        drafts = {d["marketplace"]: d for d in api("GET", f"/workflow/items/{item_id}")["drafts"]}
        live = {m: (drafts.get(m) or {}).get("status") in ("published", "sold") for m in args.markets}
        if all(live.values()):
            target_dir = folder.parent / "posted"
            target_dir.mkdir(exist_ok=True)
            target = target_dir / folder.name
            if target.exists():
                target = target_dir / f"{folder.name} ({item_id})"
            shutil.move(str(folder), str(target))
            moved.append({"itemId": item_id, "folder": folder.name, "to": str(target.relative_to(LISTINGS_DIR))})
        else:
            waiting.append({"itemId": item_id, "folder": folder.name, "notLiveYet": [m for m, ok in live.items() if not ok]})
    print(json.dumps({"moved": moved, "waiting": waiting}, indent=2))


def cmd_ingest_all(args) -> None:
    """Send every new item folder, one after another, and print a short table. Nothing is approved or posted."""
    folders = [f for f in item_folders() if not (f / MARKER).exists()]
    if not folders:
        print("Nothing new to send: every item folder already has its drafts in CrossLinkOS.")
        return
    print(f"Sending {len(folders)} items. Each takes about 1-2 minutes; leave this window open.\n", flush=True)
    rows = []
    for number, folder in enumerate(folders, 1):
        name = str(folder.relative_to(LISTINGS_DIR))
        print(f"[{number}/{len(folders)}] {name} …", flush=True)
        run = subprocess.run([sys.executable, __file__, "ingest", name], capture_output=True, text=True)
        try:
            result = json.loads(run.stdout)
        except Exception:  # noqa: BLE001
            result = {"error": (run.stdout or run.stderr).strip()[-300:]}
        if "error" in result:
            rows.append((name, "-", "FAILED", result["error"]))
            print(f"      failed: {result['error']}", flush=True)
            continue
        needs = sorted({need for draft in result.get("drafts", {}).values() if draft.get("status") != "ready" for need in draft.get("stillNeeds", [])})
        size = result.get("sizeCheck", {}).get("status", "")
        status = "ready" if not needs else "needs: " + ", ".join(needs)
        rows.append((name, str(result["itemId"]), status, "" if size == "ok" else f"size: {size}"))
        print(f"      item {result['itemId']}: {status}{'' if size == 'ok' else ' | size ' + size}", flush=True)
    print("\nDone. Open the Draft Board in CrossLinkOS to review and post them.\n")
    for name, item, status, note in rows:
        print(f"  #{item:>4}  {status:<40} {note}  ({name.split('/')[-1]})")


def generate_drafts(item_id: int, tries: int = 3) -> tuple[list, dict]:
    """Ask CrossLinkOS's copy generator for each site's version; retry while any site fell back to the plain template."""
    drafts: list = []
    for attempt in range(tries):
        drafts = api("POST", f"/workflow/items/{item_id}/marketplace-drafts", {}, timeout=90)
        origins = {d["marketplace"]: d.get("copyOrigin") for d in drafts}
        if all(origin in ("ai", "seller") for origin in origins.values()):
            break
        time.sleep(4 * (attempt + 1))
    return drafts, {d["marketplace"]: d.get("copyOrigin") for d in drafts}


def cmd_recopy(args) -> None:
    """Throw away saved copy and have the generator write each site's title + description again."""
    ids = args.ids
    if ids == ["all"]:
        ids = [str(json.loads((f / MARKER).read_text())["itemId"]) for f in item_folders() if (f / MARKER).exists()]
    results = []
    for raw in ids:
        item_id = int(raw)
        current = api("GET", f"/workflow/items/{item_id}")["item"]
        cleaned = buyer_description(current.get("description") or "")
        fields = {"description": cleaned} if cleaned and cleaned != (current.get("description") or "").strip() else {}
        patch_item(item_id, fields, {}, remove=["platformCopy"])
        drafts, origins = generate_drafts(item_id)
        live = [d["marketplace"] for d in drafts if d["status"] in ("published", "sold")]
        results.append({"itemId": item_id, "copy": {m: ("AI, written for this site" if o == "ai" else "TEMPLATE (AI timed out; run recopy again)" if o == "template" else o) for m, o in origins.items()}, "alreadyLive": live})
        print(f"item {item_id}: " + ", ".join(f"{m} {'ok' if o == 'ai' else o}" for m, o in origins.items()), flush=True)
    print(json.dumps({"recopied": results, "note": "Drafts already live keep what was posted; edit those on the marketplace if needed."}, indent=2))


def cmd_rephoto(args) -> None:
    """Re-pick an item's photos from its folder with the current photo rules (white backgrounds + labels)."""
    folder = next((f for f in item_folders() if (f / MARKER).exists() and json.loads((f / MARKER).read_text()).get("itemId") == args.id), None)
    if not folder:
        fail(f"No folder in {LISTINGS_DIR} was sent as item {args.id}.")
    images, roles, names, notes, skipped = pick_photos(folder_photos(folder), args.keep_order)
    now = datetime.now(timezone.utc).isoformat()
    records = [{"id": f"ap-{int(time.time())}-{i}", "original": to_data_url(image, STORED_SIDE, STORED_BYTES), "active": "original", "processingStatus": "original", "name": name, "createdAt": now} for i, (image, name) in enumerate(zip(images, names))]
    api("PATCH", f"/workflow/items/{args.id}", {"photoRecords": records}, timeout=90)
    print(json.dumps({"itemId": args.id, "photos": [{"file": n, "view": (r or {}).get("view")} for n, r in zip(names, roles)], "cover": notes["cover"], "leftOut": notes["leftOut"], "skipped": skipped,
                      "note": "Drafts not posted yet use these photos. A listing already live keeps its photos: change those on the marketplace."}, indent=2))


def cmd_cover(args) -> None:
    """Make photo number N (1 = current cover) the cover of an item already in CrossLinkOS."""
    item = api("GET", f"/workflow/items/{args.id}")["item"]
    records = list(item.get("photoRecords") or [])
    if not 1 <= args.photo <= len(records):
        fail(f"Item {args.id} has {len(records)} photos; pick 1 to {len(records)}.")
    records.insert(0, records.pop(args.photo - 1))
    api("PATCH", f"/workflow/items/{args.id}", {"photoRecords": records})
    print(json.dumps({"itemId": args.id, "cover": f"photo {args.photo} is now the cover", "note": "Approved drafts use it on their next post; already-live listings keep their cover."}, indent=2))


def cmd_approve(args) -> None:
    check = (api("GET", f"/workflow/items/{args.id}")["item"].get("marketplaceDetails") or {}).get("sizeCheck") or {}
    if str(check.get("status", "")).startswith("MISMATCH") and not args.size_ok:
        fail(f"Item {args.id} size doesn't match: doc says {check.get('written')}, the tag in the photos reads {check.get('fromPhotos')}. "
             f"Confirm with: cl update {args.id} --size <right size>  (then approve again)")
    body = {"marketplaces": args.only} if args.only else {}
    print(json.dumps(api("POST", f"/autopilot/items/{args.id}/approve", body), indent=2))


def cmd_unapprove(args) -> None:
    print(json.dumps(api("POST", f"/autopilot/items/{args.id}/unapprove", {}), indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="CrossLinkOS helper for Hermes")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("scan").set_defaults(run=cmd_scan)
    p = sub.add_parser("ingest"); p.add_argument("folder"); p.add_argument("--force", action="store_true"); p.add_argument("--no-drafts", action="store_true"); p.add_argument("--keep-order", action="store_true", help="use the folder's photo order; skip cover picking"); p.set_defaults(run=cmd_ingest)
    sub.add_parser("ingest-all").set_defaults(run=cmd_ingest_all)
    p = sub.add_parser("recopy"); p.add_argument("ids", nargs="+", help="item ids, or: all"); p.set_defaults(run=cmd_recopy)
    p = sub.add_parser("item"); p.add_argument("id", type=int); p.set_defaults(run=cmd_item)
    p = sub.add_parser("update"); p.add_argument("id", type=int)
    p.add_argument("--price", type=float); p.add_argument("--cost", type=float); p.add_argument("--original-price", type=float); p.add_argument("--lowest", type=float, help="lowest offer to accept (Poshmark Automate Offers)"); p.add_argument("--weight", type=float)
    for name in ("title", "brand", "size", "color", "category", "measurements", "condition", "description", "department", "subcategory", "material", "style", "research"):
        p.add_argument(f"--{name}")
    p.add_argument("--redraft", action="store_true", help="rewrite the P/D/M copy after the update")
    p.add_argument("--keep-size", action="store_true", help="leave a size at the end of --title")
    p.set_defaults(run=cmd_update)
    p = sub.add_parser("redraft"); p.add_argument("id", type=int); p.set_defaults(run=cmd_redraft)
    p = sub.add_parser("review"); p.add_argument("--status", default="", help="ready, approved, draft, needs_attention, published"); p.set_defaults(run=cmd_review)
    p = sub.add_parser("approve"); p.add_argument("id", type=int); p.add_argument("--only", nargs="+", choices=["poshmark", "depop"]); p.add_argument("--size-ok", action="store_true"); p.set_defaults(run=cmd_approve)
    p = sub.add_parser("tidy"); p.add_argument("--markets", nargs="+", default=["poshmark", "depop"], choices=["poshmark", "depop", "mercari"]); p.set_defaults(run=cmd_tidy)
    p = sub.add_parser("rephoto"); p.add_argument("id", type=int); p.add_argument("--keep-order", action="store_true"); p.set_defaults(run=cmd_rephoto)
    p = sub.add_parser("cover"); p.add_argument("id", type=int); p.add_argument("photo", type=int, help="photo number, 1 = current cover"); p.set_defaults(run=cmd_cover)
    p = sub.add_parser("unapprove"); p.add_argument("id", type=int); p.set_defaults(run=cmd_unapprove)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
