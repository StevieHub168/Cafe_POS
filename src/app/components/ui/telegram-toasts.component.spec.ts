import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TelegramToastsComponent } from './telegram-toasts.component';
import { TelegramNotifier, TelegramToast } from '../../services/telegram-notifier.service';

describe('TelegramToastsComponent (the little box in the corner)', () => {
  let fixture: ComponentFixture<TelegramToastsComponent>;
  let notifier: { toasts: TelegramToast[]; retry: jasmine.Spy; dismiss: jasmine.Spy };

  const boxes = () => Array.from(fixture.nativeElement.querySelectorAll('[data-telegram-toast]')) as HTMLElement[];
  const button = (box: HTMLElement, label: string) => Array.from(box.querySelectorAll('button')).find(b => (b.textContent ?? '').trim() === label || b.getAttribute('aria-label') === label) as HTMLButtonElement | undefined;

  beforeEach(async () => {
    notifier = { toasts: [], retry: jasmine.createSpy('retry'), dismiss: jasmine.createSpy('dismiss') };
    await TestBed.configureTestingModule({ imports: [TelegramToastsComponent], providers: [{ provide: TelegramNotifier, useValue: notifier }] }).compileComponents();
    fixture = TestBed.createComponent(TelegramToastsComponent);
    fixture.detectChanges();
  });

  it('shows nothing when there is nothing to say', () => {
    expect(boxes().length).toBe(0);
    expect(fixture.nativeElement.querySelector('[aria-label="Telegram"]')).toBeNull();
  });

  it('shows one box per message, with its words', () => {
    notifier.toasts.push({ id: 1, state: 'sending', text: 'Sending the sale to Telegram...' }, { id: 2, state: 'sent', text: 'Repair sent to Telegram.' });
    fixture.detectChanges();
    expect(boxes().map(b => b.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Sending the sale to Telegram...', 'Repair sent to Telegram.']);
  });

  it('"Sending" has no buttons; "Sent" has only a close button', () => {
    notifier.toasts.push({ id: 1, state: 'sending', text: 'Sending' }, { id: 2, state: 'sent', text: 'Sent' });
    fixture.detectChanges();
    expect(boxes()[0].querySelectorAll('button').length).toBe(0);
    expect(boxes()[1].querySelectorAll('button').length).toBe(1);
    expect(button(boxes()[1], 'Close')).toBeTruthy();
  });

  it('"Not sent" is an alert (red) with "Send again" and a close button, and they work', () => {
    const failed: TelegramToast = { id: 3, state: 'failed', text: 'The sale was saved, but not sent to Telegram. Bad Request: chat not found' };
    notifier.toasts.push(failed);
    fixture.detectChanges();
    const box = boxes()[0];
    expect(box.getAttribute('role')).toBe('alert');
    expect(box.textContent).toContain('Bad Request: chat not found');
    button(box, 'Send again')!.click();
    expect(notifier.retry).toHaveBeenCalledOnceWith(failed);
    button(box, 'Close')!.click();
    expect(notifier.dismiss).toHaveBeenCalledOnceWith(failed);
  });

  it('the other boxes are polite status lines, and the corner box does not block clicks on the page behind it', () => {
    notifier.toasts.push({ id: 1, state: 'sent', text: 'Sent' });
    fixture.detectChanges();
    expect(boxes()[0].getAttribute('role')).toBe('status');
    expect((fixture.nativeElement.querySelector('[aria-label="Telegram"]') as HTMLElement).classList).toContain('pointer-events-none');
  });
});
