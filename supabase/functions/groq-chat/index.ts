// Forwards a chat-completions request to Groq so the Groq API key stays a
// server secret instead of shipping inside the web bundle. Used by the
// pet care assistant, medical-record analysis and inventory forecast.
//
// The request body is Groq's own chat-completions body; Groq's status code,
// body and retry-after header are passed back unchanged so the callers'
// existing 401/429/400 handling keeps working.
//
// Secrets (Edge Functions -> Secrets): GROQ_API_KEY.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "retry-after",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

// Anyone holding the public anon key can reach this function, so only the
// model the app uses is allowed and replies are capped.
const ALLOWED_MODELS = ["openai/gpt-oss-20b"];
const MAX_TOKENS_CAP = 4000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return json({ error: "GROQ_API_KEY is not configured." }, 401);

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.messages)) return json({ error: "messages is required." }, 400);
  if (!ALLOWED_MODELS.includes(body.model)) return json({ error: "Model not allowed." }, 400);
  body.max_tokens = Math.min(Number(body.max_tokens) || MAX_TOKENS_CAP, MAX_TOKENS_CAP);
  delete body.stream;

  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return json({ error: `Could not reach Groq: ${error instanceof Error ? error.message : error}` }, 502);
  }

  const headers: Record<string, string> = { ...corsHeaders, "Content-Type": "application/json" };
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) headers["retry-after"] = retryAfter;
  return new Response(await response.text(), { status: response.status, headers });
});
