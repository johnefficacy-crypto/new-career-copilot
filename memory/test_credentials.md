# Career Copilot · Test Credentials (Phase 1.5 + Phase 2)

Authentication is handled by **Supabase Auth**. There are no seeded
demo accounts on the backend — every account is a real Supabase
Auth user.

## Test admin / payments user

Created during Razorpay end-to-end tests. Already promoted to
`super_admin` and has at least one paid subscription on file.

```
email:    razortest+1778018301@inbox.testreal.dev
password: RazorPass@2026
role:     super_admin
user_id:  9ea717da-6b10-408e-a1fd-04a633a16b88
```

> If this user has been deleted, the test scripts in this repo can
> recreate it via the Supabase admin API (see snippets below).

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

## Razorpay test cards (Razorpay Checkout)

Test mode keys are already wired into `backend/.env` and
`NEXT_PUBLIC_RAZORPAY_KEY_ID`. Use any of:

- Card: `4111 1111 1111 1111` · CVV `123` · any future expiry
- UPI:  `success@razorpay`
- Netbanking: pick any test bank → "Success"

The webhook secret is intentionally a placeholder
(`XXXXXXXXXXXXXXXXXXXXXXXX`); set a real one in `backend/.env` and
register `${REACT_APP_BACKEND_URL}/api/payments/webhook` in the
Razorpay dashboard before going live.

## Auth endpoints

- Frontend → Supabase Auth: signUp, signInWithPassword, signOut,
  resetPasswordForEmail, updateUser({ password }), onAuthStateChange
- Backend → `GET /api/auth/me` (Supabase Bearer token validates the user)

The legacy `/api/auth/{register,login,logout,refresh,forgot-password,reset-password}`
endpoints from Phase 1 have been removed along with MongoDB.
