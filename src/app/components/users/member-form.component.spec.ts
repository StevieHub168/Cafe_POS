import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { MemberFormComponent } from './member-form.component';
import { AuthService } from '../../services/auth.service';
import { CreatedUser, User } from '../../models/user.model';

const NEW_USER: User = { id: 9, username: 'mony', email: 'mony@gmail.com', full_name: 'Mony', role: 'staff' };
const created = (over: Partial<User> = {}): CreatedUser => ({ user: { ...NEW_USER, ...over }, token: 'the-new-members-own-token' });

describe('MemberFormComponent (add a member)', () => {
  let fixture: ComponentFixture<MemberFormComponent>;
  let component: MemberFormComponent;
  let auth: { createUser: jasmine.Spy };
  let savedUsers: User[];
  let cancelled: number;

  async function open(answer: unknown = of(created())): Promise<void> {
    auth = { createUser: jasmine.createSpy('createUser').and.returnValue(answer) };
    await TestBed.configureTestingModule({
      imports: [MemberFormComponent],
      providers: [{ provide: AuthService, useValue: auth }],
    }).compileComponents();
    fixture = TestBed.createComponent(MemberFormComponent);
    component = fixture.componentInstance;
    savedUsers = [];
    cancelled = 0;
    component.saved.subscribe(user => savedUsers.push(user));
    component.cancelled.subscribe(() => cancelled++);
    fixture.detectChanges();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => (dom().textContent ?? '').replace(/\s+/g, ' ');
  const input = (id: string) => dom().querySelector(`#${id}`) as HTMLInputElement;
  const type = (id: string, value: string) => { input(id).value = value; input(id).dispatchEvent(new Event('input')); fixture.detectChanges(); };
  const pill = (label: string) => Array.from(dom().querySelectorAll('[role="radio"]')).find(b => b.textContent!.trim() === label) as HTMLButtonElement;
  const addButton = () => dom().querySelector('button[type="submit"]') as HTMLButtonElement;
  const cancelButton = () => Array.from(dom().querySelectorAll('button')).find(b => b.textContent!.trim() === 'Cancel') as HTMLButtonElement;
  const error = () => dom().querySelector('[data-form-error]')?.textContent?.trim() ?? null;
  const submit = () => { addButton().click(); fixture.detectChanges(); };
  const fillValid = () => { type('m-email', 'mony@gmail.com'); type('m-password', 'Thastore@1234'); };

  describe('what it shows', () => {
    it('has Name, Email, Role and Password; only the email and the password are marked as needed', async () => {
      await open();
      expect(input('m-name')).not.toBeNull();
      expect(input('m-email')).not.toBeNull();
      expect(input('m-password')).not.toBeNull();
      const labels = (id: string) => dom().querySelector(`label[for="${id}"]`)!.textContent!;
      expect(labels('m-name')).not.toContain('*');
      expect(labels('m-email')).toContain('*');
      expect(labels('m-password')).toContain('*');
      expect(addButton().textContent!.trim()).toBe('Add member');
    });

    it('Staff is picked to begin with, and picking Admin says what that means', async () => {
      await open();
      expect(pill('Staff').getAttribute('aria-checked')).toBe('true');
      expect(pill('Admin').getAttribute('aria-checked')).toBe('false');
      expect(dom().querySelector('[data-role-note]')!.textContent).toContain('cannot see the Users page');
      pill('Admin').click();
      fixture.detectChanges();
      expect(pill('Admin').getAttribute('aria-checked')).toBe('true');
      expect(pill('Staff').getAttribute('aria-checked')).toBe('false');
      expect(dom().querySelector('[data-role-note]')!.textContent).toContain('add members and reset passwords');
    });

    it('the password is plain text (you write it for someone else), and says how long it must be', async () => {
      await open();
      expect(input('m-password').type).toBe('text');
      expect(input('m-password').placeholder).toBe('At least 8 characters');
    });
  });

  describe('what is checked before anything is sent', () => {
    it('no email: "Write the email."', async () => {
      await open();
      type('m-password', 'Thastore@1234');
      submit();
      expect(error()).toBe('Write the email.');
      expect(auth.createUser).not.toHaveBeenCalled();
    });

    it('an email that is not an email', async () => {
      await open();
      for (const wrong of ['mony', 'mony@', 'mony@gmail', '@gmail.com', 'mo ny@gmail.com']) {
        type('m-email', wrong);
        type('m-password', 'Thastore@1234');
        submit();
        expect(error()).withContext(wrong).toBe('Write a real email, like name@shop.com.');
      }
      expect(auth.createUser).not.toHaveBeenCalled();
    });

    it('no password, or a short one', async () => {
      await open();
      type('m-email', 'mony@gmail.com');
      submit();
      expect(error()).toBe('Write a password.');
      type('m-password', '        ');
      submit();
      expect(error()).toBe('Write a password.');
      type('m-password', 'short');
      submit();
      expect(error()).toBe('The password must be at least 8 characters.');
      expect(auth.createUser).not.toHaveBeenCalled();
    });

    it('the message goes away when the form is right', async () => {
      await open();
      submit();
      expect(error()).not.toBeNull();
      fillValid();
      submit();
      expect(error()).toBeNull();
    });
  });

  describe('adding', () => {
    it('sends the email (the spaces cut off), the password as written, and the role; no name written = no name sent', async () => {
      await open();
      type('m-email', '  mony@gmail.com ');
      type('m-password', 'Thastore@1234');
      submit();
      expect(auth.createUser).toHaveBeenCalledOnceWith({ email: 'mony@gmail.com', password: 'Thastore@1234', role: 'staff' });
    });

    it('a name that is written is sent (the spaces cut off), and Admin is sent as the role', async () => {
      await open();
      type('m-name', '  The Boss ');
      type('m-email', 'boss@gmail.com');
      type('m-password', 'Leap@1234');
      pill('Admin').click();
      fixture.detectChanges();
      submit();
      expect(auth.createUser).toHaveBeenCalledOnceWith({ email: 'boss@gmail.com', password: 'Leap@1234', role: 'admin', full_name: 'The Boss' });
    });

    it('tells the page about the new member (and only the member: the token that comes with it is left alone)', async () => {
      await open(of(created({ id: 12, full_name: 'Mony Chea' })));
      fillValid();
      submit();
      expect(savedUsers.length).toBe(1);
      expect(savedUsers[0].id).toBe(12);
      expect(savedUsers[0].full_name).toBe('Mony Chea');
      expect(JSON.stringify(savedUsers[0])).not.toContain('token');
    });

    it('while it is being added the button says so and is off, and a second press sends nothing', async () => {
      const pending = new Subject<CreatedUser>();
      await open(pending);
      fillValid();
      submit();
      expect(addButton().textContent!.trim()).toBe('Adding...');
      expect(addButton().disabled).toBeTrue();
      expect(cancelButton().disabled).toBeTrue();
      component.submit();
      expect(auth.createUser).toHaveBeenCalledTimes(1);
      pending.next(created());
      pending.complete();
      fixture.detectChanges();
      expect(addButton().textContent!.trim()).toBe('Add member');
    });

    it('the reason is shown when the API says no (the form stays open with what was written)', async () => {
      await open(throwError(() => new Error('Email already registered')));
      fillValid();
      submit();
      expect(error()).toBe('Email already registered');
      expect(savedUsers.length).toBe(0);
      expect(input('m-email').value).toBe('mony@gmail.com');
      expect(addButton().disabled).toBeFalse();
    });

    it('an error with no reason says so in plain words', async () => {
      await open(throwError(() => ({})));
      fillValid();
      submit();
      expect(error()).toBe('Failed to add the member.');
    });
  });

  describe('Cancel', () => {
    it('tells the page, and does nothing while a member is being added', async () => {
      const pending = new Subject<CreatedUser>();
      await open(pending);
      cancelButton().click();
      expect(cancelled).toBe(1);
      fillValid();
      submit();
      component.cancel();
      expect(cancelled).toBe(1);
      expect(text()).toContain('Adding...');
    });
  });
});
