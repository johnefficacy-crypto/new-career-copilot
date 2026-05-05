// lib/scraping/extractor.ts
// Career Copilot — Phase 10
// Uses Claude to parse raw HTML/text from recruitment portal pages
// into structured ExtractedRecruitment objects.

import Anthropic from "@anthropic-ai/sdk"
import type { ExtractedRecruitment } from "@/types/scraping"
import { toJsonSafe } from "@/types/scraping"

export type { ExtractedRecruitment }
export { toJsonSafe }

const client = new Anthropic()

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a specialist data extraction agent for Indian government recruitment notifications.
You receive raw HTML or text scraped from official government job portals.
Your job is to extract structured recruitment information and return ONLY valid JSON.

HARD RULES:
- Extract ONLY factual information present in the text. Never fabricate data.
- Dates → ISO 8601 (YYYY-MM-DD). If only a month is known use the 1st (e.g. "March 2026" → "2026-03-01").
- If a field is genuinely not mentioned, set it to null. Do NOT guess.
- But DO search the ENTIRE document before returning null — eligibility details
  are often in a separate "Eligibility Criteria" / "Age Limit" / "Educational
  Qualification" section far from the post list.
- Vacancies = total across all categories unless the text clearly separates posts.
- org_type must be one of: UPSC, SSC, Banking, Railway, State, Insurance, Defence, Other.
- Return ONLY JSON. No markdown, no explanation, no preamble.

EXTRACTION HEURISTICS (very important — most extractions fail because these are skipped):

Age limits — look for these phrases anywhere in the text:
  "age between X and Y years"
  "minimum age X years, maximum age Y years"
  "not less than X years and not more than Y years"
  "X to Y years as on <date>"
  "upper age limit: Y years"   → min_age = 18 unless stated otherwise
  "age: X-Y years"
  Category tables with columns "Min Age" / "Max Age" / "General" / "OBC" / "SC/ST"
  → Use the GENERAL / unreserved category for min_age and max_age. The engine
     applies category-wise relaxation separately.
  If only "maximum age" is given, set min_age to 18 only if the notification
  explicitly says so, otherwise null.

Education — look for:
  "Educational Qualification"
  "Essential Qualification"
  "Minimum Qualification"
  Phrases like "Bachelor's degree in any discipline", "Graduate from a recognised
  university", "Post-graduate degree in <field>", "Diploma in Engineering",
  "10+2 pass", "Matriculation", "Class X", "B.E./B.Tech", "CA/CMA", "LLB".
  Put the RAW phrase into education_required so the downstream mapper can
  classify it (class_10, class_12, diploma, graduate, postgraduate, phd).
  If specific disciplines are listed (Civil Engineering, Computer Science,
  Economics, Law, etc.), put them into the "disciplines" array.

Posts — a single notification often has many distinct posts with different
criteria (e.g. "Assistant Manager", "Chief Manager", "Probationary Officer").
Extract each as its own entry. If all posts share the same age/education, repeat
those values on each post rather than leaving them null.

Dates — "last date for receipt of applications", "closing date", "apply online
till" → apply_end_date. "Online application starts from" → apply_start_date.
"Notification released on" / the PDF's date line → notification_date.`

// ── Main extraction function ──────────────────────────────────────────────────

export async function extractRecruitmentData(
  rawText: string,
  sourceUrl: string,
  sourceName: string
): Promise<{ data: ExtractedRecruitment; confidence: number } | null> {

  // Keep first 16000 chars (~4k tokens) — covers most notifications including
  // separate "Eligibility Criteria" and "How to Apply" sections that were
  // getting truncated at 12k and causing null age/education.
  const truncated = rawText.slice(0, 16000)

  const userPrompt = `Extract all recruitment notification data from the following text scraped from ${sourceName} (${sourceUrl}).

Return a JSON object matching this EXACT shape:
{
  "title": "string — full recruitment name as printed on the notification",
  "organization_name": "string — issuing body (e.g. 'Union Public Service Commission')",
  "org_type": "UPSC|SSC|Banking|Railway|State|Insurance|Defence|Other",
  "notification_date": "YYYY-MM-DD or null",
  "apply_start_date": "YYYY-MM-DD or null",
  "apply_end_date":   "YYYY-MM-DD or null",
  "total_vacancies":  number or null,
  "year":             number (use the advertisement year; current year if unclear),
  "source_pdf_url":            "string or null (direct PDF if linked)",
  "official_notification_url": "${sourceUrl}",
  "posts": [
    {
      "post_name":          "string — exact post title from the notification",
      "group_type":         "A|B|C|D or null",
      "pay_level":          "string or null (e.g. 'Level-7', '56100-177500', 'Pay Matrix 10')",
      "vacancies":          number or null,
      "min_age":            number or null  // UNRESERVED / GENERAL category, in years
      "max_age":            number or null  // UNRESERVED / GENERAL category, in years
      "education_required": "string or null — raw phrase, e.g. 'Bachelor\\'s degree in any discipline from a recognised university'",
      "disciplines":        ["string"] or null  // e.g. ["Civil Engineering","Mechanical Engineering"]
    }
  ],
  "confidence": 0.0-1.0
}

CONFIDENCE CALIBRATION:
  1.0 — title, org, all three dates, total_vacancies, AND every post has min_age/max_age/education_required.
  0.7 — title, org, dates, vacancies, but some posts missing age or education.
  0.5 — only title/org/dates — post-level data missing or ambiguous.
  <0.3 — text appears to be a listing/index page, not a real notification.

SCRAPED TEXT:
${truncated}`

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      // 4000 tokens — a notification with 8-10 distinct posts + per-post
      // age/education/disciplines arrays was hitting the 2000-token ceiling
      // and returning truncated JSON that the parser couldn't recover.
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    })

    const text = response.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("")
      .trim()

    // Strip any accidental markdown fences
    const clean = text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim()
    const parsed = JSON.parse(clean) as Record<string, unknown>

    const confidence = typeof parsed.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.5

    // Remove confidence from the data object before returning
    const { confidence: _c, ...rest } = parsed
    void _c

    return { data: rest as ExtractedRecruitment, confidence }

  } catch (err) {
    console.error("[extractor] Failed to parse Claude response:", err)
    return null
  }
}

// ── Fetch raw text from a URL ─────────────────────────────────────────────────

export async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CareerCopilot-Scraper/1.0; +https://careercopilot.in/bot)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    return stripHtml(html)
  } catch (err) {
    console.error(`[fetcher] Failed to fetch ${url}:`, err)
    return null
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim()
}

// ── Duplicate detection ───────────────────────────────────────────────────────

export function computeSimilarityKey(data: ExtractedRecruitment): string {
  const org = data.organization_name.toLowerCase().replace(/[^a-z0-9]/g, "")
  const year = String(data.year)
  const titleWords = data.title.toLowerCase().split(/\s+/).slice(0, 4).join("")
  return `${org}-${year}-${titleWords}`
}