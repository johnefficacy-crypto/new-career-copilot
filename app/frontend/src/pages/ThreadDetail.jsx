import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUp, Pin, Send } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/authContext";

export default function ThreadDetail() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const auth = useAuth();

  async function load() {
    const d = await api.get(`/api/community/threads/${slug}`);
    setData(d);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [slug]);

  async function send(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/community/threads/${slug}/posts`, { body: reply });
      setReply("");
      await load();
    } finally {
      setSending(false);
    }
  }

  async function vote() {
    await api.post(`/api/community/threads/${slug}/vote`, {});
    await load();
  }

  if (!data) return <div data-testid="thread-loading">Loading…</div>;
  const t = data.thread;

  return (
    <div className="space-y-6" data-testid={`thread-detail-${slug}`}>
      <Link to="/app/community" className="inline-flex items-center gap-1 text-sm text-muted-foreground link-under">
        <ArrowLeft className="h-4 w-4" /> Community
      </Link>
      <div className="soft-card rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <button onClick={vote} className="flex flex-col items-center gap-1 text-muted-foreground hover:text-clay-600" data-testid="vote-btn">
            <ArrowUp className="h-5 w-5" />
            <div className="text-sm font-semibold text-foreground">{t.votes}</div>
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {t.pinned && <span className="inline-flex items-center gap-1 text-clay-700 font-bold uppercase tracking-wider"><Pin className="h-3 w-3" /> Pinned</span>}
              <span className="font-semibold">{t.author}</span>
              {t.badge && <span className="pill pill-dusk">{t.badge}</span>}
              {t.tag && <span className="pill pill-clay">{t.tag}</span>}
            </div>
            <h1 className="font-heading text-2xl md:text-3xl font-semibold mt-2">{t.title}</h1>
            <p className="mt-4 text-foreground/85 leading-relaxed whitespace-pre-wrap">{t.body}</p>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{data.posts.length} replies</div>
        <div className="mt-3 space-y-3">
          {data.posts.map((p) => (
            <div key={p.id} className="soft-card rounded-2xl p-5">
              <div className="text-xs font-semibold mb-2">{p.author}</div>
              <div className="text-foreground/85 whitespace-pre-wrap">{p.body}</div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={send} className="soft-card rounded-2xl p-5" data-testid="reply-form">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Reply as {auth.user?.name}</div>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={4}
          className="w-full mt-2 px-4 py-3 rounded-xl bg-white/80 border border-border text-sm outline-none"
          placeholder="Add to the thread…"
          data-testid="reply-body"
        />
        <div className="flex justify-end mt-3">
          <button className="btn btn-primary" disabled={sending} data-testid="reply-submit">
            <Send className="h-4 w-4" /> Post reply
          </button>
        </div>
      </form>
    </div>
  );
}
