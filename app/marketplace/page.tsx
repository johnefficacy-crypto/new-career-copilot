'use client';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

const allMentors = [
  {
    name: 'Dr. Ananya Sharma', initials: 'AS', role: 'IAS Officer (2018 Batch, AIR 12)', exams: ['UPSC CSE'],
    rating: 4.9, reviews: 142, badge: 'Career Copilot Verified', badgeTag: 'tag-green', category: 'UPSC', free: false,
    sessions: [
      { title: 'UPSC Essay Strategy & GS Integration', date: 'May 10, 2026', time: '7:00 PM', duration: 60, capacity: 50, seatsLeft: 23, price: 199 },
      { title: 'Mains Answer Writing — Framework', date: 'May 17, 2026', time: '7:00 PM', duration: 60, capacity: 50, seatsLeft: 41, price: 199 },
    ],
  },
  {
    name: 'Vikram Nair', initials: 'VN', role: 'RBI Grade B (2020), SEBI Grade A (2021)', exams: ['RBI Grade B', 'SEBI'],
    rating: 4.8, reviews: 98, badge: 'Career Copilot Verified', badgeTag: 'tag-green', category: 'Banking', free: false,
    sessions: [
      { title: 'RBI Grade B Phase I — Finance & Mgt', date: 'May 12, 2026', time: '8:00 PM', duration: 90, capacity: 40, seatsLeft: 18, price: 149 },
    ],
  },
  {
    name: 'Pooja Mehta', initials: 'PM', role: 'SSC CGL AIR 12 (2021)', exams: ['SSC CGL', 'SSC CHSL'],
    rating: 4.7, reviews: 76, badge: 'Career Copilot Verified', badgeTag: 'tag-green', category: 'SSC', free: false,
    sessions: [
      { title: 'SSC CGL Tier I — Quant Shortcuts', date: 'May 9, 2026', time: '6:00 PM', duration: 60, capacity: 50, seatsLeft: 35, price: 99 },
    ],
  },
  {
    name: 'Deepa Singh', initials: 'DS', role: 'UPSC CSE AIR 44 (2021)', exams: ['UPSC CSE', 'UPPCS'],
    rating: 4.8, reviews: 113, badge: 'Career Copilot Verified', badgeTag: 'tag-green', category: 'UPSC', free: false,
    sessions: [
      { title: 'Optional Strategy — Sociology Mains', date: 'May 14, 2026', time: '7:30 PM', duration: 90, capacity: 30, seatsLeft: 12, price: 299 },
    ],
  },
  {
    name: 'Kartik Bose', initials: 'KB', role: 'SSC CGL AIR 3 (2022)', exams: ['SSC CGL'],
    rating: 4.9, reviews: 88, badge: 'Career Copilot Verified', badgeTag: 'tag-green', category: 'SSC', free: true,
    sessions: [
      { title: 'Free: SSC CGL Prelims Strategy AMA', date: 'May 8, 2026', time: '9:00 PM', duration: 45, capacity: 200, seatsLeft: 143, price: 0 },
    ],
  },
];

const allCourses = [
  { title: 'UPSC GS Foundation Course 2026', provider: 'Vision IAS', price: 18000, display: '₹18,000', origDisplay: '₹22,000', rating: 4.6, students: '12.4k', tag: 'tag-purple', tagLabel: 'Bestseller', category: 'UPSC', affiliate: false },
  { title: 'RBI Grade B Complete Course', provider: 'Oliveboard', price: 8500, display: '₹8,500', origDisplay: '₹10,000', rating: 4.5, students: '6.2k', tag: 'tag-blue', tagLabel: 'Popular', category: 'Banking', affiliate: true },
  { title: 'SSC CGL Tier I + II Crash Course', provider: 'Testbook', price: 2999, display: '₹2,999', origDisplay: '₹4,999', rating: 4.3, students: '24.1k', tag: 'tag-yellow', tagLabel: 'New', category: 'SSC', affiliate: false },
  { title: 'Current Affairs Monthly Bundle', provider: 'ForumIAS', price: 499, display: '₹499/mo', origDisplay: null, rating: 4.7, students: '31k', tag: 'tag-green', tagLabel: 'Subscription', category: 'All', affiliate: false },
  { title: 'UPSC Ethics & Essay Masterclass', provider: 'Insights IAS', price: 5999, display: '₹5,999', origDisplay: '₹7,500', rating: 4.8, students: '8.1k', tag: 'tag-purple', tagLabel: 'Top Rated', category: 'UPSC', affiliate: false },
  { title: 'IBPS PO + Clerk Complete Pack', provider: 'Adda247', price: 3499, display: '₹3,499', origDisplay: '₹4,999', rating: 4.4, students: '18.3k', tag: 'tag-blue', tagLabel: 'Bundle', category: 'Banking', affiliate: true },
];

