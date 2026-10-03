import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { transactionId, amount, successUrl, failedUrl, description } = await req.json();

    const cleanAmount = Number(amount);

    if (!transactionId) return json({ error: "transactionId is required." }, 400);
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      return json({ error: "A valid amount is required." }, 400);
    }
    if (!successUrl || !failedUrl) {
      return json({ error: "successUrl and failedUrl are required." }, 400);
    }

    const secretKey = Deno.env.get("PAYMONGO_SECRET_KEY");
    if (!secretKey) return json({ error: "PAYMONGO_SECRET_KEY is not configured." }, 500);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Supabase service credentials are not configured." }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Confirm the transaction exists and hasn't already been paid.
    const { data: transaction, error: fetchError } = await supabase
      .from("transactions")
      .select("id,total_amount,payment_status,payment_method,split_payment_details")
      .eq("id", transactionId)
      .single();

    if (fetchError || !transaction) {
      return json({ error: "Transaction was not found." }, 404);
    }

    if (transaction.payment_status === "Paid") {
      return json({ error: "This transaction has already been paid." }, 409);
    }

    // A Split Payment only sends its GCash portion through PayMongo -- the
    // Cash portion was already collected by staff. The amount comes from the
    // saved split, not the client, so the QR can never ask for the cash too.
    const isSplit = transaction.payment_method === "Split Payment";
    const chargeAmount = isSplit
      ? Number(transaction.split_payment_details?.GCash ?? 0)
      : cleanAmount;

    if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) {
      return json({ error: "This split payment has no GCash portion to charge." }, 400);
    }

    // PayMongo expects the amount in centavos (smallest currency unit).
    const amountInCentavos = Math.round(chargeAmount * 100);

    const authHeader = "Basic " + btoa(`${secretKey}:`);

    const sourceResponse = await fetch("https://api.paymongo.com/v1/sources", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            type: "gcash",
            amount: amountInCentavos,
            currency: "PHP",
            description: isSplit
              ? `PawCruz GCash portion of split payment (${transactionId})`
              : description || `PawCruz transaction ${transactionId}`,
            redirect: {
              success: successUrl,
              failed: failedUrl,
            },
          },
        },
      }),
    });

    const sourceData = await sourceResponse.json();

    if (!sourceResponse.ok) {
      const message = sourceData?.errors?.[0]?.detail || "PayMongo could not create the GCash source.";
      return json({ error: message, details: sourceData }, sourceResponse.status);
    }

    const sourceId = sourceData?.data?.id;
    const checkoutUrl = sourceData?.data?.attributes?.redirect?.checkout_url;

    if (!sourceId || !checkoutUrl) {
      return json({ error: "PayMongo response was missing the checkout URL." }, 502);
    }

    const { error: updateError } = await supabase
      .from("transactions")
      .update({
        paymongo_source_id: sourceId,
        paymongo_checkout_url: checkoutUrl,
        // payment_method is left as checkout saved it ("GCash" or "Split
        // Payment") -- overwriting a split with "GCash" made settlement
        // treat the whole total as paid through GCash.
        payment_status: "Pending",
      })
      .eq("id", transactionId);

    if (updateError) {
      return json({ error: "Unable to save the GCash source to the transaction." }, 500);
    }

    return json({ checkoutUrl, sourceId });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to create the GCash source." }, 500);
  }
});