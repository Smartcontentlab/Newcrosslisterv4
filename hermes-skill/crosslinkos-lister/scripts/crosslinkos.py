#!/usr/bin/env python3
"""CrossLinkOS helper for Hermes: turns item photo folders into CrossLinkOS listings.

Each folder inside LISTINGS_DIR (default ~/Listings) is one item, named the way you want
the listing titled, e.g. ~/Listings/Lululemon Align Leggings Black 6/.
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
    item ID                      one item with its drafts (no photos)
    update ID [--price ...]      save research (price, original price, sizes, notes)
    redraft ID                   rewrite the drafts after big changes
    review [--status ready]      items waiting for approval, with what each draft still needs
    approve ID [--only poshmark] approve Ready to push drafts for auto-post
    unapprove ID                 take approved drafts back to Ready to push

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
MAX_STORED = 8
STORED_SIDE, STORED_BYTES = 1400, 300_000  # each stored photo; 8 of them stay under the 4.5 MB request limit
READ_SIDE, READ_BYTES = 768, 120_000  # photos sent to the AI reader (server limit 170k characters)


def load_env() -> None:
    env_file = Path.home() / ".config" / "crosslinkos" / "env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()
API = os.environ.get("CROSSLINKOS_API", "https://crosslinkos.vercel.app/api").rstrip("/")
LISTINGS_DIR = Path(os.path.expanduser(os.environ.get("LISTINGS_DIR", "~/Listings")))


def fail(message: str, code: int = 1) -> None:
    print(json.dumps({"error": message}, indent=2))
    sys.exit(code)


def api(method: str, path: str, body: dict | None = None, timeout: int = 90) -> dict:
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
            fail(f"CrossLinkOS {method} {path} answered {error.code}: {message}")
        except urllib.error.URLError as error:
            if attempt < 2:
                time.sleep(5)
                continue
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
                    info[re.sub(r"[^a-z]", "", key.lower())] = value.strip()
                elif line.strip():
                    info["notes"] = (info.get("notes", "") + " " + line.strip()).strip()
    return info


def number(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"\d+(?:\.\d+)?", value.replace(",", ""))
    return float(match.group()) if match else None


CONDITIONS = {"new": "new", "nwt": "new", "newwithtags": "new", "likenew": "like_new", "nwot": "like_new", "excellent": "like_new", "euc": "like_new", "good": "good", "guc": "good", "fair": "fair", "poor": "poor"}


def resolve_folder(name: str) -> Path:
    path = Path(os.path.expanduser(name))
    if not path.is_absolute():
        path = LISTINGS_DIR / name
    if not path.is_dir():
        fail(f"Folder not found: {path}")
    return path


# ----------------------------------------------------------------- commands

def cmd_scan(_args) -> None:
    if not LISTINGS_DIR.exists():
        fail(f"{LISTINGS_DIR} does not exist yet. Create it and add one folder per item.")
    new, done = [], []
    for folder in sorted(p for p in LISTINGS_DIR.iterdir() if p.is_dir() and not p.name.startswith((".", "_"))):
        photos = folder_photos(folder)
        marker = folder / MARKER
        if marker.exists():
            done.append({"folder": folder.name, **json.loads(marker.read_text())})
        elif photos:
            # Skip a folder still receiving photos (changed in the last 2 minutes).
            settling = time.time() - max(p.stat().st_mtime for p in photos) < 120
            new.append({"folder": folder.name, "path": str(folder), "photos": len(photos), "stillSyncing": settling})
    print(json.dumps({"listingsDir": str(LISTINGS_DIR), "new": new, "alreadySent": len(done)}, indent=2))


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
    images, skipped = [], []
    for path in paths[:MAX_STORED]:
        try:
            images.append(open_image(path))
        except Exception as error:  # noqa: BLE001
            skipped.append(f"{path.name}: {error}")
    if not images:
        fail(f"None of the photos could be opened. {'; '.join(skipped)}")
    stored = [to_data_url(image, STORED_SIDE, STORED_BYTES) for image in images]
    to_read = [to_data_url(image, READ_SIDE, READ_BYTES) for image in images[:3]]

    info = read_info(folder)
    hints = {"title": folder.name}
    if info.get("brand"):
        hints["brand"] = info["brand"]
    read = api("POST", "/workflow/photo-read", {"photos": to_read, "hints": hints}, timeout=90)
    facts = {k: read.get(k) for k in ("title", "brand", "model", "category", "subcategory", "department", "color", "secondaryColor", "material", "pattern", "style", "size") if read.get(k)}
    if read.get("flaws"):
        facts["flaws"] = read["flaws"]
    for key in ("brand", "size", "department", "subcategory", "category", "color"):
        if info.get(key):
            facts[key] = info[key]  # the seller's own notes beat the photo reader

    body = {"folder": folder.name, "photos": stored, "facts": facts}
    if number(info.get("price")) is not None:
        body["price"] = number(info["price"])
    if number(info.get("cost")) is not None:
        body["cost"] = number(info["cost"])
    if info.get("condition"):
        body["condition"] = CONDITIONS.get(re.sub(r"[^a-z]", "", info["condition"].lower()), "good")
    if info.get("notes"):
        body["notes"] = info["notes"][:2000]
    created = api("POST", "/autopilot/items", body, timeout=60)
    item_id = created["id"]

    extra = {}
    if number(info.get("originalprice") or info.get("msrp") or info.get("retail")) is not None:
        extra["originalPrice"] = str(int(number(info.get("originalprice") or info.get("msrp") or info.get("retail"))))
    if info.get("measurements"):
        patch_item(item_id, {"measurements": info["measurements"]}, extra)
    elif extra:
        patch_item(item_id, {}, extra)

    drafts = [] if args.no_drafts else api("POST", f"/workflow/items/{item_id}/marketplace-drafts", {}, timeout=90)
    (folder / MARKER).write_text(json.dumps({"itemId": item_id, "sentAt": datetime.now(timezone.utc).isoformat()}))
    print(json.dumps({
        "itemId": item_id, "title": created["title"], "photosSent": len(stored), "photosSkipped": skipped,
        "photoRead": {"facts": facts, "unsure": read.get("unsure", []), "aiModel": read.get("aiModel")},
        "fromInfoTxt": info, "weightLb": created.get("weight"),
        "drafts": draft_summary(drafts), "next": "Research the price and original price, then run: update ITEM --price N --original-price N",
    }, indent=2))


def patch_item(item_id: int, fields: dict, details: dict) -> dict:
    item = api("GET", f"/workflow/items/{item_id}")["item"]
    body = dict(fields)
    if details:
        merged = dict(item.get("marketplaceDetails") or {})
        merged.update(details)
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
    if args.weight is not None:
        fields["weight"] = args.weight
    if args.original_price is not None:
        details["originalPrice"] = str(int(round(args.original_price)))
    for name in ("department", "subcategory", "material", "style"):
        value = getattr(args, name)
        if value:
            details[name] = value
    if args.research:
        details["priceResearch"] = {"summary": args.research[:1500], "at": datetime.now(timezone.utc).isoformat(), "by": "hermes"}
    if not fields and not details:
        fail("Nothing to update. Pass at least one option, e.g. --price 38")
    patch_item(args.id, fields, details)
    if args.redraft:
        api("POST", f"/workflow/items/{args.id}/marketplace-drafts", {}, timeout=90)
    cmd_item(args)


def cmd_redraft(args) -> None:
    drafts = api("POST", f"/workflow/items/{args.id}/marketplace-drafts", {}, timeout=90)
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


def cmd_approve(args) -> None:
    body = {"marketplaces": args.only} if args.only else {}
    print(json.dumps(api("POST", f"/autopilot/items/{args.id}/approve", body), indent=2))


def cmd_unapprove(args) -> None:
    print(json.dumps(api("POST", f"/autopilot/items/{args.id}/unapprove", {}), indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="CrossLinkOS helper for Hermes")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("scan").set_defaults(run=cmd_scan)
    p = sub.add_parser("ingest"); p.add_argument("folder"); p.add_argument("--force", action="store_true"); p.add_argument("--no-drafts", action="store_true"); p.set_defaults(run=cmd_ingest)
    p = sub.add_parser("item"); p.add_argument("id", type=int); p.set_defaults(run=cmd_item)
    p = sub.add_parser("update"); p.add_argument("id", type=int)
    p.add_argument("--price", type=float); p.add_argument("--cost", type=float); p.add_argument("--original-price", type=float); p.add_argument("--weight", type=float)
    for name in ("title", "brand", "size", "color", "category", "measurements", "condition", "description", "department", "subcategory", "material", "style", "research"):
        p.add_argument(f"--{name}")
    p.add_argument("--redraft", action="store_true", help="rewrite the P/D/M copy after the update")
    p.set_defaults(run=cmd_update)
    p = sub.add_parser("redraft"); p.add_argument("id", type=int); p.set_defaults(run=cmd_redraft)
    p = sub.add_parser("review"); p.add_argument("--status", default="", help="ready, approved, draft, needs_attention, published"); p.set_defaults(run=cmd_review)
    p = sub.add_parser("approve"); p.add_argument("id", type=int); p.add_argument("--only", nargs="+", choices=["poshmark", "depop"]); p.set_defaults(run=cmd_approve)
    p = sub.add_parser("unapprove"); p.add_argument("id", type=int); p.set_defaults(run=cmd_unapprove)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
