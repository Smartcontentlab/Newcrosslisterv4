import { createClient } from "@supabase/supabase-js";

const defaultSupabaseUrl = "https://wxtwjuqajceahzxyquzm.supabase.co";
const defaultSupabasePublishableKey = "sb_publishable_6RIIuYhv8ZvU9di1F2ltsQ_c4kEL8DK";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? defaultSupabaseUrl;
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? defaultSupabasePublishableKey;

export const authConfigurationReady = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = createClient(
  supabaseUrl ?? "https://configuration-required.invalid",
  supabasePublishableKey ?? "configuration-required",
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
