# Exam Intelligence Import Checklist (Real Data Only)

Complete this checklist before promoting any row to reviewed/verified/locked.

## Exam + Registry
- [ ] Exam family / exam / cycle / phase rows created with deterministic IDs.
- [ ] Cycle URL points to official notification source.
- [ ] No blind overwrite of existing production rows.

## Syllabus Evidence
- [ ] Official syllabus source URL recorded.
- [ ] Fetched date and/or content hash recorded.
- [ ] Reviewer identity (admin) recorded for approval actions.
- [ ] Every syllabus topic mention has mapping notes and review status.

## PYQ Evidence
- [ ] PYQ source type recorded (`official` / otherwise) with trust status.
- [ ] Every PYQ question has explicit review status.
- [ ] Every question-topic tag has explicit review status.
- [ ] Verified PYQ counts are only derived from verified-question + verified-tag pairs.

## Topic Coverage
- [ ] Every high-yield flag has written reason in reviewer/admin notes.
- [ ] Coverage rows remain pending/reviewed until evidence is complete.
- [ ] `locked` used only after reviewer confirmation of evidence chain.

## Competition Metrics
- [ ] Evidence count documented and non-zero when claiming confidence.
- [ ] Reviewer status is pending/reviewed/locked per review stage.

## Policy Updates
- [ ] Every `affects_* = true` row has official source proof.
- [ ] Every plan/deadline/eligibility/documents/syllabus/vacancy effect is tied to `source_type='official'` + `reviewer_status='verified'`.
- [ ] Aggregator/research/opportunity rows keep all `affects_* = false`.

## Final Readiness Gate
- [ ] Run: `python app/backend/scripts/validate_exam_intelligence_seed.py --exam-slug <slug>`
- [ ] Run strict gate: `python app/backend/scripts/validate_exam_intelligence_seed.py --exam-slug <slug> --strict`
- [ ] Resolve FAILs before enabling planner dependency.
