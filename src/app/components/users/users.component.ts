import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { MIN_PASSWORD, User } from '../../models/user.model';
import { PageHeaderComponent } from '../ui/page-header/page-header.component';
import { StatusBadgeComponent } from '../ui/status-badge/status-badge.component';
import { SkeletonComponent } from '../ui/skeleton/skeleton.component';
import { AskDialogComponent } from '../ui/ask-dialog/ask-dialog.component';
import { MemberFormComponent } from './member-form.component';

/**
 * Admin only: the people who can sign in. "Add member" adds one (a drawer with the form), and "Reset password" changes the password
 * of one (for someone who forgot it). The person is signed out and has to sign in again with the new password.
 */
@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, SkeletonComponent, StatusBadgeComponent, AskDialogComponent, MemberFormComponent],
  templateUrl: './users.component.html',
})
export class UsersComponent implements OnInit {
  users: User[] = [];
  isLoading = true;
  errorMessage = '';
  successMessage = '';
  private successTimer: ReturnType<typeof setTimeout> | undefined;

  /** The "Add member" drawer is open. */
  adding = false;

  /** The person whose password is being reset (null = the box is closed). */
  resetting: User | null = null;
  newPassword = '';
  resetError = '';
  isResetting = false;
  readonly minPassword = MIN_PASSWORD;

  constructor(private userService: UserService, private authService: AuthService) { }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.userService.getUsers().pipe(finalize(() => (this.isLoading = false))).subscribe({
      // Admins first, then A-Z.
      next: (users) => (this.users = [...users].sort((a, b) =>
        Number(b.role === 'admin') - Number(a.role === 'admin') || this.nameOf(a).localeCompare(this.nameOf(b)))),
      error: (err) => (this.errorMessage = err?.error?.error || 'Failed to load the users.'),
    });
  }

  nameOf(user: User): string {
    return user.full_name?.trim() || user.username;
  }

  /** The signed-in admin (their own password can be changed too, and they stay signed in). */
  isMe(user: User): boolean {
    return this.authService.currentUserValue?.id === user.id;
  }

  // ---------- add a member (the form is <app-member-form>) ----------

  openAdd(): void {
    this.adding = true;
  }

  closeAdd(): void {
    this.adding = false;
  }

  onAdded(user: User): void {
    this.adding = false;
    this.load();
    this.showSuccess(`Added ${this.nameOf(user)} (${user.email}). They can sign in now.`);
  }

  // ---------- reset a password ----------

  openReset(user: User): void {
    this.resetting = user;
    this.newPassword = '';
    this.resetError = '';
  }

  cancelReset(): void {
    if (this.isResetting) return;
    this.resetting = null;
  }

  confirmReset(): void {
    const user = this.resetting;
    if (!user || this.isResetting) return;
    if (this.newPassword.trim() === '') { this.resetError = 'Write the new password.'; return; }
    if (this.newPassword.length < MIN_PASSWORD) { this.resetError = `The password must be at least ${MIN_PASSWORD} characters.`; return; }

    this.isResetting = true;
    this.resetError = '';
    this.userService.resetPassword(user.id, this.newPassword).pipe(finalize(() => (this.isResetting = false))).subscribe({
      next: () => {
        this.resetting = null;
        this.newPassword = '';
        this.showSuccess(`Password changed for ${this.nameOf(user)}.${this.isMe(user) ? '' : ' They have to sign in again.'}`);
      },
      // Stay open and say why, so the message is where you are looking.
      error: (err) => (this.resetError = err?.error?.error || 'Failed to change the password.'),
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.resetting) this.cancelReset();
    else this.closeAdd();
  }

  private showSuccess(message: string): void {
    this.successMessage = message;
    clearTimeout(this.successTimer);
    this.successTimer = setTimeout(() => (this.successMessage = ''), 6000);
  }
}
