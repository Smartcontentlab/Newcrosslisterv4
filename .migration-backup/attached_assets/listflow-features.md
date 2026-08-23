# ListFlow — Full Feature List

---

## ✅ BUILT (v1 — Live Now)

### Dashboard
- KPI cards: total revenue, total profit, active listings, pending orders
- Recent orders feed with marketplace badges, buyer name, sale price, status
- Sales by channel — live breakdown of revenue per marketplace
- Sell-through rate and inventory value metrics

### Inventory Management
- Item grid with photos, title, brand, category, condition badge
- Cost vs. listing price display with profit margin
- Active listing count per item
- Item status tracking: Active, Draft, Sold, Archived
- Add / edit / delete items
- Per-item tags and search keywords

### Cross-Listing Management
- Listing table across all 9 marketplaces (eBay, Poshmark, Depop, Mercari, Facebook, Etsy, Grailed, Whatnot, Shopify)
- Filter by marketplace or status
- Create, edit, and delete listings
- Per-listing price override

### Order Management
- Full order pipeline: Pending → Awaiting Shipment → Shipped → Delivered → Returned
- Buyer name, marketplace, sale price, fees, shipping cost, net profit per order
- Tracking number field
- Status update workflow with auto-side-effects (item marks sold when order ships)

### Shipping Queue
- Interactive checklist per order: Locate → Verify → Package → Print Label → Ship → Mark Shipped → Upload Tracking → Notify Buyer
- Step timestamps recorded when completed
- Auto-advances order to "Shipped" when all steps complete
- Only shows orders with Awaiting Shipment status

### Analytics
- Monthly revenue & profit trend (12-month line chart)
- Marketplace revenue breakdown (bar chart)
- Top categories ranked by total revenue
- KPIs: avg sale price, sell-through rate, avg days to sell

### AI Assistant
- **AI Chat** — business advisor that answers questions about pricing, sourcing, shipping, stale inventory, Poshmark strategy, fees, margins
- **Price Estimator** — enter title, brand, condition, category → get suggested price range + confidence level + reasoning
- **Listing Generator** — select an item + marketplace → AI writes optimized title, description, tags, and keywords in the right voice for that platform (different tone for eBay vs Depop vs Poshmark etc.)

### Listing Health Score
- Per-listing score (0–100) based on title length, description quality, photo count, pricing, and tags
- Letter grade (A–F)
- Actionable tips to improve score

---

## 🔜 NEXT UP — High Priority

### "Should I Buy?" Scanner *(standalone micro-tool)*
- Open camera → take photo of item at thrift store / estate sale
- AI identifies brand, model, category, condition from photo
- Enter purchase cost
- Quick Google Shopping lookup to check current resale market
- **Green / Yellow / Red** recommendation with confidence level
- High confidence: instant answer. Low confidence: asks for brand + keywords
- 10–20 second full interaction — no saving, no listing creation, just the answer
- Resets for next scan

### AI Vision — Photo-Based Item Recognition
- Upload a photo → AI identifies: brand, model, category, color, pattern, material, condition, estimated price, year, style
- Flags potential counterfeits
- Detects visible damage (stains, tears, missing hardware)
- Suggests missing photos (front, back, tag, detail, flaw)
- Pre-fills the item form automatically

### Photo Pipeline
- Background removal (one click)
- Auto-crop and straighten
- Brightness & contrast correction
- Sharpen
- Generate white-background version
- Compress for each marketplace's requirements
- Multiple output styles: flat lay, hanger, lifestyle

### Smart Pricing Engine
- Search recently *sold* listings (not just active) for comparables
- Show: average sold price, fast-sale price, maximum value, lowest competitor
- Recommend: listing price, offer floor, expected sell-through time
- Profit after fees + shipping + tax calculator per marketplace

### Marketplace Rules Engine
- Real-time validation before publishing
- Each marketplace has different rules enforced: title character limits, prohibited words, required fields, UPC/GTIN, condition mappings, photo requirements
- Warn the user *before* they hit Publish, not after it fails

---

## 🚀 ROADMAP — Medium Priority

### Poshmark Automation Hub *(Pro Feature)*
- **Closet Sharing** — auto-share your entire closet on a configurable schedule (morning / afternoon / evening windows)
- **Follow Automation** — follow users in your niche to grow reach
- **Offer to Likers** — automatically send a discount offer within X hours of someone liking an item
- **Price Drop Automation** — drop price by X% after Y days with no sale
- **Bundle Discounts** — auto-set bundle pricing rules
- **Sharing Schedule** — set runs per day (2 / 4 / 6 / 8), system distributes naturally across windows (not robotic exact-hour intervals)
- **Automation Health Dashboard** — live status: Running / Needs Attention / Browser Offline / Login Required / Session Expired
- **Activity Log** — timestamped record of every completed run and what it did
- **Mobile Monitor** — view automation status and Pause/Resume from phone; schedule editing requires desktop
- *Human-like scheduling* — runs within a time window, not at exact intervals, to avoid pattern detection
- *Browser extension* — Chrome extension connects the desktop browser to the automation engine

