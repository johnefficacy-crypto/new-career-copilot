'use client';
import React, { useState } from 'react';
import { useApp, Thread, ThreadFlair } from '../context/AppContext';

const POST_LIMIT = 5;

const examSpaces = [
  { id: 'upsc',    name: 'UPSC CSE',  shortName: 'UPSC',  color: '#7c3aed', members: 12400 },
  { id: 'ssc',     name: 'SSC CGL',   shortName: 'SSC',   color: '#2563eb', members: 8920  },
  { id: 'ibps',    name: 'IBPS PO',   shortName: 'IBPS',  color: '#059669', members: 6100  },
  { id: 'general', name: 'General',   shortName: 'Gen',   color: '#9ca3af', members: 31000 },
];

const channels = [
  { id: 'official_updates', name: '#official-updates', adminOnly: true  },
  { id: 'preparation',      name: '#preparation',      adminOnly: false },
  { id: 'pyq_discussion',   name: '#pyq-discussion',   adminOnly: false },
  { id: 'form_help',        name: '#form-help',        adminOnly: false },
  { id: 'cutoffs_results',  name: '#cutoffs-results',  adminOnly: false },
];

const tagColors: Record<string, string> = {
  'UPSC': 'tag-purple', 'Polity': 'tag-blue', 'Notes': 'tag-gray',
  'SSC CGL': 'tag-yellow', 'Study Group': 'tag-blue', 'IBPS PO': 'tag-green',
  'Strategy': 'tag-blue', 'Success': 'tag-green', 'Current Affairs': 'tag-red',
  'Daily': 'tag-gray', 'PYQ': 'tag-purple', 'Geography': 'tag-green',
  'Form Help': 'tag-orange', 'OBC': 'tag-gray', 'Cutoff': 'tag-yellow',
  '2025': 'tag-gray', 'Official': 'tag-red',
};

const flairColors: Record<ThreadFlair, string> = {
  Question: 'flair-Question', Strategy: 'flair-Strategy', Resource: 'flair-Resource',
  Discussion: 'flair-Discussion', Success: 'flair-Success',
};

const studyGroups = [
  { name: 'UPSC 2026 — Morning Batch', exam: 'UPSC CSE', members: 6, capacity: 8, open: true,  joined: true  },
  { name: 'SSC CGL Quant Focused',     exam: 'SSC CGL',  members: 3, capacity: 5, open: true,  joined: false },
  { name: 'RBI Grade B — Phase I',     exam: 'RBI',      members: 4, capacity: 4, open: false, joined: false },
  { name: 'IBPS PO Daily Prep',        exam: 'IBPS PO',  members: 7, capacity: 8, open: true,  joined: true  },
];

