'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useApp, StudyTask } from '../context/AppContext';

const mockTests = [
  { name: 'UPSC GS Paper I — Set 12',       score: 118, total: 200, percentile: 84, date: 'Apr 28', subjects: { History: 32, Geography: 28, Polity: 34, Economy: 24 } },
  { name: 'UPSC GS Paper II (CSAT) — Set 7', score: 148, total: 200, percentile: 91, date: 'Apr 21', subjects: { Reasoning: 62, Comprehension: 58, Maths: 28 } },
  { name: 'SSC CGL Tier I — Set 5',          score: 162, total: 200, percentile: 77, date: 'Apr 14', subjects: { Quant: 45, English: 42, GK: 38, Reasoning: 37 } },
  { name: 'RBI Grade B Phase I — Set 3',     score: 134, total: 200, percentile: 88, date: 'Apr 7',  subjects: { GA: 52, English: 38, Quant: 44 } },
];

const riskTopics = [
  { topic: 'Modern History',   subject: 'History',  risk: 'high',   planned: 2.5, done: 0   },
  { topic: 'Indian Climate',   subject: 'Geography', risk: 'medium', planned: 2,   done: 0   },
  { topic: 'Apr Current Aff.', subject: 'Current Affairs', risk: 'medium', planned: 1.5, done: 0 },
  { topic: 'Monetary Policy',  subject: 'Economics', risk: 'low',    planned: 2,   done: 2   },
];

function FocusTimer({ task, onClose }: { task: StudyTask; onClose: () => void }) {
  const totalSeconds = task.hours * 3600;
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setSeconds(s => {
        if (s >= totalSeconds - 1) { setRunning(false); return totalSeconds; }
        return s + 1;
      }), 1000);
    } else { if (ref.current) clearInterval(ref.current); }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running, totalSeconds]);

  const pct = (seconds / totalSeconds) * 100;
  const fmt = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="card" style={{ width: 380, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ justifyContent: 'center', marginBottom: '0.25rem' }}>⏱ Focus Session</h2>
        <div style={{ color: '#6b7280', fontSize: '0.88rem', marginBottom: '1.5rem' }}>{task.topic} · {task.subject}</div>
        <div style={{ position: 'relative', width: 160, height: 160, margin: '0 auto 1.5rem' }}>
          <svg viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="2.5" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#4f46e5" strokeWidth="2.5"
              strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1f2937' }}>{fmt(h)}:{fmt(m)}:{fmt(s)}</div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>of {task.hours}h goal</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button className="btn btn-primary" style={{ minWidth: 100 }} onClick={() => setRunning(r => !r)}>
            {running ? '⏸ Pause' : seconds === 0 ? '▶ Start' : '▶ Resume'}
          </button>
          <button className="btn btn-outline" onClick={() => { setSeconds(0); setRunning(false); }}>↺ Reset</button>
          <button className="btn btn-outline" onClick={onClose}>✕ Close</button>
        </div>
        {seconds >= totalSeconds && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#dcfce7', borderRadius: 8, color: '#16a34a', fontWeight: 600 }}>🎉 Session complete!</div>
        )}
      </div>
    </div>
  );
}

