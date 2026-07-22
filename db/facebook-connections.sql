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

CREATE TABLE IF NOT EXISTS dilg_staff_users (
  meta_user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended')),
  global_role TEXT NOT NULL DEFAULT 'staff' CHECK (global_role IN ('staff', 'regional_admin')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dilg_offices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  office_type TEXT NOT NULL DEFAULT 'other' CHECK (office_type IN ('regional', 'province', 'city', 'other')),
  facebook_page_id TEXT UNIQUE,
  facebook_page_name TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dilg_office_memberships (
  meta_user_id TEXT NOT NULL REFERENCES dilg_staff_users(meta_user_id) ON DELETE CASCADE,
  office_id TEXT NOT NULL REFERENCES dilg_offices(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('office_admin', 'publisher', 'editor', 'viewer')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meta_user_id, office_id)
);

CREATE TABLE IF NOT EXISTS dilg_access_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_meta_user_id TEXT,
  action TEXT NOT NULL,
  target_meta_user_id TEXT,
  office_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dilg_memberships_user_idx
  ON dilg_office_memberships(meta_user_id)
  WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS dilg_access_audit_created_idx
  ON dilg_access_audit(created_at DESC);