const freeResources = [
  { title: 'NCERT Polity XI — Free PDF', type: 'Official PDF', price: 0, tag: 'tag-green', category: 'UPSC' },
  { title: 'Economic Survey 2025-26 Summary', type: 'PDF', price: 0, tag: 'tag-green', category: 'All' },
  { title: 'SSC CGL Previous Year Papers (5 years)', type: 'PDF Bundle', price: 0, tag: 'tag-green', category: 'SSC' },
];

const paidResources = [
  { title: 'Laxmikanth Indian Polity — 7th Ed.', type: 'Book', price: 580, display: '₹580', tag: 'tag-blue', category: 'UPSC' },
  { title: 'UPSC PYQ 25 Years — GS Paper I', type: 'PDF Bundle', price: 199, display: '₹199', tag: 'tag-gray', category: 'UPSC' },
  { title: 'CSAT Practice Sets (100 Papers)', type: 'PDF Bundle', price: 299, display: '₹299', tag: 'tag-gray', category: 'UPSC' },
  { title: 'Banking Awareness Handbook 2026', type: 'Book', price: 450, display: '₹450', tag: 'tag-blue', category: 'Banking' },
  { title: 'SSC English Grammar & Usage', type: 'Book', price: 320, display: '₹320', tag: 'tag-yellow', category: 'SSC' },
];

const categories = ['All', 'UPSC', 'Banking', 'SSC'];

function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ color: '#f59e0b', fontSize: '0.8rem' }}>
      {'★'.repeat(Math.floor(rating))}{'☆'.repeat(5 - Math.floor(rating))}
      <span style={{ color: '#6b7280', marginLeft: '0.3rem' }}>{rating}</span>
    </span>
  );
}

