import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";

export default function BlogDetail() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);

  useEffect(() => {
    api.get(`/api/blogs/${slug}`).then(setPost).catch(() => setPost(null));
  }, [slug]);

  if (!post) return <main className="container py-8">Blog not found.</main>;

  return <main className="container py-8">
    <article className="card p-4">
      <h1 className="text-2xl font-bold">{post.title}</h1>
      <p className="text-sm text-muted-foreground">Last updated: {post.updated_at}</p>
      <p className="mt-3">{post.excerpt}</p>
      <div className="prose mt-3 whitespace-pre-wrap">{post.content}</div>
      {post.primary_cta_label && post.primary_cta_url ? <Link className="btn mt-4" to={post.primary_cta_url}>{post.primary_cta_label}</Link> : null}
    </article>
  </main>;
}
