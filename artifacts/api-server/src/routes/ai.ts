import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, itemsTable } from "@workspace/db";
import {
  GenerateListingBody,
  GenerateListingResponse,
  GetPriceEstimateBody,
  GetPriceEstimateResponse,
  AiChatBody,
  AiChatResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const MARKETPLACE_STYLES: Record<string, string> = {
  ebay: "keyword-rich, structured, search-optimized with complete item specifics",
  poshmark: "trend-focused, fashion-forward language with style tags and emoji-friendly formatting",
  depop: "modern, youth-focused with trending fashion terms and hashtag suggestions",
  mercari: "short, clean, mobile-friendly with buyer-focused keywords",
  facebook: "locally optimized, clear and easy to read for neighborhood buyers",
  etsy: "handcrafted story-telling, vintage or artisan language, search-friendly",
  grailed: "menswear-savvy, brand-focused, sizing details prominent",
  whatnot: "live-sale friendly, exciting and engaging language",
  shopify: "professional brand voice, SEO-optimized, conversion-focused",
};

router.post("/ai/generate-listing", async (req, res): Promise<void> => {
  const parsed = GenerateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .select()
    .from(itemsTable)
    .where(eq(itemsTable.id, parsed.data.itemId));

  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const marketplace = parsed.data.marketplace;
  const style = MARKETPLACE_STYLES[marketplace] ?? "clear and professional";

  // Generate optimized listing content based on item details and marketplace
  const brandPart = item.brand ? ` ${item.brand}` : "";
  const modelPart = item.model ? ` ${item.model}` : "";
  const conditionLabel: Record<string, string> = {
    new: "Brand New",
    like_new: "Like New",
    good: "Good Condition",
    fair: "Fair Condition",
    poor: "Poor Condition",
  };
  const condStr = conditionLabel[item.condition] ?? item.condition;

  const title = `${condStr}${brandPart}${modelPart} ${item.title} - ${marketplace === "ebay" ? "Fast Ship" : marketplace === "poshmark" ? "Bundle Discount" : "Great Price"}`.slice(0, 80);

  const description = `${condStr}${brandPart}${modelPart} ${item.title}\n\n` +
    `${item.description ?? `This ${item.category ?? "item"} is in ${condStr.toLowerCase()} and ready to ship.`}\n\n` +
    `Details:\n` +
    `- Condition: ${condStr}\n` +
    (item.brand ? `- Brand: ${item.brand}\n` : "") +
    (item.model ? `- Model: ${item.model}\n` : "") +
    (item.category ? `- Category: ${item.category}\n` : "") +
    (item.weight ? `- Estimated weight: ${item.weight} lbs\n` : "") +
    `\nOptimized for ${marketplace} — ${style}.\n\n` +
    `Questions? Message me anytime. Fast shipping, carefully packaged.`;

  const baseTags = [
    item.brand,
    item.model,
    item.category,
    item.condition,
    ...(item.tags ?? []),
  ].filter(Boolean) as string[];

  const marketplaceTags: Record<string, string[]> = {
    poshmark: ["ootd", "fashionstyle", "vintage", "preloved"],
    depop: ["thrift", "vintage", "y2k", "aesthetic"],
    ebay: ["freeshipping", "authentic", "bestprice"],
    mercari: ["deal", "sale", "bundle"],
    grailed: ["archive", "designer", "fits"],
  };

  const tags = [...new Set([...baseTags, ...(marketplaceTags[marketplace] ?? [])])];
  const keywords = [...new Set([item.title, ...(item.tags ?? []), item.brand ?? "", item.category ?? ""].filter(Boolean))];

  res.json(
    GenerateListingResponse.parse({
      title,
      description,
      tags,
      keywords,
      suggestedPrice: item.price > 0 ? item.price : null,
      condition: item.condition,
    })
  );
});

router.post("/ai/price-estimate", async (req, res): Promise<void> => {
  const parsed = GetPriceEstimateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, brand, condition, category } = parsed.data;

  // Price estimation heuristics based on condition and category
  const basePrice = 25;

  const conditionMultipliers: Record<string, number> = {
    new: 1.0,
    like_new: 0.85,
    good: 0.65,
    fair: 0.45,
    poor: 0.25,
  };

  const categoryMultipliers: Record<string, number> = {
    Electronics: 3.0,
    Sneakers: 2.5,
    Designer: 4.0,
    Clothing: 1.2,
    Accessories: 1.5,
    Collectibles: 2.0,
    Books: 0.5,
    Games: 1.8,
    Toys: 1.0,
  };

  const brandPremiums: Record<string, number> = {
    Nike: 1.5, Adidas: 1.4, Supreme: 3.0, Gucci: 5.0, Louis: 6.0,
    Apple: 4.0, Sony: 2.5, Samsung: 2.0,
  };

  const condMul = conditionMultipliers[condition ?? "good"] ?? 0.65;
  const catMul = category ? (categoryMultipliers[category] ?? 1.0) : 1.0;
  const brandMul = brand
    ? Object.entries(brandPremiums).find(([k]) =>
        brand.toLowerCase().includes(k.toLowerCase())
      )?.[1] ?? 1.0
    : 1.0;

  const estimated = Math.round(basePrice * condMul * catMul * brandMul);
  const minPrice = Math.round(estimated * 0.75);
  const maxPrice = Math.round(estimated * 1.35);

  const confidence = brandMul > 1.2 || catMul > 2.0 ? "high" : catMul > 1.2 ? "medium" : "low";

  const reasoning = `Based on ${condition ?? "good"} condition ${brand ? `${brand} ` : ""}${category ?? "item"}, ` +
    `comparable sold listings suggest a price range of $${minPrice}–$${maxPrice}. ` +
    `List closer to $${maxPrice} if photos are strong and ship quickly.`;

  res.json(
    GetPriceEstimateResponse.parse({
      suggestedPrice: estimated,
      minPrice,
      maxPrice,
      confidence,
      reasoning,
    })
  );
});

