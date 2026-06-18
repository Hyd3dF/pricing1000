-- 002_content.sql
-- Konu platformu — icerik semasi: topics, comments (nested), votes, saves.

-- ---------- topics ----------
CREATE TABLE IF NOT EXISTS topics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(200) NOT NULL,
  body          TEXT NOT NULL,
  category      VARCHAR(50) NOT NULL DEFAULT 'general',
  tags          TEXT[] NOT NULL DEFAULT '{}',
  upvotes       INTEGER NOT NULL DEFAULT 0,
  downvotes     INTEGER NOT NULL DEFAULT 0,
  view_count    INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  is_pinned     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topics_category_chk CHECK (
    category IN ('general','dev','design','startup','offtopic')
  )
);

CREATE INDEX IF NOT EXISTS idx_topics_user ON topics (user_id);
CREATE INDEX IF NOT EXISTS idx_topics_created ON topics (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topics_category ON topics (category);
CREATE INDEX IF NOT EXISTS idx_topics_tags ON topics USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_topics_title_search ON topics USING GIN (to_tsvector('simple', title));
CREATE INDEX IF NOT EXISTS idx_topics_body_search ON topics USING GIN (to_tsvector('simple', body));

-- ---------- comments (nested, max 3 seviye) ----------
CREATE TABLE IF NOT EXISTS comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id      UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES comments(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  upvotes       INTEGER NOT NULL DEFAULT 0,
  downvotes     INTEGER NOT NULL DEFAULT 0,
  depth         INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT comments_depth_chk CHECK (depth >= 0 AND depth <= 3)
);

CREATE INDEX IF NOT EXISTS idx_comments_topic ON comments (topic_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments (user_id);

-- ---------- votes (topic + comment) ----------
CREATE TABLE IF NOT EXISTS votes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type   VARCHAR(10) NOT NULL,
  target_id     UUID NOT NULL,
  value         SMALLINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT votes_target_type_chk CHECK (target_type IN ('topic','comment')),
  CONSTRAINT votes_value_chk CHECK (value IN (1, -1)),
  UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_target ON votes (target_type, target_id);

-- ---------- saves ----------
CREATE TABLE IF NOT EXISTS saves (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id      UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_saves_user ON saves (user_id, created_at DESC);

-- ---------- updated_at tetikleyicileri ----------
DROP TRIGGER IF EXISTS trg_topics_updated_at ON topics;
CREATE TRIGGER trg_topics_updated_at
  BEFORE UPDATE ON topics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_comments_updated_at ON comments;
CREATE TRIGGER trg_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- comment_count otomatik guncelleme ----------
CREATE OR REPLACE FUNCTION update_topic_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE topics SET comment_count = comment_count + 1 WHERE id = NEW.topic_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE topics SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.topic_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_topic_comment_count ON comments;
CREATE TRIGGER trg_topic_comment_count
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_topic_comment_count();
