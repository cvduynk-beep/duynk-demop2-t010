-- Vinny v1: yêu cầu gặp nhân viên + phản hồi 👍/👎. Chỉ THÊM bảng, không đụng dữ liệu hiện có. Không lưu nội dung hội thoại.
-- Chạy: npx prisma db execute --file prisma/migrations-sql/20261015_vinny_support_feedback/up.sql --schema prisma/schema.prisma
DO $$ BEGIN
  CREATE TYPE "SupportRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS support_requests (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id),
  conversation_id varchar(64) NOT NULL,
  category varchar(30) NOT NULL,
  summary varchar(1000) NOT NULL,
  status "SupportRequestStatus" NOT NULL DEFAULT 'OPEN',
  handled_by uuid REFERENCES profiles(id),
  note varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS support_requests_status_created_at_idx ON support_requests (status, created_at);
CREATE INDEX IF NOT EXISTS support_requests_profile_id_conversation_id_idx ON support_requests (profile_id, conversation_id);

CREATE TABLE IF NOT EXISTS chat_feedback (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL UNIQUE,
  conversation_id varchar(64) NOT NULL,
  rating varchar(4) NOT NULL CHECK (rating IN ('up', 'down')),
  reason varchar(200),
  prompt_version varchar(10) NOT NULL,
  kind varchar(20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_feedback_prompt_version_rating_idx ON chat_feedback (prompt_version, rating);
