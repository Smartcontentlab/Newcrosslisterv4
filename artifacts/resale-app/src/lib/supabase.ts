import { createClient } from "@supabase/supabase-js";

// No baked-in project: a stale default points the app at a Supabase project that
// may no longer exist, and the seller sees "Failed to fetch" instead of being told
// the deployment is missing its VITE_SUPABASE_* variables.
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? "";

export const authConfigurationReady = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = createClient(
  supabaseUrl || "https://configuration-required.invalid",
  supabasePublishableKey || "configuration-required",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export async function getAccessToken(): Promise<string | null> {
  if (!authConfigurationReady) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = await getAccessToken();
  if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
