import puppeteer, { Browser } from 'puppeteer';

let browserPromise: Promise<Browser> | null = null;

/** One shared headless browser; a fresh page per invoice keeps jobs isolated and fast. */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const executablePath =
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        process.env.CHROME_BIN ||
        (await puppeteer.executablePath());

      const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });

      browser.on('disconnected', () => { browserPromise = null; });
      return browser;
    })().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }

  return browserPromise;
}

/**
 * Render HTML to a PDF buffer.
 * The invoice template controls page size and margins via CSS @page rules.
 * Puppeteer margins are set to 0 so the CSS @page margin is the sole authority.
 */
export async function htmlToPdf(html: string, opts: { width?: string; height?: string } = {}): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const allowed =
        request.url() === 'about:blank' ||
        /^data:image\/(png|jpeg|webp|gif);base64,/.test(request.url()) ||
        /^data:font\/ttf;base64,/.test(request.url());
      void (allowed ? request.continue() : request.abort()).catch(() => undefined);
    });
    await page.setContent(html, { waitUntil: 'load' });
    // Wait for custom fonts declared in the HTML to finish loading.
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const pdf = await page.pdf({
      // preferCSSPageSize lets the @page { size: Xmm Ymm } rule in the template
      // determine the paper dimensions; we pass width/height only as a fallback.
      preferCSSPageSize: true,
      width: opts.width,
      height: opts.height,
      printBackground: true,
      // Margins are owned by the CSS @page rule in invoice.hbs; keep Puppeteer's
      // margin at zero so the two layers do not accumulate.
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    await b?.close();
    browserPromise = null;
  }
}
