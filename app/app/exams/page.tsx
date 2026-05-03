'use client';
import React, { useState } from 'react';
import { useApp, ApplicationStatus } from '../context/AppContext';

const STATUS_OPTIONS = ['All', 'Applied', 'Admit card ready', 'Not applied', 'Notification awaited'];

const APP_LIFECYCLE: { key: ApplicationStatus; label: string }[] = [
  { key: 'not_started',       label: 'Not started'    },
  { key: 'applied',           label: 'Applied'        },
  { key: 'admit_card',        label: 'Admit card'     },
  { key: 'appeared',          label: 'Appeared'       },
  { key: 'result_out',        label: 'Result out'     },
];

const emptyForm = { name: '', body: '', stage: '', date: '', status: 'Not applied', eligibility: 'Eligible', posts: '' };

function daysLeft(deadline: string) {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
}

function LifecycleBar({ current }: { current: ApplicationStatus }) {
  if (current === 'notification_awaited') return null;
  const idx = APP_LIFECYCLE.findIndex(s => s.key === current);
  return (
    <div className="app-lifecycle">
      {APP_LIFECYCLE.map((step, i) => {
        const done    = i < idx;
        const active  = i === idx;
        return (
          <React.Fragment key={step.key}>
            {i > 0 && <div className={`app-lifecycle-line ${done ? 'app-lifecycle-line-done' : ''}`} />}
            <div className="app-lifecycle-step">
              <div className={`app-lifecycle-dot ${done ? 'app-lifecycle-dot-done' : active ? 'app-lifecycle-dot-current' : ''}`}>
                {done ? '✓' : i + 1}
              </div>
              <div className={`app-lifecycle-label ${active ? 'app-lifecycle-label-active' : ''}`}>{step.label}</div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function ExamsPage() {
  const { exams, updateExamStatus, updateApplicationStatus, addExam, userTier } = useApp();
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showModal,    setShowModal]    = useState(false);
  const [form,         setForm]         = useState(emptyForm);
  const [expandedRow,  setExpandedRow]  = useState<number | null>(null);
  const [showDocs,     setShowDocs]     = useState<number | null>(null);

  const filtered = exams.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.body.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleAdd = () => {
    if (!form.name || !form.date) return;
    addExam({ ...form, deadline: form.date });
    setForm(emptyForm);
    setShowModal(false);
  };

  const pipeline = [
    { label: 'Applied',        count: exams.filter(e => e.applicationStatus === 'applied').length,   color: '#4f46e5' },
    { label: 'Admit Card Out', count: exams.filter(e => e.applicationStatus === 'admit_card').length, color: '#d97706' },
    { label: 'Not Applied',    count: exams.filter(e => e.applicationStatus === 'not_started').length, color: '#9ca3af' },
    { label: 'Eligible',       count: exams.filter(e => e.eligibility === 'Eligible').length,         color: '#16a34a' },
  ];

  return (
    <div className="page">
      {/* Add exam modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowModal(false)}>
          <div className="card" style={{ width: 480, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <h2>Add New Exam</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
              {[
                { label: 'Exam Name *',    key: 'name',  placeholder: 'e.g. UPSC EPFO 2026' },
                { label: 'Conducting Body', key: 'body',  placeholder: 'e.g. EPFO' },
                { label: 'Stage',          key: 'stage', placeholder: 'e.g. Phase I' },
                { label: 'Vacancies',      key: 'posts', placeholder: 'e.g. 2500 vacancies' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '0.3rem' }}>{f.label}</label>
                  <input style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.9rem', outline: 'none' }}
                    placeholder={f.placeholder} value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '0.3rem' }}>Exam Date *</label>
                <input type="date" style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.9rem', outline: 'none' }}
                  value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAdd}>Add Exam</button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><h1>Exams</h1><p>Browse recruitments, check eligibility, and track your applications.</p></div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Exam</button>
      </div>

      {/* Pipeline summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {pipeline.map(p => (
          <div className="card" key={p.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: p.color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: p.color, fontSize: '1.1rem' }}>{p.count}</div>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#374151' }}>{p.label}</div>
          </div>
        ))}
      </div>

      {/* Eligibility gate for free users */}
      {userTier === 'free' && (
        <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#4f46e5' }}>🔍 Eligibility matching available</div>
            <div style={{ fontSize: '0.83rem', color: '#6b7280', marginTop: '0.2rem' }}>
              Based on your profile, you may match <strong>4 open recruitments</strong>. Upgrade to see exactly which ones and why.
            </div>
          </div>
          <a href="/profile" className="btn btn-upgrade" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', flexShrink: 0 }}>Upgrade to Pro</a>
        </div>
      )}

      {/* Exam table */}
      <div className="card">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ flex: 1, minWidth: 180, padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
            placeholder="Search exams..." value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {STATUS_OPTIONS.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                padding: '0.35rem 0.75rem', borderRadius: 20, fontSize: '0.8rem', fontWeight: 500,
                border: 'none', cursor: 'pointer',
                background: statusFilter === s ? '#4f46e5' : '#f3f4f6',
                color: statusFilter === s ? '#fff' : '#6b7280',
              }}>{s}</button>
            ))}
          </div>
        </div>

        <h2 style={{ marginBottom: '0.75rem' }}>📋 Your Exam Tracker</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f3f4f6', color: '#6b7280', textAlign: 'left' }}>
                {['Exam', 'Stage', 'Date', 'Countdown', 'Vacancies', 'Eligibility', 'Application Status', 'Details'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => {
                const days        = daysLeft(e.deadline);
                const isExpanded  = expandedRow === i;
                const globalIdx   = exams.indexOf(e);
                const isProGated  = userTier === 'free' && e.eligibility === 'Eligible';

                return (
                  <React.Fragment key={i}>
                    <tr style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: isExpanded ? '#f9fafb' : 'transparent' }}
                      onClick={() => setExpandedRow(isExpanded ? null : i)}>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ fontWeight: 500, color: '#1f2937' }}>{e.name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{e.body}</div>
                        <div style={{ marginTop: '0.2rem' }}>
                          <a href={e.officialUrl} target="_blank" rel="noopener noreferrer"
                            onClick={ev => ev.stopPropagation()}
                            style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 500 }}>
                            🔗 Official site
                          </a>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem', color: '#374151' }}>{e.stage}</td>
                      <td style={{ padding: '0.75rem', color: '#374151', whiteSpace: 'nowrap' }}>{e.date}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{
                          fontSize: '0.8rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: 20,
                          color: days <= 30 ? '#dc2626' : days <= 90 ? '#ca8a04' : '#2563eb',
                          background: days <= 30 ? '#fee2e2' : days <= 90 ? '#fef9c3' : '#dbeafe',
                        }}>{days > 0 ? `${days}d` : 'Past'}</span>
                      </td>
                      <td style={{ padding: '0.75rem', color: '#374151' }}>{e.posts}</td>
                      <td style={{ padding: '0.75rem' }}>
                        {isProGated ? (
                          <div className="upgrade-gate" style={{ display: 'inline-block' }}>
                            <span className="tag tag-green upgrade-gate-blur">Eligible</span>
                            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', color: '#7c3aed', fontWeight: 600 }} title="Upgrade to Pro to see eligibility details">◆</span>
                          </div>
                        ) : (
                          <span className={`tag ${e.eligibility === 'Eligible' ? 'tag-green' : e.eligibility === 'Not eligible' ? 'tag-red' : 'tag-yellow'}`}>
                            {e.eligibility}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <select
                          value={e.applicationStatus}
                          onClick={ev => ev.stopPropagation()}
                          onChange={ev => { ev.stopPropagation(); updateApplicationStatus(globalIdx, ev.target.value as ApplicationStatus); }}
                          style={{ padding: '0.25rem 0.5rem', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.78rem', cursor: 'pointer', outline: 'none' }}>
                          {APP_LIFECYCLE.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                          <option value="notification_awaited">Notification awaited</option>
                        </select>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ color: '#4f46e5', fontSize: '0.8rem', fontWeight: 500 }}>{isExpanded ? '▲' : '▼'}</span>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr style={{ background: '#f9fafb' }}>
                        <td colSpan={8} style={{ padding: '1rem 1.25rem' }}>
                          {/* Application lifecycle */}
                          <div style={{ marginBottom: '0.75rem' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>Application Progress</div>
                            <LifecycleBar current={e.applicationStatus} />
                          </div>

                          {/* Eligibility reason */}
                          <div style={{ marginBottom: '0.75rem', background: e.eligibility === 'Eligible' ? '#f0fdf4' : '#fef2f2', borderRadius: 8, padding: '0.75rem 1rem', borderLeft: `3px solid ${e.eligibility === 'Eligible' ? '#16a34a' : '#dc2626'}` }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: e.eligibility === 'Eligible' ? '#16a34a' : '#dc2626', marginBottom: '0.3rem' }}>
                              {e.eligibility === 'Eligible' ? '✓ Why you are eligible' : '✗ Why you are not eligible'}
                            </div>
                            {userTier === 'free' ? (
                              <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>
                                <a href="/profile" style={{ color: '#4f46e5', fontWeight: 600 }}>Upgrade to Pro</a> to see detailed eligibility explanation.
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.82rem', color: '#374151' }}>{e.eligibilityReason}</div>
                            )}
                          </div>

                          {/* Document checklist */}
                          <div style={{ marginBottom: '0.75rem' }}>
                            <button onClick={ev => { ev.stopPropagation(); setShowDocs(showDocs === i ? null : i); }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: '#4f46e5', fontWeight: 600, padding: 0 }}>
                              📋 Document Checklist ({e.documents.length} items) {showDocs === i ? '▲' : '▼'}
                            </button>
                            {showDocs === i && (
                              <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                {e.documents.map((doc, di) => (
                                  <span key={di} className="tag tag-blue" style={{ fontSize: '0.75rem' }}>✓ {doc}</span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {e.applicationStatus === 'not_started' && e.eligibility === 'Eligible' && (
                              <a href={e.officialUrl} target="_blank" rel="noopener noreferrer"
                                className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '0.35rem 0.85rem' }}>
                                Apply on Official Site ↗
                              </a>
                            )}
                            {e.applicationStatus === 'not_started' && (
                              <button className="btn btn-success" style={{ fontSize: '0.82rem', padding: '0.35rem 0.85rem' }}
                                onClick={() => updateApplicationStatus(globalIdx, 'applied')}>
                                Mark as Applied
                              </button>
                            )}
                            <button className="btn btn-outline" style={{ fontSize: '0.82rem', padding: '0.35rem 0.85rem' }}>
                              🔔 Set Reminder
                            </button>
                            <a href="/community" className="btn btn-outline" style={{ fontSize: '0.82rem', padding: '0.35rem 0.85rem' }}>
                              💬 Discuss in Community
                            </a>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>No exams match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
