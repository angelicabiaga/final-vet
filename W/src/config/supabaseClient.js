import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing Supabase environment variables. Copy .env.example to .env and add your project credentials.");
} else if (process.env.NODE_ENV !== "production") {
  console.info("PawCruz connected Supabase project:", supabaseUrl);
}

export const supabase = createClient(supabaseUrl || "https://example.supabase.co", supabaseAnonKey || "example-anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
