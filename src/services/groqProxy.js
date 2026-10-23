// Every Groq call goes through the groq-chat Supabase Edge Function, which
// holds the Groq API key as a secret (GROQ_API_KEY) so it never ships to the
// browser. The function is called with the public Supabase anon key.
export const GROQ_ENDPOINT = `${process.env.REACT_APP_SUPABASE_URL || ""}/functions/v1/groq-chat`;

export const GROQ_AUTH_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
