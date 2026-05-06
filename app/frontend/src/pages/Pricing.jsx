import React, { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/authContext";

const RZP_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpay() {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = RZP_SCRIPT;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function paymentMessageFromError(err, fallback) {
  const detail = String(err?.message || err?.detail || "").toLowerCase();
  if (err?.status === 503 && detail.includes("not configured")) return "Payments are not configured in this environment.";
  if (detail.includes("sdk not installed")) return "Payments are temporarily unavailable right now.";
  if (detail.includes("credentials")) return "Payments are temporarily unavailable right now.";
  if (detail.includes("network") || detail.includes("failed to fetch")) return "We couldn't reach payments right now. Please try again.";
  if (detail.includes("signature")) return "Payment confirmation failed. If money was debited, support will help.";
  if (detail.includes("order")) return "Could not start payment. Please try again.";
  return fallback || "Something went wrong with payment. Please try again.";
}

function rupees(p) {
  return ((p || 0) / 100).toLocaleString("en-IN");
}

function featureList(plan) {
  const f = plan.features;
  if (!f) return [];
  if (Array.isArray(f)) return f;
  // Translate the legacy object shape (`{eligibility_check: true}`) into chips.
  const labels = {
    eligibility_check: "Eligibility verdicts",
    ai_career_chat: "AI Coach",
    download_pdf_plan: "Downloadable study plan",
    marketplace_access: "Marketplace access",
    priority_support: "Priority support",
  };
  const out = [];
  for (const [k, v] of Object.entries(f)) {
    if (v === false || v === null || v === 0) continue;
    if (k in labels) {
      out.push(labels[k]);
    } else if (typeof v === "number") {
      out.push(`${k.replace(/_/g, " ")}: ${v}`);
    } else if (v === true) {
      out.push(k.replace(/_/g, " "));
    }
  }
  return out;
}

export default function Pricing() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        api.get("/api/plans"),
        user ? api.get("/api/subscriptions/me").catch(() => null) : Promise.resolve(null),
      ]);
      setPlans(p.plans || []);
      setActive(s?.active || null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function subscribe(plan) {
    if (plan.price_inr === 0) {
      setMsg("Free plan — nothing to charge.");
      return;
    }
    if (!user) {
      window.location.href = "/login?next=/app/pricing";
      return;
    }
    setBusyId(plan.id);
    setMsg(null);
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error("Razorpay SDK missing");

      const { order, key_id } = await api.post("/api/payments/order", {
        plan_id: plan.id,
      });

      const options = {
        key: key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.id,
        name: "Career Copilot",
        description: `${plan.name} subscription`,
        prefill: {
          name: user.name || "",
          email: user.email || "",
        },
        theme: { color: "#2C2A4A" },
        handler: async (resp) => {
          try {
            const v = await api.post("/api/payments/verify", {
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            setMsg(`Subscription active · ${v.plan_id}`);
            await load();
          } catch (e) {
            setMsg(paymentMessageFromError(e, "Payment confirmation failed."));
          }
        },
        modal: {
          ondismiss: () => setBusyId(null),
        },
      };
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp) => {
        setMsg(
          "Payment was not completed. Please try again."
        );
        setBusyId(null);
      });
      rzp.open();
    } catch (e) {
      setMsg(paymentMessageFromError(e, "Could not start checkout."));
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8" data-testid="pricing-page">
      <header>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Pricing · Career Copilot
        </div>
        <h1 className="mt-1 font-heading text-4xl font-semibold tracking-tight">
          Pick a plan that matches the season.
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Upgrade unlocks the full study OS — adaptive plans, unlimited mocks,
          AI guidance, and prioritised deadline alerts. Cancel anytime.
        </p>
      </header>

      {active && (
        <div className="rounded-xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm flex items-center gap-3">
          <ShieldCheck className="h-4 w-4 text-sage-700" />
          <span>
            You're on{" "}
            <span className="font-semibold">
              {active.plan?.name || active.plan_id}
            </span>{" "}
            · current period ends{" "}
            <span className="font-mono text-xs">
              {active.current_period_end
                ? new Date(active.current_period_end).toLocaleDateString()
                : "—"}
            </span>
          </span>
        </div>
      )}

      {msg && (
        <div className="rounded-xl border border-clay-200 bg-[#F5EDE0] px-4 py-3 text-sm">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {loading && (
          <div className="text-muted-foreground" data-testid="pricing-loading">
            Loading plans…
          </div>
        )}
        {!loading &&
          plans.map((plan) => {
            const isActive = active?.plan_id === plan.id;
            const features = featureList(plan);
            const isFree = plan.price_inr === 0;
            return (
              <article
                key={plan.id}
                data-testid={`pricing-card-${plan.id}`}
                className={`rounded-2xl border p-6 flex flex-col gap-4 transition ${
                  isActive
                    ? "border-dusk-700 bg-white shadow-md"
                    : "border-clay-200 bg-white hover:shadow-sm"
                }`}
              >
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold flex items-center gap-2">
                    {plan.interval}
                    {isActive && (
                      <span className="pill pill-dusk text-[10px]">current</span>
                    )}
                  </div>
                  <h2 className="font-heading text-2xl font-semibold mt-1">
                    {plan.name}
                  </h2>
                  {plan.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {plan.description}
                    </p>
                  )}
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="font-heading text-4xl font-semibold">
                    {isFree ? "Free" : `₹${rupees(plan.price_inr)}`}
                  </span>
                  {!isFree && (
                    <span className="text-sm text-muted-foreground">
                      / {plan.interval === "annual" ? "yr" : "mo"}
                    </span>
                  )}
                </div>

                <ul className="space-y-2 text-sm">
                  {features.length === 0 && (
                    <li className="text-muted-foreground italic">
                      No features listed.
                    </li>
                  )}
                  {features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-sage-600 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => subscribe(plan)}
                  disabled={busyId === plan.id || isActive || isFree}
                  className={`mt-auto btn ${
                    isActive ? "btn-ghost" : "btn-primary"
                  }`}
                  data-testid={`pricing-subscribe-${plan.id}`}
                >
                  {busyId === plan.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Opening…
                    </>
                  ) : isActive ? (
                    "Active"
                  ) : isFree ? (
                    "Included"
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Subscribe
                    </>
                  )}
                </button>
              </article>
            );
          })}
      </div>

      <p className="text-xs text-muted-foreground">
        Payments are processed by Razorpay. Card / UPI / netbanking accepted in
        INR. Receipts are saved to your account history. AI never decides
        billing — every charge is signature-verified deterministically.
      </p>
    </div>
  );
}
