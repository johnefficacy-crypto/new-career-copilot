import React, { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { api } from "../lib/api";

export default function AIChat() {
  const [guidance, setGuidance] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const normalize = (m) => ({ message: typeof m?.message === "string" ? m.message : (typeof m?.content === "string" ? m.content : ""), reply: typeof m?.reply === "string" ? m.reply : (m?.role === "assistant" ? (m?.content || "") : (typeof m?.assistant === "string" ? m.assistant : null)) });
  const endRef = useRef(null);

  useEffect(() => {
    api.get("/api/ai/guidance").then(setGuidance).catch(() => {});
    api.get("/api/ai/history").then((d) => setMessages((Array.isArray(d?.items) ? d.items : []).map(normalize).filter((m) => m.message || m.reply))).catch((e) => { if (process.env.NODE_ENV !== "production") console.error(e); });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(msg, promptId) {
    const body = msg ?? text;
    if (!body?.trim()) return;
    setSending(true);
    setText("");
    setMessages((m) => [...m, { message: body, reply: null }]);
    try {
      const r = await api.post("/api/ai/chat", { message: body, prompt_id: promptId });
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { message: body, reply: r.reply };
        return next;
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-4 gap-4 h-[calc(100vh-7rem)]" data-testid="ai-chat-page">
      <aside className="soft-card rounded-2xl p-4 space-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Copilot AI</div>
          <div className="font-heading text-lg font-semibold mt-1">{guidance?.greeting || "Hey, ready when you are."}</div>
          <div className="text-xs text-muted-foreground mt-2">{guidance?.note}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Quick prompts</div>
          <div className="space-y-1.5">
            {(guidance?.prompts || []).map((p) => (
              <button
                key={p.id}
                onClick={() => send(p.title, p.id)}
                data-testid={`ai-prompt-${p.id}`}
                className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-clay-50 border border-transparent hover:border-clay-200"
              >
                {p.title}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="lg:col-span-3 flex flex-col soft-card rounded-2xl">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="h-8 w-8 rounded-full bg-dusk-800 text-white grid place-items-center"><Bot className="h-4 w-4" /></div>
          <div>
            <div className="font-heading font-semibold">Copilot AI</div>
            <div className="text-[11px] text-muted-foreground">Explanatory only · does not override official data</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="max-w-md mx-auto text-center py-12 text-muted-foreground">
              <Sparkles className="h-5 w-5 text-clay-500 mx-auto" />
              <div className="mt-3 font-heading text-lg font-semibold">Ask anything about your prep.</div>
              <div className="text-sm">Try one of the quick prompts on the left.</div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i}>
              <div className="flex justify-end">
                <div className="max-w-lg bg-clay-500 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm">{String(m.message || "")}</div>
              </div>
              {m.reply != null ? (
                <div className="flex justify-start mt-2">
                  <div className="max-w-2xl bg-clay-50 border border-clay-100 text-foreground rounded-2xl rounded-tl-sm px-4 py-3 text-sm whitespace-pre-wrap">
                    {String(m.reply || "")}
                  </div>
                </div>
              ) : (
                <div className="flex justify-start mt-2">
                  <div className="bg-clay-50 rounded-2xl px-4 py-3 text-sm text-muted-foreground">thinking…</div>
                </div>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="p-4 border-t border-border flex gap-2"
          data-testid="ai-form"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask about your plan, your eligibility, your next step…"
            className="flex-1 px-4 py-2.5 rounded-full bg-white/80 border border-border text-sm"
            data-testid="ai-input"
          />
          <button disabled={sending} className="btn btn-primary" data-testid="ai-send">
            <Send className="h-4 w-4" /> Send
          </button>
        </form>
      </div>
    </div>
  );
}
