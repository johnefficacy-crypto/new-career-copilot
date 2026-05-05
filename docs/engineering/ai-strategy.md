# Career Copilot — AI Strategy

_Last updated: 2026-04-30_

Consolidates: AI automation implementation plan, aspirant personalization strategy, PYQ microtopic analysis architecture.

---

## 1. AI positioning

AI in Career Copilot is an **assistant, not an authority**.

The product loop is:

```
Official recruitment discovery
→ Deterministic eligibility check
→ Application tracking
→ AI-generated preparation strategy
→ Study execution
→ Performance analytics
→ Community and mentorship
→ AI-adaptive next actions
```

AI powers the personalization, summarization, and guidance layers. Official facts, eligibility verdicts, publishing decisions, and organization verification remain rule-based, auditable, and human-reviewable.

---

## 2. AI action policy

Every AI-driven feature is classified by risk and automation level.

### 2.1 Fully automatable (low risk, user-correctable)

These features can be AI-driven because wrong output is low-risk and the user can correct or regenerate:

- Study plan generation
- Daily study task generation
- Study plan regeneration after missed sessions
- Notes summarization
- Flashcard generation
- Mistake-book summarization
- Mock-test weak-topic diagnosis
- Weekly review report
- Personalized next-best-action recommendations
- Resource recommendations from verified internal library
- Career and exam strategy guidance (with disclaimers and realistic caveats)

### 2.2 AI-assisted, admin-reviewed (medium risk)

AI reduces workload but output must not reach users without meeting confidence thresholds and/or admin review:

- Recruitment notification extraction from PDF or HTML
- Age, education, category, PwBD, domicile, attempt rule extraction
- Official source resolution from aggregator discoveries
- PYQ question segmentation and classification
- PYQ subject/topic/microtopic tagging
- Cutoff, vacancy, and competition metric extraction from documents
- Marketplace course and institute classification
- Admin data-quality diagnosis suggestions

### 2.3 Deterministic only — AI must not be used

These must be rule-based and auditable:

- Final eligibility verdicts
- Official organization verification
- Recruitment publish approval
- Canonical URL assignment
- Trust classification for organizations and sources

### 2.4 AI action policy table

Runtime AI governance uses the `ai_action_policies` table to control automation behavior per action key:

```sql
create table public.ai_action_policies (
  id uuid primary key default gen_random_uuid(),
  action_key text not null unique,       -- e.g. 'eligibility_explanation_generate'
  required_permission text not null,     -- permission bucket
  min_confidence numeric(4,3) default 0.85,
  auto_allowed boolean not null default false,
  human_review_required boolean not null default true,
  audit_logged boolean not null default true,
  is_active boolean not null default true
);
```

Admin can toggle `auto_allowed` and `human_review_required` per action at `/admin/ai-policy` without a code deploy.

---

## 3. Aspirant personalization architecture

### 3.1 Principle

Career Copilot should understand an aspirant as a full human decision-maker, not only as a set of eligibility fields.

The personalization layer should help aspirants answer:

- Which exam is suitable for my life situation?
- What is realistic for me in the next 6 months, 1 year, 5 years?
- What study strategy fits my time, money, location, and responsibilities?
- What resources should I use based on my budget and level?

### 3.2 Personalization dimensions

The aspirant profile collects:

**Eligibility context:** DOB, category, PwBD, ex-serviceman, domicile, education, attempts

**Life context:**
- Employment status (student / employed / unemployed / preparing full-time)
- Daily available study hours
- Financial pressure level (low/medium/high constraint)
- Location (rural/urban, tier-1/2/3 city)
- Family responsibilities

**Exam context:**
- Target exams (primary and backup)
- Current preparation stage (beginner / intermediate / experienced)
- Exams previously attempted
- Preferred exam types (written/objective/descriptive/interview-heavy)

**Learning context:**
- Study style preference (self-study / online / offline coaching)
- Weak subjects (from onboarding and mock performance)
- Budget for courses and resources
- Language comfort (Hindi/English/regional)

### 3.3 What AI may do with this data

- Personalize study plans
- Identify financial pressure → recommend free resources before paid
- Suggest realistic timelines given available hours
- Recommend backup exams when primary is high-competition
- Explain trade-offs between govt job, private job, and hybrid paths
- Recommend working-professional preparation strategies
- Prioritize urgent deadlines
- Flag when current preparation pace is insufficient for exam timeline

