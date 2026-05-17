import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Star, Check, Lock, ShieldCheck } from "lucide-react";
import { api, getApiErrorMessage } from "../lib/api";

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function ResourceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [r, setR] = useState(null);
  const [access, setAccess] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [detail, acc] = await Promise.all([
        api.get(`/api/marketplace/resources/${id}`),
        api.get(`/api/marketplace/resources/${id}/access`).catch(() => ({ state: "not_enrolled" })),
      ]);
      setR(detail);
      setAccess(acc);
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const buy = async () => {
    setBusy(true);
    setError("");
    try {
      const idempotency = `${id}-${Date.now()}`;
      const res = await api.post(`/api/marketplace/resources/${id}/order`, { idempotency_key: idempotency });
      if (res?.free) {
        await refresh();
        navigate(`/app/marketplace/${id}/learn`);
        return;
      }
      const ok = await loadRazorpayScript();
      if (!ok || !window.Razorpay) {
        throw new Error("Razorpay checkout is unavailable. Refresh and try again.");
      }
      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: res.key_id,
          order_id: res.order.razorpay_order_id,
          amount: res.order.amount,
          currency: res.order.currency,
          name: "Career Copilot",
          description: r.title,
          prefill: { email: res.user?.email || "", name: res.user?.name || "" },
          theme: { color: "#A68057" },
          handler: async (response) => {
            try {
              await api.post(`/api/marketplace/resources/${id}/verify`, {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              await refresh();
              navigate(`/app/marketplace/${id}/learn`);
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          modal: { ondismiss: () => reject(new Error("Checkout cancelled")) },
        });
        rzp.open();
      });
    } catch (e) {
      const msg = getApiErrorMessage(e) || e?.message || "Could not complete payment";
      if (msg !== "Checkout cancelled") setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (error && !r) {
    return <div className="text-sm text-rose-700" data-testid="resource-error">{error}</div>;
  }
  if (!r) return <div>Loading…</div>;

  const price = Number(r.price || r.price_inr || 0);
  const state = access?.state || "not_enrolled";
  const isFree = price <= 0;

  return (
    <div className="space-y-6" data-testid={`resource-${id}`}>
      <Link to="/app/marketplace" className="text-sm text-muted-foreground link-under inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to marketplace
      </Link>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="soft-card rounded-3xl overflow-hidden">
            <div className="h-40" style={{ background: r.cover || "#F1E1CD" }} />
            <div className="p-6">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{r.type}</div>
              <h1 className="font-heading text-3xl font-semibold mt-1">{r.title}</h1>
              <div className="text-muted-foreground text-sm">{r.provider}</div>
              <div className="mt-4 inline-flex items-center gap-2 text-sm">
                <Star className="h-4 w-4 text-amber-500" fill="currentColor" /> {r.rating}
                <span className="text-muted-foreground">· {Number(r.students || 0).toLocaleString()} learners</span>
              </div>
              {r.is_affiliate ? (
                <div className="mt-3 text-xs rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900" data-testid="affiliate-disclosure">
                  <ShieldCheck className="inline-block h-3.5 w-3.5 mr-1" />
                  Affiliate disclosure: {r.affiliate_disclosure || "We earn a small disclosed cut on this product."}
                </div>
              ) : null}
            </div>
          </div>

          <div className="soft-card rounded-2xl p-6">
            <h2 className="font-heading text-xl font-semibold">Curriculum</h2>
            <ul className="mt-3 space-y-2">
              {(r.sections || []).map((s) => (
                <li key={s.id} className="py-2 border-b border-border last:border-0">
                  <div className="font-medium">{s.title}</div>
                  <ul className="mt-1 ml-3 text-xs text-muted-foreground space-y-1">
                    {(s.lessons || []).map((l) => (
                      <li key={l.id} className="flex items-center gap-2">
                        {l.is_preview ? <Check className="h-3 w-3 text-sage-600" /> : <Lock className="h-3 w-3" />}
                        <span>{l.title}</span>
                        {l.duration_mins ? <span>· {l.duration_mins}m</span> : null}
                        {l.is_preview ? <span className="text-sage-700">· preview</span> : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>

          <div className="soft-card rounded-2xl p-6">
            <h2 className="font-heading text-xl font-semibold">Reviews</h2>
            <div className="mt-3 space-y-3">
              {(r.reviews || []).map((rv, i) => (
                <div key={i} className="border-b border-border pb-3 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-sm">{rv.name}</div>
                    <div className="text-amber-500 text-xs">{"★".repeat(rv.rating)}</div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{rv.text}</p>
                </div>
              ))}
              {(r.reviews || []).length === 0 ? (
                <div className="text-sm text-muted-foreground">No reviews yet.</div>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="soft-card rounded-2xl p-6 h-fit sticky top-20">
          <div className="font-heading text-3xl font-semibold">
            {isFree ? "Free" : `₹${price.toLocaleString()}`}
          </div>
          {error ? <div className="mt-2 text-xs text-rose-700" data-testid="resource-purchase-error">{error}</div> : null}

          {state === "enrolled" ? (
            <Link to={`/app/marketplace/${id}/learn`} className="btn btn-primary w-full mt-4 inline-flex justify-center" data-testid="continue-btn">
              Continue learning
            </Link>
          ) : state === "refund_requested" ? (
            <button className="btn btn-muted w-full mt-4" disabled data-testid="refund-pending">
              Refund pending ({access?.refund_status})
            </button>
          ) : state === "refunded" ? (
            <button onClick={buy} disabled={busy} className="btn btn-primary w-full mt-4" data-testid="buy-again-btn">
              {busy ? "Loading…" : isFree ? "Enrol free" : `Buy again · ₹${price.toLocaleString()}`}
            </button>
          ) : (
            <button onClick={buy} disabled={busy} className="btn btn-primary w-full mt-4" data-testid="buy-btn">
              {busy ? "Loading…" : isFree ? "Enrol free" : `Buy · ₹${price.toLocaleString()}`}
            </button>
          )}

          <div className="mt-5 pt-5 border-t border-border text-sm text-muted-foreground space-y-2">
            <div>Lifetime access after purchase</div>
            <div>Community discussion thread included</div>
            <div data-testid="refund-window">
              {Number(r.refund_window_days || 0) > 0
                ? `${r.refund_window_days}-day refund window`
                : "No refund window on this product"}
            </div>
            <div className="text-[11px]">Final price is shown above. No surprise upsells.</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
