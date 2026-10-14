"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { inspectionApi } from "@/lib/inspection/api";
import { clearDraft, loadDraft, saveDraft } from "@/lib/inspection/draftStore";
import { blankDraft, fieldAnchorId, inspectionResErrorText, isDraftCompatible, syncPhotos, toSubmitDto, validateDraftFull } from "@/lib/inspection/logic";
import { listingForbiddenField } from "@/lib/inspection/facts";
import { LISTING_TEXT_FORBIDDEN } from "@/lib/units/listing-text";
import { useInspectionAction } from "@/lib/inspection/useInspectionAction";
import { useInspectionUploads } from "@/lib/inspection/useInspectionUploads";
import type { InspectionDetail, InspectionDraft, InspectionPhotoView, ListingRoom } from "@/lib/inspection/types";
import consign from "@/components/consign/Consign.module.css";
import { DecisionBlock } from "./DecisionBlock";
import { DeclaredBlock, DoorBlock, FunctionsBlock, LandlordInfoBlock, MeasureBlock } from "./InfoBlocks";
import { ExtraItemsBlock, InventoryBlock } from "./InventoryBlock";
import { ListingBlock } from "./ListingBlock";
import { LivingFeesBlock } from "./LivingFeesBlock";
import { ProgressPanel } from "./ProgressPanel";
import type { PhotoController } from "./photoController";
import styles from "./Inspection.module.css";

/**
 * Phiếu thẩm định ở stage `inspecting` — bố cục như bản mock: 8 mục + cột phụ (thông tin chủ kê khai, tổng hợp trực tiếp).
 * Ảnh thật, nháp ở máy. Mục 8 chọn đề xuất: duyệt ⇒ niêm yết ngay (đổi giá ⇒ chờ chủ nhà); không duyệt (căn bất thường)
 * ⇒ phiếu chuyển Admin rà soát (`reviewing`). Cả hai đều phải điền đủ phiếu vì Admin có thể duyệt niêm yết từ phiếu này.
 */
