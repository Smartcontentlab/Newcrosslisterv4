/**
 * Per-platform writing playbooks: the "research" that gets fed to the AI so a Depop listing does not read like a
 * Poshmark listing.
 *
 * Every rule below says where it came from. Three kinds of evidence are kept apart on purpose:
 *   - "official"   : written by the marketplace itself (help centre or company blog),
 *   - "reported"   : numbers or habits reported by third-party seller tools and communities, not confirmed by the marketplace,
 *   - "trend"      : dated vocabulary from the marketplace's own trend reports.
 * Limits marked verified:false are deliberately used as soft targets. Confirm them in the live app before treating them as hard.
 *
 * Refresh: trend lists are dated (TRENDS_AS_OF). Depop publishes "Trending on Depop" monthly; update DEPOP_TRENDS from the
 * newest post (https://www.depop.com/blog/) once a month. docs/HANDOFF.md has the refresh steps.
 */

export type Platform = "poshmark" | "depop" | "mercari";
export const PLATFORMS: Platform[] = ["poshmark", "depop", "mercari"];

export const TRENDS_AS_OF = "2026-09-21";

type Source = { label: string; url?: string; kind: "official" | "reported" | "trend"; date?: string };

export type Playbook = {
  platform: Platform;
  label: string;
  /** Depop has no separate title box: the first line of the description does that job. */
  hasTitleField: boolean;
  titleLimit: number;
  titleLimitVerified: boolean;
  descriptionLimit: number;
  descriptionLimitVerified: boolean;
  /** Hashtags are written at the end of the description. min/max counts are soft targets. */
  hashtags: { min: number; max: number; verified: boolean };
  voice: string;
  structure: string[];
  do: string[];
  dont: string[];
  sources: Source[];
};

