import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ────────────────────────────────────────────────────────────────
   Barcode Studio — generator + camera scanner + bulk generation
   Pure client-side: renders 1D barcodes on <canvas> from a
   built-in CODE128 / EAN-13 / EAN-8 / UPC / CODE39 encoder, and
   scans barcodes from the device camera via the BarcodeDetector
   API (with a graceful fallback to a keyboard-wedge listener).
   ──────────────────────────────────────────────────────────────── */

export type BarcodeFormat = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39';

const FORMAT_OPTIONS: { value: BarcodeFormat; label: string; hint: string }[] = [
  { value: 'CODE128', label: 'CODE 128', hint: 'Any ASCII value — best for SKUs, invoices, internal codes' },
  { value: 'EAN13', label: 'EAN-13', hint: '13 digits — global retail product barcodes' },
  { value: 'EAN8', label: 'EAN-8', hint: '8 digits — compact retail packages' },
  { value: 'UPC', label: 'UPC-A', hint: '12 digits — North American retail' },
  { value: 'CODE39', label: 'CODE 39', hint: 'A–Z 0–9 - . $ / + % space — warehouse & industrial' },
];

/* ════════════════════ Validation & auto-completion ════════════════════ */

function validateValue(format: BarcodeFormat, value: string): string | null {
  const v = value.trim();
  switch (format) {
    case 'EAN13':
      if (!/^\d{12,13}$/.test(v)) return 'EAN-13 requires 12 digits (a 13th check digit is computed) or the full 13 digits.';
      return null;
    case 'EAN8':
      if (!/^\d{7,8}$/.test(v)) return 'EAN-8 requires 7 digits (check digit computed) or the full 8 digits.';
      return null;
    case 'UPC':
      if (!/^\d{11,12}$/.test(v)) return 'UPC-A requires 11 digits (check digit computed) or the full 12 digits.';
      return null;
    case 'CODE39':
      if (!/^[0-9A-Z\-. $/+%]+$/.test(v)) return 'CODE 39 supports A–Z, 0–9, and the symbols - . $ / + % space only.';
      return null;
    case 'CODE128':
      if (v.length === 0 || v.length > 80) return 'CODE 128 accepts 1–80 ASCII characters.';
      if (!/^[\x00-\x7F]*$/.test(v)) return 'CODE 128 accepts ASCII characters only.';
      return null;
  }
}

/** Completes EAN/UPC values by computing the modulo-10 check digit. */
function completeCheckDigits(format: BarcodeFormat, value: string): string {
  const v = value.trim();
  const checksumDigit = (digits: string): number => {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      sum += Number(digits[digits.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
    }
    return (10 - (sum % 10)) % 10;
  };
  if (format === 'EAN13' && v.length === 12) return v + checksumDigit(v);
  if (format === 'EAN8' && v.length === 7) return v + checksumDigit(v);
  if (format === 'UPC' && v.length === 11) return v + checksumDigit(v);
  return v;
}

/* ════════════════════ Encoding tables ════════════════════ */

const CODE128_PATTERNS: string[] = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100',
  '10011001000', '10011000100', '10001100100', '11001001000', '11001000100', '11000100100',
  '10110011100', '10011011100', '10011001110', '10111001100', '10011101100', '10011100110',
  '11001110010', '11001011100', '11001001110', '11011100100', '11001110100', '11101101110',
  '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000', '10001000110',
  '10110001000', '10001101000', '10001100010', '11010001000', '11000101000', '11000100010',
  '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110',
  '11101110110', '11010001110', '11000101110', '11011101000', '11011100010', '11011101110',
  '11101011000', '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100', '10010110000',
  '10010000110', '10000101100', '10000100110', '10110010000', '10110000100', '10011010000',
  '10011000010', '10000110100', '10000110010', '11000010010', '11001010000', '11110111010',
  '11000010100', '10001111010', '10100111100', '10010111100', '10010111110', '10111101100',
  '10111100110', '11110111110', '11011111010', '11011110110', '11101111000', '11101110100',
  '11101110010', '11010111100', '11010111110', '11011011110', '11011011010', '11011000110',
  '11000110110', '10100011000', '10001011000', '10001000110',
];

