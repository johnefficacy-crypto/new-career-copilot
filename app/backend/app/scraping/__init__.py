"""Phase-2 scraping module — direct Python port of
``UI-career-copilot/lib/scraping/{extractor,runner,alerts}.ts`` (master).

The deterministic eligibility engine and this scraper trust gate are the
two governance gates of Career Copilot's data plane:

    source_registry   ─►  scrape_runs  ─►  scrape_queue  ─►  recruitments
                                                  │
                                                  └──►  notification_alerts

Every queued item lands with ``status='pending'`` regardless of model
confidence. Promotion is an explicit admin decision (the May 2026
"never auto-approve" hardening referenced in the TS runner).

Public entry points:
    extractor.fetch_page_text(url)
    extractor.extract_recruitment_data(text, source_url, source_name)
    runner.run_scraping_pass(triggered_by, triggered_by_user, source_ids?)
    runner.promote_to_recruitments(extracted, supabase) → recruitment_id
    alerts.alert_users_for_new_recruitment(recruitment_id)
    alerts.send_deadline_alerts()
"""
