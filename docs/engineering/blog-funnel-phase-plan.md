# Blog Funnel Implementation Plan (Mapped to Current Codebase)

## Route map
- Public list: `GET /api/blogs` -> `app/backend/app/api/blogs.py`
- Public detail: `GET /api/blogs/{slug}` -> `app/backend/app/api/blogs.py`
- Admin list: `GET /api/admin/blogs` -> `app/backend/app/api/blogs.py`
- Admin create: `POST /api/admin/blogs` -> `app/backend/app/api/blogs.py`
- Admin update: `PUT /api/admin/blogs/{blog_id}` -> `app/backend/app/api/blogs.py`
- Public UI routes: `/blog`, `/blog/:slug` -> `app/frontend/src/routes/publicRoutes.jsx`
- Admin UI route: `/admin/blogs` -> `app/frontend/src/routes/adminRoutes.jsx`

## DB migration map
- Migration file: `app/supabase/migrations/101_blog_foundation.sql`
- Adds phase-1 core entities:
  - `blog_posts`, `blog_categories`, `blog_tags`, `blog_post_tags`, `blog_ctas`, `blog_recruitment_links`
- Includes indexes for status + publish recency queries.

## Admin CRUD fields in Phase 1
Implemented now:
- title, slug, excerpt, content, status
- primary_intent, primary_cta_label, primary_cta_url
- seo_title, seo_description

Deferred to Phase 2/3 (but schema-ready):
- canonical URL, robots index, linked recruitment/org
- secondary CTA and richer CTA placements
- SEO diagnostics panel + structured-data warnings

## Event tracking schema (Phase 3 target)
- Keep event table separate to avoid write amplification in read APIs.
- Proposed event contract:
  - `event_type`: `blog_view`, `blog_cta_click`, `blog_signup_start`, `blog_signup_complete`
  - `source`: `blog`
  - dimensions: `blog_post_id`, `intent`, `recruitment_id`, `exam`, `session_id`, `user_id`
- Reuse existing analytics/event pipeline patterns in backend for consistency.

## Phase sequencing mapped to repo
1. **Phase 1 (this PR)**
   - DB schema, backend CRUD APIs, admin page, public list/detail routes.
2. **Phase 2 (next)**
   - SSR/static blog head tags, canonical, OG/Twitter, JSON-LD, sitemap + robots.
3. **Phase 3**
   - CTA block targeting + source/intent propagation and attribution.
4. **Phase 4**
   - stale content automation + dashboard conversions.