### 3.4 What AI must not do

- Discriminate based on gender, rural/urban background, caste, income, family status
- Tell a user they are "not capable" because of their background
- Make unsupported psychological judgments
- Shame users for financial or family constraints
- Fabricate career outcomes or guarantee selection
- Recommend high-cost courses to financially constrained users without cheaper alternatives
- Override deterministic eligibility rules with AI estimates

---

## 4. PYQ and exam intelligence AI

### 4.1 Purpose

PYQ analysis is the highest-value exam intelligence feature. Aspirants spend significant time trying to understand which topics are high-weight, which are trending up, and how difficult a subject has been over the years. This analysis is currently scattered across coaching notes, YouTube, and paid test series.

### 4.2 PYQ data model

```
exam_pyq_papers
├── paper_id, exam_id, year, stage, paper_name
├── pdf_url (official), verified_at

exam_pyq_questions
├── question_id, paper_id
├── subject, topic, microtopic
├── difficulty: easy | medium | hard
├── marks_weight
├── question_text (optional — copyright risk for some exams)
├── source_type: official | community | extracted_by_ai

exam_pyq_analysis
├── analysis_id, paper_id
├── subject, topic, question_count
├── difficulty_distribution (easy/med/hard counts)
├── weight_percentage
```

### 4.3 AI role in PYQ

AI assists with:

- Segmenting questions from scanned PDFs (where OCR is available)
- Classifying questions into subject/topic/microtopic
- Flagging confidence level per classification
- Suggesting corrections

Admin reviews AI classification before questions are marked as verified.

AI must not:

- Mark classifications as verified without admin review
- Publish PYQ analysis data to users if confidence is below threshold

### 4.4 Visualizations (Phase 12)

Required charts:

| Chart | Data source |
|---|---|
| Subject-weight trend line (year-over-year) | `exam_pyq_analysis` |
| Subject distribution pie chart | `exam_pyq_analysis` |
| Difficulty heatmap by subject and year | `exam_pyq_analysis` |
| Most repeated topics table | `exam_pyq_analysis` |
| Cutoff trend line by category | `exam_cutoffs` |
| Vacancy bar chart by year | `exam_vacancy_history` |
| Competition ratio card | `exam_competition_metrics` |

---

## 5. Semantic search (Phase 13)

Migration 030 has created the `pgvector` table and `ivfflat` index. The ETL sync job is pending.

### What gets embedded

- Recruitment titles and descriptions
- Post names and eligibility criteria summaries
- Exam overview text

### Use cases

- "Find exams similar to IBPS PO" (recruitment-level similarity)
- "What exams are good for commerce graduates?" (profile-to-exam matching)
- Better search than exact-match keyword search on `/dashboard/exams`

### Guardrails

- Embeddings are generated from deterministic data (recruitment rows), not AI-generated text
- Search results are ranked by eligibility and urgency on top of semantic similarity
- Semantic search does not replace the eligibility engine; it supplements discovery

---

## 6. AI Career Chat

Available to Pro users (limited messages/month) and Elite users (unlimited).

### What it can do

- Explain eligibility for a specific exam in plain language
- Suggest study resources for a topic
- Generate a study plan draft for refinement
- Explain PYQ trends in conversational form
- Discuss exam selection trade-offs given the user's profile
- Motivational and strategy conversations

### What it must not do

- Give final eligibility verdicts (always refer to the deterministic engine result)
- Promise selection or guarantee outcomes
- Recommend very high-cost paid resources to financially constrained users
- Access private data from other users

### System prompt constraints

The AI Career Chat system prompt must include:

- User's profile (education, category, DOB, domicile, target exams)
- Current eligible recruitments from the deterministic engine
- Disclaimer: AI guidance is supplementary; official notifications are authoritative
- Instruction to not override deterministic eligibility results

---

## 7. AI moderation assist (community, Phase 11+)

AI may be used to:

- Flag potentially abusive, spam, or copyright-infringing posts
- Suggest a moderation action (hide, warn, escalate) with confidence score

AI must not:

- Execute moderation actions without human review at launch
- Permanently ban users without human decision

Rationale: community moderation errors (false positives) damage trust more than slower moderation. Human review is required until AI classification accuracy is demonstrated.
