import pytest

from app.common.indexing import group_by, index_by, normalize_token
from app.common.state_machine import InvalidTransition, transition
from app.queues.priority import deadline_priority


def test_indexing_helpers():
    rows = [{"id": "a", "type": "x"}, {"id": "b", "type": "x"}, {"type": "missing"}]

    assert index_by(rows, "id") == {"a": rows[0], "b": rows[1]}
    assert group_by(rows, "type")["x"] == rows[:2]
    assert normalize_token("SSC-CGL 2026") == "ssc_cgl_2026"


def test_state_machine_transition():
    transitions = {"pending": {"approve": "approved"}}

    assert transition("pending", "approve", transitions) == "approved"
    with pytest.raises(InvalidTransition):
        transition("pending", "publish", transitions)


def test_deadline_priority():
    assert deadline_priority(None) == 0
    assert deadline_priority(-1) == -100
    assert deadline_priority(1) == 100
    assert deadline_priority(5) == 50
    assert deadline_priority(30) == 10