export const PLAYBOOKS: Record<Platform, Playbook> = {
  poshmark: {
    platform: "poshmark",
    label: "Poshmark",
    hasTitleField: true,
    titleLimit: 80,
    titleLimitVerified: false,
    descriptionLimit: 1500,
    descriptionLimitVerified: false,
    hashtags: { min: 4, max: 10, verified: false },
    voice: "Detailed, warm and honest, like explaining the piece to a friend. Full sentences are fine. Poshmark buyers browse, compare and bundle, so more detail helps.",
    structure: [
      "Title: Brand + product type + key attributes (color, size, material or style). Lead with the brand.",
      "Opening line: what it is and why it is good (look, feel, fit, style such as tailored, relaxed or trend-led).",
      "Details block, one fact per line: brand, size, color, material, fit, style, and every measurement the seller gave.",
      "Condition line: honest, and name every flaw the seller listed. Mention tags/box/dust bag only if the seller said so.",
      "Bundle nudge (Poshmark buyers bundle): a short line inviting a bundle, no discount promises the seller did not state.",
      "Last line: hashtags, space separated.",
    ],
    do: [
      "Use searchable words a buyer would type: brand, item type, material, style, color, size.",
      "Put measurements in the description. Buyers who see measurements ask fewer questions and are more likely to buy.",
      "Match seasonal hashtags to the item and the time of year (only when they honestly fit).",
    ],
    dont: [
      "No commentary about the seller's own fit (\"too small for me\"). Describe the item, not the seller.",
      "No hashtag stuffing with brands or styles that do not describe this item.",
      "No all-caps titles or emoji strings in the title.",
    ],
    sources: [
      { label: "Poshmark: steps to create a perfect listing (title format, description tone)", url: "https://blog.poshmark.com/2026/01/01/learn-to-sell-on-poshmark/", kind: "official", date: "2026-01-01" },
      { label: "Poshmark: write listing descriptions that make sales (materials, measurements)", url: "https://blog.poshmark.com/write-listing-descriptions-to-make-sales/", kind: "official", date: "2021-07-06" },
      { label: "Vendoo: character limits reported for Poshmark (title 80, description 1,500)", url: "https://blog.vendoo.co/poshmark-vs-mercari", kind: "reported" },
      { label: "Hashtag habits (#NWT, seasonal tags) are seller-community practice. Poshmark's own guidance pages do not set a hashtag rule, so counts here are soft targets", kind: "reported" },
    ],
  },
  depop: {
    platform: "depop",
    label: "Depop",
    hasTitleField: false,
    titleLimit: 80,
    titleLimitVerified: false,
    descriptionLimit: 1000,
    descriptionLimitVerified: false,
    hashtags: { min: 3, max: 5, verified: false },
    voice: "Short, casual and trend-aware, written the way Gen Z sellers write: lowercase is fine, a few punchy lines, light slang used sparingly. Never sound like an ad. Never fake hype about a flaw.",
    structure: [
      "First line acts as the title (Depop has no title box): the words a buyer would search, brand first if known.",
      "One or two short, vibe-forward lines (styling idea, era, aesthetic).",
      "Quick facts, one per line: size and fit (measurements if given), material, color.",
      "Condition in plain words, with every flaw the seller listed.",
      "One line on shipping/bundles only if the seller gave bundle info.",
      "Last line: 3 to 5 relevant hashtags.",
    ],
    do: [
      "Keep it short and to the point. Only relevant words, hashtags, brands and tags (Depop's own advice).",
      "Add measurements and fit notes because sizes vary between brands.",
      "Use era and aesthetic words that honestly describe the piece (for example y2k, vintage, 90s, streetwear) when they apply.",
      "Use a trend word from the list provided only when the item genuinely fits it.",
      "Keep the description, the listing attributes (color, brand, style, fabric) and the photos telling the same story.",
    ],
    dont: [
      "Do not stuff unrelated brands or trends into hashtags to chase search.",
      "No long paragraphs, no corporate wording, no repeating the same word many times.",
      "No slang so heavy that the item facts get lost.",
    ],
    sources: [
      { label: "Depop Help Centre: tips for describing your item", url: "https://depophelp.zendesk.com/hc/en-gb/articles/360020435158-Tips-for-describing-your-item", kind: "official" },
      { label: "Depop: how to grow your shop (attributes, keywords, consistency)", url: "https://www.depop.com/blog/grow-your-shop/", kind: "official", date: "2026-04-01" },
      { label: "Depop: Trending on Depop, August (published Sept 1, 2026)", url: "https://www.depop.com/blog/trending-on-depop-august-26/", kind: "trend", date: "2026-09-01" },
      { label: "Depop 2026 trends report: The Edited Self", url: "https://news.depop.com/company-news/depop-unveils-2026-fashion-trends-report-the-edited-self/", kind: "trend" },
      { label: "Hashtag count (up to 5) and length (about 1,000 characters) are commonly reported by seller tools; Depop's help page gives no number", kind: "reported" },
    ],
  },
  mercari: {
    platform: "mercari",
    label: "Mercari",
    hasTitleField: true,
    titleLimit: 80,
    titleLimitVerified: false,
    descriptionLimit: 1000,
    descriptionLimitVerified: false,
    hashtags: { min: 0, max: 3, verified: false },
    voice: "Clear, factual and easy to skim on a phone. Search-first: brand and item words up front. Friendly but plain. Mercari shoppers want exact facts and honesty.",
    structure: [
      "Title: brand + item type + key detail (size, color, model). Brand clearly stated.",
      "Opening sentence in plain words: what it is and its condition.",
      "Short facts list, one per line: brand, size, color, material, measurements the seller gave.",
      "Condition, honest, with every flaw the seller listed.",
      "Optional one-line story (how it could be used or styled) if it fits without inventing facts.",
      "Optional last line: at most 3 hashtags that really describe the item.",
    ],
    do: [
      "State the brand clearly. It improves visibility (Mercari's own advice).",
      "Include as much accurate information as possible; shoppers want to know exactly what they are buying.",
      "Add category and condition words for search-ability.",
      "Call out flaws plainly. Being truthful raises shopper confidence.",
    ],
    dont: [
      "Do not add brand names or hashtags that are not associated with the item. Mercari asks sellers not to.",
      "No keyword dumps and no long hashtag lists.",
    ],
    sources: [
      { label: "Mercari Help: creating a listing (brand, honesty, story, no unrelated brands/hashtags)", url: "https://www.mercari.com/us/help_center/topics/listing/guides/creating-a-listing/", kind: "official" },
      { label: "Vendoo: character limits reported for Mercari (title 80, description 1,000)", url: "https://blog.vendoo.co/poshmark-vs-mercari", kind: "reported" },
    ],
  },
};

/**
 * Dated trend vocabulary. Each entry only reaches the AI when the item plausibly matches `when`, so trend words are used
 * only where they are true. `words` are search-friendly terms a seller could honestly use for a matching piece.
 */
type Trend = { id: string; source: string; words: string[]; when: RegExp };

