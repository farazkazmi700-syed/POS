import { useState, useRef, type ChangeEvent, type DragEvent } from 'react';

export interface LogoBrandingManagerProps {
  logoUrl: string;
  savedLogoUrl?: string;
  businessName: string;
  address?: string;
  taxRegNo?: string;
  currency?: string;
  invoicePrefix?: string;
  domainType?: string;
  onChangeLogoUrl: (url: string) => void;
  onSaveLogo: (url: string) => Promise<void> | void;
  isSaving?: boolean;
}

/**
 * Resizes an uploaded image on an offscreen canvas to keep base64 payloads
 * lightweight (~40-80KB) while preserving high visual fidelity for receipts & watermarks.
 */
function compressImageFile(file: File, maxDimension = 640): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // PNG preserves transparency for circular/cutout logos
        const dataUrl = canvas.toDataURL('image/png', 0.92);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(reader.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function LogoBrandingManager({
  logoUrl,
  savedLogoUrl = '',
  businessName,
  address,
  taxRegNo,
  currency = 'PKR',
  invoicePrefix = 'INV',
  domainType = 'Retail',
  onChangeLogoUrl,
  onSaveLogo,
  isSaving = false,
}: LogoBrandingManagerProps) {
  const [activeTab, setActiveTab] = useState<'both' | 'receipt' | 'header'>('both');
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(0.09);
  const [previewDarkTheme, setPreviewDarkTheme] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isDataUri = logoUrl.startsWith('data:');
  const isDirty = (logoUrl || '').trim() !== (savedLogoUrl || '').trim();

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, SVG, WebP, GIF).');
      return;
    }
    setErrorMessage(null);
    try {
      const dataUri = await compressImageFile(file);
      onChangeLogoUrl(dataUri);
    } catch {
      setErrorMessage('Failed to process image. Please try another image or URL.');
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleSaveClick = async () => {
    setErrorMessage(null);
    try {
      await onSaveLogo(logoUrl);
      setSaveFeedback('Logo saved successfully! Live previews and app branding updated.');
      setTimeout(() => setSaveFeedback(null), 4000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save logo. Please try again.');
    }
  };

  const handleRemoveClick = () => {
    onChangeLogoUrl('');
    setErrorMessage(null);
  };

  const displayBusinessName = (businessName || '').trim() || 'Your Business Name';
  const displayAddress = (address || '').trim() || '123 Commercial Ave, Suite 400';
  const displayTax = (taxRegNo || '').trim() || 'NTN-8492019-3';
  const displayPrefix = (invoicePrefix || 'INV').toUpperCase();
  const displayCurrency = (currency || 'PKR').toUpperCase();

  return (
    <div className="space-y-6">
      {/* ── Top Header: Title & Actions ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4 dark:border-slate-700">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Logo &amp; Brand Watermark
            </h3>
            {isDirty ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                Unsaved Changes
              </span>
            ) : logoUrl ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Active Logo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                Default Monogram
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Customize your business logo. It renders in the header navigation bar, desktop sidebar, and as an authentic rotated watermark on customer receipts and PDF invoices.
          </p>
        </div>

        {/* Quick Save Logo Button */}
        <div className="flex items-center gap-2">
          {logoUrl && (
            <button
              type="button"
              onClick={handleRemoveClick}
              disabled={isSaving}
              className="btn-secondary !py-2 !px-3 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
              title="Remove logo"
            >
              Remove Logo
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={isSaving || !isDirty}
            className={`btn-primary !py-2 !px-4 text-xs font-semibold shadow-sm transition ${
              isDirty ? 'ring-2 ring-teal-500/50 shadow-teal-600/20' : 'opacity-70 cursor-not-allowed'
            }`}
          >
            {isSaving ? (
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Saving logo…
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Save Logo
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Status Alerts ── */}
      {saveFeedback && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300">
          <svg className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          {saveFeedback}
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-800 ring-1 ring-inset ring-red-600/20 dark:bg-red-950/40 dark:text-red-300">
          <svg className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          {errorMessage}
        </div>
      )}

      {/* ── Logo Upload & Input Section ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Drag & Drop File Upload Box */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center transition ${
            isDragging
              ? 'border-teal-500 bg-teal-50/60 dark:border-teal-400 dark:bg-teal-950/30'
              : 'border-slate-300 bg-slate-50/60 hover:border-teal-500/80 hover:bg-slate-100/60 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-teal-500/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/gif"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-xs ring-1 ring-slate-200 transition group-hover:scale-105 group-hover:shadow-md dark:bg-slate-800 dark:ring-slate-700">
            <svg className="h-6 w-6 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
            Click to upload or drag &amp; drop logo
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            PNG, SVG, JPG, WebP (auto-optimized for fast receipts)
          </p>
          {isDataUri && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
              ✓ Image file selected
            </span>
          )}
        </div>

        {/* URL Input Box & Quick Preview Card */}
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
          <div>
            <label className="label !mb-1 text-xs">Or use Image URL (CDN / Cloud Storage)</label>
            <div className="relative">
              <input
                className="input text-xs"
                placeholder={isDataUri ? 'Uploaded image active (paste URL to replace)' : 'https://cdn.example.com/logo.png'}
                value={isDataUri ? '' : logoUrl}
                onChange={(e) => {
                  setErrorMessage(null);
                  onChangeLogoUrl(e.target.value);
                }}
              />
              {!isDataUri && logoUrl && (
                <button
                  type="button"
                  onClick={() => onChangeLogoUrl('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="Clear input"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {isDataUri && (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Using an uploaded image. Enter an external image URL to replace it.
              </p>
            )}
          </div>

          {/* Mini active badge */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-xs dark:border-slate-700/80 dark:bg-slate-900/60">
            <div className="flex items-center gap-2.5 min-w-0">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo thumbnail"
                  className="h-9 w-9 rounded-lg object-contain bg-slate-50 p-0.5 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 text-sm font-bold text-white shadow-xs">
                  {displayBusinessName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <span className="block truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {logoUrl ? (isDataUri ? 'Uploaded Image' : 'Custom Image URL') : 'Monogram Fallback'}
                </span>
                <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">
                  {logoUrl ? 'Active on receipts & header' : 'Upload an image above to activate'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary !py-1 !px-2.5 text-[11px]"
              >
                Change
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Live Previews Section ── */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40 sm:p-5 space-y-4">
        {/* Navigation & Preview Mode Switcher */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-3.5 dark:border-slate-700/80">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Live Brand &amp; Watermark Previews
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Preview updates live as you type or change the logo before saving.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Tabs */}
            <div className="flex items-center rounded-xl bg-slate-200/80 p-0.5 dark:bg-slate-700/80">
              <button
                type="button"
                onClick={() => setActiveTab('both')}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  activeTab === 'both'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Both Previews
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('receipt')}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  activeTab === 'receipt'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Receipt Watermark
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('header')}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  activeTab === 'header'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Header Branding
              </button>
            </div>
          </div>
        </div>

        {/* ── Previews Layout Grid ── */}
        <div
          className={`grid gap-6 items-start ${
            activeTab === 'both'
              ? 'grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]'
              : 'grid-cols-1 max-w-2xl mx-auto'
          }`}
        >
          {/* ────── 1. Receipt & Watermark Preview Card ────── */}
          {(activeTab === 'both' || activeTab === 'receipt') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  Customer Receipt / Tax Invoice Watermark
                </span>

                {/* Opacity selector */}
                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <span>Watermark:</span>
                  {[0.06, 0.09, 0.14].map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => setWatermarkOpacity(op)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                        watermarkOpacity === op
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {Math.round(op * 100)}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Realistic Paper Receipt Mockup Container */}
              <div className="relative mx-auto w-full max-w-sm rounded-2xl bg-white p-5 text-slate-900 shadow-xl ring-1 ring-slate-200/90 dark:bg-slate-950 dark:text-slate-100 dark:ring-slate-800 overflow-hidden font-mono text-[11px] leading-relaxed">
                {/* ── Background Logo Watermark (matches pdf-worker invoice.hbs) ── */}
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden"
                  aria-hidden="true"
                >
                  {logoUrl ? (
                    <div
                      style={{
                        opacity: watermarkOpacity,
                        transform: 'translate(-50%, -50%) rotate(-20deg)',
                        position: 'absolute',
                        left: '50%',
                        top: '52%',
                        width: '260px',
                        height: '260px',
                      }}
                    >
                      <img
                        src={logoUrl}
                        alt="Watermark watermark"
                        className="h-full w-full object-contain filter grayscale"
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        opacity: 0.05,
                        transform: 'translate(-50%, -50%) rotate(-20deg)',
                        position: 'absolute',
                        left: '50%',
                        top: '52%',
                      }}
                      className="text-center font-black tracking-widest text-4xl text-slate-900 dark:text-white uppercase select-none"
                    >
                      {displayBusinessName}
                    </div>
                  )}
                </div>

                {/* ── Foreground Receipt Elements ── */}
                <div className="relative z-10 space-y-3">
                  {/* Receipt Header */}
                  <div className="text-center pb-2 border-b border-dashed border-slate-300 dark:border-slate-700">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Business logo"
                        className="mx-auto mb-1.5 max-h-11 max-w-[140px] object-contain drop-shadow-xs"
                      />
                    ) : (
                      <div className="mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                        {displayBusinessName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <h5 className="font-bold text-xs tracking-wider uppercase text-slate-900 dark:text-slate-100">
                      {displayBusinessName}
                    </h5>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {displayAddress}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Tax Reg (NTN/STRN): {displayTax}
                    </p>
                  </div>

                  {/* Invoice Meta */}
                  <div className="grid grid-cols-2 text-[10px] text-slate-600 dark:text-slate-400">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        TAX INVOICE:
                      </span>{' '}
                      {displayPrefix}-2026-0042
                    </div>
                    <div className="text-right">Oct 18, 2026 · 19:45</div>
                    <div>Cashier: Store Cashier</div>
                    <div className="text-right">Mode: CASH</div>
                  </div>

                  {/* Items List */}
                  <div className="border-t border-b border-dashed border-slate-300 py-2 dark:border-slate-700">
                    <div className="flex justify-between font-bold text-[10px] uppercase text-slate-500 mb-1">
                      <span>Item</span>
                      <span>Total</span>
                    </div>
                    <div className="space-y-1.5 text-[10.5px]">
                      <div className="flex justify-between">
                        <div>
                          <div>Whole Bean Espresso Blend</div>
                          <div className="text-[9.5px] text-slate-500">1 x 1,850.00</div>
                        </div>
                        <span className="font-semibold">{displayCurrency} 1,850.00</span>
                      </div>
                      <div className="flex justify-between">
                        <div>
                          <div>Artisan Cold Brew (250ml)</div>
                          <div className="text-[9.5px] text-slate-500">2 x 450.00</div>
                        </div>
                        <span className="font-semibold">{displayCurrency} 900.00</span>
                      </div>
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="space-y-1 text-[10.5px]">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Subtotal:</span>
                      <span>{displayCurrency} 2,750.00</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Sales Tax (GST 18%):</span>
                      <span>{displayCurrency} 495.00</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold pt-1 border-t border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
                      <span>GRAND TOTAL:</span>
                      <span>{displayCurrency} 3,245.00</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 pt-0.5">
                      <span>Cash Paid: {displayCurrency} 3,500.00</span>
                      <span>Change: {displayCurrency} 255.00</span>
                    </div>
                  </div>

                  {/* Barcode & Footer Notice */}
                  <div className="pt-2 text-center text-[10px] border-t border-dashed border-slate-300 dark:border-slate-700 space-y-1 text-slate-500 dark:text-slate-400">
                    {/* Simulated barcode */}
                    <div className="mx-auto flex h-7 w-44 items-center justify-center gap-0.5 bg-slate-100 p-1 dark:bg-slate-900">
                      {[3, 1, 4, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 2, 4, 1, 2].map((w, i) => (
                        <div
                          key={i}
                          style={{ width: `${w}px` }}
                          className="h-full bg-slate-900 dark:bg-slate-100"
                        />
                      ))}
                    </div>
                    <p className="font-medium text-[9px] tracking-wider text-slate-400 uppercase">
                      *{displayPrefix}-2026-0042*
                    </p>
                    <p className="text-[9.5px]">Thank you for your business!</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-slate-100/80 p-2 text-[11px] text-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
                <span className="text-teal-600 dark:text-teal-400 font-bold">ℹ Note:</span>
                Receipt watermark is automatically printed in grayscale at 8% opacity across all customer thermal printouts, POS slips, and generated PDF invoices.
              </div>
            </div>
          )}

          {/* ────── 2. Header & App Branding Preview Card ────── */}
          {(activeTab === 'both' || activeTab === 'header') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                  </svg>
                  App Header &amp; Sidebar Branding
                </span>

                <button
                  type="button"
                  onClick={() => setPreviewDarkTheme((d) => !d)}
                  className="rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Preview: {previewDarkTheme ? 'Dark' : 'Light'}
                </button>
              </div>

              {/* Header Bar Simulation */}
              <div
                className={`rounded-2xl border p-3.5 shadow-sm space-y-3 transition ${
                  previewDarkTheme
                    ? 'border-slate-800 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-900'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Top Header Bar (Desktop &amp; Mobile)
                </div>

                <div
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                    previewDarkTheme
                      ? 'border-slate-800 bg-slate-950/70'
                      : 'border-slate-200/90 bg-slate-50/90'
                  }`}
                >
                  {/* Brand Pill */}
                  <div className="flex items-center gap-2.5">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Header brand logo"
                        className="h-6 w-6 rounded-md object-cover ring-1 ring-slate-200 dark:ring-slate-700 shadow-xs"
                      />
                    ) : (
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-teal-500 to-teal-700 text-[10px] font-bold text-white shadow-xs">
                        {displayBusinessName.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="text-xs font-bold tracking-tight">
                      {displayBusinessName}
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live
                    </span>
                  </div>

                  {/* Mock Action Icons */}
                  <div className="flex items-center gap-1.5 opacity-60">
                    <div className="h-6 w-6 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    <div className="h-6 w-6 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    <div className="h-6 w-6 rounded-full bg-teal-600/20 text-[9px] flex items-center justify-center font-bold text-teal-700 dark:text-teal-300">
                      AD
                    </div>
                  </div>
                </div>

                {/* Sidebar Brand Simulation */}
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pt-1">
                  Sidebar Brand Header
                </div>

                <div
                  className={`flex items-center gap-3 rounded-xl border p-3 ${
                    previewDarkTheme
                      ? 'border-slate-800 bg-slate-950/70'
                      : 'border-slate-200/90 bg-slate-50/90'
                  }`}
                >
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Sidebar brand logo"
                      className="h-10 w-10 rounded-xl object-cover shadow-sm ring-2 ring-teal-500/20"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-sm font-bold text-white shadow-sm">
                      {displayBusinessName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold tracking-tight">
                      {displayBusinessName}
                    </span>
                    <span className="block truncate text-[10px] text-slate-500 capitalize">
                      {domainType} POS System
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-slate-100/80 p-2 text-[11px] text-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
                <span className="text-teal-600 dark:text-teal-400 font-bold">ℹ Brand Identity:</span>
                Your logo instantly brands the top desktop header bar, sidebar, and mobile drawer across all POS registers.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

