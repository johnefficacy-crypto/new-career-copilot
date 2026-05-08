# Secret rotation runbook

## Scope

This runbook covers operational rotation for backend secrets used by Career Copilot:

- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (frontend public key; rotate in coordination)
- `DATABASE_URL` (if managed outside Supabase default)
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RESEND_API_KEY` (if email sending enabled)

## Cadence

- **High-privilege keys** (`SUPABASE_SERVICE_ROLE_KEY`, webhook/payment secrets): every **90 days**.
- **Provider API keys** (LLM/email): every **90–180 days** based on provider policy.
- **Emergency rotation**: immediate on suspected leakage.

## Rotation procedure (minimal downtime)

1. Create a new secret in provider console.
2. Store the new value in deployment secret manager/environment.
3. Redeploy backend with new secrets.
4. Validate health endpoints and critical API flows.
5. Revoke old secret in provider console.
6. Record rotation event in internal ops log (date, owner, systems affected).

## Validation checklist

- `/api/health` and `/api/db-health` are healthy.
- Eligibility recompute path works.
- Admin scrape run path works (if relevant API keys rotated).
- Payment webhook verification still passes (if webhook secret rotated).

## Safety notes

- Never print secrets in logs.
- Never commit secrets to repo.
- Use env/secret manager only.
