'use client';
import React, { useState } from 'react';
import { useApp, AccountabilityPartner } from '../context/AppContext';

const initialProfile = {
  name: 'Rohit Verma', email: 'rohit.verma@gmail.com', joined: 'January 2024',
  dob: '1998-03-14', qualification: 'B.Tech — Computer Science',
  university: 'Delhi Technological University', gradYear: '2020',
  category: 'General', domicile: '', pwbd: '', exServiceman: '', upscAttempts: '2',
  studyGoal: '4', studyTime: '06:00', emailNotifications: true,
  deadlineReminder: '7', communityDigest: 'Daily',
};

const targetExamOptions = [
  { name: 'UPSC CSE 2026',   tag: 'tag-purple' },
  { name: 'RBI Grade B 2026', tag: 'tag-blue' },
  { name: 'SSC CGL 2026',    tag: 'tag-gray' },
  { name: 'IBPS PO 2026',    tag: 'tag-green' },
  { name: 'SEBI Grade A 2026', tag: 'tag-yellow' },
];

const initialTargetExams = [
  { name: 'UPSC CSE 2026',    priority: 'Primary',   tag: 'tag-purple' },
  { name: 'RBI Grade B 2026', priority: 'Secondary', tag: 'tag-blue'   },
  { name: 'SSC CGL 2026',     priority: 'Backup',    tag: 'tag-gray'   },
];

const achievements = [
  { label: 'Study Streak',    value: '14 days 🔥' },
  { label: 'Mock Tests',      value: '47'         },
  { label: 'Community Posts', value: '23'         },
  { label: 'Avg Mock Score',  value: '74%'        },
  { label: 'Resources Done',  value: '8'          },
  { label: 'Exams Tracked',   value: '6'          },
];

const TIER_FEATURES: Record<string, string[]> = {
  free: [
    'Basic dashboard', 'Exam browsing (limited)', 'Forum reading + 5 posts/day',
    'Apply tracker (manual)', 'Eligibility preview (count only)',
  ],
  pro: [
    'Everything in Free', 'Full eligibility engine + "why" explanations',
    'AI study plan generation', 'Personalised match alerts',
    'Forum: unlimited posting', 'Study group creation (up to 3)',
    '1 accountability partner (commitment-based)', 'PYQ trend charts',
    'Cutoff & vacancy analytics', 'Mentor session booking',
  ],
  elite: [
    'Everything in Pro', 'AI Career Chat (unlimited)',
    'Advanced PYQ analytics (topic-level heatmap)',
    'Downloadable study plan + weekly review PDF',
    'Study group up to 8 members', 'Up to 3 accountability partners',
    '1 mentor session included/month', 'Priority support', 'Early access',
  ],
};

const PARTNER_LIMIT: Record<string, number> = { free: 0, pro: 1, elite: 3 };

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  active:  { bg: '#dcfce7', color: '#15803d', label: '● Active'  },
  pending: { bg: '#fef9c3', color: '#854d0e', label: '◌ Pending' },
  invited: { bg: '#f3f4f6', color: '#6b7280', label: '→ Invited' },
};

function SmallBar({ rate, color }: { rate: number; color: string }) {
  return (
    <div style={{ background: '#f3f4f6', borderRadius: 99, height: 5, flex: 1 }}>
      <div style={{ width: `${rate}%`, height: '100%', borderRadius: 99, background: color, transition: 'width 0.4s' }} />
    </div>
  );
}

