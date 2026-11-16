import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { AppComponent } from './app.component';

@Component({ standalone: true, template: '' })
class BlankPage { }

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([
          { path: 'menu', component: BlankPage },
          { path: 'products', component: BlankPage },
          { path: 'dashboard', component: BlankPage },
        ]),
        provideHttpClient(),
      ],
    }).compileComponents();
  });

  async function titleAfterGoingTo(url: string): Promise<string> {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl(url);
    return fixture.componentInstance.pageTitle;
  }

  it('titles the Dashboard page', async () => {
    expect(await titleAfterGoingTo('/dashboard')).toBe('Dashboard');
  });

  it('keeps the right title when the address has a filter (?category=..&brand=..)', async () => {
    expect(await titleAfterGoingTo('/products?category=2&brand=Asus')).toBe('Products');
  });

  it('titles the Menu and Products pages', async () => {
    expect(await titleAfterGoingTo('/menu')).toBe('Menu');
    expect(await titleAfterGoingTo('/products')).toBe('Products');
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('starts on the Products page title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.pageTitle).toBe('Menu');
  });
});
