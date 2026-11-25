/**
 * Typical packed weight from words in the item's title, style and category, for items created by
 * Hermes (the studio does the same in the browser, artifacts/resale-app/src/lib/pricing.ts; keep the
 * two lists in step). Returns null when nothing matches, so an unknown item never gets a made-up number.
 */
const RULES: Array<{ fill: number; words: RegExp }> = [
  { fill: 3, words: /\bboots?\b|booties|bootie/ },
  { fill: 2.3, words: /sneaker|trainer|running shoe|\bshoes?\b|air force|jordan|\bdunks?\b|loafer|clog/ },
  { fill: 1, words: /sandal|\bheels?\b|\bpumps?\b|slide|flip.?flop|mule|flats?\b/ },
  { fill: 1.5, words: /\bbags?\b|purse|handbag|tote|backpack|crossbody|clutch|satchel|wallet/ },
  { fill: 2, words: /jacket|coat|parka|puffer|blazer|vest|windbreaker|anorak|trench/ },
  { fill: 0.75, words: /sweater|cardigan|knit|turtleneck/ },
  { fill: 1.25, words: /hoodie|sweatshirt|crewneck|pullover|fleece|quarter.?zip|half.?zip|sweatpant|jogger/ },
  { fill: 0.6, words: /legging|tights|yoga|workout|athletic|activewear|sports? bra|bike short|joggers? set|align|bandier|lululemon|alo\b/ },
  { fill: 1.5, words: /jeans?\b|denim|trouser|\bpants?\b|cargo|chino|overall/ },
  { fill: 0.75, words: /dress|romper|jumpsuit|gown/ },
  { fill: 0.6, words: /shorts?\b|skirt|skort/ },
  { fill: 0.5, words: /long.?sleeve|polo|button.?(up|down)|blouse|shirt\b|flannel/ },
  { fill: 0.4, words: /\btees?\b|t-?shirt|tank|cami|crop top|\btop\b|bodysuit|jersey/ },
  { fill: 0.4, words: /hat|\bcap\b|beanie|scarf|belt|sunglasses|jewelry|necklace|bracelet|earring|\bring\b|socks?|gloves?|hair clip|scrunchie/ },
];

export function estimateWeight(item: { title?: string; model?: string; category?: string; subcategory?: string }): number | null {
  const text = [item.subcategory, item.model, item.title, item.category].filter(Boolean).join(" ").toLowerCase();
  if (!text) return null;
  return RULES.find((rule) => rule.words.test(text))?.fill ?? null;
}
