# Career Copilot · Test Credentials (Phase 1.5)

Authentication is now handled by **Supabase Auth**. There are no seeded
demo accounts on the backend anymore — every account is a real Supabase
Auth user.

## How to sign in for testing

1. Open the app at `/signup` and create an account with a real email
   provider (Supabase rejects disposable TLDs like `.test`).
2. The Supabase project requires email confirmation, so either
   - confirm the email via the link Supabase sends, or
   - create a pre-confirmed user via the admin API:

```bash
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "you@example.com",
    "password": "YourPass@2026",
    "email_confirm": true,
    "user_metadata": {"name": "Tester"}
  }'
```

3. Sign in at `/login` — the frontend calls `supabase.auth.signInWithPassword`,
   stores the session in localStorage, and attaches the access token as
   `Authorization: Bearer <jwt>` on backend requests.

## Granting admin role

Admin/super_admin routes require `role` in the user's
`app_metadata` (or `user_metadata`):

```bash
curl -X PUT "$SUPABASE_URL/auth/v1/admin/users/<user_id>" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"app_metadata": {"role": "super_admin"}}'
```

Allowed values: `user` (default), `mentor`, `admin`, `super_admin`.

## Auth endpoints

- Frontend → Supabase Auth: signUp, signInWithPassword, signOut,
  resetPasswordForEmail, updateUser({ password }), onAuthStateChange
- Backend → `GET /api/auth/me` (Supabase Bearer token validates the user)

The legacy `/api/auth/{register,login,logout,refresh,forgot-password,reset-password}`
endpoints from Phase 1 have been removed along with MongoDB.
