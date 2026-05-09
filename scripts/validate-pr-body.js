#!/usr/bin/env node
const fs = require('fs');

function getBody() {
  const path = process.argv[2] || process.env.PR_BODY_FILE;
  if (path && fs.existsSync(path)) return fs.readFileSync(path, 'utf8');
  if (process.env.PR_BODY) return process.env.PR_BODY;
  throw new Error('No PR body provided. Use argv[2], PR_BODY_FILE, or PR_BODY.');
}

const requiredSections = [
  'Summary',
  'Problem / Gap Addressed',
  'Implemented in This PR',
  'Remaining Work / Intentionally Deferred',
  'Files Changed',
  'API Contracts Touched',
  'UI States Covered',
  'Accessibility Checklist',
  'Manual Test Checklist',
  'Commands Run',
];

const placeholderPhrases = [
  'What changed at a high level?',
  'Why this PR exists now?',
  'Item 1', 'Item 2', 'Item 3',
  'Scenario 1', 'Scenario 2', 'Scenario 3',
  'Paste exact commands and outcome markers',
  'path/to/file', 'Why it changed',
  'where?',
];

function sectionContent(body, section) {
  const esc = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`##\\s+${esc}\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i');
  const m = body.match(re);
  return m ? m[1].trim() : '';
}

function isEmptyOrPlaceholder(content, section) {
  if (!content) return true;
  const lowered = content.toLowerCase();
  const stripped = lowered.replace(/[\s`>*#|:-]/g, '');
  if (!stripped) return true;
  const allPlaceholder = placeholderPhrases.every((p) => lowered.includes(p.toLowerCase())) || placeholderPhrases.some((p) => lowered === p.toLowerCase());
  if (allPlaceholder) return true;
  if (section !== 'API Contracts Touched' && /^n\/?a\.?$/i.test(content)) return true;
  return false;
}

function fail(msg) { console.error(`❌ ${msg}`); process.exitCode = 1; }

const body = getBody();

requiredSections.forEach((section) => {
  const content = sectionContent(body, section);
  if (!content) return fail(`Missing required section: ${section}`);
  if (isEmptyOrPlaceholder(content, section)) return fail(`Section is empty or placeholder-only: ${section}`);

  if (section === 'Implemented in This PR') {
    const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
    const checked = lines.filter((l) => /^-\s*\[[xX]\]/.test(l));
    if (checked.length === 0) fail('"Implemented in This PR" must include at least one checked item.');
  }

  if (section === 'Commands Run') {
    const cleaned = content
      .replace(/```[\s\S]*?```/g, (m) => m.replace(/#\s*✅\s*command-that-passed/gi, '').replace(/#\s*⚠️\s*command-with-environment-limitation/gi, '').replace(/#\s*❌\s*command-that-failed-due-to-code/gi, ''))
      .replace(/#.*$/gm, '')
      .trim();
    if (!cleaned || !/[a-z0-9]/i.test(cleaned)) fail('"Commands Run" must include real command/result content.');
  }
});

if (process.exitCode) process.exit(process.exitCode);
console.log('✅ PR body validation passed.');
