"""APScheduler in-process job runner.

Three jobs:
    notif:dispatch        every 2 min   — dispatch_pending_alerts
    notif:deadline_sweep  daily 06:00   — send_deadline_alerts (3-day + 1-day)
    elig:recompute        every 5 min   — drain_recompute_queue

Lifecycle is wired into the FastAPI ``lifespan`` in ``server.py``.
The scheduler is a singleton; calls to ``start_scheduler`` are idempotent.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.db.supabase_client import get_supabase_admin
from app.notifications.dispatcher import dispatch_pending_alerts, kill_switch_enabled
from app.notifications.recompute_worker import drain_recompute_queue
from app.scraping.alerts import send_deadline_alerts

logger = logging.getLogger("career_copilot.notifications.scheduler")

_scheduler: BackgroundScheduler | None = None
_last_run: dict[str, dict[str, Any]] = {}


def _wrap(name: str, func) -> Any:
    def runner() -> None:
        started = datetime.now(timezone.utc).isoformat()
        try:
            result = func()
            _last_run[name] = {"at": started, "ok": True, "result": result}
            logger.info("[%s] %s", name, result)
        except Exception as exc:  # noqa: BLE001
            _last_run[name] = {"at": started, "ok": False, "error": str(exc)}
            logger.exception("[%s] failed", name)

    return runner


# ─── Job bodies ─────────────────────────────────────────────────────────────


def _job_dispatch() -> dict[str, Any]:
    return dispatch_pending_alerts(get_supabase_admin())


def _job_deadline_sweep() -> dict[str, Any]:
    sb = get_supabase_admin()
    if kill_switch_enabled(sb):
        return {"killed": True}
    return send_deadline_alerts(sb)


def _job_recompute() -> dict[str, Any]:
    return drain_recompute_queue(get_supabase_admin())


def _job_plan_regen() -> dict[str, Any]:
    # Imported lazily — the planner pulls in a chunk of the study_os
    # package, and the scheduler module is imported early in startup.
    from app.study_os.regen import regenerate_stale_plans

    return regenerate_stale_plans(get_supabase_admin())


# Public registry — also used by the manual-trigger admin endpoint.
JOBS: dict[str, callable] = {  # type: ignore[type-arg]
    "notif:dispatch": _job_dispatch,
    "notif:deadline_sweep": _job_deadline_sweep,
    "elig:recompute": _job_recompute,
    "study:plan_regen": _job_plan_regen,
}


# ─── Lifecycle ──────────────────────────────────────────────────────────────


def start_scheduler() -> BackgroundScheduler | None:
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    if os.environ.get("DISABLE_SCHEDULER", "").lower() in {"1", "true", "yes"}:
        logger.info("scheduler disabled via DISABLE_SCHEDULER env")
        return None

    sched = BackgroundScheduler(timezone="UTC")

    sched.add_job(
        _wrap("notif:dispatch", _job_dispatch),
        IntervalTrigger(minutes=2),
        id="notif:dispatch",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    # Daily 06:00 IST = 00:30 UTC
    sched.add_job(
        _wrap("notif:deadline_sweep", _job_deadline_sweep),
        CronTrigger(hour=0, minute=30, timezone="UTC"),
        id="notif:deadline_sweep",
        replace_existing=True,
    )
    sched.add_job(
        _wrap("elig:recompute", _job_recompute),
        IntervalTrigger(minutes=5),
        id="elig:recompute",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    # Daily 03:00 UTC — refresh active study plans not regenerated today.
    sched.add_job(
        _wrap("study:plan_regen", _job_plan_regen),
        CronTrigger(hour=3, minute=0, timezone="UTC"),
        id="study:plan_regen",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    sched.start()
    _scheduler = sched
    logger.info("APScheduler started: %s", [j.id for j in sched.get_jobs()])
    return sched


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        try:
            _scheduler.shutdown(wait=False)
        except Exception:
            pass
        _scheduler = None


def list_jobs() -> list[dict[str, Any]]:
    if _scheduler is None:
        return []
    out: list[dict[str, Any]] = []
    for job in _scheduler.get_jobs():
        last = _last_run.get(job.id)
        out.append(
            {
                "id": job.id,
                "next_run_at": str(job.next_run_time) if job.next_run_time else None,
                "trigger": str(job.trigger),
                "last_run": last,
            }
        )
    return out


def run_job_now(job_id: str) -> dict[str, Any]:
    fn = JOBS.get(job_id)
    if fn is None:
        raise KeyError(job_id)
    started = datetime.now(timezone.utc).isoformat()
    try:
        result = fn()
        _last_run[job_id] = {"at": started, "ok": True, "result": result, "manual": True}
        return {"ok": True, "result": result}
    except Exception as exc:  # noqa: BLE001
        _last_run[job_id] = {"at": started, "ok": False, "error": str(exc), "manual": True}
        return {"ok": False, "error": str(exc)}
