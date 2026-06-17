import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.accessToken();

  let authReq = req;
  // Añadir cabecera Authorization si tenemos token y no es login/refresh
  if (token && !req.url.includes('/api/auth/login') && !req.url.includes('/api/auth/refresh')) {
    authReq = authService.injectToken(req, token);
  }

  return next(authReq).pipe(
    catchError((error) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !req.url.includes('/api/auth/login') &&
        !req.url.includes('/api/auth/refresh')
      ) {
        // Manejar expiración de token de forma asíncrona
        return authService.handle401Error(req, next);
      }
      return throwError(() => error);
    })
  );
};
