"""Progressive tiny questions (PR2) — internal persona/profile layer.

Public surface:
    list_active_questions(supabase)
    get_question(supabase, question_key)
    select_next_question(supabase, user_id)
    validate_answer(question, answer_value)
    save_question_answer(supabase, user_id, question_key, answer_value)
    apply_safe_profile_mapping(supabase, user_id, question, normalized)
    emit_question_signal(supabase, user_id, question_key, normalized)

PR2 stays deterministic: no AI, no free-form chatbot, one tiny question
at a time.
"""

from app.persona_questions.answers import (  # noqa: F401
    AnswerValidationError,
    save_question_answer,
    save_question_skip,
    validate_answer,
)
from app.persona_questions.bank import (  # noqa: F401
    get_question,
    latest_question_answers,
    list_active_questions,
    shape_question_for_api,
)
from app.persona_questions.events import emit_question_signal  # noqa: F401
from app.persona_questions.profile_adapter import (  # noqa: F401
    apply_safe_profile_mapping,
)
from app.persona_questions.selector import select_next_question  # noqa: F401
