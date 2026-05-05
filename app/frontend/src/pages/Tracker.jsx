import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";

const STAGE_LABELS = {
  notified: "Notified",
  applied: "Applied",
  fee_paid: "Fee paid",
  admit_card: "Admit card",
  appeared: "Appeared",
  result: "Result",
};

export default function Tracker() {
  const [data, setData] = useState({ items: [], stages: [] });
  const [saving, setSaving] = useState(null);

  async function load() {
    const d = await api.get("/api/tracker");
    setData(d);
  }
  useEffect(() => {
    load();
  }, []);

  async function update(id, stage) {
    setSaving(id);
    await api.put(`/api/tracker/${id}`, { stage });
    await load();
    setSaving(null);
  }
  async function remove(id) {
    await api.del(`/api/tracker/${id}`);
    await load();
  }

  return (
    <div className="space-y-6" data-testid="tracker-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Application tracker</div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Where you are in each cycle.</h1>
          <p className="text-muted-foreground mt-1">Move cards forward as you go — admit cards and results will sync here in Phase 2.</p>
        </div>
        <Link to="/app/exams" className="btn btn-primary" data-testid="tracker-add">
          <Plus className="h-4 w-4" /> Track an exam
        </Link>
      </div>

      {data.items.length === 0 ? (
        <div className="soft-card rounded-2xl p-10 text-center">
          <ListChecks className="h-6 w-6 text-clay-500 mx-auto" />
          <div className="mt-3 font-heading text-lg font-semibold">Nothing tracked yet</div>
          <div className="text-sm text-muted-foreground">Open an exam detail page and hit "Track application" to begin.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {data.items.map((t) => (
            <div key={t.id} className="soft-card rounded-2xl p-5" data-testid={`tracker-${t.recruitment_slug}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-xl bg-clay-100 grid place-items-center font-mono font-semibold text-xs text-clay-700">
                      {t.organization_code}
                    </div>
                    <div>
                      <div className="font-semibold">{t.recruitment_name}</div>
                      <div className="text-xs text-muted-foreground">{STAGE_LABELS[t.stage]}</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="px-3 py-1.5 rounded-full bg-white/80 border border-border text-xs font-semibold"
                    value={t.stage}
                    onChange={(e) => update(t.id, e.target.value)}
                    disabled={saving === t.id}
                    data-testid={`tracker-stage-${t.recruitment_slug}`}
                  >
                    {data.stages.map((s) => (
                      <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                    ))}
                  </select>
                  <button onClick={() => remove(t.id)} className="h-9 w-9 grid place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive" data-testid={`tracker-del-${t.recruitment_slug}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-1">
                {data.stages.map((s, i) => {
                  const activeIdx = data.stages.indexOf(t.stage);
                  const active = i <= activeIdx;
                  return (
                    <div key={s} className="flex-1">
                      <div className={`h-1.5 rounded-full ${active ? "bg-clay-500" : "bg-clay-100"}`} />
                      <div className="mt-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{STAGE_LABELS[s]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