export default function StudyPage() {
  const { tasks, toggleTask, addTask, resources, updateResourceProgress, studyPlan, generateStudyPlan, userTier } = useApp();
  const [focusTask,    setFocusTask]    = useState<StudyTask | null>(null);
  const [showAddTask,  setShowAddTask]  = useState(false);
  const [newTask,      setNewTask]      = useState({ day: 'Mon', subject: '', topic: '', hours: 1 });
  const [expandedTest, setExpandedTest] = useState<number | null>(null);
  const [generating,   setGenerating]   = useState(false);

  const doneCount  = tasks.filter(t => t.done).length;
  const doneHours  = tasks.filter(t => t.done).reduce((s, t) => s + t.hours, 0);
  const totalHours = tasks.reduce((s, t) => s + t.hours, 0);

  const handleAddTask = () => {
    if (!newTask.topic || !newTask.subject) return;
    addTask(newTask);
    setNewTask({ day: 'Mon', subject: '', topic: '', hours: 1 });
    setShowAddTask(false);
  };

  const handleGenerate = () => {
    if (userTier === 'free') return;
    setGenerating(true);
    setTimeout(() => { generateStudyPlan(); setGenerating(false); }, 1800);
  };

  return (
    <div className="page">
      {focusTask && <FocusTimer task={focusTask} onClose={() => setFocusTask(null)} />}

      {showAddTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAddTask(false)}>
          <div className="card" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <h2>Add Study Task</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
              {[
                { label: 'Subject', key: 'subject', placeholder: 'e.g. History' },
                { label: 'Topic',   key: 'topic',   placeholder: 'e.g. Mughal Empire' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '0.3rem' }}>{f.label}</label>
                  <input style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.9rem', outline: 'none' }}
                    placeholder={f.placeholder} value={(newTask as any)[f.key]}
                    onChange={e => setNewTask(p => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '0.3rem' }}>Day</label>
                <select style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.9rem', outline: 'none' }}
                  value={newTask.day} onChange={e => setNewTask(p => ({ ...p, day: e.target.value }))}>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '0.3rem' }}>Hours: {newTask.hours}</label>
                <input type="range" min={0.5} max={6} step={0.5} value={newTask.hours}
                  onChange={e => setNewTask(p => ({ ...p, hours: parseFloat(e.target.value) }))} style={{ width: '100%' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAddTask}>Add Task</button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowAddTask(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><h1>Study</h1><p>Your weekly plan, focus sessions, mock tests, and AI study plan.</p></div>
        <button className="btn btn-primary" onClick={() => setShowAddTask(true)}>+ Add Task</button>
      </div>

      {/* AI Study Plan card */}
      <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '4px solid #4f46e5' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, marginBottom: '0.25rem' }}>🤖 AI Study Plan</h2>
            {userTier === 'free' ? (
              <>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                  See what a personalised 90-day plan looks like for your target exams.
                </p>
                <div className="upgrade-gate" style={{ borderRadius: 10, overflow: 'hidden' }}>
                  <div className="upgrade-gate-blur" style={{ background: '#f9fafb', padding: '1rem', borderRadius: 10 }}>
                    <div style={{ fontSize: '0.85rem', color: '#374151', marginBottom: '0.3rem' }}>🎯 Goal: Clear UPSC CSE 2026 Prelims</div>
                    <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>14h/week · 1 mock/10 days · Polity + History priority</div>
                    <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.3rem' }}>Trade-off: Reducing Quant ↑ risk in SSC CGL</div>
                  </div>
                  <div className="upgrade-gate-cta">
                    <strong>◆ Pro feature</strong>
                    <p>Generate a 90-day plan tailored to your profile, target dates, and mock performance.</p>
                    <a href="/profile" className="btn btn-upgrade" style={{ fontSize: '0.82rem' }}>Upgrade to Pro</a>
                  </div>
                </div>
              </>
            ) : studyPlan.generated ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#0369a1', marginBottom: '0.25rem', textTransform: 'uppercase' }}>90-Day Goal</div>
                    <div style={{ fontSize: '0.85rem', color: '#374151' }}>{studyPlan.macroGoal}</div>
                  </div>
                  <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#15803d', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Weekly Target</div>
                    <div style={{ fontSize: '0.85rem', color: '#374151' }}>{studyPlan.weeklyTarget}</div>
                  </div>
                  <div style={{ background: '#fdf4ff', borderRadius: 8, padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#7c3aed', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Direction</div>
                    <div style={{ fontSize: '0.82rem', color: '#374151' }}>{studyPlan.direction}</div>
                  </div>
                  <div style={{ background: '#fff7ed', borderRadius: 8, padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#c2410c', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Trade-off</div>
                    <div style={{ fontSize: '0.82rem', color: '#374151' }}>{studyPlan.tradeOff}</div>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0.25rem 0 0' }}>
                Generate a personalised 90-day plan based on your target exams, mock scores, and available time.
              </p>
            )}
          </div>
          {userTier !== 'free' && (
            <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={handleGenerate} disabled={generating}>
              {generating ? '⏳ Generating…' : studyPlan.generated ? '↺ Regenerate' : '✦ Generate Plan'}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
        {/* Weekly plan */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>📅 This Week's Plan</h2>
            <span className="tag tag-purple">{Math.round((doneCount / tasks.length) * 100)}% done</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.3rem' }}>
            <span>Hours completed</span>
            <span style={{ fontWeight: 600, color: '#1f2937' }}>{doneHours}h / {totalHours}h</span>
          </div>
          <div className="progress-bar-track" style={{ marginBottom: '1rem' }}>
            <div className="progress-bar-fill" style={{ width: `${(doneHours / totalHours) * 100}%`, transition: 'width 0.4s' }} />
          </div>
          {tasks.map(t => (
            <div key={t.id} className="list-item" style={{ alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, cursor: 'pointer' }} onClick={() => toggleTask(t.id)}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: t.done ? '#4f46e5' : '#f3f4f6',
                  color: t.done ? '#fff' : '#9ca3af',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', fontWeight: 700, transition: 'all 0.2s',
                }}>{t.done ? '✓' : t.day}</div>
                <div>
                  <div className="list-item-title" style={{ color: t.done ? '#9ca3af' : '#1f2937', textDecoration: t.done ? 'line-through' : 'none' }}>{t.topic}</div>
                  <div className="list-item-sub">{t.subject} · {t.hours}h</div>
                </div>
              </div>
              {!t.done
                ? <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }} onClick={() => setFocusTask(t)}>▶ Start</button>
                : <span style={{ color: '#16a34a', fontSize: '1rem', cursor: 'pointer' }} onClick={() => toggleTask(t.id)} title="Undo">✓</span>
              }
            </div>
          ))}
        </div>

        {/* Backlog risk */}
        <div className="card">
          <h2>⚠️ Backlog Risk Heatmap</h2>
          {riskTopics.map((r, i) => (
            <div key={i} className="list-item" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div className="list-item-title">{r.topic}</div>
                <div className="list-item-sub">{r.subject} · {r.planned}h planned · {r.done}h done</div>
                <div className="progress-bar-track" style={{ marginTop: '0.4rem' }}>
                  <div className="progress-bar-fill" style={{ width: `${(r.done / r.planned) * 100}%`, background: r.risk === 'high' ? '#dc2626' : r.risk === 'medium' ? '#ca8a04' : '#16a34a' }} />
                </div>
              </div>
              <span className={`tag risk-${r.risk}`} style={{ flexShrink: 0, fontSize: '0.72rem' }}>
                {r.risk === 'high' ? '🔴 High' : r.risk === 'medium' ? '🟡 Med' : '🟢 Low'}
              </span>
            </div>
          ))}
          <div style={{ marginTop: '0.75rem', padding: '0.65rem', background: '#fef9c3', borderRadius: 8, fontSize: '0.8rem', color: '#854d0e' }}>
            💡 Tip: {riskTopics.filter(r => r.risk === 'high').length} topics are high risk. Consider swapping Sunday revision for catch-up.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        {/* Mock tests */}
        <div className="card">
          <h2>📊 Mock Test Results</h2>
          {mockTests.map((t, i) => {
            const isOpen = expandedTest === i;
            return (
              <div key={i} className="list-item" style={{ cursor: 'pointer' }} onClick={() => setExpandedTest(isOpen ? null : i)}>
                <div style={{ flex: 1 }}>
                  <div className="list-item-title">{t.name}</div>
                  <div className="list-item-sub">{t.date} · {t.percentile}th percentile</div>
                  <div className="progress-bar-track" style={{ marginTop: '0.4rem' }}>
                    <div className="progress-bar-fill" style={{ width: `${(t.score / t.total) * 100}%`, background: t.score / t.total >= 0.75 ? '#16a34a' : '#4f46e5' }} />
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: '0.65rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {Object.entries(t.subjects).map(([sub, sc]) => (
                        <div key={sub} style={{ background: '#f3f4f6', borderRadius: 6, padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>
                          <span style={{ color: '#6b7280' }}>{sub}</span>
                          <span style={{ fontWeight: 600, color: '#1f2937', marginLeft: '0.35rem' }}>{sc}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t.score}/{t.total}</div>
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{Math.round((t.score / t.total) * 100)}%</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Resource progress */}
        <div className="card">
          <h2>📖 Resource Progress</h2>
          {resources.map((r, i) => (
            <div key={i} style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#1f2937' }}>{r.title}</div>
                  <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{r.type}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <input type="number" min={0} max={100} value={r.progress}
                    onChange={e => updateResourceProgress(i, parseInt(e.target.value) || 0)}
                    style={{ width: 52, padding: '0.2rem 0.4rem', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.85rem', textAlign: 'center', outline: 'none' }} />
                  <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>%</span>
                </div>
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${r.progress}%`, background: r.progress === 100 ? '#16a34a' : '#4f46e5', transition: 'width 0.3s' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