function PartnerCard({
  p, showToast, addMyCommitment, removeMyCommitment, setPenalty, updateSharedGoal, removePartner,
}: {
  p: AccountabilityPartner;
  showToast: (m: string) => void;
  addMyCommitment: (pid: number, task: string) => void;
  removeMyCommitment: (pid: number, cid: number) => void;
  setPenalty: (pid: number, type: 'ngo' | 'partner', amount: number, ngo: string) => void;
  updateSharedGoal: (pid: number, goal: string) => void;
  removePartner: (pid: number) => void;
}) {
  const st = STATUS_COLORS[p.status];
  const [expanded,      setExpanded]     = useState(false);
  const [newTask,       setNewTask]      = useState('');
  const [editGoal,      setEditGoal]     = useState(false);
  const [goalDraft,     setGoalDraft]    = useState(p.sharedGoal);
  const [penType,       setPenType]      = useState<'ngo' | 'partner'>(p.penaltyType);
  const [penAmount,     setPenAmount]    = useState(String(p.penaltyAmount));
  const [penNgo,        setPenNgo]       = useState(p.penaltyNgo);
  const [editingPenalty, setEditingPenalty] = useState(false);

  const doneCount = p.myCommitments.filter(c => c.done).length;
  const rate = p.myCommitments.length > 0 ? Math.round((doneCount / p.myCommitments.length) * 100) : 0;

  const handleAddTask = () => {
    if (!newTask.trim()) return;
    addMyCommitment(p.id, newTask.trim());
    setNewTask('');
    showToast('Commitment added!');
  };

  const handleSaveGoal = () => {
    updateSharedGoal(p.id, goalDraft);
    setEditGoal(false);
    showToast('Shared goal updated!');
  };

  const handleSavePenalty = () => {
    const amount = Math.max(1, parseInt(penAmount) || 0);
    setPenalty(p.id, penType, amount, penNgo);
    setEditingPenalty(false);
    showToast('Penalty agreement saved!');
  };

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '1rem', background: expanded ? '#f9fafb' : '#fff' }}>
        <div className="avatar" style={{ width: 44, height: 44, fontSize: '0.95rem', flexShrink: 0 }}>{p.initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1f2937' }}>{p.name}</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.1rem 0.5rem', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' }}>
            {p.exam} · Last active: {p.lastActive}
            {p.status === 'active' && ` · 🔥 ${p.streak}d streak`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
          <button onClick={() => setExpanded(e => !e)}
            style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', color: '#6b7280', fontSize: '0.78rem', padding: '0.3rem 0.65rem', fontWeight: 500 }}>
            {expanded ? '▲ Less' : '▼ Manage'}
          </button>
          <button onClick={() => { removePartner(p.id); showToast(`Removed ${p.name}.`); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '1rem', padding: '0.3rem', lineHeight: 1 }} title="Remove">✕</button>
        </div>
      </div>

      {/* Compact summary (always visible) */}
      <div style={{ padding: '0 1rem 0.85rem', borderTop: '1px solid #f3f4f6' }}>
        <div style={{ paddingTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {/* Shared goal */}
          <div style={{ fontSize: '0.78rem', color: '#0369a1', background: '#f0f9ff', borderRadius: 6, padding: '0.4rem 0.65rem' }}>
            <span style={{ fontWeight: 600 }}>🎯 Goal: </span>{p.sharedGoal}
          </div>
          {/* Penalty summary */}
          <div style={{ fontSize: '0.78rem', color: '#92400e', background: '#fffbeb', borderRadius: 6, padding: '0.4rem 0.65rem' }}>
            <span style={{ fontWeight: 600 }}>⚖ Penalty: </span>
            ₹{p.penaltyAmount}/missed task →{' '}
            {p.penaltyType === 'ngo' ? `${p.penaltyNgo || '—'} (NGO)` : `${p.name.split(' ')[0]} (cash)`}
          </div>
          {/* This week progress */}
          {p.status === 'active' && p.myCommitments.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#374151' }}>
              <span style={{ flexShrink: 0 }}>This week:</span>
              <SmallBar rate={rate} color={rate >= 80 ? '#16a34a' : rate >= 50 ? '#ca8a04' : '#dc2626'} />
              <span style={{ flexShrink: 0, fontWeight: 700, color: rate >= 80 ? '#16a34a' : '#dc2626' }}>{doneCount}/{p.myCommitments.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded management section */}
      {expanded && (
        <div style={{ borderTop: '2px solid #f3f4f6', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', background: '#fafafa' }}>

          {/* ── Shared goal editor ── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Shared goal</div>
              {!editGoal && <button onClick={() => { setGoalDraft(p.sharedGoal); setEditGoal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4f46e5', fontSize: '0.78rem', fontWeight: 500 }}>Edit</button>}
            </div>
            {editGoal ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input style={{ flex: 1, padding: '0.45rem 0.65rem', border: '1px solid #4f46e5', borderRadius: 8, fontSize: '0.85rem', outline: 'none' }}
                  value={goalDraft} onChange={e => setGoalDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveGoal(); if (e.key === 'Escape') setEditGoal(false); }} />
                <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }} onClick={handleSaveGoal}>Save</button>
                <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }} onClick={() => setEditGoal(false)}>✕</button>
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', color: '#374151', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.5rem 0.75rem', lineHeight: 1.5 }}>{p.sharedGoal}</div>
            )}
          </div>

          {/* ── Weekly commitments editor ── */}
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
              This week's commitments ({p.myCommitments.length})
            </div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.6rem' }}>
              These are the tasks you promise to complete. Your partner sees them and checks your progress each Sunday.
            </div>
            {p.myCommitments.length === 0 ? (
              <div style={{ color: '#9ca3af', fontSize: '0.83rem', padding: '0.5rem 0', textAlign: 'center' }}>No commitments yet — add what you'll do this week.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.6rem' }}>
                {p.myCommitments.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: 8, background: c.done ? '#f0fdf4' : '#fff', border: `1px solid ${c.done ? '#bbf7d0' : '#e5e7eb'}` }}>
                    <span style={{ fontSize: '0.85rem', color: c.done ? '#15803d' : '#374151', flex: 1, textDecoration: c.done ? 'line-through' : 'none' }}>{c.task}</span>
                    {c.done && <span style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600 }}>✓ Done</span>}
                    <button onClick={() => { removeMyCommitment(p.id, c.id); showToast('Commitment removed.'); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '0.9rem', padding: '0 0.2rem', lineHeight: 1, flexShrink: 0 }} title="Remove">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                style={{ flex: 1, padding: '0.45rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.85rem', outline: 'none' }}
                placeholder="e.g. Complete Polity chapters 15–18"
                value={newTask} onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); }} />
              <button className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem' }} onClick={handleAddTask} disabled={!newTask.trim()}>
                + Add
              </button>
            </div>
          </div>

          {/* ── Penalty agreement ── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Penalty agreement</div>
              {!editingPenalty && (
                <button onClick={() => { setPenType(p.penaltyType); setPenAmount(String(p.penaltyAmount)); setPenNgo(p.penaltyNgo); setEditingPenalty(true); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4f46e5', fontSize: '0.78rem', fontWeight: 500 }}>Edit</button>
              )}
            </div>
            {editingPenalty ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', padding: '0.85rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10 }}>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6b7280', marginBottom: '0.35rem' }}>Penalty type</div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {(['ngo', 'partner'] as const).map(t => (
                      <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.85rem', borderRadius: 8, border: `1.5px solid ${penType === t ? '#4f46e5' : '#e5e7eb'}`, background: penType === t ? '#f5f3ff' : '#fff', cursor: 'pointer', fontSize: '0.83rem', color: '#374151' }}>
                        <input type="radio" name={`pentype-${p.id}`} value={t} checked={penType === t} onChange={() => setPenType(t)} style={{ accentColor: '#4f46e5' }} />
                        {t === 'ngo' ? '🏛 Donate to NGO' : '💸 Pay to partner'}
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: penType === 'ngo' ? '1fr 2fr' : '1fr', gap: '0.65rem' }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6b7280', marginBottom: '0.25rem' }}>₹ per missed task</div>
                    <input type="number" min={1} style={{ width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
                      value={penAmount} onChange={e => setPenAmount(e.target.value)} />
                  </div>
                  {penType === 'ngo' && (
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6b7280', marginBottom: '0.25rem' }}>NGO name</div>
                      <input style={{ width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
                        placeholder="e.g. CRY India, HelpAge India"
                        value={penNgo} onChange={e => setPenNgo(e.target.value)} />
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-primary" style={{ flex: 1, fontSize: '0.82rem' }} onClick={handleSavePenalty}>Save Agreement</button>
                  <button className="btn btn-outline" style={{ fontSize: '0.82rem' }} onClick={() => setEditingPenalty(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '0.75rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.83rem' }}>
                <div><span style={{ color: '#9ca3af' }}>Amount: </span><strong style={{ color: '#92400e' }}>₹{p.penaltyAmount}/missed task</strong></div>
                <div><span style={{ color: '#9ca3af' }}>Type: </span><strong style={{ color: '#92400e' }}>{p.penaltyType === 'ngo' ? '🏛 NGO donation' : '💸 Pay to partner'}</strong></div>
                {p.penaltyType === 'ngo' && p.penaltyNgo && (
                  <div><span style={{ color: '#9ca3af' }}>NGO: </span><strong style={{ color: '#92400e' }}>{p.penaltyNgo}</strong></div>
                )}
              </div>
            )}
          </div>

          {/* ── Partner's commitments (read-only) ── */}
          {p.partnerCommitments.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                {p.name.split(' ')[0]}'s commitments (this week)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {p.partnerCommitments.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.75rem', borderRadius: 8, background: c.done ? '#f0fdf4' : '#fff7ed', border: `1px solid ${c.done ? '#bbf7d0' : '#fed7aa'}`, fontSize: '0.82rem' }}>
                    <span style={{ fontWeight: 700, color: c.done ? '#15803d' : '#ea580c' }}>{c.done ? '✓' : '✗'}</span>
                    <span style={{ color: c.done ? '#15803d' : '#92400e' }}>{c.task}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.4rem' }}>
                Partner checked in: {p.partnerCheckedIn ? 'Yes' : 'Not yet this week'}
              </div>
            </div>
          )}

          {/* ── Week history ── */}
          {p.weekHistory.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>Past weeks</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {p.weekHistory.slice(0, 2).map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.55rem 0.85rem', borderRadius: 8, background: '#fff', border: '1px solid #e5e7eb', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: 600, color: '#374151', minWidth: 80 }}>{h.weekLabel}</span>
                    <span style={{ color: h.myRate >= 80 ? '#16a34a' : '#dc2626' }}>You: {h.myRate}%</span>
                    <span style={{ color: h.partnerRate >= 80 ? '#16a34a' : '#dc2626' }}>{p.name.split(' ')[0]}: {h.partnerRate}%</span>
                    {h.penaltyOwed > 0 && <span style={{ color: '#dc2626' }}>You paid ₹{h.penaltyOwed}</span>}
                    {h.penaltyRecovered > 0 && <span style={{ color: '#16a34a' }}>Received ₹{h.penaltyRecovered}</span>}
                    {h.penaltyOwed === 0 && h.penaltyRecovered === 0 && <span style={{ color: '#16a34a' }}>✓ No penalties</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const {
    userTier, setUserTier, profileCompletion, missingFields,
    partners, addPartner, removePartner, nudgePartner, updateSharedGoal,
    addMyCommitment, removeMyCommitment, setPenalty,
  } = useApp();

  const [profile,     setProfile]    = useState(initialProfile);
  const [editMode,    setEditMode]   = useState<'none' | 'info' | 'prefs'>('none');
  const [draft,       setDraft]      = useState(initialProfile);
  const [targetExams, setTargetExams] = useState(initialTargetExams);
  const [showAddExam, setShowAddExam] = useState(false);
  const [toast,       setToast]      = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Invite state
  const [showInvite,   setShowInvite]   = useState(false);
  const [inviteName,   setInviteName]   = useState('');
  const [inviteExam,   setInviteExam]   = useState('UPSC CSE 2026');
  const [inviteGoal,   setInviteGoal]   = useState('');
  const [invitePenType, setInvitePenType] = useState<'ngo' | 'partner'>('ngo');
  const [invitePenAmt,  setInvitePenAmt]  = useState('100');
  const [invitePenNgo,  setInvitePenNgo]  = useState('CRY India');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3200); };
  const saveInfo  = () => { setProfile(draft); setEditMode('none'); showToast('Profile updated!'); };
  const savePrefs = () => { setProfile(draft); setEditMode('none'); showToast('Preferences saved!'); };
  const cancelEdit = () => { setDraft(profile); setEditMode('none'); };

  const addExam = (name: string, tag: string) => {
    if (targetExams.find(e => e.name === name)) return;
    const priorities = ['Primary', 'Secondary', 'Backup', 'Optional'];
    setTargetExams(prev => [...prev, { name, tag, priority: priorities[Math.min(prev.length, 3)] }]);
    setShowAddExam(false);
  };
  const removeExam = (name: string) => setTargetExams(prev => prev.filter(e => e.name !== name));

  const handleInvite = () => {
    if (!inviteName.trim() || !inviteGoal.trim()) return;
    addPartner(
      inviteName.trim(), inviteExam, inviteGoal.trim(),
      invitePenType, parseInt(invitePenAmt) || 100, invitePenNgo.trim(),
    );
    setInviteName(''); setInviteExam('UPSC CSE 2026');
    setInviteGoal(''); setInvitePenType('ngo'); setInvitePenAmt('100'); setInvitePenNgo('CRY India');
    setShowInvite(false);
    showToast(`Invite sent to ${inviteName.trim()}!`);
  };

  const age = Math.floor((Date.now() - new Date(profile.dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  const partnerLimit = PARTNER_LIMIT[userTier];
  const canAddPartner = userTier !== 'free' && partners.length < partnerLimit;

  const completionFields = [
    { label: 'Date of Birth',     filled: !!profile.dob         },
    { label: 'Qualification',     filled: !!profile.qualification },
    { label: 'Category',          filled: !!profile.category     },
    { label: 'State Domicile',    filled: !!profile.domicile     },
    { label: 'PwBD Status',       filled: !!profile.pwbd         },
    { label: 'Ex-Serviceman',     filled: !!profile.exServiceman },
    { label: 'Target Exams',      filled: targetExams.length > 0 },
    { label: 'UPSC Attempts',     filled: !!profile.upscAttempts },
    { label: 'Study Preferences', filled: !!profile.studyGoal    },
    { label: 'Email',             filled: !!profile.email        },
  ];
  const filledCount   = completionFields.filter(f => f.filled).length;
  const completionPct = Math.round((filledCount / completionFields.length) * 100);

  return (
    <div className="page">
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1f2937', color: '#fff', padding: '0.75rem 1.25rem', borderRadius: 10, fontWeight: 500, fontSize: '0.9rem', zIndex: 500, boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>{toast}</div>
      )}

      {/* Upgrade modal */}
      {showUpgrade && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowUpgrade(false)}>
          <div className="card" style={{ width: 580, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h2>📦 Choose Your Plan</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
              {(['free', 'pro', 'elite'] as const).map(tier => (
                <div key={tier} style={{ border: `2px solid ${userTier === tier ? '#4f46e5' : '#e5e7eb'}`, borderRadius: 10, padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span className={`tier-badge tier-${tier}`}>{tier === 'free' ? '○ Free' : tier === 'pro' ? '◆ Pro' : '★ Elite'}</span>
                    {userTier === tier && <span className="tag tag-green" style={{ fontSize: '0.68rem' }}>Current</span>}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1f2937', marginBottom: '0.25rem' }}>{tier === 'free' ? '₹0' : tier === 'pro' ? '₹399/mo' : '₹799/mo'}</div>
                  <ul style={{ fontSize: '0.78rem', color: '#374151', lineHeight: 1.8, paddingLeft: '1rem' }}>
                    {TIER_FEATURES[tier].slice(0, 5).map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                  {tier !== userTier && (
                    <button className={`btn ${tier === 'elite' ? 'btn-upgrade' : 'btn-primary'}`}
                      style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.82rem' }}
                      onClick={() => { setUserTier(tier); setShowUpgrade(false); showToast(`Switched to ${tier} plan (demo).`); }}>
                      {tier === 'free' ? 'Downgrade' : `Upgrade to ${tier.charAt(0).toUpperCase() + tier.slice(1)}`}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center' }}>Demo only — no real payments.</div>
          </div>
        </div>
      )}

      {/* Profile header */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div className="avatar" style={{ width: 72, height: 72, fontSize: '1.75rem', flexShrink: 0 }}>
          {profile.name.split(' ').map((n: string) => n[0]).join('')}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>{profile.name}</h1>
            <span className={`tier-badge tier-${userTier}`}>{userTier === 'free' ? '○ Free' : userTier === 'pro' ? '◆ Pro' : '★ Elite'}</span>
          </div>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: '0.3rem 0 0.5rem' }}>{profile.email} · Joined {profile.joined}</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="tag tag-purple">UPSC Aspirant</span>
            {userTier !== 'free' && <span className="tag tag-green">{userTier === 'elite' ? '★ Elite Member' : '◆ Pro Member'}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setShowUpgrade(true)}>{userTier === 'free' ? '⬆ Upgrade' : '📦 Manage Plan'}</button>
          <button className="btn btn-outline" onClick={() => { setDraft(profile); setEditMode('info'); }}>Edit Info</button>
          <button className="btn btn-outline" onClick={() => { setDraft(profile); setEditMode('prefs'); }}>Edit Prefs</button>
        </div>
      </div>

      {/* Profile completion */}
      <div className="card" style={{ marginBottom: '1.25rem', borderLeft: `4px solid ${completionPct >= 80 ? '#16a34a' : '#f59e0b'}` }}>
        <h2 style={{ margin: 0, marginBottom: '0.4rem' }}>{completionPct >= 80 ? '✅' : '⚠️'} Profile Completion — {completionPct}%</h2>
        <div className="completion-bar-wrap" style={{ maxWidth: 400 }}>
          <div className="completion-bar-fill" style={{ width: `${completionPct}%` }} />
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
          {completionFields.map(f => (
            <span key={f.label} className={`tag ${f.filled ? 'tag-green' : 'tag-gray'}`} style={{ fontSize: '0.72rem' }}>
              {f.filled ? '✓' : '○'} {f.label}
            </span>
          ))}
        </div>
        {missingFields.length > 0 && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: '#6b7280' }}>
            Complete <strong>{missingFields.join(', ')}</strong> to unlock full eligibility matching.
          </p>
        )}
      </div>

      <div className="grid-2" style={{ marginBottom: '1.25rem' }}>
        {/* Eligibility & Info */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>📋 Eligibility & Info</h2>
            {editMode === 'info' && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }} onClick={saveInfo}>Save</button>
                <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }} onClick={cancelEdit}>Cancel</button>
              </div>
            )}
          </div>
          {editMode === 'info' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {[
                { label: 'Full Name', key: 'name', type: 'text' }, { label: 'Email', key: 'email', type: 'email' },
                { label: 'Date of Birth', key: 'dob', type: 'date' }, { label: 'Qualification', key: 'qualification', type: 'text' },
                { label: 'University', key: 'university', type: 'text' }, { label: 'Graduation Year', key: 'gradYear', type: 'text' },
                { label: 'State Domicile', key: 'domicile', type: 'text' }, { label: 'UPSC Attempts Used', key: 'upscAttempts', type: 'text' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '0.2rem' }}>{f.label}</label>
                  <input type={f.type} style={{ width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
                    value={(draft as any)[f.key]} onChange={e => setDraft(p => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}
              {[
                { label: 'Category', key: 'category', opts: ['General', 'OBC', 'SC', 'ST', 'EWS'] },
                { label: 'PwBD Status', key: 'pwbd', opts: ['', 'VH', 'HH', 'OH'] },
                { label: 'Ex-Serviceman', key: 'exServiceman', opts: ['', 'yes'] },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '0.2rem' }}>{f.label}</label>
                  <select style={{ width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
                    value={(draft as any)[f.key]} onChange={e => setDraft(p => ({ ...p, [f.key]: e.target.value }))}>
                    {f.opts.map(o => <option key={o} value={o}>{o || 'Not applicable'}</option>)}
                  </select>
                </div>
              ))}
            </div>
          ) : (
            [
              { label: 'Date of Birth',   value: new Date(profile.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) },
              { label: 'Age',             value: `${age} years` },
              { label: 'Qualification',   value: profile.qualification },
              { label: 'University',      value: profile.university },
              { label: 'Graduation Year', value: profile.gradYear },
              { label: 'Category',        value: profile.category },
              { label: 'State Domicile',  value: profile.domicile  || <span style={{ color: '#ef4444' }}>⚠ Not set</span> },
              { label: 'PwBD Status',     value: profile.pwbd      || <span style={{ color: '#ef4444' }}>⚠ Not set</span> },
              { label: 'Ex-Serviceman',   value: profile.exServiceman || <span style={{ color: '#ef4444' }}>⚠ Not set</span> },
              { label: 'UPSC Attempts',   value: `${profile.upscAttempts} of 6 used` },
            ].map((e, i) => (
              <div className="list-item" key={i}>
                <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{e.label}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1f2937' }}>{e.value}</span>
              </div>
            ))
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Target exams */}
          <div className="card">
            <h2>🎯 Target Exams</h2>
            {targetExams.map((e, i) => (
              <div className="list-item" key={i} style={{ alignItems: 'center' }}>
                <div style={{ flex: 1 }}><div className="list-item-title">{e.name}</div></div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span className={`tag ${e.tag}`}>{e.priority}</span>
                  <button onClick={() => removeExam(e.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem', lineHeight: 1 }}>×</button>
                </div>
              </div>
            ))}
            {showAddExam && (
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {targetExamOptions.filter(o => !targetExams.find(e => e.name === o.name)).map(o => (
                  <button key={o.name} onClick={() => addExam(o.name, o.tag)} className="btn btn-outline" style={{ textAlign: 'left', fontSize: '0.85rem' }}>+ {o.name}</button>
                ))}
                <button className="btn btn-outline" style={{ fontSize: '0.8rem', color: '#9ca3af' }} onClick={() => setShowAddExam(false)}>Cancel</button>
              </div>
            )}
            {!showAddExam && <button className="btn btn-outline" style={{ width: '100%', marginTop: '0.75rem' }} onClick={() => setShowAddExam(true)}>+ Add Exam</button>}
          </div>

          {/* Plan features */}
          <div className="card">
            <h2>📦 Your Plan: <span className={`tier-badge tier-${userTier}`} style={{ fontSize: '0.78rem' }}>{userTier === 'free' ? '○ Free' : userTier === 'pro' ? '◆ Pro' : '★ Elite'}</span></h2>
            <ul style={{ fontSize: '0.82rem', color: '#374151', lineHeight: 1.9, paddingLeft: '1.1rem' }}>
              {TIER_FEATURES[userTier].map((f, i) => <li key={i}>{f}</li>)}
            </ul>
            {userTier !== 'elite' && (
              <button className="btn btn-upgrade" style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.85rem' }} onClick={() => setShowUpgrade(true)}>⬆ Upgrade for more features</button>
            )}
          </div>

          {/* Achievements */}
          <div className="card">
            <h2>🏅 Achievements</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
              {achievements.map((a, i) => (
                <div key={i} style={{ background: '#f9fafb', borderRadius: 8, padding: '0.65rem', textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#4f46e5' }}>{a.value}</div>
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.15rem' }}>{a.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Accountability Partners ── */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>🤝 Accountability Partners</h2>
            <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.2rem' }}>
              {userTier === 'free' ? 'Pro: 1 partner · Elite: up to 3 · Commitment-based + penalty system'
                : `${partners.length} / ${partnerLimit} partner${partnerLimit !== 1 ? 's' : ''} · Commitment-based accountability`}
            </div>
          </div>
          {userTier === 'free' ? (
            <button className="btn btn-upgrade" style={{ fontSize: '0.82rem' }} onClick={() => setShowUpgrade(true)}>◆ Upgrade to unlock</button>
          ) : canAddPartner ? (
            <button className="btn btn-primary" style={{ fontSize: '0.82rem' }} onClick={() => setShowInvite(v => !v)}>
              {showInvite ? '✕ Cancel' : '+ Invite Partner'}
            </button>
          ) : (
            <span className="tag tag-gray" style={{ fontSize: '0.78rem' }}>Limit reached</span>
          )}
        </div>

        {userTier === 'free' ? (
          <div style={{ background: '#f5f3ff', borderRadius: 10, padding: '1.25rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>🤝</div>
            <div style={{ fontWeight: 600, color: '#4f46e5', marginBottom: '0.4rem' }}>Commitment-based accountability with real stakes</div>
            <div style={{ fontSize: '0.85rem', color: '#6b7280', maxWidth: 460, margin: '0 auto 1rem', lineHeight: 1.6 }}>
              Promise weekly tasks to each other. Check in every Sunday. See side-by-side snapshots. If you miss your tasks — donate to an NGO or pay your partner directly.
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.82rem', color: '#374151' }}>
              {['📋 Weekly task agreements', '📸 Shared snapshots', '⚖ Penalty for missed tasks', '🏛 NGO donation or cash'].map((f, i) => (
                <span key={i}>{f}</span>
              ))}
            </div>
            <button className="btn btn-upgrade" onClick={() => setShowUpgrade(true)}>Upgrade to Pro — ₹399/mo</button>
          </div>
        ) : (
          <>
            {/* Invite form */}
            {showInvite && (
              <div style={{ background: '#f9fafb', borderRadius: 10, padding: '1.1rem', marginBottom: '1rem', border: '1px solid #e5e7eb' }}>
                <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '0.9rem', color: '#1f2937' }}>Invite an accountability partner</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '0.65rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>Partner name *</label>
                    <input style={{ width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
                      placeholder="e.g. Priya Sharma" value={inviteName} onChange={e => setInviteName(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>Their target exam</label>
                    <select style={{ width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
                      value={inviteExam} onChange={e => setInviteExam(e.target.value)}>
                      {['UPSC CSE 2026', 'SSC CGL 2026', 'IBPS PO 2026', 'RBI Grade B 2026', 'SEBI Grade A 2026', 'Other'].map(ex => <option key={ex}>{ex}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: '0.65rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>Shared weekly goal *</label>
                  <input style={{ width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
                    placeholder="e.g. Complete GS Paper I syllabus by May 20 and attempt 2 full mocks"
                    value={inviteGoal} onChange={e => setInviteGoal(e.target.value)} />
                </div>
                {/* Penalty setup */}
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#374151', marginBottom: '0.5rem' }}>⚖ Penalty for missed tasks</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '0.5rem' }}>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>Type</label>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {(['ngo', 'partner'] as const).map(t => (
                          <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.65rem', borderRadius: 7, border: `1.5px solid ${invitePenType === t ? '#4f46e5' : '#e5e7eb'}`, background: invitePenType === t ? '#f5f3ff' : '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                            <input type="radio" value={t} checked={invitePenType === t} onChange={() => setInvitePenType(t)} style={{ accentColor: '#4f46e5' }} />
                            {t === 'ngo' ? '🏛 NGO' : '💸 Partner'}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>₹ per missed task</label>
                      <input type="number" min={1} style={{ width: '100%', padding: '0.42rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
                        value={invitePenAmt} onChange={e => setInvitePenAmt(e.target.value)} />
                    </div>
                  </div>
                  {invitePenType === 'ngo' && (
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>NGO name</label>
                      <input style={{ width: '100%', padding: '0.42rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
                        placeholder="e.g. CRY India, HelpAge India, Teach for India"
                        value={invitePenNgo} onChange={e => setInvitePenNgo(e.target.value)} />
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.65rem' }}>
                  <button className="btn btn-primary" style={{ flex: 1, fontSize: '0.85rem' }} onClick={handleInvite} disabled={!inviteName.trim() || !inviteGoal.trim()}>
                    Send Invite
                  </button>
                  <button className="btn btn-outline" style={{ flex: 1, fontSize: '0.85rem' }} onClick={() => setShowInvite(false)}>Cancel</button>
                </div>
              </div>
            )}

            {/* Partner list */}
            {partners.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#9ca3af' }}>
                <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>🤝</div>
                <div style={{ fontWeight: 500, marginBottom: '0.25rem', color: '#374151' }}>No partners yet</div>
                <div style={{ fontSize: '0.85rem' }}>Invite a study partner and set up your accountability agreement.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {partners.map(p => (
                  <PartnerCard
                    key={p.id} p={p} showToast={showToast}
                    addMyCommitment={addMyCommitment}
                    removeMyCommitment={removeMyCommitment}
                    setPenalty={setPenalty}
                    updateSharedGoal={updateSharedGoal}
                    removePartner={removePartner}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Preferences */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>⚙️ Preferences</h2>
          {editMode === 'prefs' ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }} onClick={savePrefs}>Save</button>
              <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }} onClick={cancelEdit}>Cancel</button>
            </div>
          ) : (
            <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }} onClick={() => { setDraft(profile); setEditMode('prefs'); }}>Edit</button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          {editMode === 'prefs' ? (
            <>
              {[
                { label: 'Daily Study Goal (hours)', key: 'studyGoal', type: 'number' },
                { label: 'Study Start Time',          key: 'studyTime', type: 'time'   },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '0.3rem' }}>{f.label}</label>
                  <input type={f.type} style={{ width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
                    value={(draft as any)[f.key]} onChange={e => setDraft(p => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '0.3rem' }}>Deadline Reminder</label>
                <select style={{ width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
                  value={draft.deadlineReminder} onChange={e => setDraft(p => ({ ...p, deadlineReminder: e.target.value }))}>
                  {['1', '3', '7', '14', '30'].map(d => <option key={d} value={d}>{d} days before</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '0.3rem' }}>Community Digest</label>
                <select style={{ width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
                  value={draft.communityDigest} onChange={e => setDraft(p => ({ ...p, communityDigest: e.target.value }))}>
                  {['Daily', 'Weekly', 'Never'].map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>
                  <input type="checkbox" checked={draft.emailNotifications} onChange={e => setDraft(p => ({ ...p, emailNotifications: e.target.checked }))} />
                  Email Notifications
                </label>
              </div>
            </>
          ) : (
            [
              { label: 'Daily Study Goal',    value: `${profile.studyGoal} hours`          },
              { label: 'Study Start Time',    value: profile.studyTime                      },
              { label: 'Email Notifications', value: profile.emailNotifications ? 'On' : 'Off' },
              { label: 'Deadline Reminders',  value: `${profile.deadlineReminder} days before` },
              { label: 'Community Digest',    value: profile.communityDigest                },
            ].map((p, i) => (
              <div key={i} style={{ background: '#f9fafb', borderRadius: 8, padding: '0.85rem 1rem' }}>
                <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.2rem' }}>{p.label}</div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1f2937' }}>{p.value}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
