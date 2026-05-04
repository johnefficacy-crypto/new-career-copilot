"import React from \"react\";
import { Check, X, ExternalLink } from \"lucide-react\";

const APPS = [
  { id: 1, name: \"Divya Rao\", exam: \"UPSC CSE 2022\", rank: \"AIR 38\", roll: \"0512843\", year: 2022, status: \"pending\", submitted: \"4 hours ago\" },
  { id: 2, name: \"Arjun Singh\", exam: \"SSC CGL 2021\", rank: \"AIR 9\", roll: \"SSC21-44821\", year: 2021, status: \"pending\", submitted: \"8 hours ago\" },
  { id: 3, name: \"Neha Jain\", exam: \"RBI Grade B 2023\", rank: \"AIR 14\", roll: \"RBI23-9922\", year: 2023, status: \"verified\", submitted: \"2 days ago\" },
  { id: 4, name: \"Kabir Shah\", exam: \"IBPS PO 2022\", rank: \"AIR 127\", roll: \"IBPS22-18211\", year: 2022, status: \"rejected\", submitted: \"3 days ago\" },
];

export default function AdminMentors() {
  return (
    <div className=\"space-y-5\">
      <div>
        <div className=\"text-[11px] uppercase tracking-[0.22em] text-white/40 font-semibold\">Mentor verification</div>
        <h1 className=\"mt-1 font-heading text-3xl font-black tracking-tighter\">Verify before they list.</h1>
        <p className=\"text-white/60 text-sm mt-1\">Rank/roll must be cross-checked against official result PDFs. No exceptions.</p>
      </div>

      <div className=\"space-y-3\">
        {APPS.map((a) => (
          <div key={a.id} className=\"rounded-2xl glass-dark p-5\">
            <div className=\"flex items-center gap-5 flex-wrap\">
              <div className=\"h-12 w-12 rounded-xl bg-gradient-to-br from-[#F56A3F] to-[#FFAB00] grid place-items-center font-bold\">
                {a.name.split(\" \").map((x) => x[0]).join(\"\")}
              </div>
              <div className=\"flex-1 min-w-[240px]\">
                <div className=\"font-bold\">{a.name}</div>
                <div className=\"text-[11px] text-white/50 font-mono\">{a.exam} · {a.rank} · roll {a.roll} · {a.year}</div>
              </div>
              <a href=\"#\" className=\"text-xs text-white/70 hover:text-white inline-flex items-center gap-1 font-mono\">
                open official result <ExternalLink className=\"h-3 w-3\" />
              </a>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                a.status === \"pending\" ? \"bg-amber-500/20 text-amber-300\"
                : a.status === \"verified\" ? \"bg-emerald-500/20 text-emerald-300\"
                : \"bg-rose-500/20 text-rose-300\"
              }`}>{a.status}</span>
              {a.status === \"pending\" && (
                <div className=\"flex gap-2\">
                  <button className=\"h-9 w-9 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 grid place-items-center\"><Check className=\"h-4 w-4 text-emerald-300\" /></button>
                  <button className=\"h-9 w-9 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 grid place-items-center\"><X className=\"h-4 w-4 text-rose-300\" /></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
"