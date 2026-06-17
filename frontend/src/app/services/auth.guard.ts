import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) {
    // Si la ruta requiere admin y no lo es, denegar
    if (route.data && route.data['role'] === 'admin' && !authService.isAdmin()) {
      router.navigate(['/']);
      return false;
    }
    return true;
  }

  // Redirigir al login
  router.navigate(['/login']);
  return false;
};
