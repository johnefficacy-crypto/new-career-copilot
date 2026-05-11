from app.notifications.dispatcher import dispatch_pending_alerts


class _Exec:
    @property
    def data(self):
        raise RuntimeError("column notification_alerts.email_sent does not exist")


class _Q:
    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        return _Exec()


class _SB:
    def table(self, _name):
        return _Q()


def test_dispatch_skips_cleanly_when_email_sent_column_missing():
    out = dispatch_pending_alerts(_SB())

    assert out == {"checked": 0, "in_app": 0, "emailed": 0, "skipped": 0, "failed": 0, "killed": 0}


class _KillExec:
    def __init__(self, data):
        self.data = data


class _KillQ:
    def __init__(self, table, calls):
        self.table = table
        self.calls = calls

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        self.calls.append(self.table)
        if self.table == "admin_settings":
            return _KillExec([{"value": "true"}])
        return _KillExec([])


class _KillSB:
    def __init__(self):
        self.calls = []

    def table(self, name):
        return _KillQ(name, self.calls)


def test_dispatch_respects_notification_kill_switch():
    sb = _KillSB()

    out = dispatch_pending_alerts(sb)

    assert out == {"checked": 0, "in_app": 0, "emailed": 0, "skipped": 0, "failed": 0, "killed": 1}
    assert sb.calls == ["admin_settings"]
