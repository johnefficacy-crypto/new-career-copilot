'use client';
import React, { useState, useEffect } from 'react';
import { useApp, AccountabilityPartner } from '../context/AppContext';

function useCountdown(deadline: string) {
  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    const calc = () => setDays(Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000));
    calc();
    const id = setInterval(calc, 60_000);
    return () => clearInterval(id);
  }, [deadline]);
  return days;
}

function CountdownBadge({ deadline }: { deadline: string }) {
  const days = useCountdown(deadline);
  if (days === null) return null;
  const color = days <= 3 ? '#dc2626' : days <= 14 ? '#ca8a04' : '#2563eb';
  return (
    <span style={{ fontSize: '0.8rem', fontWeight: 700, color, background: color + '15', padding: '0.2rem 0.55rem', borderRadius: 20 }}>
      {days > 0 ? `${days}d left` : days === 0 ? 'Today!' : 'Passed'}
    </span>
  );
}

const statusTag: Record<string, string> = {
  'Applied': 'tag-green', 'Admit card ready': 'tag-yellow',
  'Notification awaited': 'tag-blue', 'Not applied': 'tag-gray',
};

function MiniBar({ value, max, color = '#4f46e5' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ background: '#f3f4f6', borderRadius: 99, height: 6, flex: 1 }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: color, transition: 'width 0.4s' }} />
    </div>
  );
}

