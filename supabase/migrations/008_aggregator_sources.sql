-- Migration 008: Add top Indian govt-job aggregator sources
-- Uses exact values from DB CHECK constraints (sourced from lib/constants/source-registry.ts):
--   category:       central_govt | banking | regulatory | insurance | psu |
--                   state_psc | state_subordinate | university | cet | defence |
--                   courts | municipal | boards | commissions
--   source_type:    official_central | official_state | official_psu | official_bank |
--                   official_insurance | aggregator | rss_feed | manual | ...
--   adapter_type:   html | rss | json | pdf | playwright | manual
--   anti_bot_risk:  none | low | medium | high | blocked
--   jurisdiction:   central | state | ut | autonomous
--   tier:           1–4

INSERT INTO public.source_registry (
  source_name, source_type, category, jurisdiction,
  official_url, notification_url, rss_url, adapter_type,
  scrape_interval_hours, tier, trust_score, anti_bot_risk,
  is_active, requires_playwright, parser_config, notes
)
SELECT
  'Employment News (GOI)',
  'aggregator', 'central_govt', 'central',
  'https://www.employmentnews.gov.in',
  'https://www.employmentnews.gov.in/Main/Rss.aspx',
  'https://www.employmentnews.gov.in/Main/Rss.aspx',
  'rss', 6, 1, 0.95, 'none', true, false,
  '{}',
  'Official GOI weekly newspaper. RSS feed. Covers all central govt notifications. Direct RSS extraction — zero LLM cost.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.source_registry WHERE official_url = 'https://www.employmentnews.gov.in'
);

INSERT INTO public.source_registry (
  source_name, source_type, category, jurisdiction,
  official_url, notification_url, rss_url, adapter_type,
  scrape_interval_hours, tier, trust_score, anti_bot_risk,
  is_active, requires_playwright, parser_config, notes
)
SELECT
  'FreeJobAlert',
  'aggregator', 'central_govt', 'central',
  'https://www.freejobalert.com',
  'https://www.freejobalert.com/latest-notifications/',
  'https://www.freejobalert.com/feed/',
  'rss', 4, 1, 0.85, 'low', true, false,
  '{}',
  'Largest Indian govt-job aggregator. RSS feed covers central + state. ~500 new notifications/month. Direct RSS extraction.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.source_registry WHERE official_url = 'https://www.freejobalert.com'
);

INSERT INTO public.source_registry (
  source_name, source_type, category, jurisdiction,
  official_url, notification_url, rss_url, adapter_type,
  scrape_interval_hours, tier, trust_score, anti_bot_risk,
  is_active, requires_playwright, parser_config, notes
)
SELECT
  'Sarkari Result',
  'aggregator', 'central_govt', 'central',
  'https://www.sarkariresult.com',
  'https://www.sarkariresult.com/latestjob/',
  NULL,
  'html', 6, 1, 0.80, 'medium', true, false,
  '{"items_selector": ".TableRow", "title_selector": "a", "link_selector": "a"}',
  'High-traffic aggregator. No RSS — HTML scrape with ETag. 1 LLM call per changed page.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.source_registry WHERE official_url = 'https://www.sarkariresult.com'
);

INSERT INTO public.source_registry (
  source_name, source_type, category, jurisdiction,
  official_url, notification_url, rss_url, adapter_type,
  scrape_interval_hours, tier, trust_score, anti_bot_risk,
  is_active, requires_playwright, parser_config, notes
)
SELECT
  'Rojgar Samachar',
  'aggregator', 'state_psc', 'state',
  'https://rojgarsamachar.gov.in',
  'https://rojgarsamachar.gov.in/rss.xml',
  'https://rojgarsamachar.gov.in/rss.xml',
  'rss', 12, 2, 0.80, 'none', true, false,
  '{}',
  'Official state-level employment newspaper. Strong Hindi-belt + state PSC coverage. Direct RSS extraction.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.source_registry WHERE official_url = 'https://rojgarsamachar.gov.in'
);

INSERT INTO public.source_registry (
  source_name, source_type, category, jurisdiction,
  official_url, notification_url, rss_url, adapter_type,
  scrape_interval_hours, tier, trust_score, anti_bot_risk,
  is_active, requires_playwright, parser_config, notes
)
SELECT
  'IBPS CRP Notifications',
  'official_bank', 'banking', 'central',
  'https://www.ibps.in',
  'https://www.ibps.in/crp-notifications/',
  NULL,
  'html', 12, 1, 0.90, 'low', true, false,
  '{}',
  'Centralised banking recruitment — covers all PSBs via CRP. Tier-1 authoritative source.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.source_registry WHERE official_url = 'https://www.ibps.in'
);
