import type { ApiQueryDef } from "@/lib/query/useApiQuery";
import { invalidateApiPattern } from "@/lib/query/useApiQuery";
import { tenantApi, errorText, type CatalogPayload, type UnitFilter } from "./api";
import type {
  DepositTermsDoc,
  FastCloseQuotes,
  PublicFastDeposit,
  TenantBooking,
  TenantContract,
  TenantHandover,
  TenantUnit,
} from "./types";

export const tenantQueries = {
  units: (filter?: UnitFilter): ApiQueryDef<CatalogPayload> => {
    const key = `tenant:units:${filter?.zone || ""}:${filter?.layout || ""}:${filter?.maxRent || ""}:${filter?.q || ""}`;
    return {
      key,
      fetch: () => tenantApi.units(filter),
      errorText: (res) => errorText(res, "Không tải được danh sách căn hộ."),
    };
  },

  unit: (code: string): ApiQueryDef<TenantUnit> => ({
    key: `tenant:unit:${code.toUpperCase()}`,
    fetch: () => tenantApi.unit(code),
    errorText: (res) => errorText(res, "Không tải được thông tin căn hộ."),
  }),

  busySlots: (code: string, from?: string, to?: string): ApiQueryDef<{ slots: string[] }> => ({
    key: `tenant:busy-slots:${code.toUpperCase()}:${from || ""}:${to || ""}`,
    fetch: () => tenantApi.busySlots(code, from, to),
    errorText: (res) => errorText(res, "Không tải được lịch bận của căn hộ."),
  }),

  bookings: (): ApiQueryDef<TenantBooking[]> => ({
    key: "tenant:bookings",
    fetch: tenantApi.myBookings,
    errorText: (res) => errorText(res, "Không tải được danh sách lịch hẹn."),
  }),

  booking: (ref: string): ApiQueryDef<TenantBooking> => ({
    key: `tenant:booking:${ref.toUpperCase()}`,
    fetch: () => tenantApi.bookingByRef(ref),
    errorText: (res) => errorText(res, "Không tìm thấy lịch hẹn trong tài khoản của bạn."),
  }),

  contracts: (): ApiQueryDef<TenantContract[]> => ({
    key: "tenant:contracts",
    fetch: tenantApi.myContracts,
    errorText: (res) => errorText(res, "Không tải được danh sách hợp đồng."),
  }),

  handovers: (contractId: string): ApiQueryDef<TenantHandover[]> => ({
    key: `tenant:handovers:${contractId}`,
    fetch: () => tenantApi.handovers(contractId),
    errorText: (res) => errorText(res, "Không tải được hộ chiếu bàn giao."),
  }),

  /** `signedIn=false` ⇒ không gọi API (khách vãng lai không có danh sách yêu thích), trả rỗng. */
  favorites: (signedIn: boolean): ApiQueryDef<TenantUnit[]> =>
    signedIn
      ? {
          key: "tenant:favorites",
          fetch: tenantApi.favorites,
          errorText: (res) => errorText(res, "Không tải được danh sách căn đã lưu."),
        }
      : {
          key: "tenant:favorites:anon",
          fetch: async () => ({ ok: true, status: 200, data: [] }),
        },

  /** Báo giá chốt nhanh — không cache dài: giá sàn/ủy quyền của chủ nhà có thể đổi. */
  fastClose: (ref: string): ApiQueryDef<FastCloseQuotes> => ({
    key: `tenant:fast-close:${ref.toUpperCase()}`,
    fetch: () => tenantApi.fastCloseQuotes(ref),
    errorText: (res) => errorText(res, "Không tải được báo giá chốt nhanh."),
  }),

  /** Công khai trên trang căn: có nút "Chốt cọc nhanh" không (chủ nhà ủy quyền + căn trống). */
  fastDeposit: (unitCode: string): ApiQueryDef<PublicFastDeposit> => ({
    key: `tenant:fast-deposit:${unitCode.toUpperCase()}`,
    fetch: () => tenantApi.publicFastDeposit(unitCode),
    errorText: (res) => errorText(res, "Không tải được ưu đãi chốt cọc nhanh."),
  }),

  depositTerms: (unitCode?: string): ApiQueryDef<DepositTermsDoc> => ({
    key: `tenant:terms:${unitCode ? unitCode.toUpperCase() : "default"}`,
    fetch: () => tenantApi.depositTerms(unitCode),
    errorText: (res) => errorText(res, "Không tải được điều khoản đặt cọc."),
  }),
};

export function invalidateTenantUnits() {
  invalidateApiPattern("tenant:units");
}

export function invalidateTenantUnit(code: string) {
  invalidateApiPattern(`tenant:unit:${code.toUpperCase()}`);
  invalidateApiPattern(`tenant:fast-deposit:${code.toUpperCase()}`);
}

export function invalidateTenantBookings() {
  invalidateApiPattern("tenant:bookings");
}

export function invalidateTenantBooking(ref: string) {
  invalidateApiPattern(`tenant:booking:${ref.toUpperCase()}`);
}

export function invalidateTenantContracts() {
  invalidateApiPattern("tenant:contracts");
}

export function invalidateTenantTerms(unitCode?: string) {
  invalidateApiPattern(`tenant:terms:${unitCode ? unitCode.toUpperCase() : "default"}`);
}

export function invalidateTenantFavorites() {
  invalidateApiPattern("tenant:favorites");
}
