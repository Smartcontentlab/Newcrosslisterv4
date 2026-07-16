/**
 * ListFlow Agent API
 *
 * Designed for AI agents (Claude computer-use, Hermes/OpenHermes with tool-calling,
 * Playwright-MCP, BrowserBase, OpenCUA, or any function-calling LLM with browser access).
 *
 * Endpoints:
 *   GET  /api/agent/status        — capabilities + OpenAI-compatible tool schemas
 *   GET  /api/agent/queue         — items that need posting, with pre-generated copy
 *   GET  /api/agent/instructions/:itemId/:marketplace  — browser step-by-step for one post
 *   POST /api/agent/complete       — mark a post as done; creates a Listing record
 */

import { Router, type IRouter } from "express";
import { eq, notInArray, inArray } from "drizzle-orm";
import { db, itemsTable, listingsTable } from "@workspace/db";

const router: IRouter = Router();

// ─── Marketplace metadata ─────────────────────────────────────────────────────

const MARKETPLACES = ["poshmark", "depop", "mercari", "ebay", "grailed", "etsy"] as const;
type Marketplace = (typeof MARKETPLACES)[number];

interface MarketplaceMeta {
  startUrl: string;
  notes: string;
  reactApp: boolean;
  fields: {
    field: string;
    selectors: string[];
    inputType: "text" | "textarea" | "number";
    humanInstruction: string;
  }[];
}

const MARKETPLACE_META: Record<Marketplace, MarketplaceMeta> = {
  poshmark: {
    startUrl: "https://poshmark.com/create-listing",
    reactApp: true,
    notes:
      "Poshmark is a React SPA. Plain input.value = '...' won't trigger state updates. " +
      "Use the React native-setter trick: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,val); " +
      "then el.dispatchEvent(new Event('input',{bubbles:true})). " +
      "Category is a multi-step dropdown — navigate each level sequentially after setting text fields.",
    fields: [
      {
        field: "title",
        selectors: ["input[data-vv-name='title']", "input[placeholder*='title' i]", ".title-input input"],
        inputType: "text",
        humanInstruction: "Find the listing title field (usually labeled 'Title' near the top of the form) and type the title.",
      },
      {
        field: "description",
        selectors: ["textarea[data-vv-name='description']", "textarea[placeholder*='describ' i]", ".description-textarea"],
        inputType: "textarea",
        humanInstruction: "Find the description textarea and type the full description.",
      },
      {
        field: "price",
        selectors: ["input[data-vv-name='originalPrice']", "input[placeholder*='original price' i]", "input[placeholder*='price' i]"],
        inputType: "number",
        humanInstruction: "Find the 'Original Price' field and enter the price number (no $ sign).",
      },
    ],
  },
  depop: {
    startUrl: "https://www.depop.com/sell/",
    reactApp: true,
    notes:
      "Depop is a React SPA. Use the same React native-setter trick as Poshmark. " +
      "The sell flow is multi-step — fill title/price/description first, then category. " +
      "Photos must be uploaded via file input; drag-and-drop works.",
    fields: [
      {
        field: "title",
        selectors: ["input[name='itemName']", "input[aria-label*='title' i]", "input[placeholder*='item name' i]"],
        inputType: "text",
        humanInstruction: "Find the item name / title field and type the title.",
      },
      {
        field: "description",
        selectors: ["textarea[name='description']", "textarea[aria-label*='description' i]", "textarea[placeholder*='describ' i]"],
        inputType: "textarea",
        humanInstruction: "Find the description textarea and type the description.",
      },
      {
        field: "price",
        selectors: ["input[name='price']", "input[aria-label*='price' i]", "input[placeholder*='price' i]"],
        inputType: "number",
        humanInstruction: "Find the price field and enter the price number.",
      },
    ],
  },
  mercari: {
    startUrl: "https://www.mercari.com/sell/",
    reactApp: true,
    notes:
      "Mercari is a React SPA. The sell flow has multiple steps/screens. " +
      "Use the React native-setter trick. Photos are added in step 1 before text fields appear.",
    fields: [
      {
        field: "title",
        selectors: ["input[aria-label*='item name' i]", "input[placeholder*='item name' i]", "input[name='name']"],
        inputType: "text",
        humanInstruction: "Find the 'Item name' field and type the title.",
      },
      {
        field: "description",
        selectors: ["textarea[aria-label*='description' i]", "textarea[placeholder*='describ' i]", "textarea[name='description']"],
        inputType: "textarea",
        humanInstruction: "Find the description textarea and type the description.",
      },
      {
        field: "price",
        selectors: ["input[aria-label*='price' i]", "input[placeholder*='price' i]", "input[name='price']"],
        inputType: "number",
        humanInstruction: "Find the price field and enter the price number.",
      },
    ],
  },
  ebay: {
    startUrl: "https://www.ebay.com/sell",
    reactApp: false,
    notes:
      "eBay's sell form uses a mix of React and server-rendered HTML. " +
      "The description may be in a CKEditor iframe — set its body innerHTML directly: " +
      "document.querySelector('.ck-editor__editable').innerHTML = '<p>your text</p>'. " +
      "Fill 'Item specifics' dropdowns after the main fields — eBay ranks incomplete specifics lower.",
    fields: [
      {
        field: "title",
        selectors: ["#Title", "input[aria-label*='title' i]", ".field-title input", "input[name='Title']"],
        inputType: "text",
        humanInstruction: "Find the 'Title' field at the top of the listing form and type the title (max 80 chars).",
      },
      {
        field: "description",
        selectors: [".ck-editor__editable", "textarea#description", "iframe.ck-editor"],
        inputType: "textarea",
        humanInstruction:
          "Find the description editor. If it's a CKEditor, click inside the editable area and type. If plain textarea, type normally.",
      },
      {
        field: "price",
        selectors: ["input[id*='BuyItNow' i]", "input[aria-label*='buy it now' i]", "input[name*='price' i]"],
        inputType: "number",
        humanInstruction: "Find the 'Buy It Now' price field and enter the price.",
      },
    ],
  },
  grailed: {
    startUrl: "https://www.grailed.com/sell",
    reactApp: true,
    notes:
      "Grailed is a React SPA targeting menswear buyers. Use the React native-setter trick. " +
      "Designer/brand tagging is important here — fill the brand autocomplete carefully. " +
      "Measurements (chest, length, waist) are prominent in the form; include them if available.",
    fields: [
      {
        field: "title",
        selectors: ["input[name='title']", "input[aria-label*='title' i]", "input[placeholder*='title' i]"],
        inputType: "text",
        humanInstruction: "Find the title field and type the listing title.",
      },
      {
        field: "description",
        selectors: ["textarea[name='description']", "textarea[aria-label*='description' i]"],
        inputType: "textarea",
        humanInstruction: "Find the description textarea and type the description.",
      },
      {
        field: "price",
        selectors: ["input[name='price']", "input[aria-label*='price' i]", "input[placeholder*='price' i]"],
        inputType: "number",
        humanInstruction: "Find the price field and enter the price.",
      },
    ],
  },
  etsy: {
    startUrl: "https://www.etsy.com/sell",
    reactApp: false,
    notes:
      "Etsy's listing form is largely server-rendered but has some React widgets. " +
      "Use all 13 tag slots for maximum search visibility. " +
      "Etsy requires at least one photo before allowing listing publish.",
    fields: [
      {
        field: "title",
        selectors: ["input[name='title']", "#listing-title", "input[aria-label*='listing title' i]"],
        inputType: "text",
        humanInstruction: "Find the 'Listing title' field and type the title.",
      },
      {
        field: "description",
        selectors: ["textarea[name='description']", "#description", "textarea[aria-label*='description' i]"],
        inputType: "textarea",
        humanInstruction: "Find the description textarea and type the description.",
      },
      {
        field: "price",
        selectors: ["input[name='price']", "#price", "input[aria-label*='price' i]"],
        inputType: "number",
        humanInstruction: "Find the 'Price' field and enter the price.",
      },
    ],
  },
};

