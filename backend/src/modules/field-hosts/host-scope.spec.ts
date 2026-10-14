import { coversZone, zoneScopeVersion, zoneScopeView } from './host-scope';

describe('host-scope (nguồn duy nhất cho phạm vi phân khu)', () => {
  const base = { assignedZone: 'The Sapphire 1' };

  it('dữ liệu cũ (thiếu field) ⇒ chỉ phân khu chính, khớp kiểu "chứa" như quy ước cũ', () => {
    expect(coversZone(base, 'The Sapphire 1')).toBe(true);
    expect(coversZone({ assignedZone: 'The Sapphire 1, The Sapphire 2' }, 'The Sapphire 2')).toBe(true);
    expect(coversZone(base, 'The Zenpark')).toBe(false);
    expect(coversZone(base, '')).toBe(false);
  });

  it('selected = chính ∪ thêm (khớp đúng tên); all = mọi phân khu kể cả tên mới', () => {
    const sel = { ...base, zoneScope: 'SELECTED', managedZones: ['The Zenpark'] };
    expect(coversZone(sel, 'The Zenpark')).toBe(true);
    expect(coversZone(sel, 'The Zen')).toBe(false);
    expect(coversZone({ ...base, zoneScope: 'ALL', managedZones: [] }, 'Phân khu mở năm sau')).toBe(true);
  });

  it('view/version: bỏ trùng + bỏ phân khu chính; version không phụ thuộc thứ tự', () => {
    expect(zoneScopeView({ ...base, zoneScope: 'SELECTED', managedZones: ['B', 'The Sapphire 1', 'B'] })).toEqual({ zoneScope: 'selected', managedZones: ['B'], zones: ['The Sapphire 1', 'B'] });
    expect(zoneScopeView({ ...base, zoneScope: 'ALL', managedZones: ['B'] }).zones).toBeNull();
    expect(zoneScopeVersion({ ...base, managedZones: ['B', 'A'] })).toBe(zoneScopeVersion({ ...base, managedZones: ['A', 'B'] }));
    expect(zoneScopeVersion({ ...base, zoneScope: 'ALL' })).not.toBe(zoneScopeVersion(base));
  });
});