### Seller Health Dashboard *(Duolingo-style daily check-in)*
- Items needing better photos
- Items priced above market
- Items priced below market (leaving money on the table)
- Items missing measurements or keywords
- Items likely to sell this week (AI prediction)
- Items that have gone stale (30+ days no sale)
- Daily listing streak counter
- Weekly goal tracker

### Bulk Operations
- Select multiple items → change price, shipping, category, brand
- Bulk relist / delist / archive / delete
- Bulk duplicate (useful for relisting after sale)
- Bulk move to storage bin
- Bulk export to CSV / spreadsheet

### Storage & Location System
- Assign items to a shelf / bin / rack / drawer / box / garage / closet
- Search "where is this?" by item name or barcode
- QR code label printing per bin
- Barcode scanner support (camera or physical scanner)

### Cross-Platform Notification Center
- One unified inbox for all marketplaces
- Offer received, question from buyer, sale, counteroffer, payment, return request, shipping reminder
- Reply to messages from within the app
- Notification priorities and filtering

### Bundle Builder
- AI detects complementary items: same size, brand, buyer demographic
- Suggests bundle pricing
- Especially useful for Poshmark bundle discounts

### Buyer CRM
- Repeat buyer tracking
- Offer history per buyer
- Notes per buyer (great communicator, slow payer, returns often)
- High-value customer tags
- Blocked buyer list

### Returns Dashboard
- Return reason tracking
- Lost profit per return
- Photo documentation
- Marketplace involved
- Flag repeat returners
- Spot return patterns (specific item category, condition, listing photo issues)

---

## 💡 FUTURE — Longer Term

### Automation — Other Marketplaces
- eBay: automated relisting, watchers alert, best offer auto-accept rules
- Depop: auto-refresh listings, follow strategy
- Mercari: smart pricing suggestions based on views vs. likes ratio
- Etsy: seasonal pricing rules, holiday promotion scheduling

### AI Listing Review (Pre-Publish Score)
- Before hitting Publish, AI reviews the full listing
- Shows score: 92/100
- Flags: missing material, weak title, dark photos, above-market price, missing measurements
- Estimated visibility boost if improvements are made

### Mobile Camera Mode
- Open app → camera opens immediately
- Take photos → AI removes background and names the item
- Fastest path from "I just bought this" to "it's listed"

### Financial Reporting
- Monthly P&L statement
- Tax-ready exports (COGS, gross profit, net profit)
- Platform fee summary per marketplace
- Year-over-year comparison

### Sourcing ROI Tracker
- Log sourcing trips (thrift store, estate sale, liquidation)
- Track total spent vs. total listed vs. total sold per sourcing event
- ROI per sourcing channel
- Best days / times to source based on your history

### Auto-Crosslisting
- When an item is created, automatically draft listings on all selected marketplaces
- Marketplace-specific content adapted automatically (title rewritten per platform rules, price adjusted per fee structure)

### Competitor Research
- Search a brand/category → see what competitors are listing and at what price
- Alert when a competitor drops price on something you're also listing
- "Underpriced" and "overpriced" flags on your inventory relative to current market

---

## Poshmark Automation — How It Works

Poshmark's algorithm rewards active closets. The more you share your listings, the higher you appear in search results. Currently, sellers either:
- Share manually (exhausting — takes 1–2 hours daily for a large closet)
- Use buggy browser extensions that require keeping a window open 24/7

**ListFlow's approach:**
1. User installs a lightweight Chrome extension
2. Extension connects to ListFlow and waits for scheduled sharing jobs
3. ListFlow sends jobs based on the user's configured schedule (e.g. "share closet 4x per day within morning/afternoon/evening/night windows")
4. Extension executes the shares as if the user was doing it — browser is open on desktop, no server-side scraping
5. Mobile app shows live automation status and lets user pause/resume

**Why this approach:**
- No server needs to log in to Poshmark on the user's behalf
- User's session / credentials stay in their own browser
- Activity looks natural because it originates from their own machine
- Schedule is distributed across time windows, not robotic exact-hour intervals
- Full transparency: every action is logged with timestamp

**Scheduling example:**
- User sets: 4 runs/day
- ListFlow schedules: 7–9am window, 12–2pm window, 4–6pm window, 8–10pm window
- Exact time within each window is randomized
- Pause/resume from mobile anytime
