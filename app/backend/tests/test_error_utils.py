import logging

from app.core.error_utils import format_error_context, log_warning_with_context


def test_format_error_context_includes_sorted_pairs():
    msg = format_error_context("op.name", b=2, a="x")
    assert msg == "op.name [a='x', b=2]"


def test_log_warning_with_context_emits_operation(caplog):
    logger = logging.getLogger("test.error.utils")
    with caplog.at_level(logging.WARNING):
        log_warning_with_context(logger, "op.name", RuntimeError("boom"), user_id="u1")
    assert "op.name [user_id='u1'] failed: boom" in caplog.text

