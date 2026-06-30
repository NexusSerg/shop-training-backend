-- Step 3.5 — Saved Search Service schema
-- Persists user search/filter combinations as shareable URL state.

CREATE TABLE IF NOT EXISTS saved_searches (
  id           UUID PRIMARY KEY,
  user_id      VARCHAR(200) NOT NULL,
  name         VARCHAR(200) NOT NULL,
  url_state    TEXT NOT NULL,
  search_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_searches_user_id_idx ON saved_searches (user_id);
CREATE INDEX IF NOT EXISTS saved_searches_created_at_idx ON saved_searches (created_at DESC);
