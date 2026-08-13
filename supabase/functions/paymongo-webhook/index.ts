import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

// Verifies the `Paymongo-Signature` header using the webhook's signing secret.
// Header format: t=<timestamp>,te=<test_signature>,li=<live_signature>
async function verifySignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    })
  );

  const timestamp = parts.t;
  const providedSignature = parts.li || parts.te;
  if (!timestamp || !providedSignature) return false;

  const signedPayload = `${timestamp}.${rawBody}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const computedSignature = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedSignature === providedSignature;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const rawBody = await req.text();

  try {
    const webhookSecret = Deno.env.get("PAYMONGO_WEBHOOK_SECRET");
    const secretKey = Deno.env.get("PAYMONGO_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!webhookSecret || !secretKey || !supabaseUrl || !serviceRoleKey) {
      return json({ error: "Webhook is not fully configured." }, 500);
    }

    const signatureHeader = req.headers.get("Paymongo-Signature");
    const verified = await verifySignature(rawBody, signatureHeader, webhookSecret);

    if (!verified) {
      return json({ error: "Invalid webhook signature." }, 401);
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload?.data?.attributes?.type;
    const resource = payload?.data?.attributes?.data;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (eventType === "source.chargeable") {
      const sourceId = resource?.id;
      const amount = resource?.attributes?.amount;

      if (!sourceId || !amount) return json({ error: "Malformed source.chargeable payload." }, 400);

      // Charge the now-chargeable source to actually collect the funds.
      const authHeader = "Basic " + btoa(`${secretKey}:`);

      const paymentResponse = await fetch("https://api.paymongo.com/v1/payments", {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            attributes: {
              amount,
              currency: "PHP",
              description: `PawCruz GCash payment for source ${sourceId}`,
              source: { id: sourceId, type: "source" },
            },
          },
        }),
      });

      const paymentData = await paymentResponse.json();

      if (!paymentResponse.ok) {
        await supabase
          .from("transactions")
          .update({ payment_status: "Cancelled" })
          .eq("paymongo_source_id", sourceId);

        return json({ error: "PayMongo could not charge the source.", details: paymentData }, 502);
      }

      const paymentId = paymentData?.data?.id;
      const paymentStatus = paymentData?.data?.attributes?.status;

      if (paymentStatus === "paid") {
        const { data: transaction } = await supabase.from("transactions").select("id").eq("paymongo_source_id", sourceId).single();
        if (!transaction?.id) return json({ error: "Transaction was not found." }, 404);
        const { error: finalizeError } = await supabase.rpc("pawcruz_finalize_pending_transaction", { p_transaction_id: transaction.id, p_payment_id: paymentId });
        if (finalizeError) return json({ error: "Payment collected but transaction finalization failed.", details: finalizeError.message }, 500);
      }

      return json({ received: true, paymentId });
    }

    if (eventType === "source.expired" || eventType === "payment.failed") {
      const sourceId = resource?.id || resource?.attributes?.source?.id;

      if (sourceId) {
        await supabase
          .from("transactions")
          .update({ payment_status: "Cancelled" })
          .eq("paymongo_source_id", sourceId);
      }

      return json({ received: true });
    }

    // Ignore event types we don't act on (payment.paid duplicates source.chargeable handling above).
    return json({ received: true, ignored: eventType });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to process the webhook." }, 500);
  }
});
