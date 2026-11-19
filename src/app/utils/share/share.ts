/**
 * Sending several things at once (a message, a photo, a picture of the invoice) to another app such as Telegram.
 *
 * A clipboard can hold only ONE thing to paste, so for "text + photo + invoice together" the browser's share menu is used
 * (navigator.share with files): the person picks Telegram and the customer, and everything arrives in one message.
 * That works on phones, on Safari (Mac) and on recent Chrome / Edge, and only on https:// pages or localhost.
 * Everything here returns an answer instead of throwing, so the page can say something plain when it cannot be done.
 */

export type ShareResult = 'shared' | 'cancelled' | 'unsupported' | 'failed';

/** What goes into the share menu: the files, and the text (left out when empty). */
function dataFor(files: File[], text: string): ShareData {
  const data: ShareData = {};
  if (files.length) data.files = files;
  if (text) data.text = text;
  return data;
}

/** Can this browser hand these files and this text to another app in one go? */
export function canShare(files: File[], text = ''): boolean {
  try {
    return typeof navigator !== 'undefined'
      && typeof navigator.share === 'function'
      && typeof navigator.canShare === 'function'
      && navigator.canShare(dataFor(files, text));
  } catch {
    return false;
  }
}

/** Opens the share menu. 'cancelled' = the person closed it (nothing to report). */
export async function share(files: File[], text: string): Promise<ShareResult> {
  if (!canShare(files, text)) return 'unsupported';
  try {
    await navigator.share(dataFor(files, text));
    return 'shared';
  } catch (error) {
    return (error as { name?: string } | null)?.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
};

/** Downloads a picture from a web address as a file ("laptop.jpg"). null = it could not be loaded (or is not a picture). */
export async function fetchImageFile(url: string, baseName: string): Promise<File | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    return new File([blob], `${baseName}.${EXTENSIONS[blob.type] ?? 'jpg'}`, { type: blob.type });
  } catch {
    return null;       // no network, or the other site does not allow it
  }
}
