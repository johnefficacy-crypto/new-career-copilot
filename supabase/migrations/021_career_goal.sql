-- Migration 021: career_goal field on profiles
-- Stores the aspirant's long-term ambition as a free-text narrative.
-- Used by the AI chat system prompt to personalise guidance.
-- Field is optional — NULL means the aspirant skipped the question.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS career_goal TEXT;

COMMENT ON COLUMN public.profiles.career_goal IS
  'Free-text narrative describing the aspirant''s career ambition beyond clearing an exam. '
  'Examples: "I want to become an IAS officer and serve my home district", '
  '"Main RBI Grade B join karna chahta hoon kyunki mujhe banking sector pasand hai". '
  'Injected into AI chat system prompt to personalise coaching.';
