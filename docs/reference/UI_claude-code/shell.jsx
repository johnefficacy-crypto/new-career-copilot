/* global React, ReactDOM, ScreenToday, ScreenPlan, ScreenSubjects, ScreenFocus, ScreenMocks, ScreenReview, ScreenEligibility, ScreenAdminExam, ScreenAdminPersona, ScreenAdminEligibility, ScreenHandoff, TweaksPanel, TweakSection, TweakRadio, TweakToggle, useTweaks */
const { useState: useStateApp, useEffect: useEffectApp } = React;

const ROUTES = [
  { id:"today",     path:"/app/today",                title:"Today",          group:"plan",      desc:"Mission Control",         render: () => <ScreenToday /> },
  { id:"plan",      path:"/app/study-plan",           title:"Study Plan",     group:"plan",      desc:"Timeline · adaptation",   render: () => <ScreenPlan /> },
  { id:"subjects",  path:"/app/study/subjects",       title:"Subjects",       group:"plan",      desc:"Topic intelligence",      render: () => <ScreenSubjects /> },
  { id:"focus",     path:"/app/study/focus",          title:"Focus",          group:"plan",      desc:"Timed session",           render: () => <ScreenFocus /> },
  { id:"mocks",     path:"/app/study/mocks",          title:"Mocks",          group:"plan",      desc:"Analysis · correction",   render: () => <ScreenMocks /> },
  { id:"review",    path:"/app/study/review",         title:"Weekly review",  group:"plan",      desc:"Close the loop",          render: () => <ScreenReview /> },
  { id:"elig",      path:"/app/eligibility",          title:"Eligibility",    group:"plan",      desc:"Recruitment matches",     render: () => <ScreenEligibility /> },

  { id:"community", path:"/app/community",            title:"Community",      group:"community", desc:"Channels · threads",      render: () => <ScreenCommunity /> },
  { id:"groups",    path:"/app/groups",               title:"Study Groups",   group:"community", desc:"Pace with people",        render: () => <ScreenGroups /> },
  { id:"partners",  path:"/app/partners",             title:"Partner",        group:"community", desc:"1:1 accountability",      render: () => <ScreenPartners /> },
  { id:"mentors",   path:"/app/mentors",              title:"Mentors",        group:"community", desc:"1:n sessions",            render: () => <ScreenMentors /> },
  { id:"resources", path:"/app/resources",            title:"Resources",      group:"community", desc:"Library",                 render: () => <ScreenResources /> },

  { id:"marketplace", path:"/app/marketplace",        title:"Marketplace",    group:"market",    desc:"Browse · buy",            render: () => <ScreenMarketplace /> },
  { id:"mylib",       path:"/app/marketplace/library",title:"My library",     group:"market",    desc:"Purchases · cart",        render: () => <ScreenLibrary /> },
  { id:"sellerdash",  path:"/app/marketplace/sell",   title:"Sell on CCP",    group:"market",    desc:"Seller dashboard",        render: () => <ScreenSellerDash /> },

  { id:"admexam",   path:"/admin/exam-intelligence",  title:"Exam Intelligence", group:"admin", desc:"7-tab verification",      render: () => <ScreenAdminExam /> },
  { id:"admelig",   path:"/admin/eligibility",        title:"Eligibility",       group:"admin", desc:"Criteria + match impact", render: () => <ScreenAdminEligibility /> },
  { id:"admper",    path:"/admin/persona",            title:"Persona Inspector", group:"admin", desc:"Persona → policy",        render: () => <ScreenAdminPersona /> },
  { id:"admincomm", path:"/admin/community",          title:"Community Admin",   group:"admin", desc:"Moderation · mentors · badges", render: () => <ScreenAdminCommunity /> },
  { id:"adminmkt",  path:"/admin/marketplace",        title:"Marketplace Admin", group:"admin", desc:"Approvals · refunds · payouts", render: () => <ScreenAdminMarket /> },
  { id:"adminfunnel", path:"/admin/funnel",            title:"Funnel Admin",      group:"admin", desc:"Conversion · drop-off · stitch", render: () => <ScreenAdminFunnel /> },

  { id:"onboarding", path:"/onboarding",               title:"Onboarding",       group:"entry",  desc:"Chat funnel · auth",       render: () => <ScreenOnboarding /> },

  { id:"handoff",   path:"#handoff",                  title:"Handoff & gaps", group:"meta",      desc:"Map · components · gaps", render: () => <ScreenHandoff /> },
];

const GROUP_LABELS = {
  entry:     "Entry",
  plan:      "Study OS",
  community: "Community",
  market:    "Marketplace",
  admin:     "Admin · internal",
  meta:      "Prototype",
};