export function InspectionWorkspace({ detail }: { detail: InspectionDetail }) {
  const router = useRouter();
  const { busy, run } = useInspectionAction(detail.id);

  const [draft, setDraft] = useState<InspectionDraft>(() => {
    const stored = loadDraft(detail.id);
    const blank = blankDraft(detail);
    // Nháp cũ (trước hồ sơ 18) thiếu facts/pricing/listing ⇒ bù từ chủ khai.
    return stored && isDraftCompatible(stored, detail) ? { ...blank, ...stored } : blank;
  });
  const [photos, setPhotos] = useState<InspectionPhotoView[]>(detail.photos);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  const [invalid, setInvalid] = useState<{ field: string; message: string } | null>(null);
  const [forcePin, setForcePin] = useState(false);
  /** Quyết định đang xác nhận; `null` = chưa mở hộp xác nhận. */
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);

  // Ảnh gắn vào nháp theo slot (nháp không chứa ảnh).
  const effective = useMemo(() => syncPhotos(draft, photos), [draft, photos]);

  // Lưu nháp sau 0,4s không gõ; hỏng ⇒ bỏ qua (draftStore tự bắt lỗi).
  useEffect(() => {
    const t = setTimeout(() => saveDraft(detail.id, draft), 400);
    return () => clearTimeout(t);
  }, [detail.id, draft]);

  // Cuộn tới ô lỗi.
  const invalidField = invalid?.field ?? null;
  useEffect(() => {
    if (!invalidField) return;
    document.getElementById(fieldAnchorId(invalidField))?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [invalidField]);

  const update = useCallback((patch: (d: InspectionDraft) => InspectionDraft) => {
    setDraft(patch);
    setInvalid(null);
  }, []);

  const onUploaded = useCallback((view: InspectionPhotoView, previewUrl: string) => {
    setPhotos((prev) => (prev.some((p) => p.id === view.id) ? prev : [...prev, view]));
    setPreviews((prev) => ({ ...prev, [view.id]: previewUrl }));
  }, []);
  const uploads = useInspectionUploads(detail.id, onUploaded);

  // Ảnh chủ nhà gửi ⇒ đưa sẵn vào ảnh niêm yết MỘT lần (server sao chép file; Host bỏ ảnh không đạt như ảnh thường).
  const importStarted = useRef(false);
  useEffect(() => {
    if (importStarted.current || detail.landlordPhotosImported !== false || detail.landlordPhotos.length === 0) return;
    importStarted.current = true;
    void inspectionApi.importLandlordPhotos(detail.id).then((res) => {
      if (!res.ok) {
        toast(inspectionResErrorText(res, "Chưa đưa được ảnh chủ nhà vào ảnh niêm yết."));
        return;
      }
      if (res.data.length === 0) return;
      setPhotos((prev) => [...prev, ...res.data.filter((p) => !prev.some((x) => x.id === p.id))]);
      toast(`Đã đưa ${res.data.length} ảnh chủ nhà gửi vào ảnh niêm yết — bỏ ảnh nào không đạt.`, "info");
    });
  }, [detail.id, detail.landlordPhotosImported, detail.landlordPhotos.length]);

  const removePhoto = useCallback(
    async (photoId: string) => {
      setRemoving((s) => new Set(s).add(photoId));
      const res = await inspectionApi.removePhoto(detail.id, photoId);
      setRemoving((s) => {
        const n = new Set(s);
        n.delete(photoId);
        return n;
      });
      if (res.ok || res.code === "inspection_not_found") setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      else toast(inspectionResErrorText(res));
    },
    [detail.id],
  );

  const controller: PhotoController = {
    photosOf: (slot) => photos.filter((p) => p.slot === slot),
    uploadsOf: (slot) => uploads.items.filter((u) => u.slot === slot),
    previews,
    add: (slot: string, room: ListingRoom | undefined, files: File[]) => uploads.addFiles(slot, room, files),
    remove: (id) => void removePhoto(id),
    retry: uploads.retry,
    force: uploads.force,
    dismiss: uploads.dismiss,
    removing,
    totalLeft: Math.max(0, detail.limits.totalMax - photos.length - uploads.items.length),
    perLineMax: detail.limits.perLineMax,
    listingMax: detail.limits.listingMax,
  };

  const pending = uploads.items.some((u) => u.status === "measuring" || u.status === "queued" || u.status === "uploading");
  const needPin = detail.doorKind === "smart" && (!detail.doorCodeOnFile || forcePin);

  function decide() {
    if (pending) {
      toast("Còn ảnh đang tải — đợi xong rồi nộp.", "info");
      return;
    }
    const next = effective.recommendation;
    // Kiểm đủ phiếu như khi duyệt (Admin cần đủ dữ liệu để niêm yết); không duyệt thì PIN không bắt buộc, lý do bắt buộc.
    const probe: InspectionDraft = { ...effective, recommendation: "approve", note: "" };
    const err =
      validateDraftFull(probe, { ...detail, doorCodeOnFile: next === "reject" || (detail.doorCodeOnFile && !forcePin) }) ??
      (next === "reject" && !effective.note.trim() ? { field: "note", message: "Đề xuất không duyệt phải ghi lý do cho Admin." } : null);
    if (err) {
      setInvalid(err);
      toast(err.message);
      return;
    }
    setDecision(next);
  }

  async function submit() {
    if (!decision) return;
    const final: InspectionDraft = { ...effective, recommendation: decision, note: effective.note.trim() };
    const res = await run(() => inspectionApi.submit(detail.id, toSubmitDto(final)));
    setDecision(null);
    if (res.ok) {
      clearDraft(detail.id);
      const done: Record<typeof res.data.stage, string> = {
        approved: `Thẩm định thành công! Căn ${res.data.unitCode} đã lên hệ thống cho khách thuê.`,
        awaiting_landlord: "Đã nộp báo cáo. Giá/cọc thay đổi nên chờ chủ nhà đồng ý trước khi niêm yết.",
        reviewing: "Đã nộp báo cáo thẩm định. Admin sẽ rà soát hồ sơ.",
        rejected: "Hồ sơ đã đóng.",
      };
      toast(done[res.data.stage], res.data.stage === "reviewing" ? "info" : "success");
      router.push("/host/inspections");
      return;
    }
    if (res.code === LISTING_TEXT_FORBIDDEN) {
      // Server là chốt chặn: tô đỏ đúng ô theo `field`.
      const field = listingForbiddenField((res.data as { field?: string } | undefined)?.field, effective.listing);
      setInvalid({ field, message: inspectionResErrorText(res, "Nội dung giới thiệu không được chứa số điện thoại, link hoặc số tiền.") });
    } else if (res.code === "report_invalid") {
      let field = (res.data as { field?: string } | undefined)?.field;
      if (field === "listing.highlights") field = "listing.highlights.0";
      if (field) setInvalid({ field, message: res.message ?? "Phiếu chưa hợp lệ." });
    } else if (res.code === "door_code_required") {
      setForcePin(true);
      setInvalid({ field: "doorPin", message: inspectionResErrorText(res) });
    }
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className={consign.inspectionGrid}>
      <div className={consign.mainFormCol}>
        {invalid && (
          <div className={consign.errorBanner} role="alert">
            {invalid.message}
          </div>
        )}
        <DoorBlock detail={detail} />
        <DeclaredBlock detail={detail} draft={effective} invalidField={invalidField} onChange={update} />
        <MeasureBlock detail={detail} draft={effective} invalidField={invalidField} onChange={update} />
        <InventoryBlock
          draft={effective}
          catalog={detail.catalog}
          photos={controller}
          invalidField={invalidField}
          onChange={update}
          declaredCodes={detail.furnished !== false ? (detail.declared?.inventoryCodes ?? null) : null}
        />
        <ExtraItemsBlock draft={effective} catalog={detail.catalog} photos={controller} invalidField={invalidField} onChange={update} />
        <FunctionsBlock draft={effective} onChange={update} />
        <LivingFeesBlock detail={detail} draft={effective} invalidField={invalidField} onChange={update} />
        <ListingBlock draft={effective} photos={controller} min={detail.limits.listingMin} max={detail.limits.listingMax} invalid={invalidField === "listingPhotoIds"} onChange={update} />
        <DecisionBlock draft={effective} needPin={needPin} invalidField={invalidField} busy={busy || pending} onChange={update} onSubmit={decide} />
      </div>

      <div className={consign.sideSummaryCol}>
        <LandlordInfoBlock detail={detail} />
        <ProgressPanel draft={effective} catalog={detail.catalog} listingMin={detail.limits.listingMin} />
      </div>

      <Modal
        open={decision !== null}
        onClose={() => setDecision(null)}
        title={decision === "approve" ? "Xác nhận đề xuất duyệt" : "Xác nhận gửi Admin rà soát"}
        footer={
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "var(--s-3)" }}>
            <button type="button" className="btn btn-quiet" onClick={() => setDecision(null)} disabled={busy}>
              Xem lại phiếu
            </button>
            <button type="button" className={`btn ${decision === "approve" ? "btn-primary" : "btn-danger"}`} onClick={() => void submit()} disabled={busy}>
              {busy ? "Đang nộp…" : decision === "approve" ? "Xác nhận & niêm yết" : "Gửi báo cáo cho Admin"}
            </button>
          </div>
        }
      >
        {decision === "approve" ? (
          <ul className={styles.confirmList}>
            <li>
              <b>Căn sẽ lên hệ thống cho khách thuê NGAY, không qua Admin.</b>
            </li>
            <li>Giá thuê và tiền cọc giữ nguyên như chủ nhà đã khai.</li>
            <li>{effective.listingPhotoIds.length} ảnh niêm yết sẽ hiện công khai trên tin đăng.</li>
            <li>Ủy quyền ký gửi có hiệu lực; không thể nộp lại hay sửa phiếu sau khi xác nhận.</li>
          </ul>
        ) : (
          <ul className={styles.confirmList}>
            <li>
              <b>Căn chưa lên hệ thống — phiếu chuyển Admin rà soát.</b>
            </li>
            <li>Admin quyết: duyệt niêm yết theo phiếu này, hoặc từ chối (chấm dứt ký gửi).</li>
            <li>
              Lý do gửi Admin: <i>{effective.note.trim()}</i>
            </li>
            <li>Không thể nộp lại hay sửa phiếu sau khi xác nhận.</li>
          </ul>
        )}
      </Modal>
    </form>
  );
}
