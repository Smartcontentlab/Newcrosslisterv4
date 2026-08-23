from pathlib import Path
import re

path = Path('/home/ubuntu/crosslisterv4/artifacts/api-server/src/routes/ai.ts')
text = path.read_text()

generator = r'''router.post("/ai/generate-listing", async (req, res): Promise<void> => {
  const parsed = GenerateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, parsed.data.itemId));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const marketplace = parsed.data.marketplace;
  const style = MARKETPLACE_STYLES[marketplace] ?? "clear and professional";
  try {
    const raw = await callNim([
      { role: "system", content: "You write accurate resale marketplace listings. Return only valid JSON with keys title, description, tags, keywords, suggestedPrice, condition. Keep title under 80 characters. Do not invent item facts; suggestedPrice must be a number or null." },
      { role: "user", content: JSON.stringify({ marketplace, style, item: { title: item.title, brand: item.brand, model: item.model, category: item.category, condition: item.condition, description: item.description, price: item.price, weight: item.weight, tags: item.tags } }) },
    ], 900);
    const result = parseJsonResponse<{ title: string; description: string; tags: string[]; keywords: string[]; suggestedPrice: number | null; condition: string }>(raw);
    res.json(GenerateListingResponse.parse({ ...result, title: result.title.slice(0, 80), condition: item.condition }));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "NVIDIA NIM listing generation failed" });
  }
});'''

estimator = r'''router.post("/ai/price-estimate", async (req, res): Promise<void> => {
  const parsed = GetPriceEstimateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, brand, condition, category } = parsed.data;
  try {
    const raw = await callNim([
      { role: "system", content: "You are a resale pricing analyst. Return only valid JSON with numeric suggestedPrice, minPrice, maxPrice, confidence as low, medium, or high, and a concise reasoning string. Use conservative ranges and state that actual sold comparables should be checked." },
      { role: "user", content: JSON.stringify({ title, brand, condition, category }) },
    ], 500);
    res.json(GetPriceEstimateResponse.parse(parseJsonResponse(raw)));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "NVIDIA NIM price estimation failed" });
  }
});'''

chat = r'''router.post("/ai/chat", async (req, res): Promise<void> => {
  const parsed = AiChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { message, context } = parsed.data;
  try {
    const raw = await callNim([
      { role: "system", content: "You are CrossLinkOS, a practical resale-management assistant. Give concise, actionable advice about inventory, listing optimization, marketplace fees, shipping, sourcing, profitability, and analytics. Return only valid JSON with keys reply and suggestions, where suggestions is an array of 2 to 4 short follow-up prompts. Do not claim live marketplace data unless it is supplied in context." },
      { role: "user", content: JSON.stringify({ message, context }) },
    ], 700);
    res.json(AiChatResponse.parse(parseJsonResponse(raw)));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "NVIDIA NIM chat failed" });
  }
});'''

text = re.sub(r'router\.post\("/ai/generate-listing"[\s\S]*?\n\}\);\n\nrouter\.post\("/ai/price-estimate"', generator + '\n\nrouter.post("/ai/price-estimate"', text, count=1)
text = re.sub(r'router\.post\("/ai/price-estimate"[\s\S]*?\n\}\);\n\nrouter\.post\("/ai/chat"', estimator + '\n\nrouter.post("/ai/chat"', text, count=1)
text = re.sub(r'router\.post\("/ai/chat"[\s\S]*?\n\}\);\n\nexport default router;', chat + '\n\nexport default router;', text, count=1)
path.write_text(text)
print('NVIDIA NIM AI routes integrated')
