import type { BarcodeFormat } from './barcode.dto';

/** Validate the identifier before handing it to the encoder. Never silently repair a supplied checksum. */
export function normalizeBarcode(format: BarcodeFormat, input: string): string {
  const value = input.trim();
  if (!/^[\x20-\x7E]{1,80}$/.test(value)) throw new Error('Enter 1–80 printable ASCII characters.');
  if (format === 'CODE128') return value;
  if (format === 'CODE39') {
    if (!/^[0-9A-Z .$/+%\-]{1,40}$/.test(value)) throw new Error('CODE 39 accepts up to 40 uppercase letters, digits, spaces and - . $ / + %.');
    return value;
  }
  const length = { EAN13: 13, EAN8: 8, UPC: 12 }[format];
  if (!length || !/^\d+$/.test(value) || ![length - 1, length].includes(value.length)) throw new Error(`${format} requires ${length - 1} digits or ${length} digits with a valid check digit.`);
  const body = value.slice(0, length - 1);
  const sum = [...body].reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  const completed = body + (10 - sum % 10) % 10;
  if (value.length === length && value !== completed) throw new Error('Invalid check digit. Check the product barcode or omit the last digit to calculate it.');
  return completed;
}
