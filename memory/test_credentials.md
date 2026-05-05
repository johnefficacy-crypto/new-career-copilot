# Career Copilot · Test Credentials (Phase 1)

| Role        | Email                            | Password             |
|-------------|----------------------------------|----------------------|
| Super Admin | superadmin@careercopilot.in | SuperAdmin@2026 |
| Admin       | _(create from /admin/rbac via super admin)_ | —                    |
| Mentor      | mentor@careercopilot.in    | Mentor@2026     |
| User (demo) | aspirant@careercopilot.in    | Aspirant@2026     |

## Auth endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET  /api/auth/me
- POST /api/auth/refresh
- POST /api/auth/forgot-password
- POST /api/auth/reset-password

Auth flow uses JWT Bearer tokens (returned in response body) plus SameSite=None cookies.
Frontend stores `access_token` in localStorage and sends it as `Authorization: Bearer <token>`.
