/**
 * Copies text to the clipboard. Resolves true when it worked, false when it could not (it never throws).
 *
 * The modern way (navigator.clipboard) only exists on https:// pages and on localhost. Opening the app from a phone on
 * the shop's network is plain http://, so there it falls back to the older way (a hidden text box + "copy").
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // not allowed here: try the older way below
  }

  if (typeof document === 'undefined') return false;
  let box: HTMLTextAreaElement | null = null;
  try {
    box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(box);
    box.select();
    box.setSelectionRange(0, text.length);   // iPhone needs this
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    box?.remove();
  }
}
