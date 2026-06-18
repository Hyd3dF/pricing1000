-- 005_topic_views.sql
-- Konu platformu — tekillestirilmis goruntulenme takibi

CREATE TABLE IF NOT EXISTS topic_views (
  topic_id      UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  viewer_hash   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (topic_id, viewer_hash)
);

CREATE INDEX IF NOT EXISTS idx_topic_views_topic ON topic_views (topic_id);
