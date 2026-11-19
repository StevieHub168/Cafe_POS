import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { of, throwError } from 'rxjs';

import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('the boxes are empty: nothing is filled in for you (no demo account, no password in the code)', () => {
    expect(component.loginForm.value).toEqual({ email: '', password: '' });
    const page = fixture.nativeElement as HTMLElement;
    expect((page.querySelector('#email') as HTMLInputElement).value).toBe('');
    expect((page.querySelector('#password') as HTMLInputElement).value).toBe('');
  });

  it('has no quick-fill buttons for demo accounts, only the form and its Sign In button', () => {
    const page = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(page.querySelectorAll('button')).map(b => b.textContent!.trim());
    expect(buttons).toEqual(['Sign In']);
    expect(page.textContent).not.toContain('laptopshop.com');
    expect((component as unknown as Record<string, unknown>)['testerAccounts']).toBeUndefined();
  });

  it('empty boxes are not sent: it asks for the email and the password', () => {
    const login = spyOn(TestBed.inject(AuthService), 'login');
    component.onSubmit();
    fixture.detectChanges();
    expect(login).not.toHaveBeenCalled();
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('Email is required');
    expect(text).toContain('Password is required');
  });
});

describe('LoginComponent after a scan (returnUrl)', () => {
  let navigateByUrl: jasmine.Spy;
  let loggedIn: boolean;
  let login: jasmine.Spy;

  async function open(returnUrl?: string): Promise<{ fixture: ComponentFixture<LoginComponent>; component: LoginComponent }> {
    navigateByUrl = jasmine.createSpy('navigateByUrl');
    login = jasmine.createSpy('login').and.returnValue(of({}));
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { isLoggedIn: () => loggedIn, login } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(returnUrl === undefined ? {} : { returnUrl }) } } },
      ],
    }).compileComponents();
    spyOn(TestBed.inject(Router), 'navigateByUrl').and.callFake(navigateByUrl as never);
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  beforeEach(() => { loggedIn = false; });

  /** Writes an email and a password in the boxes, as a person does (nothing is filled in for them). */
  const signInWith = (component: LoginComponent) => component.loginForm.patchValue({ email: 'mony@gmail.com', password: 'a-long-password' });

  it('after signing in it opens the page that was wanted: the scanned laptop', async () => {
    const { component } = await open('/l/LP-0042');
    signInWith(component);
    component.onSubmit();
    expect(login).toHaveBeenCalledOnceWith({ email: 'mony@gmail.com', password: 'a-long-password' });
    expect(navigateByUrl).toHaveBeenCalledOnceWith('/l/LP-0042');
  });

  it('without a wanted page it opens the Menu, as always', async () => {
    const { component } = await open();
    signInWith(component);
    component.onSubmit();
    expect(navigateByUrl).toHaveBeenCalledOnceWith('/menu');
  });

  it('shows "You scanned LP-0042" for a scanned laptop, and nothing else about it before signing in', async () => {
    const { fixture } = await open('/l/lp-0042');
    const card = (fixture.nativeElement as HTMLElement).querySelector('[data-scanned]') as HTMLElement;
    const lines = Array.from(card.querySelectorAll('p')).map(p => p.textContent!.trim());
    expect(lines).toEqual(['You scanned', 'LP-0042']);
  });

  it('shows no scanned card for any other page', async () => {
    const { fixture } = await open('/labels?ids=3');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-scanned]')).toBeNull();
  });

  it('never opens another site: a wanted page that is not of this app is ignored', async () => {
    const { component } = await open('https://evil.example/l/LP-0042');
    signInWith(component);
    component.onSubmit();
    expect(navigateByUrl).toHaveBeenCalledOnceWith('/menu');
  });

  it('a person who is already signed in goes straight to the wanted page', async () => {
    loggedIn = true;
    await open('/l/LP-0042');
    expect(navigateByUrl).toHaveBeenCalledOnceWith('/l/LP-0042');
  });

  it('a wrong password stays on Login and says so', async () => {
    const { component } = await open('/l/LP-0042');
    login.and.returnValue(throwError(() => new Error('Wrong email or password')));
    signInWith(component);
    component.onSubmit();
    expect(component.errorMessage).toBe('Wrong email or password');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