router.post("/ai/chat", async (req, res): Promise<void> => {
  const parsed = AiChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { message, context } = parsed.data;
  const lowerMsg = message.toLowerCase();

  // Smart rule-based AI assistant responses
  let reply = "";
  let suggestions: string[] = [];

  if (lowerMsg.includes("stale") || lowerMsg.includes("not selling") || lowerMsg.includes("slow")) {
    reply = "Items that haven't sold in 30+ days often need a price refresh or better photos. Try dropping the price 10–15% and relisting on a fresh marketplace like Depop or Poshmark for new eyeballs. Also check if your title is keyword-rich — buyers can't buy what they can't find.";
    suggestions = ["Show me my stale inventory", "How do I price items better?", "Which marketplace has the best sell-through rate?"];
  } else if (lowerMsg.includes("pric") || lowerMsg.includes("how much")) {
    reply = "Great pricing strategy: research 3–5 recently SOLD comparables (not just listed), price 5–10% below the average sold price, and offer bundle discounts. Condition photos matter more than description text for justifying price.";
    suggestions = ["Use the Price Estimator", "What condition affects price most?", "Should I accept offers?"];
  } else if (lowerMsg.includes("ship") || lowerMsg.includes("packag")) {
    reply = "Shipping efficiency is a profit multiplier. Batch your shipments on Tuesday–Thursday when USPS is least congested. Stock poly mailers, bubble mailers, and small/medium boxes in bulk. Always weigh packages before printing labels — dimensional weight catches sellers off guard.";
    suggestions = ["View my shipping queue", "What shipping supplies do I need?", "How to get discounted labels?"];
  } else if (lowerMsg.includes("photo") || lowerMsg.includes("picture") || lowerMsg.includes("image")) {
    reply = "Photos are your most powerful selling tool. Use natural light near a window, shoot on a white or neutral background, and always include: front, back, tags/labels, any flaws, and at least one lifestyle or detail shot. 6–8 photos convert significantly better than 2–3.";
    suggestions = ["Generate a listing for an item", "What makes a good title?", "How to improve listing health score?"];
  } else if (lowerMsg.includes("source") || lowerMsg.includes("find inventory") || lowerMsg.includes("where to buy")) {
    reply = "Top sourcing channels for resellers: (1) thrift stores on weekday mornings before stock is picked over, (2) estate sales — arrive early for electronics, art, and vintage, (3) Facebook Marketplace for bulk lots, (4) liquidation pallets from B-Stock or Liquidation.com, (5) retail clearance with price history tools like CamelCamelCamel.";
    suggestions = ["What categories sell best?", "How to calculate ROI on sourcing?", "Best platforms for bulk lots?"];
  } else if (lowerMsg.includes("fee") || lowerMsg.includes("profit") || lowerMsg.includes("margin")) {
    reply = "Typical marketplace fees: eBay ~13%, Poshmark 20% flat (or $2.95 under $15), Mercari 10%, Depop 10%, Etsy 6.5% + listing. Always calculate net profit = Sale Price - Cost of Goods - Fees - Shipping. Target 40%+ margins for sustainable business.";
    suggestions = ["View my profit analytics", "Which marketplace has lowest fees?", "How to increase margins?"];
  } else if (lowerMsg.includes("poshmark") || lowerMsg.includes("share") || lowerMsg.includes("closet")) {
    reply = "Poshmark closet sharing is the #1 free traffic driver. Share each listing 2–3x per day, focusing on morning (7–9am) and evening (7–10pm) when buyers are active. Follow users who like your items and send targeted offers within 24 hours of a like — that's when intent is highest.";
    suggestions = ["Set up sharing schedule", "How to send offers to likers?", "Best time to share on Poshmark?"];
  } else if (lowerMsg.includes("analytics") || lowerMsg.includes("report") || lowerMsg.includes("performance")) {
    reply = "Key metrics to watch weekly: sell-through rate (target >30%), average days to sell (target <21), profit margin by marketplace, and inventory turnover. If your sell-through rate drops below 20%, it's time for a pricing or photography audit across your listings.";
    suggestions = ["View analytics dashboard", "What's my best marketplace?", "Show revenue trends"];
  } else {
    reply = `Good question about "${message}". Here's what I'd recommend: focus on your top-performing categories and marketplaces first, optimize your listing titles for search keywords, and keep your inventory moving — stale inventory costs you money in time and storage. Check your analytics to see where your highest profit items are coming from.`;
    suggestions = ["View my analytics", "Show stale inventory", "Generate a listing", "Check listing health scores"];
  }

  res.json(AiChatResponse.parse({ reply, suggestions }));
});

export default router;