function RateBar({ rate, color }: { rate: number; color: string }) {
  return (
    <div style={{ marginTop: '0.3rem' }}>
      <div style={{ background: '#f3f4f6', borderRadius: 99, height: 8 }}>
        <div style={{ width: `${rate}%`, height: '100%', borderRadius: 99, background: color, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

function penaltyTarget(p: AccountabilityPartner) {
  return p.penaltyType === 'ngo' ? p.penaltyNgo || 'NGO' : p.name.split(' ')[0];
}

function CheckInModal({
  partner, onToggle, onSubmit, onClose,
}: {
  partner: AccountabilityPartner;
  onToggle: (id: number) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const done    = partner.myCommitments.filter(c => c.done).length;
  const total   = partner.myCommitments.length;
  const missed  = total - done;
  const penalty = missed * partner.penaltyAmount;
  const rate    = total > 0 ? Math.round((done / total) * 100) : 0;
  const partnerDone   = partner.partnerCommitments.filter(c => c.done).length;
  const partnerTotal  = partner.partnerCommitments.length;
  const partnerMissed = partnerTotal - partnerDone;
  const partnerPenalty = partnerMissed * partner.penaltyAmount;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="card" style={{ width: 560, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>📋 Weekly Check-In with {partner.name.split(' ')[0]}</h2>
            <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.2rem' }}>Apr 28 – May 4, 2026 · Mark tasks you actually completed</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.2rem' }}>✕</button>
        </div>

        {/* My tasks */}
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Your committed tasks
          </div>
          {total === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.75rem', textAlign: 'center' }}>No commitments set for this week. Add them in Profile → Accountability Partners.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {partner.myCommitments.map(c => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.85rem', borderRadius: 8, background: c.done ? '#f0fdf4' : '#f9fafb', border: `1px solid ${c.done ? '#bbf7d0' : '#e5e7eb'}`, cursor: 'pointer' }}>
                  <input type="checkbox" checked={c.done} onChange={() => onToggle(c.id)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#4f46e5' }} />
                  <span style={{ fontSize: '0.875rem', color: c.done ? '#15803d' : '#374151', textDecoration: c.done ? 'line-through' : 'none' }}>{c.task}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* My stats */}
        {total > 0 && (
          <div style={{ marginTop: '1rem', padding: '0.85rem 1rem', borderRadius: 8, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.83rem', color: '#374151', fontWeight: 500 }}>Completed: {done}/{total} tasks ({rate}%)</span>
              {missed > 0 && <span className="tag tag-red" style={{ fontSize: '0.72rem' }}>⚠ {missed} missed</span>}
            </div>
            <RateBar rate={rate} color={rate >= 80 ? '#16a34a' : rate >= 50 ? '#ca8a04' : '#dc2626'} />
          </div>
        )}

        {/* Penalty owed */}
        {missed > 0 && (
          <div style={{ marginTop: '0.85rem', padding: '0.85rem 1rem', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca' }}>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#dc2626', marginBottom: '0.25rem' }}>
              ⚠ Penalty owed: ₹{penalty}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              {missed} missed task{missed > 1 ? 's' : ''} × ₹{partner.penaltyAmount}/task →{' '}
              <strong>{partner.penaltyType === 'ngo' ? `${penaltyTarget(partner)} (NGO)` : partner.name.split(' ')[0]}</strong>
            </div>
          </div>
        )}

        {/* Partner's check-in (read-only) */}
        {partner.partnerCheckedIn && (
          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {partner.name.split(' ')[0]}'s check-in (already submitted)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {partner.partnerCommitments.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.85rem', borderRadius: 8, background: c.done ? '#f0fdf4' : '#fff7ed', border: `1px solid ${c.done ? '#bbf7d0' : '#fed7aa'}` }}>
                  <span style={{ fontSize: '0.9rem' }}>{c.done ? '✓' : '✗'}</span>
                  <span style={{ fontSize: '0.83rem', color: c.done ? '#15803d' : '#92400e' }}>{c.task}</span>
                </div>
              ))}
            </div>
            {partnerMissed > 0 && (
              <div style={{ marginTop: '0.6rem', padding: '0.65rem 0.85rem', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.82rem', color: '#15803d' }}>
                🎉 {partner.name.split(' ')[0]} missed {partnerMissed} task{partnerMissed > 1 ? 's' : ''} — they owe ₹{partnerPenalty} to you{partner.penaltyType === 'ngo' ? ' / NGO' : ''}.
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onSubmit} disabled={total === 0}>
            {penalty > 0 ? `Submit & Pay ₹${penalty} →` : 'Submit Check-In ✓'}
          </button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
        <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: '#9ca3af', textAlign: 'center' }}>
          This is a demo — no real payment is processed.
        </div>
      </div>
    </div>
  );
}

function SnapshotModal({ partner, onClose }: { partner: AccountabilityPartner; onClose: () => void }) {
  const [histTab, setHistTab] = useState(0);
  const currentDone   = partner.myCommitments.filter(c => c.done).length;
  const currentTotal  = partner.myCommitments.length;
  const currentRate   = currentTotal > 0 ? Math.round((currentDone / currentTotal) * 100) : 0;
  const partnerDone   = partner.partnerCommitments.filter(c => c.done).length;
  const partnerTotal  = partner.partnerCommitments.length;
  const partnerRate   = partnerTotal > 0 ? Math.round((partnerDone / partnerTotal) * 100) : 0;
  const myMissed      = currentTotal - currentDone;
  const partnerMissed = partnerTotal - partnerDone;
  const myPenalty     = myMissed * partner.penaltyAmount;
  const theirPenalty  = partnerMissed * partner.penaltyAmount;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="card" style={{ width: 640, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>📸 Weekly Snapshot</h2>
            <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.2rem' }}>Apr 28 – May 4, 2026 · with {partner.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.2rem' }}>✕</button>
        </div>

        {/* Side-by-side current week */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          {/* Me */}
          <div style={{ border: '2px solid #4f46e5', borderRadius: 10, padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#4f46e5' }}>You</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: currentRate >= 80 ? '#16a34a' : '#dc2626' }}>{currentRate}%</span>
            </div>
            <RateBar rate={currentRate} color={currentRate >= 80 ? '#16a34a' : currentRate >= 50 ? '#ca8a04' : '#dc2626'} />
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {currentTotal === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>No commitments set</div>
              ) : partner.myCommitments.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.8rem', color: c.done ? '#15803d' : '#dc2626' }}>
                  <span style={{ flexShrink: 0, fontWeight: 700 }}>{c.done ? '✓' : '✗'}</span>
                  <span>{c.task}</span>
                </div>
              ))}
            </div>
            {!partner.checkedInThisWeek && (
              <div style={{ marginTop: '0.65rem', fontSize: '0.75rem', color: '#f59e0b', fontWeight: 500 }}>⏳ Not checked in yet</div>
            )}
          </div>

          {/* Partner */}
          <div style={{ border: '2px solid #7c3aed', borderRadius: 10, padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#7c3aed' }}>{partner.name.split(' ')[0]}</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: partnerRate >= 80 ? '#16a34a' : '#dc2626' }}>{partnerRate}%</span>
            </div>
            <RateBar rate={partnerRate} color={partnerRate >= 80 ? '#16a34a' : partnerRate >= 50 ? '#ca8a04' : '#dc2626'} />
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {partnerTotal === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>No commitments set</div>
              ) : partner.partnerCommitments.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.8rem', color: c.done ? '#15803d' : '#dc2626' }}>
                  <span style={{ flexShrink: 0, fontWeight: 700 }}>{c.done ? '✓' : '✗'}</span>
                  <span>{c.task}</span>
                </div>
              ))}
            </div>
            {!partner.partnerCheckedIn && (
              <div style={{ marginTop: '0.65rem', fontSize: '0.75rem', color: '#f59e0b', fontWeight: 500 }}>⏳ Not checked in yet</div>
            )}
          </div>
        </div>

        {/* Penalty summary */}
        {(myPenalty > 0 || theirPenalty > 0) && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#92400e', marginBottom: '0.5rem' }}>⚖ Penalty Ledger — {partner.penaltyType === 'ngo' ? `${penaltyTarget(partner)} (NGO)` : 'Partner'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.83rem' }}>
              {myPenalty > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                  <span>You owe ({myMissed} missed × ₹{partner.penaltyAmount})</span>
                  <strong>₹{myPenalty} →</strong>
                </div>
              )}
              {theirPenalty > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                  <span>{partner.name.split(' ')[0]} owes ({partnerMissed} missed × ₹{partner.penaltyAmount})</span>
                  <strong>₹{theirPenalty} →</strong>
                </div>
              )}
            </div>
            {myPenalty > 0 && (
              <button className="btn btn-primary" style={{ marginTop: '0.75rem', fontSize: '0.82rem', width: '100%', background: '#dc2626', borderColor: '#dc2626' }}>
                Pay My Penalty — ₹{myPenalty} to {partner.penaltyType === 'ngo' ? penaltyTarget(partner) : partner.name.split(' ')[0]} (demo)
              </button>
            )}
          </div>
        )}

        {/* History */}
        {partner.weekHistory.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Past weeks
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              {partner.weekHistory.map((h, i) => (
                <button key={i} onClick={() => setHistTab(i)}
                  style={{ padding: '0.3rem 0.75rem', borderRadius: 20, border: `1px solid ${histTab === i ? '#4f46e5' : '#e5e7eb'}`, background: histTab === i ? '#4f46e5' : '#fff', color: histTab === i ? '#fff' : '#374151', fontSize: '0.78rem', cursor: 'pointer', fontWeight: histTab === i ? 600 : 400 }}>
                  {h.weekLabel}
                </button>
              ))}
            </div>
            {(() => {
              const h = partner.weekHistory[histTab];
              return (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '0.75rem' }}>
                    {[{ label: 'You', rate: h.myRate, tasks: h.myCommitments, color: '#4f46e5' }, { label: partner.name.split(' ')[0], rate: h.partnerRate, tasks: h.partnerCommitments, color: '#7c3aed' }].map((side, si) => (
                      <div key={si} style={{ border: `1px solid ${side.color}40`, borderRadius: 8, padding: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.82rem', color: side.color }}>{side.label}</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: side.rate >= 80 ? '#16a34a' : '#dc2626' }}>{side.rate}%</span>
                        </div>
                        <RateBar rate={side.rate} color={side.rate >= 80 ? '#16a34a' : side.rate >= 50 ? '#ca8a04' : '#dc2626'} />
                        <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {side.tasks.map((c, ci) => (
                            <div key={ci} style={{ display: 'flex', gap: '0.4rem', fontSize: '0.75rem', color: c.done ? '#15803d' : '#dc2626' }}>
                              <span style={{ flexShrink: 0 }}>{c.done ? '✓' : '✗'}</span><span>{c.task}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                    {h.penaltyOwed > 0 && <span style={{ color: '#dc2626' }}>You paid: ₹{h.penaltyOwed} → {penaltyTarget(partner)}</span>}
                    {h.penaltyRecovered > 0 && <span style={{ color: '#16a34a' }}>{partner.name.split(' ')[0]} paid: ₹{h.penaltyRecovered}</span>}
                    {h.penaltyOwed === 0 && h.penaltyRecovered === 0 && <span style={{ color: '#16a34a' }}>✓ No penalties — both kept their word!</span>}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TodayPage() {
  const {
    tasks, toggleTask, exams, threads, userTier,
    profileCompletion, missingFields,
    partners, nudgePartner, toggleMyCommitment, submitCheckIn,
  } = useApp();

  const [today,        setToday]       = useState('');
  const [toast,        setToast]       = useState('');
  const [checkInId,    setCheckInId]   = useState<number | null>(null);
  const [snapshotId,   setSnapshotId]  = useState<number | null>(null);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const doneCount         = tasks.filter(t => t.done).length;
  const totalPlannedHours = tasks.reduce((s, t) => s + t.hours, 0);
  const doneHours         = tasks.filter(t => t.done).reduce((s, t) => s + t.hours, 0);
  const urgentExams       = exams
    .filter(e => e.status !== 'Not applied' && e.applicationStatus !== 'notification_awaited')
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 3);
  const recentThreads  = threads.slice(0, 3);
  const activePartners = partners.filter(p => p.status === 'active');

  const nextAction = (() => {
    const notApplied = exams.find(e =>
      e.eligibility === 'Eligible' && e.applicationStatus === 'not_started' &&
      Math.ceil((new Date(e.deadline).getTime() - Date.now()) / 86400000) <= 30
    );
    if (notApplied) return { title: notApplied.name, msg: `Application closes in ${Math.ceil((new Date(notApplied.deadline).getTime() - Date.now()) / 86400000)} days. You haven't applied yet.`, href: '/exams', cta: 'View Exam' };
    const pending = tasks.find(t => !t.done);
    if (pending) return { title: pending.topic, msg: `${pending.subject} · ${pending.hours}h planned today`, href: '/study', cta: 'Start Session' };
    return { title: 'Review your mock test scores', msg: 'Analyse weak areas and adjust your plan for next week.', href: '/study', cta: 'Go to Study' };
  })();

  const checkInPartner   = checkInId  ? partners.find(p => p.id === checkInId)  : null;
  const snapshotPartner  = snapshotId ? partners.find(p => p.id === snapshotId) : null;

  const handleSubmitCheckIn = (partnerId: number) => {
    submitCheckIn(partnerId, 'Apr 28–May 4');
    setCheckInId(null);
    showToast('Check-in submitted! Your weekly snapshot is saved.');
  };

  return (
    <div className="page">
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1f2937', color: '#fff', padding: '0.75rem 1.25rem', borderRadius: 10, fontWeight: 500, fontSize: '0.9rem', zIndex: 500, boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      )}

      {checkInPartner && (
        <CheckInModal
          partner={checkInPartner}
          onToggle={(cid) => toggleMyCommitment(checkInPartner.id, cid)}
          onSubmit={() => handleSubmitCheckIn(checkInPartner.id)}
          onClose={() => setCheckInId(null)}
        />
      )}
      {snapshotPartner && (
        <SnapshotModal partner={snapshotPartner} onClose={() => setSnapshotId(null)} />
      )}

      <div className="page-header">
        <h1>Today</h1>
        <p suppressHydrationWarning>{today}</p>
      </div>

      {/* Next Best Action */}
      <div className="next-action-card" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ marginBottom: '0.1rem' }}>⚡ Next Best Action</h2>
        <p style={{ marginBottom: '0.75rem' }}><strong style={{ color: '#fff' }}>{nextAction.title}</strong> — {nextAction.msg}</p>
        <a href={nextAction.href} className="btn" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', fontSize: '0.82rem' }}>
          {nextAction.cta} →
        </a>
      </div>

      {/* Stats row */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
          {[
            { value: urgentExams.length, label: 'Active applications' },
            { value: `${doneCount}/${tasks.length}`, label: 'Tasks done this week' },
            { value: '14d 🔥', label: 'Study streak' },
            { value: exams.filter(e => e.applicationStatus === 'applied').length, label: 'Applications filed' },
          ].map((s, i) => (
            <div className="stat-block" key={i}>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Truth Panel */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <h2>📊 Weekly Truth Panel</h2>
        <div className="truth-panel">
          {[
            { value: `${doneHours}h`, label: 'Study hours done', sub: `of ${totalPlannedHours}h planned`, subColor: doneHours >= totalPlannedHours * 0.8 ? '#16a34a' : '#ca8a04' },
            { value: `${Math.round((doneCount / tasks.length) * 100)}%`, label: 'Task completion', sub: `${doneCount} of ${tasks.length} tasks`, subColor: '#4f46e5' },
            { value: '84th', label: 'Mock percentile', sub: 'Last test: Apr 28', subColor: '#059669' },
            { value: `${100 - Math.round((doneCount / tasks.length) * 100)}%`, label: 'Backlog risk', sub: tasks.filter(t => !t.done).length > 0 ? `${tasks.filter(t => !t.done).length} topics behind` : 'On track', subColor: doneCount >= tasks.length * 0.8 ? '#16a34a' : '#dc2626' },
          ].map((item, i) => (
            <div className="truth-panel-item" key={i}>
              <div className="truth-panel-value">{item.value}</div>
              <div className="truth-panel-label">{item.label}</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 500, color: item.subColor, marginTop: '0.2rem' }}>{item.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Accountability Partners */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>🤝 Accountability Partners</h2>
          <a href="/profile" style={{ fontSize: '0.8rem', color: '#4f46e5', fontWeight: 500 }}>Manage →</a>
        </div>

        {userTier === 'free' ? (
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', background: '#f5f3ff', borderRadius: 10, padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '2rem' }}>🤝</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#4f46e5', marginBottom: '0.25rem' }}>Task-based accountability with a study partner</div>
              <div style={{ fontSize: '0.83rem', color: '#6b7280' }}>Commit to weekly tasks together, check in each Sunday, see each other's snapshot — and pay a penalty (NGO donation or cash) if you fall short.</div>
            </div>
            <a href="/profile" className="btn btn-upgrade" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', flexShrink: 0 }}>Upgrade to Pro</a>
          </div>
        ) : activePartners.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#9ca3af' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🤝</div>
            <div style={{ fontWeight: 500, marginBottom: '0.5rem', color: '#374151' }}>No active partners yet</div>
            <div style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>Invite an aspirant, set weekly commitments, and hold each other accountable.</div>
            <a href="/profile" className="btn btn-primary" style={{ fontSize: '0.85rem' }}>Add Partner →</a>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {activePartners.map(p => {
              const myDone    = p.myCommitments.filter(c => c.done).length;
              const myTotal   = p.myCommitments.length;
              const myRate    = myTotal > 0 ? Math.round((myDone / myTotal) * 100) : 0;
              const myMissed  = myTotal - myDone;
              const pDone     = p.partnerCommitments.filter(c => c.done).length;
              const pTotal    = p.partnerCommitments.length;
              const pRate     = pTotal > 0 ? Math.round((pDone / pTotal) * 100) : 0;
              const pMissed   = pTotal - pDone;

              return (
                <div key={p.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '1rem' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div className="avatar" style={{ width: 42, height: 42, fontSize: '0.95rem', flexShrink: 0 }}>{p.initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1f2937' }}>{p.name}</span>
                        {p.checkedInThisWeek && <span className="tag tag-green" style={{ fontSize: '0.68rem' }}>✓ Checked in</span>}
                        {!p.checkedInThisWeek && <span className="tag tag-yellow" style={{ fontSize: '0.68rem' }}>⏳ Pending check-in</span>}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' }}>{p.exam} · 🔥 {p.streak}d streak · Last active {p.lastActive}</div>
                    </div>
                  </div>

                  {/* Shared goal */}
                  <div style={{ background: '#f0f9ff', borderRadius: 7, padding: '0.5rem 0.75rem', marginBottom: '0.85rem', fontSize: '0.78rem', color: '#0369a1' }}>
                    <span style={{ fontWeight: 600 }}>🎯 Shared goal: </span>{p.sharedGoal}
                  </div>

                  {/* This week's agreement — side by side */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
                    {/* My side */}
                    <div style={{ border: '1px solid #4f46e520', borderRadius: 8, padding: '0.65rem', background: '#f9f9ff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.75rem', color: '#4f46e5' }}>YOU</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: myRate >= 80 ? '#16a34a' : '#dc2626' }}>{myTotal > 0 ? `${myDone}/${myTotal} (${myRate}%)` : 'No tasks yet'}</span>
                      </div>
                      {myTotal > 0 && <RateBar rate={myRate} color={myRate >= 80 ? '#16a34a' : myRate >= 50 ? '#ca8a04' : '#dc2626'} />}
                      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {p.myCommitments.slice(0, 4).map(c => (
                          <div key={c.id} style={{ display: 'flex', gap: '0.35rem', fontSize: '0.73rem', color: c.done ? '#15803d' : '#6b7280' }}>
                            <span style={{ flexShrink: 0, fontWeight: 700 }}>{c.done ? '✓' : '○'}</span>
                            <span style={{ textDecoration: c.done ? 'line-through' : 'none' }}>{c.task}</span>
                          </div>
                        ))}
                        {myTotal === 0 && <div style={{ fontSize: '0.73rem', color: '#9ca3af' }}>Set commitments in Profile</div>}
                      </div>
                    </div>

                    {/* Partner's side */}
                    <div style={{ border: '1px solid #7c3aed20', borderRadius: 8, padding: '0.65rem', background: '#faf9ff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.75rem', color: '#7c3aed' }}>{p.name.split(' ')[0].toUpperCase()}</span>
                        {p.partnerCheckedIn
                          ? <span style={{ fontSize: '0.72rem', fontWeight: 700, color: pRate >= 80 ? '#16a34a' : '#dc2626' }}>{pTotal > 0 ? `${pDone}/${pTotal} (${pRate}%)` : '—'}</span>
                          : <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600 }}>⏳ Awaiting</span>}
                      </div>
                      {p.partnerCheckedIn && pTotal > 0 && <RateBar rate={pRate} color={pRate >= 80 ? '#16a34a' : pRate >= 50 ? '#ca8a04' : '#dc2626'} />}
                      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {p.partnerCommitments.slice(0, 4).map((c, i) => (
                          <div key={i} style={{ display: 'flex', gap: '0.35rem', fontSize: '0.73rem', color: p.partnerCheckedIn ? (c.done ? '#15803d' : '#dc2626') : '#9ca3af' }}>
                            <span style={{ flexShrink: 0, fontWeight: 700 }}>{p.partnerCheckedIn ? (c.done ? '✓' : '✗') : '○'}</span>
                            <span>{c.task}</span>
                          </div>
                        ))}
                        {pTotal === 0 && <div style={{ fontSize: '0.73rem', color: '#9ca3af' }}>No commitments set</div>}
                      </div>
                    </div>
                  </div>

                  {/* Penalty display */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 7, background: '#fffbeb', border: '1px solid #fde68a', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.78rem', color: '#92400e', fontWeight: 500 }}>
                      ⚖ ₹{p.penaltyAmount}/missed task
                    </span>
                    <span style={{ fontSize: '0.73rem', color: '#9ca3af' }}>→</span>
                    <span style={{ fontSize: '0.78rem', color: '#92400e' }}>
                      {p.penaltyType === 'ngo' ? `${p.penaltyNgo || 'NGO'} (donation)` : `${p.name.split(' ')[0]} (cash)`}
                    </span>
                    {!p.checkedInThisWeek && myMissed > 0 && (
                      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>
                        Est. owed: ₹{myMissed * p.penaltyAmount}
                      </span>
                    )}
                    {p.checkedInThisWeek && pMissed > 0 && (
                      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>
                        {p.name.split(' ')[0]} owes ₹{pMissed * p.penaltyAmount} to you
                      </span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {!p.checkedInThisWeek ? (
                      <button className="btn btn-primary" style={{ flex: 1, fontSize: '0.82rem' }} onClick={() => setCheckInId(p.id)}>
                        📋 Check In Now
                      </button>
                    ) : (
                      <button className="btn btn-outline" style={{ flex: 1, fontSize: '0.82rem' }} disabled style={{ opacity: 0.6 }}>
                        ✓ Checked In
                      </button>
                    )}
                    <button className="btn btn-outline" style={{ flex: 1, fontSize: '0.82rem' }} onClick={() => setSnapshotId(p.id)}>
                      📸 View Snapshot
                    </button>
                    <button
                      className={`btn ${p.nudged ? 'btn-outline' : 'btn-outline'}`}
                      style={{ fontSize: '0.82rem', opacity: p.nudged ? 0.5 : 1 }}
                      disabled={p.nudged}
                      onClick={() => { nudgePartner(p.id); showToast(`Nudge sent to ${p.name.split(' ')[0]}! 👋`); }}
                    >
                      {p.nudged ? '👋 Sent' : '👋 Nudge'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
        {/* Exam deadlines */}
        <div className="card">
          <h2>⚡ Active Exam Deadlines</h2>
          {urgentExams.length === 0 && (
            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>No active applications. <a href="/exams" style={{ color: '#4f46e5' }}>Browse exams →</a></p>
          )}
          {urgentExams.map((e, i) => (
            <div className="list-item" key={i}>
              <div style={{ flex: 1 }}>
                <div className="list-item-title">{e.name}</div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <CountdownBadge deadline={e.deadline} />
                  <span className={`tag ${statusTag[e.status] || 'tag-gray'}`}>{e.status}</span>
                </div>
              </div>
              <a href="/exams" className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '0.25rem 0.65rem', flexShrink: 0 }}>View →</a>
            </div>
          ))}
          {urgentExams.length > 0 && (
            <a href="/exams" style={{ display: 'block', textAlign: 'center', marginTop: '0.75rem', fontSize: '0.82rem', color: '#4f46e5', fontWeight: 500 }}>
              View all {exams.length} exams →
            </a>
          )}
        </div>

        {/* Streak */}
        <div className="card">
          <h2>🔥 Study Streak</h2>
          <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
            <div style={{ fontSize: '2.75rem' }}>🎯</div>
            <div style={{ fontWeight: 700, fontSize: '1.75rem', marginTop: '0.25rem', color: '#4f46e5' }}>14 days</div>
            <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.25rem' }}>Keep it going!</div>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.3rem' }}>
              <span>Weekly goal</span><span>{doneCount}/7 days</span>
            </div>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${(doneCount / tasks.length) * 100}%` }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '0.75rem' }}>
            {tasks.map(t => (
              <div key={t.id} style={{ textAlign: 'center' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: t.done ? '#4f46e5' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', color: t.done ? '#fff' : '#9ca3af', fontWeight: 600 }}>
                  {t.done ? '✓' : t.day[0]}
                </div>
                <div style={{ fontSize: '0.62rem', color: '#9ca3af', marginTop: '0.2rem' }}>{t.day[0]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
        {/* Tasks */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>📚 Study Tasks</h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{doneCount}/{tasks.length}</span>
              <a href="/study" style={{ fontSize: '0.8rem', color: '#4f46e5', fontWeight: 500 }}>All →</a>
            </div>
          </div>
          <div className="progress-bar-track" style={{ marginBottom: '1rem' }}>
            <div className="progress-bar-fill" style={{ width: `${(doneCount / tasks.length) * 100}%`, transition: 'width 0.3s' }} />
          </div>
          {tasks.map(t => (
            <div key={t.id} className="list-item" style={{ alignItems: 'center', cursor: 'pointer' }} onClick={() => toggleTask(t.id)}>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flex: 1 }}>
                <span style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: `2px solid ${t.done ? '#4f46e5' : '#d1d5db'}`, background: t.done ? '#4f46e5' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                  {t.done && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}
                </span>
                <div>
                  <div className="list-item-title" style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? '#9ca3af' : '#1f2937', transition: 'all 0.2s' }}>{t.topic}</div>
                  <div className="list-item-sub">{t.subject} · {t.hours}h</div>
                </div>
              </div>
              {!t.done && <a href="/study" onClick={e => e.stopPropagation()} className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem' }}>Study →</a>}
            </div>
          ))}
          {doneCount === tasks.length && (
            <div style={{ textAlign: 'center', marginTop: '1rem', padding: '0.75rem', background: '#dcfce7', borderRadius: 8, color: '#16a34a', fontWeight: 600, fontSize: '0.9rem' }}>🎉 All tasks complete!</div>
          )}
        </div>

        {/* Community */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>💬 Community</h2>
            <a href="/community" style={{ fontSize: '0.8rem', color: '#4f46e5', fontWeight: 500 }}>View all →</a>
          </div>
          {recentThreads.map(t => (
            <div className="list-item" key={t.id}>
              <div className="avatar" style={{ position: 'relative' }}>
                {t.initials}
                {t.verifiedTopper && <span style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, background: '#059669', borderRadius: '50%', border: '1.5px solid #fff', fontSize: '0.55rem', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="list-item-title">{t.author}</span>
                  <span style={{ fontSize: '0.73rem', color: '#d1d5db' }}>{t.time}</span>
                </div>
                <div className="list-item-sub" style={{ marginTop: '0.15rem', lineHeight: 1.4 }}>{t.preview.slice(0, 70)}…</div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.3rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                  <span>{t.liked ? '❤️' : '🤍'} {t.likes}</span><span>💬 {t.replies.length}</span>
                </div>
              </div>
            </div>
          ))}
          <a href="/community" className="btn btn-outline" style={{ display: 'block', width: '100%', textAlign: 'center', marginTop: '0.75rem' }}>Join Discussion</a>
        </div>
      </div>

      {/* Profile completion */}
      <div className="card" style={{ borderLeft: `4px solid ${profileCompletion >= 80 ? '#16a34a' : '#f59e0b'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, marginBottom: '0.5rem' }}>
              {profileCompletion >= 80 ? '✅' : '⚠️'} Profile Completion — {profileCompletion}%
            </h2>
            <div className="completion-bar-wrap" style={{ maxWidth: 320 }}>
              <div className="completion-bar-fill" style={{ width: `${profileCompletion}%` }} />
            </div>
            <p style={{ marginTop: '0.5rem', fontSize: '0.83rem', color: '#6b7280' }}>
              {missingFields.length > 0
                ? <>Complete <strong>{missingFields.join(', ')}</strong> to unlock eligibility matching for more exams.</>
                : 'Profile is complete. Eligibility matching is fully active.'}
            </p>
          </div>
          <a href="/profile" className="btn btn-outline" style={{ marginLeft: '1rem', fontSize: '0.8rem', flexShrink: 0 }}>Complete Profile →</a>
        </div>
      </div>
    </div>
  );
}
