# CrossLinkOS Autopilot: Hermes + extension auto-post

How the pieces fit, how to set it up on the Ubuntu laptop, and how to hand it to someone else.

## Flow

```
iPhone photos ──Immich──▶ ~/Listings/<Item Name>/   (one folder per item, optional info.txt)
                               │
Hermes (scheduled) ── crosslinkos.py scan / ingest ──▶ CrossLinkOS API
   │                     photo read → item → P/D/M drafts
   ├─ web search: sold comps, retail price ── crosslinkos.py update ──▶ drafts become Ready to push
   ├─ message to Shay: summary of Ready items ──▶ "approve 12 14"
   └─ crosslinkos.py approve ──▶ drafts become "Approved — auto-post"
                               │
Chrome extension (auto-post on) ── every 2–5 min: next approved draft
   opens form → fills → checks required fields + photos → presses List/Post
   └─▶ CrossLinkOS: Live (with link) or Needs attention (with reason)
```

## Pieces

| Piece | Where | What it does |
|---|---|---|
| Access keys | Settings › Access keys; `api-server/src/lib/agent-keys.ts` | Lets Hermes and the extension call the API. SHA-256 hash stored in `user_profiles.settings.agentKeys`; full key shown once; max 5; a key cannot create or revoke keys. |
| Autopilot API | `api-server/src/routes/autopilot.ts` | `POST /autopilot/items`, `GET /autopilot/review`, `POST /autopilot/items/:id/approve`, `/unapprove`, `GET /autopilot/queue`, `POST /autopilot/drafts/:id/result`. |
| Draft status `approved` | `workflow.ts`, `listings.tsx` | "Approved — auto-post". Approve / Cancel buttons in the draft sheet (Poshmark, Depop). |
| Hermes skill | `hermes-skill/crosslinkos-lister/` | `SKILL.md` (the loop and research rules) + `scripts/crosslinkos.py` (stdlib + Pillow). |
| Installer | `hermes-skill/install.sh` | apt deps, links the skill into `~/.hermes/skills/business/`, creates `~/Listings`, saves the key to `~/.config/crosslinkos/env` (chmod 600). |
| Auto-post | `chrome-extension/autopost.js`, side panel | Off by default. One post per 2–5 min, 25/day, pauses on CAPTCHA or 2 failures in a row. Poshmark and Depop only. |

## Setup (Ubuntu laptop)

1. **Create a key**: CrossLinkOS → Settings → Access keys → name it "Hermes on my laptop" → Create → Copy.
2. **Get the code**: `git clone https://github.com/Smartcontentlab/Newcrosslisterv4.git ~/crosslinkos` (or `cd ~/crosslinkos && git pull` if it is already there).
3. **Install the skill**: `bash ~/crosslinkos/hermes-skill/install.sh`, then paste the key when asked.
4. **Update the extension**: `chrome://extensions` → CrossLinkOS Draft Fill → **Remove**, then **Load unpacked** → choose `~/crosslinkos/chrome-extension`. It should show version 0.3.0.
5. **Turn on auto-post**: open the extension's side panel → paste the same key → **Turn on auto-post**. Stay signed in to Poshmark and Depop in that Chrome.
6. **In Hermes**: `/reload-skills`, then say: *"Every 30 minutes, run the crosslinkos-lister loop and message me the approval summary on Telegram."*

## First run: watch it

Approve one item for Poshmark only (`approve 12 poshmark`), press **Check now** in the side panel, and watch the tab it opens. The posting buttons were mapped from Poshmark's and Depop's forms but have not yet been pressed on a live account. If it stops, the side panel log and the draft's Needs attention reason say where.

## Handoff notes

- Nothing posts without a draft reaching `approved`. That happens only through the seller's Approve in the app or `crosslinkos.py approve`, and the skill tells Hermes never to approve on its own unless the seller turns on auto-approve.
- To stop everything: turn auto-post off in the extension, or revoke the key in Settings.
- Mercari is excluded from auto-post until its form is mapped (blocked by ID verification on the account).
