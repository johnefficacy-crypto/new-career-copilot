import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export default function Blogs() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get("/api/blogs").then((d) => setItems(d.items || [])).catch(() => setItems([]));
  }, []);
  return <main className="container py-8">
    <h1 className="text-2xl font-bold">Career Copilot Blog</h1>
    <p className="text-sm text-muted-foreground">Exam discovery + eligibility + preparation action.</p>
    <div className="stack mt-4" style={{ gap: 12 }}>
      {items.map((x) => <article key={x.id} className="card p-4">
        <h2 className="text-lg font-semibold"><Link to={`/blog/${x.slug}`}>{x.title}</Link></h2>
        <p className="text-sm">{x.excerpt}</p>
      </article>)}
    </div>
  </main>;
}
