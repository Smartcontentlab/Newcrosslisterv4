// One place that talks to NVIDIA NIM's OpenAI-compatible chat endpoint.

export const DEFAULT_NIM_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

export type NimMessage = { role: "system" | "user" | "assistant"; content: string };
type NimPayload = { choices?: Array<{ message?: { content?: string } }> };

export class NimError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

async function post(model: string, messages: NimMessage[], temperature: number, maxTokens: number): Promise<Response> {
  const apiKey = process.env.NVIDIA_NIM_API_KEY;
  if (!apiKey) throw new NimError("NVIDIA_NIM_API_KEY is not configured");
  const baseUrl = (process.env.NVIDIA_NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, messages, temperature, max_tokens: maxTokens,
      // Nemotron "thinks" first by default and can spend the whole token budget on
      // it, leaving an empty answer. These requests want short, direct output.
      ...(/nemotron/i.test(model) ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    }),
  });
}

/**
 * Returns the model's text. NVIDIA retires hosted models regularly and then answers
 * 410 Gone (or 404 for an unknown name); a stale NVIDIA_NIM_MODEL setting would
 * otherwise take every AI feature down, so that case retries once with the default.
 */
export async function nimChat(messages: NimMessage[], options: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
  const temperature = options.temperature ?? 0.2;
  const maxTokens = options.maxTokens ?? 1200;
  const configured = process.env.NVIDIA_NIM_MODEL?.trim() || DEFAULT_NIM_MODEL;

  let response = await post(configured, messages, temperature, maxTokens);
  if ((response.status === 410 || response.status === 404) && configured !== DEFAULT_NIM_MODEL) {
    console.warn(`NVIDIA NIM model "${configured}" is unavailable (HTTP ${response.status}); using ${DEFAULT_NIM_MODEL}. Update NVIDIA_NIM_MODEL.`);
    response = await post(DEFAULT_NIM_MODEL, messages, temperature, maxTokens);
  }

  if (!response.ok) {
    const providerBody = (await response.text()).slice(0, 500);
    throw new NimError(`NVIDIA NIM returned HTTP ${response.status}${providerBody ? `: ${providerBody}` : ""}`, response.status);
  }
  const payload = await response.json() as NimPayload;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new NimError("NVIDIA NIM returned an empty response");
  return content;
}