export default function CommunityPage() {
  const { threads, toggleLike, addReply, addThread, reportThread, postsToday, incrementPostCount, userTier } = useApp();

  const [activeSpace,   setActiveSpace]   = useState('upsc');
  const [activeChannel, setActiveChannel] = useState('preparation');
  const [expandedId,    setExpandedId]    = useState<number | null>(null);
  const [showNewPost,   setShowNewPost]   = useState(false);
  const [newPost,       setNewPost]       = useState({ title: '', body: '', tags: '', flair: 'Discussion' as ThreadFlair });
  const [replyText,     setReplyText]     = useState<Record<number, string>>({});
  const [groups,        setGroups]        = useState(studyGroups);
  const [reportedIds,   setReportedIds]   = useState<Set<number>>(new Set());

  const isOfficialChannel = activeChannel === 'official_updates';
  const canPost = userTier !== 'free' || postsToday < POST_LIMIT;
  const postsLeft = POST_LIMIT - postsToday;

  const visibleThreads = threads.filter(t =>
    t.spaceId === activeSpace && t.channelId === activeChannel
  );

  const handleAddReply = (threadId: number) => {
    const text = replyText[threadId]?.trim();
    if (!text) return;
    addReply(threadId, text);
    setReplyText(p => ({ ...p, [threadId]: '' }));
  };

  const submitPost = () => {
    if (!newPost.title || !newPost.body) return;
    if (!canPost) return;
    const tags = newPost.tags.split(',').map(t => t.trim()).filter(Boolean);
    addThread({
      author: 'Rohit V.', initials: 'RV', time: 'Just now',
      title: newPost.title, preview: newPost.body.slice(0, 100),
      body: newPost.body, tags, flair: newPost.flair,
      spaceId: activeSpace, channelId: activeChannel,
    });
    incrementPostCount();
    setNewPost({ title: '', body: '', tags: '', flair: 'Discussion' });
    setShowNewPost(false);
  };

  const handleReport = (id: number) => {
    reportThread(id);
    setReportedIds(prev => new Set(prev).add(id));
  };

  const toggleGroup = (i: number) => {
    setGroups(prev => prev.map((g, idx) =>
      idx !== i ? g : { ...g, joined: !g.joined, members: g.joined ? g.members - 1 : g.members + 1 }
    ));
  };

  const currentSpace = examSpaces.find(s => s.id === activeSpace)!;

  return (
    <div className="page">
      {/* New Post Modal */}
      {showNewPost && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowNewPost(false)}>
          <div className="card" style={{ width: 540, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <h2>New Post in {currentSpace.name} › {channels.find(c => c.id === activeChannel)?.name}</h2>
            {userTier === 'free' && (
              <div className="quota-bar">
                <span>📝 {postsLeft} of {POST_LIMIT} daily posts remaining</span>
                <a href="/profile" className="btn btn-upgrade" style={{ fontSize: '0.75rem', padding: '0.2rem 0.65rem' }}>Upgrade for unlimited</a>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '0.3rem' }}>Flair</label>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {(['Question', 'Strategy', 'Resource', 'Discussion', 'Success'] as ThreadFlair[]).map(f => (
                    <button key={f} onClick={() => setNewPost(p => ({ ...p, flair: f }))}
                      className={`tag ${flairColors[f]}`}
                      style={{ border: newPost.flair === f ? '2px solid #4f46e5' : '2px solid transparent', cursor: 'pointer', fontWeight: newPost.flair === f ? 700 : 500 }}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '0.3rem' }}>Title *</label>
                <input style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.9rem', outline: 'none' }}
                  placeholder="What's your post about?" value={newPost.title}
                  onChange={e => setNewPost(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '0.3rem' }}>Content *</label>
                <textarea style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.9rem', outline: 'none', resize: 'vertical', minHeight: 100 }}
                  placeholder="Share your thoughts..." value={newPost.body}
                  onChange={e => setNewPost(p => ({ ...p, body: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '0.3rem' }}>Tags (comma-separated)</label>
                <input style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.9rem', outline: 'none' }}
                  placeholder="e.g. UPSC, Strategy, Notes" value={newPost.tags}
                  onChange={e => setNewPost(p => ({ ...p, tags: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={submitPost} disabled={!canPost}>
                {canPost ? 'Post' : `Limit reached (${POST_LIMIT}/day on Free)`}
              </button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowNewPost(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1>Community</h1>
          <p>Exam-specific forums, study groups, and peer discussions.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { if (!isOfficialChannel) setShowNewPost(true); }} disabled={isOfficialChannel}>
          + New Post
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 220px', gap: '1.25rem' }}>
        {/* Space sidebar */}
        <div>
          <div className="card" style={{ padding: '0.75rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem', padding: '0 0.25rem' }}>Exam Spaces</div>
            <div className="space-sidebar">
              {examSpaces.map(sp => (
                <button key={sp.id} className={`space-tab ${activeSpace === sp.id ? 'space-tab-active' : ''}`}
                  onClick={() => { setActiveSpace(sp.id); setActiveChannel('preparation'); setExpandedId(null); }}>
                  <span className="space-dot" style={{ background: sp.color }} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div>{sp.name}</div>
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 400 }}>{sp.members.toLocaleString()} members</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Post quota (free users) */}
          {userTier === 'free' && (
            <div className="card" style={{ marginTop: '0.75rem', padding: '0.9rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>📝 Daily Posts</div>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {Array.from({ length: POST_LIMIT }).map((_, i) => (
                  <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < postsToday ? '#4f46e5' : '#e5e7eb' }} />
                ))}
              </div>
              <div style={{ fontSize: '0.73rem', color: '#9ca3af', marginTop: '0.4rem' }}>{postsToday}/{POST_LIMIT} used today</div>
              {postsToday >= POST_LIMIT && (
                <a href="/profile" className="btn btn-upgrade" style={{ display: 'block', textAlign: 'center', marginTop: '0.5rem', fontSize: '0.75rem', padding: '0.3rem 0' }}>
                  Upgrade for unlimited
                </a>
              )}
            </div>
          )}
        </div>

        {/* Main feed */}
        <div>
          {/* Channel tabs */}
          <div className="channel-tabs">
            {channels.map(ch => {
              const isAdmin = ch.adminOnly;
              const isActive = activeChannel === ch.id;
              return (
                <button key={ch.id}
                  className={`channel-tab ${isAdmin ? (isActive ? 'channel-tab-admin-active' : 'channel-tab-admin') : (isActive ? 'channel-tab-active' : 'channel-tab-inactive')}`}
                  onClick={() => { setActiveChannel(ch.id); setExpandedId(null); }}>
                  {isAdmin ? '🔒 ' : ''}{ch.name}
                </button>
              );
            })}
          </div>

          {/* Official updates lock */}
          {isOfficialChannel && (
            <div className="official-lock-banner">
              🔒 This channel contains admin-only official notifications. User posts are not permitted here.
            </div>
          )}

          {/* Thread list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {visibleThreads.map(t => {
              const isOpen = expandedId === t.id;
              const isReported = reportedIds.has(t.id);
              return (
                <div className="card" key={t.id} style={{ opacity: isReported ? 0.5 : 1 }}>
                  {t.pinned && <span className="tag tag-purple" style={{ marginBottom: '0.6rem', display: 'inline-block', fontSize: '0.7rem' }}>📌 Pinned</span>}

                  <div style={{ display: 'flex', gap: '0.75rem', cursor: 'pointer' }} onClick={() => setExpandedId(isOpen ? null : t.id)}>
                    <div className="avatar" style={{ width: 38, height: 38, fontSize: '0.85rem' }}>{t.initials}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#374151' }}>{t.author}</span>
                        {t.verifiedTopper && <span className="verified-badge">✓ Verified Topper</span>}
                        <span className="tag tag-gray" style={{ fontSize: '0.7rem' }}>{t.time}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                        <span className={`tag ${flairColors[t.flair]}`} style={{ fontSize: '0.7rem' }}>{t.flair}</span>
                        <span style={{ fontWeight: 600, color: '#1f2937', fontSize: '0.92rem' }}>{t.title}</span>
                      </div>
                      <div style={{ fontSize: '0.83rem', color: '#6b7280', lineHeight: 1.5 }}>{isOpen ? t.body : t.preview}</div>
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        {t.tags.map(tag => <span key={tag} className={`tag ${tagColors[tag] || 'tag-gray'}`}>{tag}</span>)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', alignItems: 'center', borderTop: '1px solid #f3f4f6', paddingTop: '0.6rem' }}>
                    <button onClick={() => toggleLike(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: t.liked ? '#dc2626' : '#9ca3af', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      {t.liked ? '❤️' : '🤍'} {t.likes}
                    </button>
                    <button onClick={() => setExpandedId(isOpen ? null : t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: '#9ca3af', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      💬 {t.replies.length} {isOpen ? 'Hide' : 'Replies'}
                    </button>
                    {!isOfficialChannel && (
                      <button onClick={() => handleReport(t.id)} disabled={isReported} style={{ background: 'none', border: 'none', cursor: isReported ? 'default' : 'pointer', fontSize: '0.78rem', color: isReported ? '#9ca3af' : '#ef4444', marginLeft: 'auto' }}>
                        {isReported ? '⚑ Reported' : '⚑ Report'}
                      </button>
                    )}
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: '0.75rem', borderTop: '1px solid #f3f4f6', paddingTop: '0.75rem' }}>
                      {t.replies.map((r, ri) => (
                        <div key={ri} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.75rem' }}>
                          <div className="avatar" style={{ width: 28, height: 28, fontSize: '0.72rem' }}>{r.initials}</div>
                          <div style={{ background: '#f9fafb', borderRadius: 8, padding: '0.45rem 0.75rem', flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>{r.author}</span>
                              {r.verifiedTopper && <span className="verified-badge">✓ Verified Topper</span>}
                              <span style={{ fontSize: '0.73rem', color: '#d1d5db', marginLeft: 'auto' }}>{r.time}</span>
                            </div>
                            <div style={{ fontSize: '0.82rem', color: '#4b5563' }}>{r.text}</div>
                          </div>
                        </div>
                      ))}
                      {!isOfficialChannel && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                          <input
                            style={{ flex: 1, padding: '0.45rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
                            placeholder="Write a reply..."
                            value={replyText[t.id] || ''}
                            onChange={e => setReplyText(p => ({ ...p, [t.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddReply(t.id); }} />
                          <button className="btn btn-primary" style={{ fontSize: '0.82rem' }} onClick={() => handleAddReply(t.id)}>Reply</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {visibleThreads.length === 0 && (
              <div className="card" style={{ textAlign: 'center', color: '#9ca3af', padding: '2.5rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💬</div>
                <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>No posts in this channel yet.</div>
                {!isOfficialChannel && <div style={{ fontSize: '0.85rem' }}>Be the first to start a discussion!</div>}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Pro/Elite upgrade (free users) */}
          {userTier === 'free' && (
            <div style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius: 12, padding: '1rem', color: '#fff' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.3rem' }}>◆ Go Pro</div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)', marginBottom: '0.75rem' }}>Unlimited posts · Create study groups · Accountability partners</div>
              <a href="/profile" className="btn" style={{ background: '#fff', color: '#4f46e5', fontSize: '0.78rem', display: 'block', textAlign: 'center', padding: '0.4rem' }}>Upgrade Now</a>
            </div>
          )}

          {/* Study groups */}
          <div className="card" style={{ padding: '1rem' }}>
            <h2 style={{ marginBottom: '0.75rem' }}>👥 Study Groups</h2>
            {groups.map((g, i) => (
              <div key={i} style={{ padding: '0.6rem 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1f2937' }}>{g.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' }}>
                      {g.members}/{g.capacity} · {g.open ? '🟢 Open' : '🔴 Full'}
                    </div>
                  </div>
                  {userTier === 'free' && !g.joined
                    ? <span className="tag tag-gray" style={{ fontSize: '0.68rem', cursor: 'pointer' }} title="Pro required to create groups">Pro</span>
                    : <button onClick={() => toggleGroup(i)} className={`btn ${g.joined ? 'btn-outline' : 'btn-primary'}`} style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem' }}>
                        {g.joined ? 'Leave' : 'Join'}
                      </button>
                  }
                </div>
              </div>
            ))}
            {userTier !== 'free' && (
              <button className="btn btn-outline" style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.8rem' }}>
                + Create Group
              </button>
            )}
            {userTier === 'free' && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#9ca3af', textAlign: 'center' }}>
                <a href="/profile" style={{ color: '#4f46e5' }}>Upgrade to Pro</a> to create groups
              </div>
            )}
          </div>

          {/* Top contributors */}
          <div className="card" style={{ padding: '1rem' }}>
            <h2>🏆 Top Contributors</h2>
            {[
              { name: 'Meera R.',  posts: 47, topper: true  },
              { name: 'Priya S.', posts: 38, topper: true  },
              { name: 'Arjun K.', posts: 29, topper: false },
              { name: 'Dev M.',   posts: 21, topper: false },
              { name: 'Sneha P.', posts: 18, topper: false },
            ].map((u, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: ['#f59e0b','#9ca3af','#b45309','#4f46e5','#059669'][i], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 700 }}>{i+1}</div>
                <div className="avatar" style={{ width: 26, height: 26, fontSize: '0.7rem' }}>{u.name[0]}{u.name.split(' ')[1]?.[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>{u.name}</div>
                  {u.topper && <span className="verified-badge" style={{ fontSize: '0.62rem' }}>✓ Topper</span>}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{u.posts}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
