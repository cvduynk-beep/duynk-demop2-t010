import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

export const PHOTO_BUCKET = 'consignment-photos';
/** Link xem ảnh sống 1 giờ — đủ cho một phiên xem hồ sơ, không để lộ ảnh vĩnh viễn nếu link bị chia sẻ. */
export const SIGNED_URL_TTL_SECONDS = 3600;

export type ImageType = { ext: 'jpg' | 'png' | 'webp'; mime: string };

/** Nhận diện ảnh theo NỘI DUNG (magic bytes), không tin `mimetype`/đuôi file do client gửi. */
export function sniffImage(buf: Buffer): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

/** Lưu ảnh ký gửi: ưu tiên bucket PRIVATE của Supabase Storage; tự động chuyển lưu cục bộ nếu chưa cấu hình hoặc mất kết nối. */
@Injectable()
export class LandlordPhotoStorage {
  private readonly logger = new Logger(LandlordPhotoStorage.name);
  private bucketReady = false;
  private readonly localBaseDir = path.join(process.cwd(), 'uploads', 'consignments');

  constructor(private readonly supabase: SupabaseService) {}

  private async bucket() {
    if (!this.supabase.isConfigured()) return null;
    try {
      const storage = this.supabase.getClient().storage;
      if (!this.bucketReady) {
        const { error } = await storage.createBucket(PHOTO_BUCKET, { public: false });
        if (error && !/already exists|duplicate/i.test(error.message)) {
          this.logger.warn(`createBucket: ${error.message}`);
        }
        this.bucketReady = true;
      }
      return storage.from(PHOTO_BUCKET);
    } catch (err) {
      this.logger.warn(`Lỗi khởi tạo bucket Supabase Storage: ${(err as Error).message}`);
      return null;
    }
  }

  /** Tải một ảnh lên; trả đường dẫn lưu (dùng làm khóa khi xóa / ký URL). */
  async upload(landlordId: string, mandateId: string, buf: Buffer, type: ImageType): Promise<string> {
    const filename = `${randomUUID()}.${type.ext}`;
    const relPath = `${landlordId}/${mandateId}/${filename}`;

    // 1. Thử tải lên Supabase Storage nếu cấu hình hợp lệ
    if (this.supabase.isConfigured()) {
      try {
        const b = await this.bucket();
        if (b) {
          const { error } = await b.upload(relPath, buf, { contentType: type.mime, upsert: false });
          if (!error) {
            return relPath;
          }
          this.logger.warn(`Supabase Storage upload thất bại (${error.message}), chuyển sang lưu trữ cục bộ.`);
        }
      } catch (err) {
        this.logger.warn(`Supabase Storage không khả dụng (${(err as Error).message}), chuyển sang lưu trữ cục bộ.`);
      }
    }

    // 2. Fallback lưu trữ cục bộ (đảm bảo không chặn luồng đăng ký của chủ nhà)
    try {
      const targetDir = path.join(this.localBaseDir, landlordId, mandateId);
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(path.join(targetDir, filename), buf);
      return `local://${relPath}`;
    } catch (err) {
      this.logger.error(`Lưu ảnh cục bộ thất bại: ${(err as Error).message}`);
      throw err;
    }
  }

  async remove(paths: string[]): Promise<void> {
    if (!paths.length) return;
    const remotePaths = paths.filter((p) => !p.startsWith('local://'));
    const localPaths = paths.filter((p) => p.startsWith('local://'));

    if (remotePaths.length && this.supabase.isConfigured()) {
      try {
        const b = await this.bucket();
        if (b) {
          const { error } = await b.remove(remotePaths);
          if (error) this.logger.warn(`Xóa ảnh Supabase thất bại (${remotePaths.length} file): ${error.message}`);
        }
      } catch (err) {
        this.logger.warn(`Lỗi xóa ảnh Supabase: ${(err as Error).message}`);
      }
    }

    for (const p of localPaths) {
      try {
        const rel = p.replace('local://', '');
        await fs.unlink(path.join(this.localBaseDir, rel));
      } catch {
        // File không tồn tại hoặc đã xóa, bỏ qua
      }
    }
  }

  /** Ký URL xem ảnh theo lô; ảnh nào ký không được thì trả null (UI bỏ qua, không làm hỏng cả trang). */
  async signedUrls(paths: string[]): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>(paths.map((p) => [p, null]));
    if (!paths.length) return out;

    // Xử lý ảnh lưu cục bộ (chuyển sang Data URL để trình duyệt hiển thị trực tiếp)
    for (const p of paths) {
      if (p.startsWith('local://')) {
        try {
          const rel = p.replace('local://', '');
          const filePath = path.join(this.localBaseDir, rel);
          const buf = await fs.readFile(filePath);
          const ext = path.extname(rel).replace('.', '').toLowerCase();
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          out.set(p, `data:${mime};base64,${buf.toString('base64')}`);
        } catch (err) {
          this.logger.warn(`Không đọc được file ảnh cục bộ (${p}): ${(err as Error).message}`);
        }
      }
    }

    // Xử lý ảnh Supabase
    const remotePaths = paths.filter((p) => !p.startsWith('local://'));
    if (remotePaths.length && this.supabase.isConfigured()) {
      try {
        const b = await this.bucket();
        if (b) {
          const { data, error } = await b.createSignedUrls(remotePaths, SIGNED_URL_TTL_SECONDS);
          if (error) throw new Error(error.message);
          for (const row of data ?? []) {
            if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
          }
        }
      } catch (err) {
        this.logger.warn(`Không ký được URL ảnh Supabase: ${(err as Error).message}`);
      }
    }

    return out;
  }
}
