"import React from \"react\";
import { motion, AnimatePresence } from \"framer-motion\";
import { CheckCircle2, XCircle, AlertTriangle, BarChart3, Sparkles } from \"lucide-react\";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from \"recharts\";

// Mock recruitment rules
const EXAMS = [
  {
    id: \"ssc-cgl\",
    name: \"SSC CGL 2026\",
    org: \"Staff Selection Commission\",
    ageMin: 18, ageMax: 32,
    edu: [\"graduate\", \"postgraduate\"],
    cats: [\"general\", \"obc\", \"sc\", \"st\", \"ews\"],
    color: \"bg-emerald-500\",
  },
  {
    id: \"ibps-po\",
    name: \"IBPS PO XV\",
    org: \"Institute of Banking Personnel\",
    ageMin: 20, ageMax: 30,
    edu: [\"graduate\", \"postgraduate\"],
    cats: [\"general\", \"obc\", \"sc\", \"st\", \"ews\"],
    color: \"bg-amber-500\",
  },
  {
    id: \"rbi-b\",
    name: \"RBI Grade B 2026\",
    org: \"Reserve Bank of India\",
    ageMin: 21, ageMax: 30,
    edu: [\"graduate\", \"postgraduate\"],
    cats: [\"general\", \"obc\", \"sc\", \"st\", \"ews\"],
    note: \"Needs min 60% in graduation\",
    color: \"bg-rose-500\",
  },
  {
    id: \"upsc-cse\",
    name: \"UPSC CSE 2026\",
    org: \"Union Public Service Commission\",
    ageMin: 21, ageMax: 32,
    edu: [\"graduate\", \"postgraduate\"],
    cats: [\"general\", \"obc\", \"sc\", \"st\", \"ews\"],
    color: \"bg-indigo-500\",
  },
];

function check(profile, ex) {
  const reasons = [];
  let ok = true;
  if (profile.age < ex.ageMin || profile.age > ex.ageMax) {
    ok = false;
    reasons.push(`Age ${profile.age} ∉ [${ex.ageMin}–${ex.ageMax}]`);
  } else {
    reasons.push(`Age ${profile.age} ∈ [${ex.ageMin}–${ex.ageMax}]`);
  }
  if (!ex.edu.includes(profile.edu)) {
    ok = false;
    reasons.push(`Education ${profile.edu} not accepted`);
  } else {
    reasons.push(\"Education accepted\");
  }
  if (!ex.cats.includes(profile.cat)) {
    ok = false;
    reasons.push(\"Category not eligible\");
  } else {
    reasons.push(`${profile.cat.toUpperCase()} category match`);
  }
  const conditional = ok && ex.note;
  return { ok, conditional, reasons };
}

const PYQ_DATA = [
  { topic: \"Quant\", \"2022\": 22, \"2023\": 25, \"2024\": 28, \"2025\": 30 },
  { topic: \"Reasoning\", \"2022\": 25, \"2023\": 22, \"2024\": 22, \"2025\": 20 },
  { topic: \"English\", \"2022\": 25, \"2023\": 25, \"2024\": 23, \"2025\": 22 },
  { topic: \"GA\", \"2022\": 28, \"2023\": 28, \"2024\": 27, \"2025\": 28 },
];

export default function Playground() {
  const [profile, setProfile] = React.useState({ age: 24, cat: \"obc\", edu: \"graduate\" });
  const [tab, setTab] = React.useState(\"engine\");

  const results = EXAMS.map((ex) => ({ ex, ...check(profile, ex) }));
  const eligible = results.filter((r) => r.ok).length;

  return (
    <section id=\"playground\" className=\"py-24 md:py-32 relative overflow-hidden\">
      <div className=\"absolute inset-0 mesh-bg opacity-60\" />

      <div className=\"container relative px-6\">
        <div className=\"flex flex-col md:flex-row md:items-end md:justify-between gap-6\">
          <div className=\"max-w-2xl\">
            <div className=\"uppercase tracking-[0.22em] text-[11px] font-bold text-[#10B981]\">Live playground</div>
            <h2 className=\"mt-4 font-heading text-4xl md:text-6xl font-black tracking-tighter leading-[0.98]\">
              Play with the engine.
              <br />
              <span className=\"gradient-text\">No signup. No fluff.</span>
            </h2>
          </div>
          <div className=\"glass rounded-full p-1 inline-flex gap-1 self-start md:self-end\" data-testid=\"playground-tabs\">
            <button
              data-testid=\"tab-engine\"
              onClick={() => setTab(\"engine\")}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition ${tab === \"engine\" ? \"bg-foreground text-background\" : \"text-foreground/70 hover:bg-black/5\"}`}
            >
              <Sparkles className=\"inline h-3.5 w-3.5 mr-1.5\" /> Eligibility engine
            </button>
            <button
              data-testid=\"tab-pyq\"
              onClick={() => setTab(\"pyq\")}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition ${tab === \"pyq\" ? \"bg-foreground text-background\" : \"text-foreground/70 hover:bg-black/5\"}`}
            >
              <BarChart3 className=\"inline h-3.5 w-3.5 mr-1.5\" /> PYQ weights
            </button>
          </div>
        </div>

        <div className=\"mt-10 relative rounded-[32px] glass p-4 md:p-6 border border-white/60 shadow-[0_40px_100px_-40px_rgba(8,15,35,0.35)]\">
          <AnimatePresence mode=\"wait\">
            {tab === \"engine\" ? (
              <motion.div
                key=\"engine\"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className=\"grid lg:grid-cols-5 gap-6\"
              >
                {/* Controls */}
                <div className=\"lg:col-span-2 rounded-2xl bg-white border border-black/5 p-6\">
                  <div className=\"text-[10px] uppercase tracking-[0.22em] text-muted-foreground\">Your profile</div>
                  <div className=\"mt-4 space-y-5\">
                    <div>
                      <div className=\"flex items-center justify-between text-sm font-semibold\">
                        <label>Age</label>
                        <span className=\"font-mono text-[#F56A3F]\" data-testid=\"age-value\">{profile.age} yrs</span>
                      </div>
                      <input
                        data-testid=\"age-slider\"
                        type=\"range\"
                        min=\"17\" max=\"40\" value={profile.age}
                        onChange={(e) => setProfile({ ...profile, age: +e.target.value })}
                        className=\"w-full mt-2 accent-[#F56A3F]\"
                      />
                    </div>

                    <div>
                      <div className=\"text-sm font-semibold mb-2\">Category</div>
                      <div className=\"flex flex-wrap gap-1.5\">
                        {[\"general\", \"obc\", \"sc\", \"st\", \"ews\"].map((c) => (
                          <button
                            key={c}
                            data-testid={`cat-${c}`}
                            onClick={() => setProfile({ ...profile, cat: c })}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border transition ${
                              profile.cat === c
                                ? \"bg-foreground text-background border-foreground\"
                                : \"bg-white text-foreground/70 border-black/10 hover:border-black/30\"
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className=\"text-sm font-semibold mb-2\">Education</div>
                      <div className=\"flex flex-wrap gap-1.5\">
                        {[\"12th\", \"graduate\", \"postgraduate\"].map((e) => (
                          <button
                            key={e}
                            data-testid={`edu-${e}`}
                            onClick={() => setProfile({ ...profile, edu: e })}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize border transition ${
                              profile.edu === e
                                ? \"bg-foreground text-background border-foreground\"
                                : \"bg-white text-foreground/70 border-black/10 hover:border-black/30\"
                            }`}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className=\"pt-4 border-t border-black/5\">
                      <div className=\"flex items-center gap-2 text-[13px] text-muted-foreground\">
                        <CheckCircle2 className=\"h-4 w-4 text-emerald-500\" />
                        Deterministic. No AI guesswork.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Results */}
                <div className=\"lg:col-span-3 rounded-2xl bg-gradient-to-br from-white to-[#FDFBF7] border border-black/5 p-6\">
                  <div className=\"flex items-center justify-between\">
                    <div>
                      <div className=\"text-[10px] uppercase tracking-[0.22em] text-muted-foreground\">Results</div>
                      <div className=\"mt-1 font-heading text-2xl font-black\">
                        <span className=\"text-emerald-600\">{eligible}</span> of {EXAMS.length} exams match
                      </div>
                    </div>
                    <div className=\"text-[11px] text-muted-foreground font-mono\">recompute · &lt; 80ms</div>
                  </div>

                  <div className=\"mt-5 space-y-2.5\">
                    {results.map(({ ex, ok, conditional, reasons }) => (
                      <motion.div
                        key={ex.id}
                        layout
                        className={`rounded-2xl border p-4 bg-white ${
                          ok ? \"border-emerald-200\" : \"border-rose-200\"
                        }`}
                      >
                        <div className=\"flex items-start justify-between gap-3\">
                          <div className=\"flex items-start gap-3 min-w-0\">
                            <div className={`h-9 w-9 rounded-lg grid place-items-center shrink-0 ${ok ? \"bg-emerald-100\" : \"bg-rose-100\"}`}>
                              {ok ? (
                                conditional ? (
                                  <AlertTriangle className=\"h-4 w-4 text-amber-600\" />
                                ) : (
                                  <CheckCircle2 className=\"h-4 w-4 text-emerald-600\" />
                                )
                              ) : (
                                <XCircle className=\"h-4 w-4 text-rose-600\" />
                              )}
                            </div>
                            <div className=\"min-w-0\">
                              <div className=\"font-heading font-bold truncate\">{ex.name}</div>
                              <div className=\"text-[11px] text-muted-foreground truncate\">{ex.org}</div>
                            </div>
                          </div>
                          <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                            !ok ? \"bg-rose-100 text-rose-700\" : conditional ? \"bg-amber-100 text-amber-700\" : \"bg-emerald-100 text-emerald-700\"
                          }`}>
                            {!ok ? \"Not eligible\" : conditional ? \"Conditional\" : \"Eligible\"}
                          </span>
                        </div>
                        <div className=\"mt-3 flex flex-wrap gap-1.5\">
                          {reasons.map((r, i) => (
                            <span key={i} className=\"text-[11px] bg-foreground/5 px-2 py-0.5 rounded-md font-mono\">
                              {r}
                            </span>
                          ))}
                          {conditional && (
                            <span className=\"text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md font-semibold\">
                              {ex.note}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key=\"pyq\"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className=\"rounded-2xl bg-white border border-black/5 p-6\"
              >
                <div className=\"flex items-center justify-between\">
                  <div>
                    <div className=\"text-[10px] uppercase tracking-[0.22em] text-muted-foreground\">SSC CGL · Tier I · PYQ subject weights</div>
                    <div className=\"font-heading text-2xl font-black mt-1\">Quant is pulling ahead.</div>
                    <div className=\"text-sm text-muted-foreground mt-1\">
                      Last 4 cycles. Decide where to invest your study hours.
                    </div>
                  </div>
                </div>
                <div className=\"mt-6 h-80\">
                  <ResponsiveContainer width=\"100%\" height=\"100%\">
                    <BarChart data={PYQ_DATA} barGap={4}>
                      <CartesianGrid strokeDasharray=\"3 3\" stroke=\"rgba(0,0,0,0.06)\" />
                      <XAxis dataKey=\"topic\" stroke=\"rgba(0,0,0,0.5)\" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke=\"rgba(0,0,0,0.5)\" fontSize={12} tickLine={false} axisLine={false} unit=\"%\" />
                      <Tooltip contentStyle={{ borderRadius: 12, border: \"1px solid rgba(0,0,0,0.08)\" }} cursor={{ fill: \"rgba(245,106,63,0.08)\" }} />
                      <Bar dataKey=\"2022\" fill=\"#D4D4D8\" radius={[6, 6, 0, 0]} />
                      <Bar dataKey=\"2023\" fill=\"#FBBF77\" radius={[6, 6, 0, 0]} />
                      <Bar dataKey=\"2024\" fill=\"#FFAB00\" radius={[6, 6, 0, 0]} />
                      <Bar dataKey=\"2025\" fill=\"#F56A3F\" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className=\"mt-4 text-sm text-muted-foreground\">
                  <strong className=\"text-foreground\">Insight:</strong> Quant weight rose from 22% → 30% in 4 years.
                  Allocate more hours to arithmetic & DI for the 2026 cycle.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
"