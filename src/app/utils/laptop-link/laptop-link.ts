/** The address a QR code opens for a laptop: "https://shop.example/l/LP-0042". `base` is the shop's address. */
export function laptopLink(base: string, code: string): string {
  return `${base.trim().replace(/\/+$/, '')}/l/${encodeURIComponent(code)}`;
}

/** The code in a link made by laptopLink ("LP-0042"), or null. */
export function codeFromLink(link: string): string | null {
  const m = /\/l\/(LP-\d{1,9})(?:[/?#]|$)/i.exec(link);
  return m ? m[1].toUpperCase() : null;
}

/** true = this address only works on this computer (a phone that scans the QR could not open it). */
export function isThisComputerOnly(base: string): boolean {
  return /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(base.trim());
}
