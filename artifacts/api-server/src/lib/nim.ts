import { logger } from "./logger";

/**
 * One shared client for NVIDIA NIM (OpenAI-compatible chat API).
 *
 * Why it exists: the app used to send whatever model name was in NVIDIA_NIM_MODEL straight to NVIDIA and, when the
 * name was retired or mistyped, silently swapped in a template. Now the client:
 *   1. reads NVIDIA's live model list and only sends model names that exist,
 *   2. falls through a preference list when a model is missing, busy (429), erroring (5xx) or too slow,
 *   3. removes <think> blocks that reasoning models add,
 *   4. reports the real reason on failure, so the UI can say "the AI could not answer because ..." instead of guessing.
 * The API key is only ever sent in the Authorization header and is never logged or returned.
 */

export type NimContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type NimMessage = { role: "system" | "user" | "assistant"; content: string | NimContentPart[] };
export type NimResult = { text: string; model: string };

export class NimError extends Error {
  constructor(message: string, readonly code: "not_configured" | "auth" | "unavailable" | "empty" | "timeout", readonly status?: number) {
    super(message);
    this.name = "NimError";
  }
}

/** Instruction-following models that return clean JSON, best first. Only names present in NVIDIA's live list are used. */
const TEXT_PREFERENCE = [
  "mistralai/mistral-large-2-instruct",
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "google/gemma-4-31b-it",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-nano-3-30b-a3b",
  "mistralai/mistral-large",
  "nvidia/llama-3.1-nemotron-51b-instruct",
  "openai/gpt-oss-20b",
  "nvidia/nemotron-3-super-120b-a12b",
  "google/gemma-3-12b-it",
];
/** Models that accept pictures. */
const VISION_PREFERENCE = [
  "meta/llama-3.2-90b-vision-instruct",
  "meta/llama-3.2-11b-vision-instruct",
  "google/gemma-4-31b-it",
  "google/gemma-3-12b-it",
  "microsoft/phi-3-vision-128k-instruct",
];

