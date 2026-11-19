import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthService } from '../../services/auth/auth.service';
import { MIN_PASSWORD, User } from '../../models/user/user.model';

type Role = User['role'];

/** The same shape the API checks, so a typo is told here, before anything is sent. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The form to add a member (admin only): a name, the email they sign in with, staff or admin, and a first password.
 * The Users page provides the frame (title, close button) and reacts to (saved) and (cancelled).
 */
@Component({
  selector: 'app-member-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './member-form.component.html',
})
export class MemberFormComponent {
  /** The new member, after the API has saved them. */
  @Output() saved = new EventEmitter<User>();
  @Output() cancelled = new EventEmitter<void>();

  readonly minPassword = MIN_PASSWORD;
  readonly roles: { value: Role; label: string; note: string }[] = [
    { value: 'staff', label: 'Staff', note: 'Can use the shop pages, but cannot see the Users page.' },
    { value: 'admin', label: 'Admin', note: 'Can also add members and reset passwords.' },
  ];

  form = { full_name: '', email: '', role: 'staff' as Role, password: '' };
  isSaving = false;
  formError = '';

  get roleNote(): string {
    return this.roles.find(r => r.value === this.form.role)?.note ?? '';
  }

  /** What is wrong with the form, in plain words ('' = nothing). */
  private problem(): string {
    const email = this.form.email.trim();
    if (email === '') return 'Write the email.';
    if (!EMAIL_PATTERN.test(email)) return 'Write a real email, like name@shop.com.';
    if (this.form.password.trim() === '') return 'Write a password.';
    if (this.form.password.length < MIN_PASSWORD) return `The password must be at least ${MIN_PASSWORD} characters.`;
    return '';
  }

  constructor(private authService: AuthService) { }

  submit(): void {
    if (this.isSaving) return;
    this.formError = this.problem();
    if (this.formError) return;

    const name = this.form.full_name.trim();
    this.isSaving = true;
    this.authService.createUser({
      email: this.form.email.trim(),
      password: this.form.password,
      role: this.form.role,
      ...(name ? { full_name: name } : {}),
    }).pipe(finalize(() => (this.isSaving = false))).subscribe({
      next: (created) => this.saved.emit(created.user),
      // Stay open and say why (e.g. "Email already registered"), so the message is where you are looking.
      error: (err) => (this.formError = err?.message || 'Failed to add the member.'),
    });
  }

  cancel(): void {
    if (!this.isSaving) this.cancelled.emit();
  }
}
