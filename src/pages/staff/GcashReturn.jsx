import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";

import AppShell from "../../components/AppShell";
import {
  getTransactionById,
  pollTransactionStatus,
} from "../../services/transactionService";

function money(value) {
  return Number(value || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

export default function GcashReturn({ profile }) {
  const [searchParams] = useSearchParams();
  const transactionId = searchParams.get("tx");
  const redirectResult = searchParams.get("result");

  const [status, setStatus] = useState("checking");
  const [transaction, setTransaction] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!transactionId) {
        setStatus("error");
        setError("No transaction reference was provided.");
        return;
      }

      try {
        // The customer's GCash redirect only tells us they finished the GCash
        // flow, not that the money actually arrived. Poll until PayMongo's
        // webhook has flipped the transaction to Paid or Cancelled.
        const result = redirectResult === "failed"
          ? await getTransactionById(transactionId)
          : await pollTransactionStatus(transactionId);

        if (cancelled) return;

        setTransaction(result);

        if (result.payment_status === "Paid") {
          setStatus("paid");
        } else if (result.payment_status === "Cancelled" || redirectResult === "failed") {
          setStatus("failed");
        } else {
          setStatus("pending");
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setError(err.message || "Unable to check the payment status.");
        }
      }
    }

    check();

    return () => {
      cancelled = true;
    };
  }, [transactionId, redirectResult]);

  return (
    <AppShell profile={profile} title="GCash Payment">
      <div className="card gcash-card">
        {status === "checking" && (
          <>
            <Loader2 className="spin" size={40} />
            <h2>Confirming your GCash payment…</h2>
            <p>This usually takes just a few seconds.</p>
          </>
        )}

        {status === "pending" && (
          <>
            <Loader2 className="spin" size={40} />
            <h2>Still waiting for confirmation</h2>
            <p>
              PayMongo hasn't confirmed this payment yet. It's safe to check
              back — the transaction stays Pending until confirmed.
            </p>
          </>
        )}

        {status === "paid" && (
          <>
            <CheckCircle2 size={40} className="ok" />
            <h2>Payment Received</h2>
            <p>GCash payment confirmed for this transaction.</p>
            {transaction && (
              <div className="gcash-total">{money(transaction.total_amount)}</div>
            )}
          </>
        )}

        {(status === "failed" || status === "error") && (
          <>
            <XCircle size={40} className="err" />
            <h2>Payment Not Completed</h2>
            <p>{error || "The GCash payment was not completed or was cancelled."}</p>
          </>
        )}

        <Link to="/staff/transactions" className="back-link">
          Back to Transactions
        </Link>
      </div>

      <style>{`
        .gcash-card{background:white;border-radius:18px;padding:40px;box-shadow:0 8px 24px rgba(47,117,150,.09);max-width:420px;margin:40px auto;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px}
        .gcash-card h2{margin:8px 0 0}
        .gcash-card p{color:#6F7F88;font-size:14px;margin:0}
        .gcash-total{font-size:24px;font-weight:700;color:#318fbe;margin-top:10px}
        .spin{animation:spin 1s linear infinite;color:#318fbe}
        .ok{color:#1f9d55}
        .err{color:#c0392b}
        .back-link{margin-top:20px;color:#318fbe;font-weight:600;text-decoration:none;font-size:14px}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      `}</style>
    </AppShell>
  );
}