/** Code128B start pattern + stop pattern */
const CODE128_START_B = '11010000100';
const CODE128_STOP = '1100011101011';

const CODE39_PATTERNS: Record<string, string> = {
  '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
  '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
  '8': '110100101101', '9': '101100101101', A: '110101001011', B: '101101001011',
  C: '110110100101', D: '101011001011', E: '110101100101', F: '101101100101',
  G: '101010011011', H: '110101001101', I: '101101001101', J: '101011001101',
  K: '110101010011', L: '101101010011', M: '110110101001', N: '101011010011',
  O: '110101101001', P: '101101101001', Q: '101010110011', R: '110101011001',
  S: '101101011001', T: '101011011001', U: '110010101011', V: '100110101011',
  W: '110011010101', X: '100101101011', Y: '110010110101', Z: '100110110101',
  '-': '100101011011', '.': '110010101101', ' ': '100110101101', $: '100100100101',
  '/': '100100101001', '+': '100101001001', '%': '101001001001', '*': '100101101101',
};

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0010001', '0010011'];
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const EAN_PARITY: Record<string, string> = {
  '0': 'LLLLLL', '1': 'LLGLGG', '2': 'LLGGLG', '3': 'LLGGGL', '4': 'LGLLGG',
  '5': 'LGGLLG', '6': 'LGGGLL', '7': 'LGLGLG', '8': 'LGLGGL', '9': 'LGGLGL',
};

/** Returns an array of bar modules: 1 = inked, 0 = empty. */
function encodeBarcode(format: BarcodeFormat, raw: string): string | null {
  const value = completeCheckDigits(format, raw);

  if (format === 'CODE128') {
    let bits = CODE128_START_B;
    for (const ch of value) {
      const idx = ch.charCodeAt(0) - 32; // Code B maps ASCII 32..126 to index 0..94
      if (idx < 0 || idx > 94) return null;
      bits += CODE128_PATTERNS[idx];
    }
    return bits + CODE128_STOP;
  }

  if (format === 'CODE39') {
    const chars = ('*' + value.toUpperCase() + '*').split('');
    let bits = '';
    chars.forEach((ch, i) => {
      const pattern = CODE39_PATTERNS[ch];
      if (!pattern) return;
      bits += pattern;
      if (i < chars.length - 1) bits += '0'; // 1-module gap between characters
    });
    return bits;
  }

  if (format === 'EAN13') {
    if (!/^\d{13}$/.test(value)) return null;
    const first = value[0];
    const parity = EAN_PARITY[first];
    if (!parity) return null;
    let bits = '101';
    for (let i = 1; i <= 6; i++) {
      const row = parity[i - 1] === 'L' ? EAN_L : EAN_G;
      bits += row[Number(value[i])];
    }
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += EAN_R[Number(value[i])];
    return bits + '101';
  }

  if (format === 'EAN8') {
    if (!/^\d{8}$/.test(value)) return null;
    let bits = '101';
    for (let i = 0; i < 4; i++) bits += EAN_L[Number(value[i])];
    bits += '01010';
    for (let i = 4; i < 8; i++) bits += EAN_R[Number(value[i])];
    return bits + '101';
  }

  // UPC-A == EAN-13 with leading 0
  if (format === 'UPC') {
    if (!/^\d{12}$/.test(value)) return null;
    return encodeBarcode('EAN13', '0' + value);
  }

  return null;
}

/* ════════════════════ Canvas renderer ════════════════════ */

