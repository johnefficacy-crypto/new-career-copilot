-- Clean baseline 001: extensions and type placeholders

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- NOTE: vector is intentionally excluded from core baseline.
-- Enable only when embeddings module is applied.
-- create extension if not exists vector;

-- TODO(types): define user-defined enum/domain/composite types from live DB introspection.
-- Snapshot contains USER-DEFINED references (for optional modules), but exact definitions
-- should be extracted from production/staging before creating executable enum SQL here.
