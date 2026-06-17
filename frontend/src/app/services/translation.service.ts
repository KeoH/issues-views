import { Injectable, signal, inject, effect } from '@angular/core';
import { AuthService } from './auth.service';
import { TimelineService } from './timeline.service';
import { TRANSLATIONS } from '../utils/translations';

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private readonly authService = inject(AuthService);
  private readonly timelineService = inject(TimelineService);

  readonly currentLang = signal<'en' | 'es'>('en');

  constructor() {
    // Sync language with active user preference
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        const lang = user.preferredLanguage || 'en';
        if (lang === 'en' || lang === 'es') {
          this.currentLang.set(lang);
        }
      }
    });
  }

  setLanguage(lang: 'en' | 'es') {
    this.currentLang.set(lang);
    const user = this.authService.currentUser();
    if (user && user.preferredLanguage !== lang) {
      this.timelineService.updateUser({
        ...user,
        preferredLanguage: lang
      });
    }
  }

  translate(key: string): string {
    if (!key) return '';
    const lang = this.currentLang();
    const translations = TRANSLATIONS[lang] || TRANSLATIONS['en'];
    return translations[key] !== undefined ? translations[key] : key;
  }
}
