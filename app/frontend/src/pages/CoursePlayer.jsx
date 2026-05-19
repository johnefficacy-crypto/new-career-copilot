import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, Lock, Play } from "lucide-react";
import { api, getApiErrorMessage } from "../lib/api";

export default function CoursePlayer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [access, setAccess] = useState(null);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [error, setError] = useState("");

  const loadCourse = useCallback(async () => {
    try {
      const [detail, acc] = await Promise.all([
        api.get(`/api/marketplace/resources/${id}`),
        api.get(`/api/marketplace/resources/${id}/access`),
      ]);
      setCourse(detail);
      setAccess(acc);
      if (acc?.state !== "enrolled" && acc?.state !== "refund_requested") {
        navigate(`/app/marketplace/${id}`, { replace: true });
      }
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  }, [id, navigate]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  const enrolled = access?.state === "enrolled";

  const lessons = useMemo(() => {
    const sections = course?.sections || [];
    return sections.flatMap((s) => (s.lessons || []).map((l) => ({ ...l, section: s.title })));
  }, [course]);

  const openLesson = async (lesson) => {
    if (!lesson.is_preview && !enrolled) return;
    setError("");
    try {
      const data = await api.get(`/api/marketplace/resources/${id}/lessons/${lesson.id}`);
      setCurrentLesson(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  };

  const markComplete = async () => {
    if (!currentLesson) return;
    try {
      await api.put(
        `/api/marketplace/resources/${id}/lessons/${currentLesson.id}/progress`,
        { completed: true, percent: 100 },
      );
      const data = await api.get(`/api/marketplace/resources/${id}/lessons/${currentLesson.id}`);
      setCurrentLesson(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  };

  if (error && !course) return <div className="text-sm text-rose-700">{error}</div>;
  if (!course) return <div>Loading…</div>;

  return (
    <div className="space-y-4" data-testid={`player-${id}`}>
      <Link to={`/app/marketplace/${id}`} className="text-sm text-muted-foreground link-under inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to course
      </Link>
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Course player</div>
          <h1 className="font-heading text-2xl font-semibold">{course.title}</h1>
        </div>
        {access?.state === "refund_requested" ? (
          <div className="text-xs rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
            Refund requested — access will end if approved.
          </div>
        ) : null}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <aside className="soft-card rounded-2xl p-4 lg:col-span-1">
          <div className="space-y-3">
            {(course.sections || []).map((s) => (
              <div key={s.id}>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{s.title}</div>
                <ul className="mt-1 space-y-1">
                  {(s.lessons || []).map((l) => {
                    const locked = !l.is_preview && !enrolled;
                    const active = currentLesson?.id === l.id;
                    return (
                      <li key={l.id}>
                        <button
                          onClick={() => openLesson(l)}
                          disabled={locked}
                          data-testid={`lesson-${l.id}`}
                          className={`w-full text-left text-sm px-2 py-1.5 rounded-md inline-flex items-center gap-2 ${
                            active ? "bg-[#FFFDF9] border border-[#D9C7A7]" : "hover:bg-[#FBF8F2]"
                          } ${locked ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          {locked ? <Lock className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          <span className="flex-1">{l.title}</span>
                          {l.duration_mins ? <span className="text-xs text-muted-foreground">{l.duration_mins}m</span> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        <section className="soft-card rounded-2xl p-6 lg:col-span-2 min-h-[400px]">
          {error ? <div className="text-xs text-rose-700 mb-3">{error}</div> : null}
          {!currentLesson ? (
            <div className="text-sm text-muted-foreground">
              Pick a lesson from the list to start.
              {lessons.length === 0 ? " (No lessons yet.)" : ""}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  {currentLesson.section?.title}
                </div>
                <h2 className="font-heading text-xl font-semibold">{currentLesson.title}</h2>
              </div>
              {currentLesson.type === "video" && currentLesson.content_url ? (
                <video
                  className="w-full rounded-xl bg-black"
                  src={currentLesson.content_url}
                  controls
                  data-testid="lesson-video"
                />
              ) : currentLesson.content_url ? (
                <a className="link-under text-sm" href={currentLesson.content_url} target="_blank" rel="noreferrer">
                  Open lesson material
                </a>
              ) : null}
              {currentLesson.content_text ? (
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-clay-800">
                  {currentLesson.content_text}
                </div>
              ) : null}
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                {currentLesson.progress?.completed ? (
                  <span className="text-sm text-sage-700 inline-flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> Completed
                  </span>
                ) : (
                  <button onClick={markComplete} className="btn btn-primary text-xs" data-testid="lesson-complete-btn">
                    Mark complete
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
