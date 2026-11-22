export function passwordResetPage(baseUrl: string): URL {
  const page = new URL(baseUrl);
  if (!['http:', 'https:'].includes(page.protocol)) {
    throw new Error('PASSWORD_RESET_BASE_URL must use HTTP or HTTPS.');
  }
  const path = page.pathname.replace(/\/+$/, '');
  page.pathname = path.endsWith('/reset-password') ? path : `${path}/reset-password`;
  return page;
}
