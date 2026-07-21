CREATE TABLE IF NOT EXISTS dilg_facebook_sessions (
  session_hash TEXT PRIMARY KEY,
  meta_user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  selected_page_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dilg_facebook_pages (
  session_hash TEXT NOT NULL REFERENCES dilg_facebook_sessions(session_hash) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  page_token TEXT NOT NULL,
  picture_url TEXT NOT NULL DEFAULT '',
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_hash, page_id)
);

CREATE INDEX IF NOT EXISTS dilg_facebook_pages_session_idx
  ON dilg_facebook_pages(session_hash);
