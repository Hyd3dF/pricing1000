-- 003_rooms.sql
-- Konu platformu — odalar: rooms, room_members, room_messages (foto destekli).

-- ---------- rooms ----------
CREATE TABLE IF NOT EXISTS rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(64) NOT NULL,
  description   TEXT,
  slug          VARCHAR(64) UNIQUE NOT NULL,
  is_private    BOOLEAN NOT NULL DEFAULT FALSE,
  member_count  INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_slug ON rooms (lower(slug));
CREATE INDEX IF NOT EXISTS idx_rooms_created ON rooms (created_at DESC);

-- ---------- room_members ----------
CREATE TABLE IF NOT EXISTS room_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          VARCHAR(20) NOT NULL DEFAULT 'member',
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT room_members_role_chk CHECK (role IN ('owner','admin','member')),
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members (room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members (user_id);

-- ---------- room_messages (text + image) ----------
CREATE TABLE IF NOT EXISTS room_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          VARCHAR(20) NOT NULL DEFAULT 'text',
  content       TEXT,
  file_key      TEXT,
  file_name     TEXT,
  file_size     INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT room_messages_type_chk CHECK (type IN ('text','image','file'))
);

CREATE INDEX IF NOT EXISTS idx_room_messages_room_created ON room_messages (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_messages_user ON room_messages (user_id);

-- ---------- member_count otomatik guncelleme ----------
CREATE OR REPLACE FUNCTION update_room_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE rooms SET member_count = member_count + 1 WHERE id = NEW.room_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE rooms SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.room_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_room_member_count ON room_members;
CREATE TRIGGER trg_room_member_count
  AFTER INSERT OR DELETE ON room_members
  FOR EACH ROW EXECUTE FUNCTION update_room_member_count();
