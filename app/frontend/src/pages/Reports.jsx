import React, { useEffect, useState } from "react";
import { Download, FileText, RefreshCcw } from "lucide-react";
import { reportsService } from "../services/studyToolsService";

const REPORT_LABELS = {
  weekly_summary: "Weekly summary",
  mistake_book: "Mistake book",
  flashcard_performance: "Flashcard performance",
  mock_analytics: "Mock analytics",
  study_log: "Study log",
  subject_mastery: "Subject mastery",
};

export default function Reports() {
  const [types, setTypes] = useState({ report_types: [], formats: [] });
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState("");
  const [format, setFormat] = useState("csv");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    const [t, list] = await Promise.all([reportsService.listTypes(), reportsService.list()]);
    setTypes(t);
    setSelected((prev) => prev || t.report_types?.[0] || "");
    setReports(list.reports || []);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    setErr(null);
    try {
      await reportsService.request({ report_type: selected, format });
      load();
    } catch (e) {
      setErr(e.message || "Failed to start export");
    } finally {
      setSubmitting(false);
    }
  };

  const download = async (id) => {
    try {
      const r = await reportsService.download(id);
      if (r.file_url && !r.file_url.startsWith("inline:")) {
        window.open(r.file_url, "_blank");
        return;
      }
      const blob = new Blob([r.content || ""], { type: r.format === "csv" ? "text/csv" : "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename || `report.${r.format || "txt"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || "Failed to download");
    }
  };

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Reports</div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Downloadable reports</h1>
        <p className="text-muted-foreground mt-1">Export your study log, mistakes, flashcard performance, mock analytics and weekly summaries.</p>
      </div>

      <div className="soft-card rounded-2xl p-5 space-y-3">
        <div className="text-sm font-semibold">Generate a new export</div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex flex-wrap gap-2">
          <select className="px-3 py-2 rounded-xl border border-border bg-background" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {(types.report_types || []).map((t) => (
              <option key={t} value={t}>{REPORT_LABELS[t] || t}</option>
            ))}
          </select>
          <select className="px-3 py-2 rounded-xl border border-border bg-background" value={format} onChange={(e) => setFormat(e.target.value)}>
            {(types.formats || []).map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
          </select>
          <button className="btn btn-primary inline-flex items-center gap-2" disabled={submitting} onClick={submit}>
            <FileText className="h-4 w-4" />
            {submitting ? "Starting…" : "Generate"}
          </button>
          <button className="btn btn-secondary inline-flex items-center gap-2" onClick={load} title="Refresh">
            <RefreshCcw className="h-4 w-4" />
          </button>
        </div>
        <div className="text-xs text-muted-foreground">PDF exports are queued and processed by a worker. CSV/JSON are generated inline.</div>
      </div>

      <div className="space-y-2">
        {reports.length === 0 ? (
          <div className="soft-card rounded-2xl p-6 text-sm text-muted-foreground text-center">No reports generated yet.</div>
        ) : (
          reports.map((r) => (
            <div key={r.id} className="soft-card rounded-xl p-4 flex items-center gap-3">
              <FileText className="h-5 w-5 text-clay-500" />
              <div className="flex-1">
                <div className="font-medium">{REPORT_LABELS[r.report_type] || r.report_type} · {r.format?.toUpperCase()}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(r.requested_at).toLocaleString()} · {r.status}
                  {r.error_message ? ` · ${r.error_message}` : ""}
                </div>
              </div>
              {r.status === "ready" && (
                <button className="btn btn-secondary inline-flex items-center gap-1" onClick={() => download(r.id)}>
                  <Download className="h-4 w-4" /> Download
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