const BASE = () => (process.env.NVIDIA_NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
const ATTEMPT_MS = 22_000;
const TOTAL_MS = 50_000; // Vercel function limit is 60s (vercel.json)
const MAX_ATTEMPTS = 4;

let liveModels: { at: number; ids: Set<string> } | null = null;
const coolDown = new Map<string, number>(); // model -> time when it may be tried again

export const nimConfigured = () => Boolean(process.env.NVIDIA_NIM_API_KEY);

async function fetchLiveModels(key: string): Promise<Set<string> | null> {
  if (liveModels && Date.now() - liveModels.at < 10 * 60_000) return liveModels.ids;
  try {
    const response = await fetch(`${BASE()}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6_000) });
    if (!response.ok) return liveModels?.ids ?? null;
    const payload = await response.json() as { data?: Array<{ id?: string }> };
    const ids = new Set((payload.data ?? []).map((model) => model.id).filter((id): id is string => typeof id === "string"));
    if (ids.size === 0) return null;
    liveModels = { at: Date.now(), ids };
    return ids;
  } catch { return liveModels?.ids ?? null; }
}

/** Ordered list of models to try. The configured model goes first when NVIDIA still offers it. */
export async function nimCandidates(kind: "text" | "vision", key: string): Promise<{ list: string[]; configuredIgnored: string | null }> {
  const live = await fetchLiveModels(key);
  const configured = process.env.NVIDIA_NIM_MODEL?.trim() || null;
  const preference = kind === "vision" ? VISION_PREFERENCE : TEXT_PREFERENCE;
  const usable = (id: string) => (live ? live.has(id) : true);
  const now = Date.now();
  const list: string[] = [];
  // A configured text model is honoured; for vision it is only used if it is a known vision model.
  if (configured && usable(configured) && (kind === "text" || VISION_PREFERENCE.includes(configured))) list.push(configured);
  for (const id of preference) if (usable(id) && !list.includes(id)) list.push(id);
  const ready = list.filter((id) => (coolDown.get(id) ?? 0) <= now);
  return { list: (ready.length ? ready : list).slice(0, MAX_ATTEMPTS), configuredIgnored: configured && live && !live.has(configured) ? configured : null };
}

export function cleanModelText(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();
}

type Payload = { choices?: Array<{ message?: { content?: string | null } }>; error?: { message?: string } };

export async function nimChat(options: { messages: NimMessage[]; maxTokens?: number; temperature?: number; kind?: "text" | "vision" }): Promise<NimResult> {
  const key = process.env.NVIDIA_NIM_API_KEY;
  if (!key) throw new NimError("The AI key (NVIDIA_NIM_API_KEY) is not set on the server.", "not_configured");
  const started = Date.now();
  const { list, configuredIgnored } = await nimCandidates(options.kind ?? "text", key);
  if (configuredIgnored) logger.warn({ configuredIgnored }, "NVIDIA_NIM_MODEL is not in NVIDIA's live model list; using automatic model choice");
  if (list.length === 0) throw new NimError("NVIDIA does not currently offer any model this app can use.", "unavailable");

  let lastProblem = "no model answered";
  let lastCode: NimError["code"] = "unavailable";
  let lastStatus: number | undefined;
  for (const model of list) {
    const remaining = TOTAL_MS - (Date.now() - started);
    if (remaining < 4_000) break;
    try {
      const response = await fetch(`${BASE()}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: options.messages, temperature: options.temperature ?? 0.3, max_tokens: options.maxTokens ?? 900, stream: false }),
        signal: AbortSignal.timeout(Math.min(ATTEMPT_MS, remaining)),
      });
      if (response.status === 401 || response.status === 403) {
        throw new NimError("NVIDIA rejected the AI key (NVIDIA_NIM_API_KEY). Create a new key at build.nvidia.com and update it in Vercel.", "auth", response.status);
      }
      if (!response.ok) {
        const body = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
        lastProblem = `${model} answered HTTP ${response.status}${body ? ` (${body})` : ""}`;
        lastCode = "unavailable"; lastStatus = response.status;
        // 404/410: the model name is gone for now. 429/5xx: busy or broken. 400/422 are about this request, not the model.
        const rest = response.status === 404 || response.status === 410 ? 30 * 60_000 : response.status === 429 ? 60_000 : response.status >= 500 ? 2 * 60_000 : 0;
        if (rest) coolDown.set(model, Date.now() + rest);
        logger.warn({ model, status: response.status }, "NIM attempt failed");
        continue;
      }
      const payload = await response.json() as Payload;
      const text = cleanModelText(payload.choices?.[0]?.message?.content ?? "");
      if (!text) { lastProblem = `${model} returned an empty answer`; lastCode = "empty"; continue; }
      return { text, model };
    } catch (error) {
      if (error instanceof NimError) throw error;
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      lastProblem = timedOut ? `${model} took too long` : `${model}: network problem (${error instanceof Error ? error.message : "unknown"})`;
      lastCode = timedOut ? "timeout" : "unavailable";
      coolDown.set(model, Date.now() + 60_000);
      logger.warn({ model, timedOut }, "NIM attempt failed");
    }
  }
  throw new NimError(`The AI could not answer: ${lastProblem}.`, lastCode, lastStatus);
}

/** Pulls the first JSON object out of a model answer (handles ``` fences and chatter around it). */
export function extractJsonObject(content: string): Record<string, unknown> | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const slice = fenced.slice(start, end + 1);
  try { return JSON.parse(slice) as Record<string, unknown>; } catch { /* try light repair below */ }
  try { return JSON.parse(slice.replace(/,\s*([}\]])/g, "$1")) as Record<string, unknown>; } catch { return null; }
}

/** Plain-language reason for the UI. Never includes secrets. */
export function nimProblem(error: unknown): string {
  if (error instanceof NimError) return error.message;
  return "The AI answered, but the app could not use the answer. Please try again.";
}

/** Test hook: forget cached model list and cool-downs. */
export function resetNimState() { liveModels = null; coolDown.clear(); }
