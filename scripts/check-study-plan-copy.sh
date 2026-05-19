#!/usr/bin/env bash
set -e
forbidden=(
  "Regenerate with AI"
  "Regenerate using AI"
  "Apply AI changes"
  "AI-generated plan"
  "AI controls plan"
  "Let AI plan for you"
)
paths=(
  "app/frontend/src/pages/study"
  "app/frontend/src/pages/StudyPlan.jsx"
)
fail=0
for s in "${forbidden[@]}"; do
  if grep -rn --include="*.jsx" --include="*.js" --include="*.tsx" \
              --include="*.ts" -F "$s" "${paths[@]}" 2>/dev/null; then
    echo "FORBIDDEN: $s"
    fail=1
  fi
done
exit $fail
