"""Exam Intelligence Contracts v1 (PR5).

Thin, deterministic READ layer on top of the existing exam intelligence
tables (migrations 029–034). Every read filters to admin-reviewed
``reviewer_status='verified'`` rows. There is **no AI**, no scraping
change, no new table, and no claim about exam content unless an
operator has explicitly verified it.

Public surface:
    resolve_exam_by_slug(supabase, slug)
    list_active_exams(supabase, limit=100)
    locked_topic_coverage_summary(supabase, exam_id)
    verified_pyq_topic_counts(supabase, exam_id)
    exam_intelligence_status(supabase, exam_id_or_slug)
    exam_intelligence_summary(supabase, exam_id_or_slug)
"""

from app.exam_intelligence.lookup import (  # noqa: F401
    list_active_exams,
    resolve_exam_by_slug,
)
from app.exam_intelligence.coverage import (  # noqa: F401
    locked_topic_coverage,
    locked_topic_coverage_summary,
    verified_pyq_topic_counts,
)
from app.exam_intelligence.status import (  # noqa: F401
    exam_intelligence_status,
    exam_intelligence_summary,
)
