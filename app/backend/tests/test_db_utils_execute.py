import pytest

from app.core.errors import DatabaseError
from app.db.utils import execute_or_default, execute_or_raise


def test_execute_or_raise_returns_value():
    assert execute_or_raise("op", lambda: 123) == 123


def test_execute_or_raise_wraps_exception():
    with pytest.raises(DatabaseError):
        execute_or_raise("op", lambda: (_ for _ in ()).throw(RuntimeError("boom")))


def test_execute_or_default_returns_default_on_failure():
    out = execute_or_default("op", lambda: (_ for _ in ()).throw(RuntimeError("boom")), [])
    assert out == []
