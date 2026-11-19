import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth/auth.service';

describe('authGuard', () => {
  let navigate: jasmine.Spy;
  let loggedIn: boolean;

  const run = (url: string) => TestBed.runInInjectionContext(() => authGuard({} as never, { url } as RouterStateSnapshot));

  beforeEach(() => {
    navigate = jasmine.createSpy('navigate');
    loggedIn = false;
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { isLoggedIn: () => loggedIn } },
        { provide: Router, useValue: { navigate } },
      ],
    });
  });

  it('lets a signed-in person through', () => {
    loggedIn = true;
    expect(run('/products')).toBeTrue();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('sends a person who is not signed in to Login and remembers the page they wanted', () => {
    expect(run('/l/LP-0042')).toBeFalse();
    expect(navigate).toHaveBeenCalledOnceWith(['/login'], { queryParams: { returnUrl: '/l/LP-0042' } });
  });

  it('keeps the query too ("/labels?ids=3&per=2")', () => {
    run('/labels?ids=3&per=2');
    expect(navigate).toHaveBeenCalledOnceWith(['/login'], { queryParams: { returnUrl: '/labels?ids=3&per=2' } });
  });

  it('adds nothing when the page wanted is just the start page', () => {
    run('/');
    expect(navigate).toHaveBeenCalledOnceWith(['/login'], { queryParams: {} });
  });
});
