import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AskDialogComponent } from './ask-dialog.component';

describe('AskDialogComponent', () => {
  let fixture: ComponentFixture<AskDialogComponent>;
  let component: AskDialogComponent;
  let yes: number;
  let no: number;

  async function open(inputs: Partial<Record<string, unknown>> = {}): Promise<void> {
    await TestBed.configureTestingModule({ imports: [AskDialogComponent] }).compileComponents();
    fixture = TestBed.createComponent(AskDialogComponent);
    component = fixture.componentInstance;
    for (const [name, value] of Object.entries({ title: 'Mark this laptop as sold?', message: 'MacBook Air 13" M1', ...inputs })) fixture.componentRef.setInput(name, value);
    yes = 0;
    no = 0;
    component.yes.subscribe(() => yes++);
    component.no.subscribe(() => no++);
    fixture.detectChanges();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const dialog = () => dom().querySelector('[role="alertdialog"]') as HTMLElement;
  const button = (label: string) => Array.from(dom().querySelectorAll('button')).find(b => b.textContent!.trim() === label) as HTMLButtonElement;

  it('shows the question, what it is about, and a line saying what will happen', async () => {
    await open({ detail: 'It is hidden from the Menu.' });
    expect(dialog().textContent).toContain('Mark this laptop as sold?');
    expect(dialog().textContent).toContain('MacBook Air 13" M1');
    expect(dialog().textContent).toContain('It is hidden from the Menu.');
    expect(dialog().getAttribute('aria-modal')).toBe('true');
    expect(dialog().getAttribute('aria-labelledby')).toBe('ask-title');
  });

  it('has no detail line when there is nothing to say', async () => {
    await open();
    expect(dialog().querySelector('p.bg-gray-50')).toBeNull();
  });

  it('the two buttons say what they do (and can be renamed)', async () => {
    await open();
    expect(button('Yes')).toBeTruthy();
    expect(button('No')).toBeTruthy();
    TestBed.resetTestingModule();
    await open({ yesLabel: 'Yes, mark as sold', noLabel: 'No, leave it' });
    expect(button('Yes, mark as sold')).toBeTruthy();
    expect(button('No, leave it')).toBeTruthy();
  });

  it('Yes and No tell the page', async () => {
    await open();
    button('Yes').click();
    expect([yes, no]).toEqual([1, 0]);
    button('No').click();
    expect([yes, no]).toEqual([1, 1]);
  });

  it('is not a warning: blue, not the red of the delete box', async () => {
    await open();
    expect(dialog().querySelector('.bg-primary-50')).not.toBeNull();
    expect(dialog().querySelector('.bg-red-50')).toBeNull();
    expect(button('Yes').className).toContain('bg-primary-600');
  });

  it('Esc and a click on the dark background do NOT answer it', async () => {
    await open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    (dom().querySelector('.ask-backdrop') as HTMLElement).click();
    dialog().click();
    expect([yes, no]).toEqual([0, 0]);
  });

  it('puts the focus on the button asked for: Yes by default, No when "Yes" changes something', async () => {
    await open();
    expect(document.activeElement).toBe(button('Yes'));
    TestBed.resetTestingModule();
    await open({ focus: 'no' });
    expect(document.activeElement).toBe(button('No'));
  });

  it('while the answer is being carried out both buttons are off and Yes says so', async () => {
    await open({ busy: true });
    expect(button('No').disabled).toBeTrue();
    expect(button('Please wait...').disabled).toBeTrue();
  });

  it('shows in red why it did not work', async () => {
    await open({ error: 'Could not update the laptop.' });
    const alert = dialog().querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Could not update the laptop.');
    expect(alert.className).toContain('text-red-600');
  });
});
