"import React from \"react\";
import { motion } from \"framer-motion\";
import { Star, Quote } from \"lucide-react\";

const TESTIMONIALS = [
  {
    name: \"Rahul Verma\",
    role: \"Selected · SSC CGL 2025\",
    img: \"https://images.unsplash.com/photo-1762522926157-bcc04bf0b10a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMHBvcnRyYWl0JTIwbW9kZXJufGVufDB8fHx8MTc3NzkwMTMwMXww&ixlib=rb-4.1.0&q=85\",
    quote:
      \"I stopped opening five Telegram channels every morning. One login, every official notification, already filtered to what I'm eligible for.\",
    stat: \"₹0 wasted on mis-applications\",
  },
  {
    name: \"Priya Iyer\",
    role: \"Aspirant · UPSC CSE 2026\",
    img: \"https://images.unsplash.com/photo-1769636929130-56648d6e9c6d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHw0fHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMHBvcnRyYWl0JTIwbW9kZXJufGVufDB8fHx8MTc3NzkwMTMwMXww&ixlib=rb-4.1.0&q=85\",
    quote:
      \"The weekly Truth Panel is brutal in the best way. I finally know whether I actually studied, or just opened the app.\",
    stat: \"48→14 hrs of wasted effort\",
  },
  {
    name: \"Arjun Malhotra\",
    role: \"IBPS PO · 2025 batch\",
    img: \"https://images.unsplash.com/photo-1758613654360-45f1ff78c0cf?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwyfHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMHBvcnRyYWl0JTIwbW9kZXJufGVufDB8fHx8MTc3NzkwMTMwMXww&ixlib=rb-4.1.0&q=85\",
    quote:
      \"The eligibility engine saved me two days of PDF-reading. It told me exactly which three posts I could apply for, and why.\",
    stat: \"Applied to 3 posts, got 2\",
  },
];

const LOGOS = [\"UPSC\", \"SSC\", \"IBPS\", \"RBI\", \"SEBI\", \"NABARD\", \"RRB\", \"State PSC\"];

export default function Testimonials() {
  return (
    <section className=\"py-24 md:py-32 bg-[#FDFBF7] relative overflow-hidden\">
      <div className=\"container px-6\">
        <div className=\"max-w-3xl\">
          <div className=\"uppercase tracking-[0.22em] text-[11px] font-bold text-[#F56A3F]\">Aspirants speak</div>
          <h2 className=\"mt-4 font-heading text-4xl md:text-6xl font-black tracking-tighter leading-[0.98]\">
            You don't need hype.
            <br />
            <span className=\"gradient-text\">You need a system that works.</span>
          </h2>
        </div>

        <div className=\"mt-14 grid md:grid-cols-3 gap-5\">
          {TESTIMONIALS.map((t, i) => (
            <motion.figure
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: \"-60px\" }}
              transition={{ delay: i * 0.12, duration: 0.8 }}
              className=\"relative rounded-3xl bg-white border border-black/5 p-7 flex flex-col gap-5 tilt\"
            >
              <Quote className=\"h-7 w-7 text-[#F56A3F]/30 absolute top-6 right-6\" />
              <div className=\"flex gap-0.5 text-[#FFAB00]\">
                {[...Array(5)].map((_, k) => <Star key={k} className=\"h-3.5 w-3.5 fill-current\" />)}
              </div>
              <blockquote className=\"text-[17px] leading-snug font-medium tracking-tight text-foreground/90\">
                \"{t.quote}\"
              </blockquote>
              <div className=\"mt-auto flex items-center gap-3 pt-4 border-t border-black/5\">
                <img src={t.img} alt={t.name} className=\"h-11 w-11 rounded-full object-cover ring-2 ring-white shadow-md\" loading=\"lazy\" />
                <div className=\"flex-1\">
                  <div className=\"font-heading font-bold text-sm\">{t.name}</div>
                  <div className=\"text-[11px] text-muted-foreground\">{t.role}</div>
                </div>
                <div className=\"text-[10px] text-right bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg font-bold font-mono\">
                  {t.stat}
                </div>
              </div>
            </motion.figure>
          ))}
        </div>

        {/* Trusted-by strip */}
        <div className=\"mt-20 border-t border-b border-black/10 py-8\">
          <div className=\"text-center text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold\">
            Covering recruitments from
          </div>
          <div className=\"mt-5 overflow-hidden relative [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]\">
            <div className=\"marquee\">
              {[...LOGOS, ...LOGOS].map((l, i) => (
                <div key={i} className=\"font-heading font-black text-3xl md:text-4xl text-foreground/30 whitespace-nowrap tracking-tight\">
                  {l}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
"