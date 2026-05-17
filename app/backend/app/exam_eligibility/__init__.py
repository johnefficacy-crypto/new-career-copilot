"""Exam-level baseline eligibility (PR-D1).

Surface:
  * :func:`evaluator.evaluate_exam_for_user` — pure per-exam decision.
  * :func:`evaluator.summarize_user_eligibility` — group every active exam
    with at least one verified rule by status: eligible / conditional /
    not_eligible / unknown.
"""
