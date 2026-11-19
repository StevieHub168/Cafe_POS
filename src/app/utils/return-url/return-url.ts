/**
 * The page to open after signing in. Only a page of this app counts ("/l/LP-0042", "/labels?ids=3"): never another site
 * ("//evil.example", "https://...", "/\evil") and never the Login page again.
 */
export function safeReturnUrl(wanted: string | null | undefined, fallback = '/menu'): string {
  const url = String(wanted ?? '');
  const bad = !url.startsWith('/') || url.startsWith('//') || url.includes('\\') || /[\u0000-\u001f]/.test(url) || /^\/login(?:[?#]|$)/.test(url);
  return bad ? fallback : url;
}

/** "LP-0042" when the page is a scanned laptop ("/l/lp-0042" too), else ''. */
export function scannedCodeOf(url: string): string {
  const match = /^\/l\/(LP-\d{1,9})$/i.exec(url.split(/[?#]/)[0]);
  return match ? match[1].toUpperCase() : '';
}
