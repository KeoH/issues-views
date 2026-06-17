import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError, BehaviorSubject, of } from 'rxjs';
import { tap, catchError, switchMap, finalize } from 'rxjs/operators';
import { User } from '../models/types';

export interface LoginResponse {
  accessToken: string;
  user: User & { role: string };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly currentUser = signal<(User & { role: string }) | null>(null);
  readonly accessToken = signal<string | null>(null);
  readonly isLoggedIn = computed(() => this.currentUser() !== null);
  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');

  private isRefreshing = false;
  private refreshTokenSubject = new BehaviorSubject<string | null>(null);

  // Inicializar sesión al cargar la app
  initSession(): Observable<boolean> {
    return this.http.post<{ accessToken: string }>('/api/auth/refresh', {}).pipe(
      switchMap(res => {
        this.accessToken.set(res.accessToken);
        return this.http.get<User & { role: string }>('/api/auth/me').pipe(
          tap(user => {
            this.currentUser.set(user);
          }),
          switchMap(() => of(true)),
          catchError(() => {
            this.clearSession();
            return of(false);
          })
        );
      }),
      catchError(() => {
        this.clearSession();
        return of(false);
      })
    );
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', { email, password }).pipe(
      tap(res => {
        this.accessToken.set(res.accessToken);
        this.currentUser.set(res.user);
      })
    );
  }

  logout() {
    return this.http.post('/api/auth/logout', {}).pipe(
      finalize(() => {
        this.clearSession();
        this.router.navigate(['/login']);
      })
    ).subscribe();
  }

  clearSession() {
    this.accessToken.set(null);
    this.currentUser.set(null);
  }

  // Refrescar token automáticamente ante un error 401
  handle401Error(request: any, next: any): Observable<any> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      return this.http.post<{ accessToken: string }>('/api/auth/refresh', {}).pipe(
        switchMap((res) => {
          this.isRefreshing = false;
          this.accessToken.set(res.accessToken);
          this.refreshTokenSubject.next(res.accessToken);
          return next(this.injectToken(request, res.accessToken));
        }),
        catchError((err) => {
          this.isRefreshing = false;
          this.clearSession();
          this.router.navigate(['/login']);
          return throwError(() => err);
        })
      );
    } else {
      return this.refreshTokenSubject.pipe(
        switchMap((token) => {
          if (token) {
            return next(this.injectToken(request, token));
          }
          return throwError(() => new Error('Refreshing token failed'));
        })
      );
    }
  }

  injectToken(request: any, token: string) {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }
}
