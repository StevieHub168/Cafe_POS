import { ApplicationRef, EnvironmentInjector, Injectable, createComponent } from '@angular/core';
import { InvoicePaperComponent } from '../components/invoices/invoice-paper.component';
import { Invoice } from '../models/invoice.model';
import { PAPER_HEIGHT, PAPER_WIDTH, paperToPng } from '../utils/invoice-export';

/** Waits until every picture in the box is loaded (the logo), so it is never missing from the invoice picture. */
async function picturesLoaded(root: HTMLElement): Promise<void> {
  const waiting = Array.from(root.querySelectorAll('img')).filter(img => !img.complete);
  await Promise.all(waiting.map(img => new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve(); })));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The picture could not be read'));
    reader.readAsDataURL(blob);
  });
}

/**
 * The invoice as a PNG picture, made without showing it: the paper is drawn off the side of the screen, turned into a picture
 * and thrown away. It is what "Copy picture" makes, so the Telegram group gets the same picture the customer would.
 */
@Injectable({ providedIn: 'root' })
export class InvoicePictureService {
  constructor(private appRef: ApplicationRef, private injector: EnvironmentInjector) { }

  /** "data:image/png;base64,..." (rejects when the picture cannot be made: the caller then sends the words alone). */
  async makeDataUrl(invoice: Invoice): Promise<string> {
    if (typeof document === 'undefined') throw new Error('No screen to draw on');
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAPER_WIDTH}px;height:${PAPER_HEIGHT}px;pointer-events:none`;
    const host = document.createElement('app-invoice-paper');
    box.appendChild(host);
    document.body.appendChild(box);
    const ref = createComponent(InvoicePaperComponent, { environmentInjector: this.injector, hostElement: host });
    try {
      ref.setInput('invoice', invoice);
      this.appRef.attachView(ref.hostView);
      ref.changeDetectorRef.detectChanges();
      await picturesLoaded(box);
      return await blobToDataUrl(await paperToPng(host));
    } finally {
      ref.destroy();
      box.remove();
    }
  }
}