// ─── OpenAI-compatible tool schemas ──────────────────────────────────────────

const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "get_posting_queue",
      description:
        "Get all inventory items that still need to be posted to one or more marketplaces. " +
        "Returns each item with pre-generated listing copy for every pending marketplace.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_posting_instructions",
      description:
        "Get detailed browser automation instructions for posting one item to one marketplace. " +
        "Returns the listing content (title, description, price, tags) plus field-by-field " +
        "CSS selectors, human-readable instructions, and platform-specific notes.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "integer", description: "The ListFlow item ID to post" },
          marketplace: {
            type: "string",
            enum: MARKETPLACES,
            description: "The marketplace platform to post to",
          },
        },
        required: ["itemId", "marketplace"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_listing_complete",
      description:
        "Call this after successfully posting an item to a marketplace. " +
        "Records the listing in ListFlow and removes the item from the queue for that platform.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "integer", description: "The ListFlow item ID that was posted" },
          marketplace: { type: "string", enum: MARKETPLACES },
          success: {
            type: "boolean",
            description: "true if the listing was successfully created, false if it failed",
          },
          postedUrl: {
            type: "string",
            description: "Optional: the URL of the newly created listing on the marketplace",
          },
          notes: {
            type: "string",
            description: "Optional: any notes about the posting (e.g. error messages if failed)",
          },
        },
        required: ["itemId", "marketplace", "success"],
      },
    },
  },
];