function drawBarcodeCanvas(
  canvas: HTMLCanvasElement,
  format: BarcodeFormat,
  value: string,
  opts: { barWidth: number; height: number; displayValue: boolean },
): void {
  const bits = encodeBarcode(format, value);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!bits) return;

  const quiet = 10 * opts.barWidth;
  const width = bits.length * opts.barWidth + quiet * 2;
  const fontPx = opts.displayValue ? Math.max(12, opts.barWidth * 11) : 0;
  canvas.width = width;
  canvas.height = opts.height + fontPx + 4;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') {
      ctx.fillRect(quiet + i * opts.barWidth, 0, opts.barWidth, opts.height);
    }
  }

  if (opts.displayValue && value.trim()) {
    ctx.fillStyle = '#000000';
    ctx.font = `${fontPx}px ui-monospace, 'Courier New', monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(completeCheckDigits(format, value), width / 2, opts.height + fontPx);
  }
}

/* ════════════════════ Components ════════════════════ */

type ScanStatus = 'idle' | 'scanning' | 'found' | 'error';

function BarcodeGenerator() {
  const [format, setFormat] = useState<BarcodeFormat>('CODE128');
  const [value, setValue] = useState('KZM-POS-2026-0001');
  const [barWidth, setBarWidth] = useState(2);
  const [height, setHeight] = useState(90);
  const [displayValue, setDisplayValue] = useState(true);
  const [copies, setCopies] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const error = validateValue(format, value);
    setLastError(error);
    if (error) return;
    drawBarcodeCanvas(canvas, format, value, { barWidth, height, displayValue });
  }, [format, value, barWidth, height, displayValue]);

  const finalValue = useMemo(() => completeCheckDigits(format, value), [format, value]);

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || lastError) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `barcode-${format.toLowerCase()}-${finalValue.replace(/[^\w-]/g, '_')}.png`;
    link.click();
  };

  const printLabels = () => {
    if (lastError) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const win = window.open('', '_blank', 'width=420,height=560');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>Barcode labels — ${finalValue}</title>
      <style>
        body { margin: 0; font-family: ui-monospace, monospace; }
        .sheet { display: flex; flex-wrap: wrap; gap: 10mm; padding: 10mm; }
        img { max-width: 46mm; }
      </style></head><body><div class="sheet">
      ${Array.from({ length: Math.max(1, Math.min(60, copies)) })
        .map(() => `<img src="${dataUrl}" alt="${finalValue}" />`)
        .join('')}
      </div></body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Barcode Generator</h2>
        <p className="text-xs text-slate-500">Create retail-grade barcodes for products, shelves, and invoices. Check digits for EAN/UPC are computed automatically.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="barcode-format">Symbology</label>
          <select className="input" id="barcode-format" value={format} onChange={(e) => setFormat(e.target.value as BarcodeFormat)}>
            {FORMAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">{FORMAT_OPTIONS.find((o) => o.value === format)?.hint}</p>
        </div>
        <div>
          <label className="label" htmlFor="barcode-value">Barcode value</label>
          <input
            className="input font-mono"
            id="barcode-value"
            value={value}
            placeholder={format === 'CODE128' ? 'SKU-001' : format === 'CODE39' ? 'SKU-001' : '4006381333931'}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="barcode-bar-width">Bar width (px)</label>
            <input className="input" id="barcode-bar-width" type="number" min={1} max={6} value={barWidth} onChange={(e) => setBarWidth(Math.max(1, Math.min(6, Number(e.target.value) || 1)))} />
          </div>
          <div>
            <label className="label" htmlFor="barcode-height">Height (px)</label>
            <input className="input" id="barcode-height" type="number" min={40} max={300} value={height} onChange={(e) => setHeight(Math.max(40, Math.min(300, Number(e.target.value) || 60)))} />
          </div>
        </div>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 text-xs font-medium">
            <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={displayValue} onChange={(e) => setDisplayValue(e.target.checked)} />
            Show human-readable value
          </label>
          <div className="flex-1">
            <label className="label" htmlFor="barcode-copies">Copies (label sheet)</label>
            <input className="input" id="barcode-copies" type="number" min={1} max={60} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
          </div>
        </div>
      </div>

      {lastError && <p className="text-xs font-semibold text-red-600" role="alert">{lastError}</p>}

      <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200 dark:ring-slate-700">
        <canvas ref={canvasRef} className="max-w-full" />
        {!lastError && (
          <p className="mt-2 font-mono text-xs text-slate-500">Encoded value: {finalValue}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={!!lastError} onClick={downloadPng}>Download PNG</button>
        <button type="button" className="btn-secondary" disabled={!!lastError} onClick={printLabels}>
          Print {copies > 1 ? `${copies} labels` : 'label'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => { setValue(''); canvasRef.current?.focus(); }}>Clear</button>
      </div>
    </section>
  );
}

function BarcodeScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [lastScans, setLastScans] = useState<{ value: string; format: string; at: string }[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleScanResult = (value: string, format: string) => {
    setStatus('found');
    setLastScans((prev) => [
      { value, format, at: new Date().toLocaleTimeString() },
      ...prev.filter((s) => s.value !== value).slice(0, 9),
    ]);
    stopCamera();
    setStatus('idle');
  };

  const startCamera = async () => {
    setScanError(null);
    setStatus('scanning');
    try {
      if (!('BarcodeDetector' in window)) {
        throw new Error('This browser does not support native barcode detection. Use Chrome or Edge on desktop/Android, or plug in a USB barcode scanner (keyboard-wedge) and scan into the manual input.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const detector = new (window as any).BarcodeDetector({
        formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf'],
      });

      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          if (results.length > 0) {
            const best = results[0];
            handleScanResult(best.rawValue, best.format);
            return;
          }
        } catch {
          /* transient frame failures are fine — keep scanning */
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setStatus('error');
      setScanError(err instanceof Error ? err.message : 'Unable to access the camera.');
      stopCamera();
    }
  };

  const manualSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = String(form.get('code') || '').trim();
    if (value) {
      handleScanResult(value, 'manual');
      e.currentTarget.reset();
    }
  };

  const isScanning = status === 'scanning';

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Barcode Scanner</h2>
        <p className="text-xs text-slate-500">Use the device camera (Chrome / Edge with native barcode detection) or a USB keyboard-wedge scanner through the manual input.</p>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-slate-950 ring-1 ring-slate-700" style={{ aspectRatio: '4 / 3' }}>
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {status !== 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-slate-400">
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5v15m16.5-15v15m-13.5-15v15m10.5-15v15m-6.75-15v15" />
            </svg>
            <p className="max-w-[220px] text-xs">{status === 'found' ? 'Scan captured — camera stopped.' : 'Camera preview appears here when scanning starts.'}</p>
          </div>
        )}
        {isScanning && (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2" aria-hidden="true">
            <div className="h-0.5 w-full animate-pulse rounded bg-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.9)]" />
          </div>
        )}
      </div>

      {scanError && <p className="text-xs font-semibold text-red-600" role="alert">{scanError}</p>}

      <div className="flex gap-2">
        {isScanning ? (
          <button type="button" className="btn-secondary" onClick={() => { stopCamera(); setStatus('idle'); }}>Stop camera</button>
        ) : (
          <button type="button" className="btn-primary" onClick={startCamera}>Start camera scan</button>
        )}
      </div>

      <form onSubmit={manualSubmit} className="flex gap-2">
        <input className="input flex-1 font-mono" name="code" placeholder="USB scanner output / manual code entry" autoComplete="off" />
        <button type="submit" className="btn-secondary">Log scan</button>
      </form>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Recent scans</p>
        {lastScans.length === 0 ? (
          <p className="text-xs text-slate-400">No scans recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
            {lastScans.map((s, i) => (
              <li key={`${s.value}-${i}`} className="flex items-center justify-between gap-3 py-1.5">
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{s.value}</span>
                <span className="text-slate-400">{s.format} · {s.at}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function Barcodes() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="border-b border-slate-200 pb-5 dark:border-slate-700">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">Operations</p>
        <h1 className="text-2xl font-semibold">Barcode Studio</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          Generate and print product barcodes, and scan them straight from the camera or a USB scanner.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <BarcodeGenerator />
        <BarcodeScanner />
      </div>
    </div>
  );
}
