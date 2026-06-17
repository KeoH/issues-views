import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { TranslationService } from '../../services/translation.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="login-wrapper">
      <div class="background-decorations">
        <div class="blob blob-purple"></div>
        <div class="blob blob-indigo"></div>
      </div>

      <!-- Language Selector -->
      <div class="lang-selector">
        <button type="button" class="btn-lang" [class.active]="translationService.currentLang() === 'en'" (click)="translationService.setLanguage('en')">EN</button>
        <button type="button" class="btn-lang" [class.active]="translationService.currentLang() === 'es'" (click)="translationService.setLanguage('es')">ES</button>
      </div>

      <div class="login-card">
        <div class="login-header">
          <div class="logo-placeholder">⏰</div>
          <h2>Timeline Scheduler</h2>
          <p>{{ 'Inicia sesión para gestionar tareas y proyectos' | translate:translationService.currentLang() }}</p>
        </div>

        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()">
          @if (errorMessage()) {
            <div class="error-banner">
              <span>⚠️</span>
              <p>{{ errorMessage() }}</p>
            </div>
          }

          <div class="form-group">
            <label for="email">{{ 'Correo Electrónico' | translate:translationService.currentLang() }}</label>
            <div class="input-container">
              <span class="icon">✉️</span>
              <input
                id="email"
                type="email"
                formControlName="email"
                placeholder="ejemplo@empresa.com"
                [class.has-error]="isFieldInvalid('email')"
              />
            </div>
          </div>

          <div class="form-group">
            <label for="password">{{ 'Contraseña' | translate:translationService.currentLang() }}</label>
            <div class="input-container">
              <span class="icon">🔒</span>
              <input
                id="password"
                type="password"
                formControlName="password"
                placeholder="••••••••"
                [class.has-error]="isFieldInvalid('password')"
              />
            </div>
          </div>

          <button type="submit" class="btn-submit" [disabled]="isLoading()">
            @if (isLoading()) {
              <span class="spinner"></span> {{ 'Accediendo...' | translate:translationService.currentLang() }}
            } @else {
              {{ 'Iniciar Sesión' | translate:translationService.currentLang() }}
            }
          </button>
        </form>

        <div class="credentials-hint">
          <h3>{{ 'Credenciales de prueba:' | translate:translationService.currentLang() }}</h3>
          <p><strong>Admin:</strong> admin@empresa.com / admin123</p>
          <p><strong>Diseñadora:</strong> ana.gomez@empresa.com / ana123</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-wrapper {
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      width: 100vw;
      background-color: #0c0d12;
      overflow: hidden;
      font-family: 'Outfit', sans-serif;
    }

    .background-decorations {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1;
      overflow: hidden;
    }

    .blob {
      position: absolute;
      width: 400px;
      height: 400px;
      border-radius: 50%;
      filter: blur(100px);
      opacity: 0.15;
      animation: float 12s infinite alternate;
    }

    .blob-purple {
      background: #8b5cf6;
      top: -100px;
      right: -100px;
    }

    .blob-indigo {
      background: #4f46e5;
      bottom: -150px;
      left: -150px;
      animation-delay: 2s;
    }

    @keyframes float {
      0% { transform: translate(0, 0) scale(1); }
      100% { transform: translate(30px, 30px) scale(1.1); }
    }

    .login-card {
      position: relative;
      z-index: 2;
      width: 100%;
      max-width: 450px;
      padding: 3rem 2.5rem;
      border-radius: 20px;
      background: rgba(30, 32, 50, 0.45);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }

    .login-header {
      text-align: center;
      margin-bottom: 2.5rem;
    }

    .logo-placeholder {
      font-size: 3rem;
      margin-bottom: 1rem;
      display: inline-block;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    .login-header h2 {
      font-size: 2rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 0.5rem;
      letter-spacing: -0.5px;
    }

    .login-header p {
      font-size: 0.95rem;
      color: #94a3b8;
    }

    .error-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 0.85rem 1rem;
      border-radius: 10px;
      margin-bottom: 1.5rem;
    }

    .error-banner p {
      color: #fca5a5;
      font-size: 0.9rem;
      margin: 0;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-group label {
      display: block;
      font-size: 0.85rem;
      font-weight: 500;
      color: #cbd5e1;
      margin-bottom: 0.5rem;
      letter-spacing: 0.5px;
    }

    .input-container {
      position: relative;
    }

    .input-container .icon {
      position: absolute;
      left: 1rem;
      top: 50%;
      transform: translateY(-50%);
      font-size: 1.1rem;
      opacity: 0.7;
    }

    .input-container input {
      width: 100%;
      padding: 0.85rem 1rem 0.85rem 2.8rem;
      border-radius: 12px;
      background: rgba(15, 17, 26, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #ffffff;
      font-size: 0.95rem;
      font-family: inherit;
      transition: all 0.3s ease;
    }

    .input-container input:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
      background: rgba(15, 17, 26, 0.8);
    }

    .input-container input.has-error {
      border-color: rgba(239, 68, 68, 0.5);
    }

    .btn-submit {
      width: 100%;
      padding: 0.95rem;
      border: none;
      border-radius: 12px;
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: #ffffff;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
    }

    .btn-submit:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
    }

    .btn-submit:active:not(:disabled) {
      transform: translateY(0);
    }

    .btn-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: #ffffff;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .credentials-hint {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 0.85rem;
      color: #64748b;
    }

    .credentials-hint h3 {
      font-size: 0.9rem;
      font-weight: 600;
      color: #94a3b8;
      margin-bottom: 0.5rem;
    }

    .credentials-hint p {
      margin-bottom: 0.25rem;
    }

    .lang-selector {
      position: absolute;
      top: 1.5rem;
      right: 1.5rem;
      display: flex;
      gap: 0.5rem;
      z-index: 10;
    }

    .btn-lang {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #94a3b8;
      padding: 0.4rem 0.8rem;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-lang:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }

    .btn-lang.active {
      background: #6366f1;
      border-color: #6366f1;
      color: #ffffff;
      box-shadow: 0 0 10px rgba(99, 102, 241, 0.3);
    }
  `]
})
export class LoginComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  readonly translationService = inject(TranslationService);
  private readonly router = inject(Router);

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  isFieldInvalid(fieldName: 'email' | 'password'): boolean {
    const field = this.loginForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  onSubmit() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.loginForm.getRawValue();

    this.authService.login(email, password).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.isLoading.set(false);
        const errKey = err.status === 401 ? 'Credenciales incorrectas' : 'Error al conectar con el servidor';
        this.errorMessage.set(this.translationService.translate(errKey));
      }
    });
  }
}