function useHash() {
  const [hash, setHash] = useStateApp(() => (typeof window !== 'undefined' && window.location.hash.replace('#','')) || 'today');
  useEffectApp(() => {
    function onHash() { setHash(window.location.hash.replace('#','') || 'today'); }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [hash, (id) => { window.location.hash = id; }];
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showStatusBadges": true,
  "density": "comfortable",
  "trustEmphasis": "loud"
}/*EDITMODE-END*/;

function App() {
  const [hash, setHash] = useHash();
  const route = ROUTES.find(r => r.id === hash) || ROUTES[0];
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // hide status badges via CSS toggle
  useEffectApp(() => {
    document.body.classList.toggle('hide-status-badges', !t.showStatusBadges);
    document.body.setAttribute('data-density', t.density);
    document.body.setAttribute('data-trust', t.trustEmphasis);
  }, [t.showStatusBadges, t.density, t.trustEmphasis]);

  return (
    <div className="min-h-screen flex">
      <Sidebar route={route} onPick={setHash} />
      <main className="flex-1 min-w-0">
        {route.render()}
      </main>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Surface state">
          <TweakToggle label="Show live/preview badges" value={t.showStatusBadges} onChange={(v)=>setTweak('showStatusBadges', v)} />
        </TweakSection>
        <TweakSection title="Layout">
          <TweakRadio label="Density" value={t.density} onChange={(v)=>setTweak('density', v)} options={[
            {value:'comfortable', label:'Comfy'},
            {value:'compact', label:'Compact'},
          ]} />
        </TweakSection>
        <TweakSection title="Trust visual">
          <TweakRadio label="Verified emphasis" value={t.trustEmphasis} onChange={(v)=>setTweak('trustEmphasis', v)} options={[
            {value:'subtle', label:'Subtle'},
            {value:'loud', label:'Loud'},
          ]} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

function Sidebar({ route, onPick }) {
  const groups = ["entry","plan","community","market","admin","meta"];
  return (
    <aside className="w-[228px] shrink-0 border-r border-[#E7DECB] bg-[#FBF4E8] sticky top-0 h-screen overflow-auto flex flex-col">
      <div className="px-4 pt-5 pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#2E2218] flex items-center justify-center">
            <span className="font-serif text-[15px] text-[#F3EADB]">cc</span>
          </div>
          <div>
            <div className="font-serif text-[15px] leading-tight">Career Copilot</div>
            <div className="num-mono text-[9.5px] text-[#6C5038] tracking-[0.1em]">study-os · prototype</div>
          </div>
        </div>
      </div>

      <div className="hairline mx-4"></div>

      <nav className="px-3 py-2 flex-1 min-h-0 overflow-y-auto">
        {groups.map(g => {
          const items = ROUTES.filter(r => r.group === g);
          if (items.length === 0) return null;
          return (
            <div key={g}>
              <div className="nav-section">{GROUP_LABELS[g]}</div>
              {items.map(r => <NavLink key={r.id} r={r} active={r.id === route.id} onPick={onPick} />)}
            </div>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-[#E7DECB] shrink-0">
        <div className="num-mono text-[9.5px] text-[#6C5038] leading-relaxed">
          Aarav Mehra<br/>
          UPSC CSE 2026 · 108d<br/>
          <span className="text-[#33482F]">live · last sync 2m ago</span>
        </div>
      </div>
    </aside>
  );
}

function NavLink({ r, active, onPick }) {
  const glyph = NAV_GLYPHS[r.id] || "·";
  return (
    <button onClick={()=>onPick(r.id)} className={`nav-link ${active ? 'active' : ''} w-full text-left mb-0.5`}>
      <span className="nav-glyph w-5 text-center text-[14px]">{glyph}</span>
      <span className="flex-1">
        <span className="block">{r.title}</span>
        <span className={`block text-[10.5px] num-mono ${active ? 'text-[#D6BC93]' : 'text-[#A68057]'}`}>{r.path}</span>
      </span>
    </button>
  );
}

const NAV_GLYPHS = {
  today: "◐",
  plan: "▤",
  subjects: "❖",
  focus: "◍",
  mocks: "△",
  review: "↻",
  elig: "⌖",
  admelig: "⌗",
  community: "✦",
  groups:    "◇",
  partners:  "↔",
  mentors:   "◊",
  resources: "≣",
  marketplace: "⊕",
  mylib:       "❒",
  sellerdash:  "₹",
  admexam:   "⊞",
  admper:    "◊",
  admincomm: "✦",
  adminmkt:  "⊕",
  adminfunnel:"↗",
  onboarding:"➤",
  handoff:   "✎",
};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
