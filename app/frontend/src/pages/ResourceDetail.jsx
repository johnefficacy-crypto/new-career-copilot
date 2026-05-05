import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Star, Check } from "lucide-react";
import { api } from "../lib/api";

export default function ResourceDetail() {
  const { id } = useParams();
  const [r, setR] = useState(null);

  useEffect(() => {
    api.get(`/api/marketplace/resources/${id}`).then(setR).catch(() => {});
  }, [id]);

  if (!r) return <div>Loading…</div>;

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
                <span className="text-muted-foreground">· {r.students.toLocaleString()} learners</span>
              </div>
            </div>
          </div>

          <div className="soft-card rounded-2xl p-6">
            <h2 className="font-heading text-xl font-semibold">Curriculum</h2>
            <ul className="mt-3 space-y-2">
              {(r.curriculum || []).map((c) => (
                <li key={c.module} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <div className="font-medium">{c.module}</div>
                    <div className="text-xs text-muted-foreground">{c.lessons} lessons · {c.duration}</div>
                  </div>
                  <Check className="h-4 w-4 text-sage-500" />
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
            </div>
          </div>
        </div>

        <aside className="soft-card rounded-2xl p-6 h-fit sticky top-20">
          <div className="font-heading text-3xl font-semibold">₹{r.price.toLocaleString()}</div>
          <button className="btn btn-primary w-full mt-4" data-testid="buy-btn">Enroll · payment via Razorpay (Phase 2)</button>
          <div className="text-[11px] text-muted-foreground mt-3">Phase 2 wires payment gateway, webhooks and entitlement sync.</div>
          <div className="mt-5 pt-5 border-t border-border text-sm text-muted-foreground space-y-2">
            <div>Lifetime access</div>
            <div>Community discussion thread included</div>
            <div>30-day refund window</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
