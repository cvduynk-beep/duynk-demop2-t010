-- Rollback Vinny v1: xoá 2 bảng (mất các yêu cầu hỗ trợ và phản hồi đã ghi). Không đụng bảng khác.
DROP TABLE IF EXISTS chat_feedback;
DROP TABLE IF EXISTS support_requests;
DROP TYPE IF EXISTS "SupportRequestStatus";