const DEPOP_TRENDS: Trend[] = [
  { id: "back-to-college", source: "Trending on Depop, Aug 2026: back-to-college", words: ["back to college", "y2k mini dress", "homecoming", "sorority formal"], when: /\b(mini dress|dress|bodycon|formal|homecoming|kitten heel|clutch)\b/i },
  { id: "beachwear", source: "Trending on Depop, Aug 2026: beachwear", words: ["beachwear", "linen", "crochet", "jorts", "nautical stripe", "tropical print", "woven bag"], when: /\b(linen|crochet|jorts?|swim|sandal|slides?|flip.?flops?|woven|straw|cover.?up|nautical|tropical)\b/i },
  { id: "riding-boots", source: "Trending on Depop, Aug 2026: riding boots", words: ["riding boots", "knee high boots", "leather", "square toe", "chocolate brown", "vintage boots"], when: /\b(riding boots?|knee.?high boots?|boots?)\b/i },
  { id: "halloween", source: "Trending on Depop, Aug 2026: Halloween", words: ["halloween", "vintage character tee", "graphic tee", "archival", "little black dress", "lace"], when: /\b(halloween|costume|character|movie|graphic tee|band tee|lace|black dress)\b/i },
  { id: "high-necklines", source: "Trending on Depop, Aug 2026: rising, high necklines", words: ["mock neck", "funnel neck", "high collar", "90s minimalism"], when: /\b(mock.?neck|funnel.?neck|turtle.?neck|high.?(neck|collar)|collar)\b/i },
  { id: "playful-prints", source: "Trending on Depop, Aug 2026: rising, playful prints", words: ["floral print", "animal print", "checkered", "plaid", "striped"], when: /\b(floral|flower|animal print|leopard|zebra|cheetah|check(ered)?|plaid|stripe[sd]?|print)\b/i },
  { id: "country-club", source: "Trending on Depop, Aug 2026: rising, country club chic", words: ["country club", "rugby shirt", "varsity jacket", "polo", "loafers", "boat shoes", "striped knit"], when: /\b(rugby|varsity|polo|loafers?|boat shoes?|preppy|striped knit|letterman)\b/i },
  { id: "modern-uniforms", source: "Depop 2026 report, The Edited Self: modern uniforms", words: ["workwear", "peacoat", "boxy knit", "button down", "sharp tailoring", "neutral"], when: /\b(work.?wear|peacoat|pea coat|button.?(down|up)|oxford|trench|blazer|tailored|boxy|chore)\b/i },
  { id: "neo-nostalgia", source: "Depop 2026 report, The Edited Self: neo nostalgia", words: ["y2k", "90s", "70s", "archival", "bandage dress", "jnco", "vintage"], when: /\b(y2k|2000s|00s|90s|70s|vintage|retro|bandage|jnco|jorts?|baggy|low.?rise|archive|archival)\b/i },
  { id: "everyday-ceremony", source: "Depop 2026 report, The Edited Self: everyday ceremony", words: ["tailored coat", "kitten heels", "statement jewelry", "metallic", "structured blazer", "draped skirt"], when: /\b(kitten heels?|statement (jewelry|necklace|earrings?)|metallic|structured|draped|tailored coat|blazer)\b/i },
  { id: "romanticized-sports", source: "Depop 2026 report, The Edited Self: romanticized sports", words: ["vintage jersey", "tennis", "bike shorts", "ski", "vintage lululemon", "sportswear"], when: /\b(jersey|tennis|bike shorts?|ski|lululemon|athletic|track (jacket|top|pants)|sportswear|nfl|nba|mlb|soccer)\b/i },
  { id: "desert-revival", source: "Trending on Depop, Aug 2025: desert revival", words: ["western", "boho", "cowboy boots", "belt buckle", "tiered skirt"], when: /\b(western|cowboy|cowgirl|boho|bohemian|tiered|fringe|belt buckle)\b/i },
];

/** Season words by month (northern hemisphere). Passed as optional vocabulary, used only when the item suits it. */
export function seasonWords(date = new Date()): string[] {
  const month = date.getUTCMonth() + 1;
  if (month === 8 || month === 9) return ["back to school", "fall", "transitional"];
  if (month === 10) return ["fall", "halloween", "cozy"];
  if (month === 11) return ["fall", "thanksgiving", "cozy", "holiday"];
  if (month === 12) return ["holiday", "winter", "gift"];
  if (month === 1 || month === 2) return ["winter", "cozy", "valentine"];
  if (month === 3 || month === 4) return ["spring", "easter"];
  if (month === 5 || month === 6) return ["summer", "vacation", "spring"];
  return ["summer", "vacation", "festival"];
}

export function relevantTrends(platform: Platform, itemText: string): Array<{ source: string; words: string[] }> {
  if (platform !== "depop") return [];
  return DEPOP_TRENDS.filter((trend) => trend.when.test(itemText)).map(({ source, words }) => ({ source, words })).slice(0, 4);
}

/** Popular brand names used only for one purpose: stopping hashtag stuffing with brands the seller never mentioned. */
export const WATCHED_BRANDS = ["nike", "adidas", "lululemon", "levis", "levi's", "gucci", "prada", "chanel", "louis vuitton", "supreme", "carhartt", "patagonia", "north face", "coach", "kate spade", "ralph lauren", "zara", "brandy melville", "urban outfitters", "free people", "aritzia", "reformation", "dr martens", "uggs", "ugg", "jordan", "new balance", "champion", "fred perry", "jansport", "stussy", "acne", "tom ford", "hollister", "abercrombie"];
