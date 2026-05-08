# Contributing to Career Copilot

Thanks for contributing.

## Development workflow

1. Create a branch from the active integration branch.
2. Make focused, reviewable commits.
3. Run tests before opening a PR.
4. Open a PR with:
   - motivation
   - summary of changes
   - testing evidence
   - follow-up items (if any)

## Backend setup

```bash
cd app/backend
pip install -r requirements.txt
```

Run locally:

```bash
uvicorn server:app --reload --port 8000
```

## Testing

From `app/backend`:

```bash
pytest
```

Targeted command commonly used during runbook work:

```bash
pytest tests/test_error_utils.py tests/test_eligibility_mapper.py tests/test_recompute_queue_behaviour.py
```

## Style and scope expectations

- Preserve deterministic behavior in eligibility engine and runner paths.
- Avoid unrelated refactors in feature-specific PRs.
- Do not change schema in backend-only PRs unless migration is explicitly included.
- Prefer small helper extraction and explicit naming over broad abstraction.

## Review checklist

- [ ] Changes are scoped to stated task.
- [ ] Tests are updated/added where needed.
- [ ] API docs/docstrings updated if endpoint behavior changes.
- [ ] Migrations/docs updated when schema changes.
- [ ] No secrets in code or logs.