// ─── Helper: generate listing copy (same logic as ai.ts) ──────────────────────

function generateCopy(item: typeof itemsTable.$inferSelect, marketplace: string) {
  const styles: Record<string, string> = {
    ebay: "keyword-rich, structured, search-optimized",
    poshmark: "trend-focused, fashion-forward with bundle discount mention",
    depop: "modern, youth-focused with trending fashion terms",
    mercari: "short, clean, mobile-friendly",
    grailed: "menswear-savvy, brand-focused, sizing details prominent",
    etsy: "vintage/artisan story-telling language",
  };

  const conditionLabel: Record<string, string> = {
    new: "Brand New", like_new: "Like New", good: "Good Condition",
    fair: "Fair Condition", poor: "Poor Condition",
  };

  const cond = conditionLabel[item.condition] ?? item.condition;
  const brand = item.brand ? ` ${item.brand}` : "";
  const callout = marketplace === "ebay" ? "Fast Ship" : marketplace === "poshmark" ? "Bundle Discount ♥" : "Great Price";

  const title = `${cond}${brand} ${item.title} - ${callout}`.slice(0, 80);

  const description =
    `${cond}${brand} ${item.title}\n\n` +
    `${item.description ?? `This ${item.category ?? "item"} is in ${cond.toLowerCase()} condition and ready to ship.`}\n\n` +
    `Details:\n` +
    `- Condition: ${cond}\n` +
    (item.brand ? `- Brand: ${item.brand}\n` : "") +
    (item.category ? `- Category: ${item.category}\n` : "") +
    `\nOptimized for ${marketplace} — ${styles[marketplace] ?? "clear and professional"}.\n\n` +
    `Questions? Message me anytime. Fast shipping, carefully packaged.`;

  const marketplaceTags: Record<string, string[]> = {
    poshmark: ["ootd", "fashionstyle", "preloved"],
    depop: ["thrift", "vintage", "y2k", "aesthetic"],
    ebay: ["freeshipping", "authentic", "bestprice"],
    mercari: ["deal", "sale"],
    grailed: ["archive", "designer"],
    etsy: ["vintage", "handmade"],
  };

  const tags = [...new Set([
    item.brand, item.category, item.condition,
    ...(item.tags ?? []), ...(marketplaceTags[marketplace] ?? []),
  ].filter(Boolean))] as string[];

  return { title, description, price: item.price, tags, condition: item.condition };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** GET /api/agent/status */
router.get("/agent/status", async (_req, res): Promise<void> => {
  const items = await db.select().from(itemsTable);
  const listings = await db.select().from(listingsTable);

  const listedItemPlatforms = new Set(listings.map((l) => `${l.itemId}:${l.marketplace}`));
  let pendingCount = 0;
  for (const item of items) {
    for (const mp of MARKETPLACES) {
      if (!listedItemPlatforms.has(`${item.id}:${mp}`)) pendingCount++;
    }
  }

  res.json({
    service: "ListFlow Agent API",
    version: "1.0.0",
    description:
      "REST API for AI agents to automate marketplace posting. " +
      "Compatible with OpenAI function-calling, Claude tool_use, and any HTTP-capable agent.",
    endpoints: {
      status: "GET /api/agent/status",
      queue: "GET /api/agent/queue",
      instructions: "GET /api/agent/instructions/:itemId/:marketplace",
      complete: "POST /api/agent/complete",
    },
    supportedMarketplaces: MARKETPLACES,
    stats: {
      totalItems: items.length,
      totalListings: listings.length,
      pendingPosts: pendingCount,
    },
    reactInputNote:
      "All major marketplaces (Poshmark, Depop, Mercari) use React. " +
      "To set field values via JS: const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; " +
      "setter.call(el, value); el.dispatchEvent(new Event('input', {bubbles:true}));",
    tools: TOOL_SCHEMAS,
  });
});

/** GET /api/agent/queue */
router.get("/agent/queue", async (_req, res): Promise<void> => {
  const items = await db.select().from(itemsTable).where(
    notInArray(itemsTable.status, ["sold", "archived"])
  );
  const listings = await db.select().from(listingsTable);

  const listedSet = new Set(listings.map((l) => `${l.itemId}:${l.marketplace}`));

  const queue = items.flatMap((item) => {
    const pendingMarketplaces = MARKETPLACES.filter(
      (mp) => !listedSet.has(`${item.id}:${mp}`)
    );
    if (pendingMarketplaces.length === 0) return [];

    return {
      itemId: item.id,
      title: item.title,
      brand: item.brand,
      category: item.category,
      condition: item.condition,
      price: item.price,
      photos: item.photos,
      pendingMarketplaces,
      generatedContent: Object.fromEntries(
        pendingMarketplaces.map((mp) => [mp, generateCopy(item, mp)])
      ),
    };
  });

  res.json({ count: queue.length, queue });
});

/** GET /api/agent/instructions/:itemId/:marketplace */
router.get("/agent/instructions/:itemId/:marketplace", async (req, res): Promise<void> => {
  const itemId = parseInt(req.params.itemId, 10);
  const marketplace = req.params.marketplace as Marketplace;

  if (isNaN(itemId) || !MARKETPLACES.includes(marketplace)) {
    res.status(400).json({ error: "Invalid itemId or marketplace" });
    return;
  }

  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, itemId));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const meta = MARKETPLACE_META[marketplace];
  const content = generateCopy(item, marketplace);

  const steps = [
    {
      step: 1,
      action: "navigate",
      url: meta.startUrl,
      humanInstruction: `Navigate to ${meta.startUrl} and make sure you are logged into your ${marketplace} account.`,
    },
    ...meta.fields.map((field, i) => ({
      step: i + 2,
      action: meta.reactApp ? "react-fill" : "fill",
      field: field.field,
      value: content[field.field as keyof typeof content] ?? "",
      selectors: field.selectors,
      inputType: field.inputType,
      humanInstruction: `${field.humanInstruction} Value to enter: "${content[field.field as keyof typeof content] ?? ""}"`,
      reactCode: meta.reactApp
        ? field.inputType === "textarea"
          ? `const el = document.querySelector('${field.selectors[0]}'); ` +
            `const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; ` +
            `s.call(el, \`${String(content[field.field as keyof typeof content] ?? "").replace(/`/g, "\\`")}\`); ` +
            `el.dispatchEvent(new Event('input',{bubbles:true}));`
          : `const el = document.querySelector('${field.selectors[0]}'); ` +
            `const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; ` +
            `s.call(el, '${String(content[field.field as keyof typeof content] ?? "").replace(/'/g, "\\'")}'); ` +
            `el.dispatchEvent(new Event('input',{bubbles:true}));`
        : null,
    })),
    {
      step: meta.fields.length + 2,
      action: "tags",
      field: "tags",
      value: content.tags.join(", "),
      humanInstruction: `Add the following tags/keywords to the listing: ${content.tags.join(", ")}`,
    },
    {
      step: meta.fields.length + 3,
      action: "photos",
      humanInstruction:
        item.photos && item.photos.length > 0
          ? `Upload ${item.photos.length} photo(s). Photos are stored as data URLs — save them to disk first, then upload via the file input on the listing form.`
          : "No photos available for this item. Take photos of the item before posting if possible.",
      photoCount: item.photos?.length ?? 0,
    },
    {
      step: meta.fields.length + 4,
      action: "submit",
      humanInstruction:
        "Review all fields, then click the Publish/List/Post button to submit the listing. " +
        "After submission, copy the listing URL from the browser address bar.",
    },
    {
      step: meta.fields.length + 5,
      action: "report_back",
      humanInstruction:
        `Call POST /api/agent/complete with { itemId: ${itemId}, marketplace: "${marketplace}", success: true, postedUrl: "<the listing url>" } ` +
        "to record this listing in ListFlow.",
      callbackEndpoint: "POST /api/agent/complete",
      callbackBody: { itemId, marketplace, success: true, postedUrl: "<paste listing URL here>" },
    },
  ];

  res.json({
    item: {
      id: item.id,
      title: item.title,
      brand: item.brand,
      category: item.category,
      condition: item.condition,
      photos: item.photos,
    },
    marketplace,
    platformNotes: meta.notes,
    listingContent: content,
    steps,
    totalSteps: steps.length,
  });
});

/** POST /api/agent/complete */
router.post("/agent/complete", async (req, res): Promise<void> => {
  const { itemId, marketplace, success, postedUrl, notes } = req.body;

  if (!itemId || !marketplace || success === undefined) {
    res.status(400).json({ error: "itemId, marketplace, and success are required" });
    return;
  }

  if (!success) {
    res.json({ ok: false, message: "Posting failure recorded", itemId, marketplace, notes });
    return;
  }

  if (!MARKETPLACES.includes(marketplace)) {
    res.status(400).json({ error: `Unknown marketplace: ${marketplace}` });
    return;
  }

  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, itemId));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  // Generate listing copy for storage
  const content = generateCopy(item, marketplace);

  const [listing] = await db
    .insert(listingsTable)
    .values({
      itemId,
      marketplace,
      status: "active",
      price: item.price,
      title: content.title,
      description: content.description,
      listedAt: new Date(),
    })
    .returning();

  res.json({
    ok: true,
    message: `Listing recorded for ${marketplace}`,
    listing,
    postedUrl: postedUrl ?? null,
    notes: notes ?? null,
  });
});

export default router;
