# Frontend Code Review (Code-Only)

## Scope and method
- Started from `AGENTS.md` and graph artifacts, then reviewed core frontend runtime, routing, auth, API client, and representative high-risk pages/components/services in `app/frontend/src`.
- Focused on major gaps: security, correctness, resilience, state consistency, and maintainability.

## Major gaps

1. **Public prototype/admin-like surfaces are exposed in production routes**
   - `/prototype/*` and `/onboarding` prototype routes are always mounted in public routes with no environment guard.
   - Risk: accidental exposure of internal workflows/screens, confusing UX, and potential leakage of mock/admin concepts.
   - Files: `app/frontend/src/routes/publicRoutes.jsx`.

2. **Auth state can claim `authed` even when backend auth is unreachable**
   - `hydrate()` sets `status="authed"` even when backend `/api/auth/me` fails.
   - Risk: UI may present protected backend-dependent features as available, then fail later per-call.
   - File: `app/frontend/src/lib/authContext.jsx`.

3. **No request timeout / cancellation in API client**
   - `apiFetch` uses bare `fetch` without timeout or `AbortController`.
   - Risk: hung requests create frozen loading states and poor mobile/network resilience.
   - File: `app/frontend/src/lib/api.js`.

4. **JSON content-type is forced for every request**
   - `Content-Type: application/json` is set by default for all verbs.
   - Risk: breaks future `FormData`/file upload endpoints and can cause subtle backend parsing issues for empty-body DELETE/GET variants.
   - File: `app/frontend/src/lib/api.js`.

5. **Route-level error boundary usage is likely ineffective for render/runtime errors**
   - `RouteErrorBoundary` is mounted as a normal route element wrapper rather than React Router data-router `errorElement` usage.
   - Risk: unhandled render errors may bypass intended fallback UX.
   - File: `app/frontend/src/routes/appRoutes.jsx`.

6. **Hard-coded role strings duplicated in authorization logic**
   - Admin role checks are repeated (`"admin"`, `"super_admin"`) in context and route protection path.
   - Risk: drift when role model evolves; inconsistent access behavior.
   - Files: `app/frontend/src/lib/authContext.jsx`, `app/frontend/src/routes/adminRoutes.jsx`.

7. **Catch-all redirect can hide real 404 states and debugging signal**
   - `* -> /` forces every unknown path to landing.
   - Risk: masks broken links/regressions and confuses users/developers.
   - File: `app/frontend/src/App.js`.

8. **Tight coupling between auth provider and backend shape without schema validation**
   - `mergeUser` trusts backend and metadata field shapes directly.
   - Risk: malformed API responses silently create inconsistent user model and role resolution.
   - File: `app/frontend/src/lib/authContext.jsx`.

9. **Potential route namespace collision and cognitive overhead**
   - `/onboarding` maps to prototype onboarding while app onboarding also exists (`/app/onboarding`, `/app/onboarding/chat`).
   - Risk: user confusion and QA ambiguity.
   - File: `app/frontend/src/routes/publicRoutes.jsx` and `app/frontend/src/routes/appRoutes.jsx`.

10. **Error object enrichment mutates `Error` with ad hoc fields**
    - `attachStructuredErrorFields` adds many custom properties to `Error` instance.
    - Risk: inconsistent contracts across callsites and weak typing/maintainability.
    - File: `app/frontend/src/lib/api.js`.

## Priority fixes (high-level)
1. Gate prototype routes behind an explicit env flag and remove `/onboarding` prototype alias in production.
2. Split auth status into session-authenticated vs backend-synced; block backend-required screens until synced.
3. Add request timeout + cancellation support in `apiFetch`.
4. Make `Content-Type` conditional: set only when body is plain object/string JSON.
5. Introduce central RBAC constants and shared guards.
6. Add a real 404 page instead of redirecting all unknown paths to `/`.
