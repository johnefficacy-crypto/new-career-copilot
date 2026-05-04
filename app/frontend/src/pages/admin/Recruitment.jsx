"import React from \"react\";
import { Search, Filter, ExternalLink } from \"lucide-react\";

const ROWS = [
  { id: \"SSC-CGL-26\", title: \"SSC CGL 2026\", org: \"Staff Selection Commission\", status: \"verified\", posts: 21, source: \"ssc.nic.in\", updated: \"12:42\" },
  { id: \"IBPS-PO-XV\", title: \"IBPS PO XV\", org: \"Institute of Banking Personnel\", status: \"published\", posts: 3, source: \"ibps.in\", updated: \"11:20\" },
  { id: \"RBI-GRB-26\", title: \"RBI Grade B 2026\", org: \"Reserve Bank of India\", status: \"needs_review\", posts: 4, source: \"opportunities.rbi.org.in\", updated: \"10:58\" },
  { id: \"UPSC-CSE-26\", title: \"UPSC CSE 2026\", org: \"Union Public Service Commission\", status: \"published\", posts: 1, source: \"upsc.gov.in\", updated: \"yesterday\" },
  { id: \"NABARD-AM-26\", title: \"NABARD Assistant Manager 2026\", org: \"NABARD\", status: \"draft\", posts: 6, source: \"nabard.org\", updated: \"yesterday\" },
  { id: \"SBI-PO-26\", title: \"SBI PO 2026\", org: \"State Bank of India\", status: \"needs_review\", posts: 2, source: \"sbi.co.in/careers\", updated: \"2d ago\" },
];

const STATUS_STYLE = {
  draft: \"bg-white/10 text-white/70\",
  needs_review: \"bg-amber-500/20 text-amber-300\",
  verified: \"bg-emerald-500/20 text-emerald-300\",
  published: \"bg-[#F56A3F]/20 text-[#FFAB00]\",
};

export default function AdminRecruitments() {
  return (
    <div className=\"space-y-5\">
      <div className=\"flex items-end justify-between flex-wrap gap-4\">
        <div>
          <div className=\"text-[11px] uppercase tracking-[0.22em] text-white/40 font-semibold\">Recruitments</div>
          <h1 className=\"mt-1 font-heading text-3xl font-black tracking-tighter\">Publish workflow</h1>
          <p className=\"text-white/60 text-sm mt-1\">draft → needs_review → verified → published</p>
        </div>
        <button className=\"bg-white text-[#0B0F19] rounded-full px-4 py-2 text-sm font-semibold\">+ New recruitment</button>
      </div>

      <div className=\"flex gap-2 flex-wrap\">
        {[\"All · 214\", \"Draft · 12\", \"Needs review · 38\", \"Verified · 44\", \"Published · 120\"].map((t, i) => (
          <button key={t} className={`text-xs font-semibold px-3 py-1.5 rounded-full ${i === 2 ? \"bg-white text-[#0B0F19]\" : \"border border-white/10 hover:bg-white/5\"}`}>{t}</button>
        ))}
      </div>

      <div className=\"rounded-2xl glass-dark p-3\">
        <div className=\"flex items-center gap-2 px-2 py-2 border-b border-white/10\">
          <Search className=\"h-4 w-4 text-white/40\" />
          <input placeholder=\"Search by title, organization, source…\" className=\"flex-1 bg-transparent text-sm outline-none placeholder:text-white/40\" />
          <button className=\"text-xs px-3 py-1.5 rounded-lg border border-white/10 inline-flex items-center gap-1\"><Filter className=\"h-3.5 w-3.5\" /> Filter</button>
        </div>
        <table className=\"w-full text-sm mt-2\">
          <thead>
            <tr className=\"text-[10px] uppercase tracking-[0.22em] text-white/40 font-semibold\">
              <th className=\"text-left py-2 px-3\">Recruitment</th>
              <th className=\"text-left py-2 px-3\">Status</th>
              <th className=\"text-left py-2 px-3\">Posts</th>
              <th className=\"text-left py-2 px-3\">Source</th>
              <th className=\"text-left py-2 px-3\">Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.id} className=\"border-t border-white/5 hover:bg-white/5\">
                <td className=\"py-3 px-3\">
                  <div className=\"font-bold\">{r.title}</div>
                  <div className=\"text-[11px] text-white/50\">{r.org} · <span className=\"font-mono\">{r.id}</span></div>
                </td>
                <td className=\"py-3 px-3\">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${STATUS_STYLE[r.status]}`}>
                    {r.status.replace(\"_\", \" \")}
                  </span>
                </td>
                <td className=\"py-3 px-3 font-mono\">{r.posts}</td>
                <td className=\"py-3 px-3 text-white/70 inline-flex items-center gap-1 font-mono text-[12px]\">
                  {r.source} <ExternalLink className=\"h-3 w-3\" />
                </td>
                <td className=\"py-3 px-3 text-white/50 font-mono text-[12px]\">{r.updated}</td>
                <td className=\"py-3 px-3\">
                  <button className=\"text-xs font-semibold text-[#FFAB00] hover:underline\">Review →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
"