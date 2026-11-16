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

  it('after signing in it opens the page that was wanted: the scanned laptop', async () => {
    const { component } = await open('/l/LP-0042');
    component.onSubmit();
    expect(login).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledOnceWith('/l/LP-0042');
  });

  it('without a wanted page it opens the Menu, as always', async () => {
    const { component } = await open();
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
    component.onSubmit();
    expect(component.errorMessage).toBe('Wrong email or password');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