export default function MarketplacePage() {
  const { userTier } = useApp();
  const [category,    setCategory]    = useState('All');
  const [search,      setSearch]      = useState('');
  const [budgetFirst, setBudgetFirst] = useState(false);
  const [booked,      setBooked]      = useState<Set<string>>(new Set());
  const [cart,        setCart]        = useState<Set<string>>(new Set());
  const [toast,       setToast]       = useState('');
  const [showRefund,  setShowRefund]  = useState<string | null>(null);
  const [expandMentor, setExpandMentor] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const bookSession = (mentorName: string, sessionTitle: string, price: number) => {
    if (userTier === 'free' && price > 0) {
      showToast('Pro or Elite required to book paid sessions.');
      return;
    }
    setBooked(prev => new Set(prev).add(`${mentorName}|${sessionTitle}`));
    showToast(price === 0 ? `Registered for free session with ${mentorName}!` : `Booking confirmed — ₹${price} charged via Razorpay.`);
  };

  const allResources = budgetFirst
    ? [...freeResources.map(r => ({ ...r, display: 'Free' })), ...paidResources].filter(r =>
        (category === 'All' || r.category === 'All' || r.category === category) &&
        r.title.toLowerCase().includes(search.toLowerCase()))
    : [...freeResources.map(r => ({ ...r, display: 'Free' })), ...paidResources].filter(r =>
        (category === 'All' || r.category === 'All' || r.category === category) &&
        r.title.toLowerCase().includes(search.toLowerCase()));

  const filteredMentors = allMentors.filter(m =>
    (category === 'All' || m.category === category) &&
    m.name.toLowerCase().includes(search.toLowerCase()) &&
    (!budgetFirst || m.sessions.some(s => s.price === 0))
  );

  const filteredCourses = [...allCourses]
    .filter(c => (category === 'All' || c.category === 'All' || c.category === category) && c.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => budgetFirst ? a.price - b.price : 0);

  return (
    <div className="page">
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1f2937', color: '#fff', padding: '0.75rem 1.25rem', borderRadius: 10, fontWeight: 500, fontSize: '0.9rem', zIndex: 500, boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>{toast}</div>
      )}

      {showRefund && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowRefund(null)}>
          <div className="card" style={{ width: 420, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <h2>📋 Booking & Refund Policy</h2>
            <div style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.7, marginTop: '0.5rem' }}>
              <div style={{ marginBottom: '0.5rem' }}><strong>Cancellation:</strong> Full refund if cancelled 24h before session. 50% refund within 24h.</div>
              <div style={{ marginBottom: '0.5rem' }}><strong>No-show:</strong> No refund if session is attended for less than 10 minutes.</div>
              <div style={{ marginBottom: '0.5rem' }}><strong>Mentor cancellation:</strong> Full refund issued automatically within 2 business days.</div>
              <div><strong>Payment:</strong> Processed via Razorpay. Platform fee: 30%. Mentor receives 70% (T+2 settlement).</div>
            </div>
            <button className="btn btn-primary" style={{ marginTop: '1rem', width: '100%' }} onClick={() => setShowRefund(null)}>Got it</button>
          </div>
        </div>
      )}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><h1>Marketplace</h1><p>Verified mentor sessions, quality courses, and trusted resources.</p></div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="btn btn-outline" onClick={() => setShowRefund('policy')} style={{ fontSize: '0.8rem' }}>📋 Refund Policy</button>
          <button className="btn btn-outline" style={{ position: 'relative' }}>
            🛒 Cart {cart.size > 0 && <span style={{ position: 'absolute', top: -6, right: -6, background: '#dc2626', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{cart.size}</span>}
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ flex: 1, minWidth: 200, padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
          placeholder="Search mentors, courses, resources..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {categories.map(c => (
            <button key={c} onClick={() => setCategory(c)} style={{
              padding: '0.4rem 1rem', borderRadius: 20, fontSize: '0.85rem', fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: category === c ? '#4f46e5' : '#f3f4f6',
              color: category === c ? '#fff' : '#6b7280',
            }}>{c}</button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
          <label className="toggle-switch">
            <input type="checkbox" checked={budgetFirst} onChange={e => setBudgetFirst(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
          Budget-first mode
        </label>
      </div>

      {/* Verification note */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '0.75rem 1.1rem', marginBottom: '1.5rem', fontSize: '0.83rem', color: '#15803d', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{ fontSize: '1rem' }}>✓</span>
        <span><strong>Career Copilot Verified</strong> mentors have been cross-verified against official UPSC/SSC/banking result records before listing. No unverified mentors are shown.</span>
      </div>

      {/* Mentor sessions */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>🧑‍🏫 Mentor Sessions {userTier === 'free' && <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#9ca3af', marginLeft: '0.5rem' }}>Free sessions available · Pro required for paid</span>}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredMentors.map((m) => {
            const isExpanded = expandMentor === m.name;
            return (
              <div key={m.name} style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'flex-start', cursor: 'pointer' }}
                  onClick={() => setExpandMentor(isExpanded ? null : m.name)}>
                  <div className="avatar" style={{ width: 46, height: 46, fontSize: '1rem', flexShrink: 0 }}>{m.initials}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1f2937' }}>{m.name}</span>
                      <span className="verified-badge">✓ {m.badge}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.2rem' }}>{m.role}</div>
                    <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                      {m.exams.map(e => <span key={e} className="tag tag-blue">{e}</span>)}
                    </div>
                    <div style={{ marginTop: '0.4rem' }}>
                      <Stars rating={m.rating} />
                      <span style={{ fontSize: '0.78rem', color: '#9ca3af', marginLeft: '0.4rem' }}>{m.reviews} reviews</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>{m.sessions.length} session{m.sessions.length > 1 ? 's' : ''} available</div>
                    <div style={{ fontSize: '0.78rem', color: '#4f46e5', marginTop: '0.2rem' }}>{isExpanded ? '▲ Hide' : '▼ View sessions'}</div>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f3f4f6', background: '#f9fafb', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {m.sessions.map((s, si) => {
                      const bookKey = `${m.name}|${s.title}`;
                      const isBooked = booked.has(bookKey);
                      const seatsFull = s.seatsLeft === 0;
                      const locked = userTier === 'free' && s.price > 0;
                      return (
                        <div key={si} className="session-card" style={{ background: '#fff' }}>
                          <div className="session-card-date">
                            📅 {s.date} · {s.time} IST · {s.duration} min
                          </div>
                          <div className="session-card-title">{s.title}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: s.price === 0 ? '#16a34a' : '#4f46e5' }}>
                                {s.price === 0 ? 'Free' : `₹${s.price}/seat`}
                              </span>
                              <span className="session-capacity">👥 {s.seatsLeft}/{s.capacity} seats left</span>
                              {s.price > 0 && <button onClick={() => setShowRefund('policy')} style={{ background: 'none', border: 'none', fontSize: '0.72rem', color: '#9ca3af', cursor: 'pointer', textDecoration: 'underline' }}>Refund policy</button>}
                              {s.price > 0 && <span className="disclosure-badge">Mentor earns 70%</span>}
                            </div>
                            {isBooked ? (
                              <span className="tag tag-green">✓ Registered</span>
                            ) : locked ? (
                              <button className="btn btn-upgrade" style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }} onClick={() => showToast('Upgrade to Pro to book paid sessions.')}>
                                ◆ Pro required
                              </button>
                            ) : (
                              <button className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '0.3rem 0.85rem' }} disabled={seatsFull}
                                onClick={() => bookSession(m.name, s.title, s.price)}>
                                {seatsFull ? 'Full' : s.price === 0 ? 'Register Free' : `Book — ₹${s.price}`}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {filteredMentors.length === 0 && <div style={{ textAlign: 'center', color: '#9ca3af', padding: '1.5rem' }}>No mentors found for this filter.</div>}
        </div>
      </div>

      <div className="grid-2">
        {/* Courses */}
        <div className="card">
          <h2>🎓 Courses {budgetFirst && <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#059669' }}>· Sorted by price</span>}</h2>
          {filteredCourses.map((c, i) => (
            <div key={i} className="list-item">
              <div style={{ flex: 1 }}>
                <div className="list-item-title">
                  {c.title}
                  {c.affiliate && <span className="disclosure-badge" style={{ marginLeft: '0.4rem' }}>Affiliate</span>}
                </div>
                <div className="list-item-sub">{c.provider} · {c.students} students</div>
                <Stars rating={c.rating} />
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#1f2937', fontSize: '0.9rem' }}>{c.display}</div>
                  {c.origDisplay && <div style={{ fontSize: '0.75rem', color: '#9ca3af', textDecoration: 'line-through' }}>{c.origDisplay}</div>}
                </div>
                <span className={`tag ${c.tag}`}>{c.tagLabel}</span>
                <button
                  className={`btn ${cart.has(c.title) ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                  onClick={() => setCart(prev => { const n = new Set(prev); n.has(c.title) ? n.delete(c.title) : n.add(c.title); showToast(n.has(c.title) ? 'Added to cart!' : 'Removed from cart'); return n; })}>
                  {cart.has(c.title) ? '✓ In Cart' : 'Add to Cart'}
                </button>
              </div>
            </div>
          ))}
          {filteredCourses.length === 0 && <div style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>No courses found.</div>}
        </div>

        {/* Resources */}
        <div className="card">
          <h2>📄 Resources & Books {budgetFirst && <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#059669' }}>· Free items first</span>}</h2>
          {allResources.map((r, i) => (
            <div key={i} className="list-item" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div className="list-item-title">{r.title}</div>
                <div className="list-item-sub">{r.type}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                <span style={{ fontWeight: 700, color: r.price === 0 ? '#16a34a' : '#1f2937', fontSize: '0.9rem' }}>
                  {r.price === 0 ? 'Free' : (r as any).display}
                </span>
                <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                  onClick={() => showToast(r.price === 0 ? `Downloading ${r.title}…` : `Opening checkout for ${r.title}`)}>
                  {r.price === 0 ? '⬇ Download' : '🛒 Buy'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
