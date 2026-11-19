import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { UsersComponent } from './users.component';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { CreatedUser, User } from '../../models/user.model';

const user = (id: number, username: string, over: Partial<User> = {}): User => ({
  id, username, email: `${username}@laptopshop.com`, full_name: username, role: 'staff', ...over,
});
const ADMIN = user(1, 'admin', { role: 'admin', full_name: 'Shop Owner' });
const USERS = [user(3, 'vanna', { full_name: 'Vanna Chea' }), user(2, 'dara', { full_name: 'Sok Dara' }), ADMIN];

describe('UsersComponent (admin: reset a password)', () => {
  let fixture: ComponentFixture<UsersComponent>;
  let component: UsersComponent;
  let api: { [k: string]: jasmine.Spy };
  let authApi: { currentUserValue: User; createUser: jasmine.Spy };

  async function open(list: User[] | Error | Subject<User[]> = USERS): Promise<void> {
    api = {
      getUsers: jasmine.createSpy('getUsers').and.returnValue(list instanceof Subject ? list : list instanceof Error ? throwError(() => ({ error: { error: list.message } })) : of(list)),
      resetPassword: jasmine.createSpy('resetPassword').and.returnValue(of({ message: 'Password changed' })),
    };
    authApi = {
      currentUserValue: ADMIN,
      createUser: jasmine.createSpy('createUser').and.callFake((data: any): Observable<CreatedUser> =>
        of({ user: user(9, data.email.split('@')[0], { email: data.email, full_name: data.full_name ?? data.email.split('@')[0], role: data.role }), token: 'their-own-token' })),
    };
    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        { provide: UserService, useValue: api },
        { provide: AuthService, useValue: authApi },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(UsersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => (dom().textContent ?? '').replace(/\s+/g, ' ');
  const cards = () => Array.from(dom().querySelectorAll('[data-user]')) as HTMLElement[];
  const names = () => cards().map(c => c.querySelector('[data-name]')!.textContent!.trim());
  const resetButton = (index: number) => cards()[index].querySelector('[data-action="reset"]') as HTMLButtonElement;
  const dialog = () => dom().querySelector('app-ask-dialog [role="alertdialog"]') as HTMLElement | null;
  const box = () => dom().querySelector('#new-password') as HTMLInputElement;
  const type = (value: string) => { box().value = value; box().dispatchEvent(new Event('input')); fixture.detectChanges(); };
  const dialogButton = (label: string) => Array.from(dialog()!.querySelectorAll('button')).find(b => b.textContent!.trim() === label) as HTMLButtonElement;
  const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); fixture.detectChanges(); };

  it('while the list loads it shows the grey shapes of the people (no "Loading..." text), then the people', async () => {
    const pending = new Subject<User[]>();
    await open(pending);
    expect(dom().querySelectorAll('[data-skeleton][data-kind="users"] [data-skeleton-item]').length).toBe(4);
    expect(text()).not.toContain('Loading...');
    expect(text()).not.toContain('No users');
    pending.next(USERS);
    pending.complete();
    fixture.detectChanges();
    expect(dom().querySelector('[data-skeleton]')).toBeNull();
    expect(cards().length).toBe(3);
  });

  describe('Add member', () => {
    const addButton = () => dom().querySelector('[data-action="add"]') as HTMLButtonElement;
    const drawer = () => dom().querySelector('[role="dialog"][aria-label="Add member"]') as HTMLElement | null;
    const typeIn = (id: string, value: string) => { const box = dom().querySelector(`#${id}`) as HTMLInputElement; box.value = value; box.dispatchEvent(new Event('input')); fixture.detectChanges(); };
    const submitForm = () => { (drawer()!.querySelector('button[type="submit"]') as HTMLButtonElement).click(); fixture.detectChanges(); };
    const press = (key: string) => { document.dispatchEvent(new KeyboardEvent('keydown', { key })); fixture.detectChanges(); };

    it('has an "Add member" button in the header', async () => {
      await open();
      expect(dom().querySelector('app-page-header [data-action="add"]')).not.toBeNull();
      expect(addButton().textContent!.trim()).toBe('Add member');
      expect(drawer()).toBeNull();
    });

    it('the button opens a panel from the right edge with the form in it', async () => {
      await open();
      addButton().click();
      fixture.detectChanges();
      expect(drawer()).not.toBeNull();
      expect(drawer()!.classList).toContain('drawer-panel');
      expect(drawer()!.querySelector('app-member-form')).not.toBeNull();
      expect(drawer()!.querySelector('h2')!.textContent).toContain('Add member');
    });

    it('the X, Cancel, the dark area and Esc close it; a click inside the panel does not', async () => {
      await open();
      const reopen = () => { if (!drawer()) { addButton().click(); fixture.detectChanges(); } };

      addButton().click(); fixture.detectChanges();
      (drawer()!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click(); fixture.detectChanges();
      expect(drawer()).toBeNull();

      reopen();
      (Array.from(drawer()!.querySelectorAll('button')).find(b => b.textContent!.trim() === 'Cancel') as HTMLButtonElement).click(); fixture.detectChanges();
      expect(drawer()).toBeNull();

      reopen();
      drawer()!.click(); fixture.detectChanges();
      expect(drawer()).not.toBeNull();                                   // inside the panel: stays open
      (dom().querySelector('.drawer-backdrop') as HTMLElement).click(); fixture.detectChanges();
      expect(drawer()).toBeNull();

      reopen();
      press('Escape');
      expect(drawer()).toBeNull();
    });

    it('adding a member closes the panel, says so, and shows them in the list (the list is read again)', async () => {
      await open();
      addButton().click(); fixture.detectChanges();
      await settle();                                                    // the form wires its boxes a moment after it appears
      const loadsBefore = api['getUsers'].calls.count();
      api['getUsers'].and.returnValue(of([...USERS, user(9, 'mony', { email: 'mony@gmail.com', full_name: 'Mony' })]));
      typeIn('m-name', 'Mony');
      typeIn('m-email', 'mony@gmail.com');
      typeIn('m-password', 'Thastore@1234');
      submitForm();
      await settle();
      expect(authApi.createUser).toHaveBeenCalledOnceWith({ email: 'mony@gmail.com', password: 'Thastore@1234', role: 'staff', full_name: 'Mony' });
      expect(drawer()).toBeNull();
      expect(text()).toContain('Added Mony (mony@gmail.com). They can sign in now.');
      expect(api['getUsers'].calls.count()).toBe(loadsBefore + 1);
      expect(names()).toContain('Mony');
      expect(cards().length).toBe(4);
    });

    it('a new admin is added as an admin and shows with the Admin badge', async () => {
      await open();
      addButton().click(); fixture.detectChanges();
      await settle();
      api['getUsers'].and.returnValue(of([...USERS, user(9, 'boss', { email: 'boss@gmail.com', full_name: 'The Boss', role: 'admin' })]));
      typeIn('m-email', 'boss@gmail.com');
      typeIn('m-password', 'Leap@1234');
      (drawer()!.querySelector('[role="radio"]:nth-child(2)') as HTMLButtonElement).click(); fixture.detectChanges();
      submitForm();
      await settle();
      expect(authApi.createUser.calls.mostRecent().args[0].role).toBe('admin');
      const boss = cards().find(c => c.textContent!.includes('The Boss'))!;
      expect(boss.textContent).toContain('Admin');
    });

    it('when the API says no the panel stays open with the reason, and the list is not read again', async () => {
      await open();
      addButton().click(); fixture.detectChanges();
      await settle();
      authApi.createUser.and.returnValue(throwError(() => new Error('Email already registered')));
      const loadsBefore = api['getUsers'].calls.count();
      typeIn('m-email', 'admin@laptopshop.com');
      typeIn('m-password', 'Thastore@1234');
      submitForm();
      expect(drawer()).not.toBeNull();
      expect(drawer()!.textContent).toContain('Email already registered');
      expect(api['getUsers'].calls.count()).toBe(loadsBefore);
    });

    it('Esc closes the reset box first, and does not close a panel that is not there', async () => {
      await open();
      (cards()[0].querySelector('[data-action="reset"]') as HTMLButtonElement).click(); fixture.detectChanges();
      expect(dialog()).not.toBeNull();
      press('Escape');
      expect(dialog()).toBeNull();
    });
  });

  it('lists everyone as a card: name, email and role; admins first, then A-Z', async () => {
    await open();
    expect(names()).toEqual(['Shop Owner', 'Sok Dara', 'Vanna Chea']);
    expect(cards()[0].querySelector('[data-email]')!.textContent).toContain('admin@laptopshop.com');
    expect(cards()[0].textContent).toContain('Admin');
    expect(cards()[1].textContent).toContain('Staff');
  });

  it('a person with no full name shows the username', async () => {
    await open([user(5, 'rotha', { full_name: '' })]);
    expect(names()).toEqual(['rotha']);
  });

  it('marks the signed-in admin with "You"', async () => {
    await open();
    expect(cards()[0].querySelector('[data-me]')).not.toBeNull();
    expect(cards()[1].querySelector('[data-me]')).toBeNull();
  });

  it('every card has a "Reset password" button', async () => {
    await open();
    expect(cards().every(c => c.querySelector('[data-action="reset"]')!.textContent!.trim() === 'Reset password')).toBeTrue();
  });

  it('says so when the users cannot be loaded', async () => {
    await open(new Error('Admin access required'));
    expect(dom().querySelector('[role="alert"]')!.textContent).toContain('Admin access required');
    expect(cards().length).toBe(0);
  });

  describe('the reset box (the same question box as everywhere, with the new password inside)', () => {
    it('opens for that person, empty, with the cursor in the password box', async () => {
      await open();
      document.body.appendChild(dom());
      resetButton(1).click();
      fixture.detectChanges();
      expect(dialog()!.textContent).toContain('Reset password');
      expect(dialog()!.textContent).toContain('Write a new password for Sok Dara.');
      expect(dialog()!.textContent).toContain('They will be signed out and have to sign in again.');
      expect(box().value).toBe('');
      expect(document.activeElement).toBe(box());
      dom().remove();
    });

    it('for the admin\'s own card it says they stay signed in', async () => {
      await open();
      resetButton(0).click();
      fixture.detectChanges();
      expect(dialog()!.textContent).toContain('You stay signed in.');
      expect(dialog()!.textContent).not.toContain('sign in again');
    });

    it('Change password sends the new password for that person, then closes and says it is done', async () => {
      await open();
      resetButton(1).click();
      fixture.detectChanges();
      type('My new pass 2026');
      dialogButton('Change password').click();
      await settle();
      expect(api['resetPassword']).toHaveBeenCalledOnceWith(2, 'My new pass 2026');
      expect(dialog()).toBeNull();
      expect(dom().querySelector('[role="status"]')!.textContent).toContain('Password changed for Sok Dara. They have to sign in again.');
      expect(component.newPassword).toBe('');
    });

    it('Enter in the box does the same as the button', async () => {
      await open();
      resetButton(2).click();
      fixture.detectChanges();
      type('Another pass 99');
      box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await settle();
      expect(api['resetPassword']).toHaveBeenCalledOnceWith(3, 'Another pass 99');
    });

    it('the admin changing their own password: done, and no "sign in again"', async () => {
      await open();
      resetButton(0).click();
      fixture.detectChanges();
      type('Mine is new 2026');
      dialogButton('Change password').click();
      await settle();
      const notice = dom().querySelector('[role="status"]')!.textContent!;
      expect(notice).toContain('Password changed for Shop Owner.');
      expect(notice).not.toContain('sign in again');
    });

    it('a password that is empty or too short is not sent; the box says why and stays open', async () => {
      await open();
      resetButton(1).click();
      fixture.detectChanges();
      dialogButton('Change password').click();
      fixture.detectChanges();
      expect(dialog()!.textContent).toContain('Write the new password.');
      type('1234567');
      dialogButton('Change password').click();
      fixture.detectChanges();
      expect(dialog()!.textContent).toContain('The password must be at least 8 characters.');
      expect(api['resetPassword']).not.toHaveBeenCalled();
      expect(dialog()).not.toBeNull();
    });

    it('a refusal from the API is shown in the box, which stays open to try again', async () => {
      await open();
      api['resetPassword'].and.returnValue(throwError(() => ({ error: { error: 'User not found' } })));
      resetButton(1).click();
      fixture.detectChanges();
      type('Long enough pass');
      dialogButton('Change password').click();
      await settle();
      expect(dialog()!.textContent).toContain('User not found');
      expect(dom().querySelector('[role="status"]')).toBeNull();
    });

    it('while it is saving the buttons are off and a second tap sends nothing more', async () => {
      await open();
      const pending = new Subject<{ message: string }>();
      api['resetPassword'].and.returnValue(pending);
      resetButton(1).click();
      fixture.detectChanges();
      type('Long enough pass');
      dialogButton('Change password').click();
      fixture.detectChanges();
      expect(dialogButton('Please wait...').disabled).toBeTrue();
      component.confirmReset();
      expect(api['resetPassword']).toHaveBeenCalledTimes(1);
      pending.next({ message: 'Password changed' });
      pending.complete();
      await settle();
      expect(dialog()).toBeNull();
    });

    it('Cancel and Esc close it and send nothing; the password typed is forgotten', async () => {
      await open();
      resetButton(1).click();
      fixture.detectChanges();
      type('Long enough pass');
      dialogButton('Cancel').click();
      fixture.detectChanges();
      expect(dialog()).toBeNull();
      resetButton(1).click();
      fixture.detectChanges();
      expect(box().value).toBe('');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(dialog()).toBeNull();
      expect(api['resetPassword']).not.toHaveBeenCalled();
    });

    it('the password is shown as it is typed (the admin tells it to the person), and is not given to the browser to remember', async () => {
      await open();
      resetButton(1).click();
      fixture.detectChanges();
      expect(box().type).toBe('text');
      expect(box().getAttribute('autocomplete')).toBe('off');
      expect(box().maxLength).toBe(72);
    });
  });
});
