import { Injectable } from '@angular/core';
import { ShareResult, canShare, fetchImageFile, share } from '../../utils/share/share';
import { copyToClipboard } from '../../utils/clipboard/clipboard';
import { copyImage, downloadBlob, paperToPng } from '../../utils/invoice-export/invoice-export';

/**
 * Everything that touches the browser when details are sent to a customer (the share menu, the clipboard, files, the
 * invoice as a picture). It only passes the work on; it is a service so that a test can put a pretend one in its place.
 */
@Injectable({
  providedIn: 'root'
})
export class ShareService {
  /** Can this browser hand these files (and text) to another app at once? */
  canShare(files: File[], text = ''): boolean {
    return canShare(files, text);
  }

  share(files: File[], text: string): Promise<ShareResult> {
    return share(files, text);
  }

  fetchImage(url: string, baseName: string): Promise<File | null> {
    return fetchImageFile(url, baseName);
  }

  /** The invoice paper (the full-size one) as a PNG picture. */
  makePng(paper: HTMLElement): Promise<Blob> {
    return paperToPng(paper);
  }

  copyText(text: string): Promise<boolean> {
    return copyToClipboard(text);
  }

  /** false = this browser cannot put a picture on the clipboard. */
  copyImage(blob: Blob): Promise<boolean> {
    return copyImage(blob);
  }

  save(blob: Blob, fileName: string): void {
    downloadBlob(blob, fileName);
  }
}
