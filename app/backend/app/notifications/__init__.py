"""Phase-2 notifications layer.

The Career Copilot data plane fans out to four channels:

    notification_alerts  ─►  dispatcher  ─►  in-app   (always)
                                              email   (Resend, optional)
                                              whatsapp (Phase-3, no-op)

Three governance rules:
    * The deterministic eligibility engine is the only thing that can
      *create* a ``new_match`` alert.
    * Every dispatch respects ``notification_preferences`` per user
      (in_app_enabled / email_enabled / min_priority_*).
    * A global kill switch lives at ``admin_settings.key='notifications_paused'``.
      When set to ``"true"`` the dispatcher and the daily deadline sweep
      both early-return.

This module is split into:
    dispatcher  — consume + render + send + mark email_sent
    scheduler   — APScheduler in-process; three jobs:
                    notif:dispatch        every 2m
                    notif:deadline_sweep  daily 06:00 IST
                    elig:recompute        every 5m
"""
