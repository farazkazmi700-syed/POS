import { normalizeBarcode } from './barcode-value';

describe('barcode encoding validation', () => {
  it.each([['EAN13', '400638133393', '4006381333931'], ['EAN8', '9638507', '96385074'], ['UPC', '03600029145', '036000291452']] as const)('calculates and verifies %s check digits', (format, body, completed) => {
    expect(normalizeBarcode(format, body)).toBe(completed);
    expect(normalizeBarcode(format, completed)).toBe(completed);
    expect(() => normalizeBarcode(format, completed.slice(0, -1) + (Number(completed.at(-1)) + 1) % 10)).toThrow('Invalid check digit');
  });
  it('rejects control characters and unsupported CODE39 input', () => {
    expect(() => normalizeBarcode('CODE128', 'A\u0001B')).toThrow();
    expect(() => normalizeBarcode('CODE128', ' ')).toThrow();
    expect(() => normalizeBarcode('CODE39', 'lowercase')).toThrow();
    expect(() => normalizeBarcode('CODE39', 'A'.repeat(41))).toThrow();
  });
});
