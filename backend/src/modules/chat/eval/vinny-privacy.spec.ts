import { redactEvalArtifact, redactEvalText } from './vinny-privacy';

describe('Vinny eval artifact privacy', () => {
  it('masks booking references consistently in evidence, links, and reply', () => {
    const x = redactEvalArtifact({ ref: 'VS-TEST42', link: '/booking/VS-TEST42', reply: 'Xem VS-TEST42' });
    expect(x.ref).toMatch(/^\[REF_/);
    expect(x.link).toBe(`/booking/${x.ref}`);
    expect(x.reply).toBe(`Xem ${x.ref}`);
  });
  it('masks contract numbers', () => {
    const x = redactEvalText('VSA-LEASE-VHOP-S1.02-0101-2026-TEST');
    expect(x).not.toContain('VSA-LEASE');
  });
  it('masks phone, email, OTP and identity-like numbers', () => {
    const x = redactEvalText('test@example.invalid 0912345678 OTP là 4821 CCCD 012345678901');
    for (const raw of ['test@example.invalid', '0912345678', '4821', '012345678901']) expect(x).not.toContain(raw);
  });
  it('removes structured names, addresses, notes and secrets', () => {
    const x = redactEvalArtifact({ fullName: 'Synthetic Person', address: 'Synthetic Street', nested: { apiKey: 'synthetic-key', landlordNote: 'private' } });
    expect(JSON.stringify(x)).not.toMatch(/Synthetic|synthetic-key|private/);
  });
  it('preserves public listing codes, rank, prices, checks, and scores', () => {
    const x = { unitCode: 'VHOP-S1.02-0101', rank: 1, rent: 8500000, allIn: 9058000, no_pii: false, score: 3 };
    expect(redactEvalArtifact(x)).toEqual(x);
  });
  it('does not mutate the values used for grading', () => {
    const x = { ref: 'VS-TEST42', list: [{ email: 'test@example.invalid' }] };
    redactEvalArtifact(x);
    expect(x.ref).toBe('VS-TEST42');
    expect(x.list[0].email).toBe('test@example.invalid');
  });
  it('also masks known structured names and addresses echoed into a reply', () => {
    const x = redactEvalArtifact({ fullName: 'Synthetic Person', address: 'Synthetic Street', reply: 'Synthetic Person ở Synthetic Street' });
    expect(x.reply).not.toMatch(/Synthetic/);
  });
});
