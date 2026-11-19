import { toBlob } from 'html-to-image';
import { Invoice, formatInvoiceNumber } from '../../models/invoice/invoice.model';

/** The paper is always drawn at this size (A5 shape); see InvoicePaperComponent. */
export const PAPER_WIDTH = 592;
export const PAPER_HEIGHT = 840;

/** Waits for the web fonts (Khmer) so that nothing is printed or drawn in a stand-in font. */
export async function fontsReady(): Promise<void> {
  try {
    await document.fonts?.ready;
  } catch {
    // an old browser without document.fonts: carry on
  }
}

/** Opens the print dialog (there the person can pick "Save as PDF", the number of copies, ...). */
export async function printPage(): Promise<void> {
  await fontsReady();
  window.print();
}

/** The paper as a PNG picture (twice the size, so it stays sharp when sent on Telegram). */
export async function paperToPng(paper: HTMLElement): Promise<Blob> {
  await fontsReady();
  const blob = await toBlob(paper, { pixelRatio: 2, width: PAPER_WIDTH, height: PAPER_HEIGHT, backgroundColor: '#ffffff' });
  if (!blob) throw new Error('The picture could not be made');
  return blob;
}

/**
 * A picture redrawn as a PNG. The clipboard takes pictures ONLY as PNG, so a JPEG or WebP photo (most laptop photos)
 * has to be turned into one first. A very big photo is made smaller (longest side 2400 px): plenty for Telegram.
 */
export async function toPngBlob(blob: Blob, longestSide = 2400): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, longestSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The picture could not be converted');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(png => (png ? resolve(png) : reject(new Error('The picture could not be converted'))), 'image/png'));
  } finally {
    bitmap.close();
  }
}

/**
 * Puts the picture on the clipboard, ready to paste (into Telegram...). false = not possible here:
 * only https:// pages and localhost may do this, and not every browser can.
 * A photo that is not a PNG (a JPEG, WebP...) is turned into one first: the clipboard refuses every other kind.
 */
export async function copyImage(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    // A promise is fine here: the browser waits for it, and the click's permission to copy is kept while it is made.
    const picture = blob.type === 'image/png' ? blob : toPngBlob(blob);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': picture })]);
    return true;
  } catch {
    return false;
  }
}

/** Saves a file to the computer / phone. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "invoice-000041.png". */
export function invoiceFileName(invoice: Pick<Invoice, 'number'>): string {
  return `invoice-${formatInvoiceNumber(invoice.number)}.png`;
}
