"import React from \"react\";
import { Clock, Users, ShieldCheck, ChevronRight } from \"lucide-react\";

const EXAMS = [
  { id: 1, name: \"SSC CGL 2026\", org: \"Staff Selection Commission\", status: \"eligible\", match: 17, total: 21, deadline: \"12 days\", tier: \"Tier I · 2 June\" },
  { id: 2, name: \"IBPS PO XV\", org: \"Institute of Banking Personnel\", status: \"urgent\", match: 3, total: 3, deadline: \"3 days\", tier: \"Prelims · 4 May\" },
  { id: 3, name: \"RBI Grade B 2026\", org: \"Reserve Bank of India\", status: \"conditional\", match: 2, total: 4, deadline: \"26 days\", tier: \"Phase I · 15 May\" },
  { id: 4, name: \"UPSC CSE 2026\", org: \"Union Public Service Commission\", status: \"eligible\", match: 1, total: 1, deadline: \"42 days\", tier: \"Prelims · 31 May\" },
  { id: 5, name: \"SBI Clerk 2026\", org: \"State Bank of India\", status: \"eligible\", match: 5, total: 5, deadline: \"51 days\", tier: \"Prelims · 6 June\" },
];

const STAGES = [\"Notification\", \"Apply Window\", \"Admit Card\", \"Exam\", \"Result\"];

export default function ExamsPage() {
  return (
    <div data-testid=\"exams-page\" className=\"space-y-6\">
      <div>
        <h1 className=\"font-heading text-4xl font-black tracking-tighter\">Exams</h1>
        <p className=\"text-muted-foreground mt-1\">All live recruitments matched to your profile, by urgency.</p>
      </div>

      <div className=\"flex flex-wrap gap-2\">
        {[\"All · 22\", \"Eligible · 19\", \"Urgent · 2\", \"Conditional · 1\", \"Applied · 0\"].map((t, i) => (
          <button key={t} className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${i === 0 ? \"bg-foreground text-background\" : \"bg-white border border-border hover:border-foreground/30\"}`}>{t}</button>
        ))}
      </div>

      <div className=\"space-y-3\">
        {EXAMS.map((e) => (
          <div key={e.id} className=\"rounded-2xl bg-white border border-border p-5 hover:border-foreground/20 transition\">
            <div className=\"flex items-start gap-5 flex-wrap\">
              <div className=\"flex items-start gap-4 flex-1 min-w-[280px]\">
                <div className=\"h-12 w-12 rounded-xl bg-foreground/5 grid place-items-center font-heading font-black text-xs\">
                  {e.org.split(\" \").map(w => w[0]).join(\"\").slice(0,3)}
                </div>
                <div className=\"min-w-0\">
                  <div className=\"flex items-center gap-2\">
                    <h3 className=\"font-heading font-bold text-lg\">{e.name}</h3>
                    <span className=\"inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full\">
                      <ShieldCheck className=\"h-3 w-3\" /> Official
                    </span>
                  </div>
                  <div className=\"text-xs text-muted-foreground\">{e.org}</div>
                  <div className=\"mt-2 text-xs text-foreground/80\">{e.tier}</div>
                </div>
              </div>

              <div className=\"flex items-center gap-3\">
                <div className=\"text-right\">
                  <div className=\"text-[10px] uppercase tracking-[0.18em] text-muted-foreground\">Eligible posts</div>
                  <div className=\"font-heading font-black text-lg\">
                    <span className={e.status === \"conditional\" ? \"text-amber-600\" : \"text-emerald-600\"}>{e.match}</span>
                    <span className=\"text-muted-foreground text-sm\">/{e.total}</span>
                  </div>
                </div>
                <div className=\"text-right\">
                  <div className=\"text-[10px] uppercase tracking-[0.18em] text-muted-foreground\">Deadline</div>
                  <div className={`font-heading font-black text-lg ${e.status === \"urgent\" ? \"text-[#F56A3F]\" : \"\"}`}>{e.deadline}</div>
                </div>
                <button className=\"h-10 w-10 grid place-items-center rounded-xl bg-foreground text-background\">
                  <ChevronRight className=\"h-4 w-4\" />
                </button>
              </div>
            </div>

            {/* 5-stage timeline */}
            <div className=\"mt-5 flex items-center gap-1.5\">
              {STAGES.map((s, i) => {
                const active = i <= (e.id % 4);
                return (
                  <div key={s} className=\"flex-1\">
                    <div className={`h-1.5 rounded-full ${active ? \"bg-gradient-to-r from-[#F56A3F] to-[#FFAB00]\" : \"bg-border\"}`} />
                    <div className={`mt-1.5 text-[10px] uppercase tracking-wider font-semibold ${active ? \"text-foreground\" : \"text-muted-foreground\"}`}>{s}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
"