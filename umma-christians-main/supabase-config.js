import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const DEFAULT_SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const runtimeConfig = globalThis.__SUPABASE__ || {};
const supabaseUrl = String(runtimeConfig.url || runtimeConfig.supabaseUrl || DEFAULT_SUPABASE_URL).trim();
const supabaseAnonKey = String(runtimeConfig.anonKey || runtimeConfig.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY).trim();

const isPlaceholder = (value) => !value || value.includes("YOUR_PROJECT") || value.includes("YOUR_SUPABASE_ANON_KEY");

export const hasSupabaseConfig = !isPlaceholder(supabaseUrl) && !isPlaceholder(supabaseAnonKey);
export const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const app = supabase;
export const db = { client: supabase, kind: "supabase-firestore-compat" };
export const auth = { client: supabase, kind: "supabase-auth-compat" };
export const rtdb = { client: supabase, kind: "supabase-realtime-compat" };
export const storage = { client: supabase, kind: "supabase-storage-compat" };

if (!hasSupabaseConfig) {
    console.warn("Supabase is not configured yet. Set SUPABASE_URL and SUPABASE_ANON_KEY in runtime-config.js or Vercel.");
}
