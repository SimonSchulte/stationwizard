import { Injectable, signal, computed } from '@angular/core';

export type AppMode = 'standalone' | 'connected-to-efs-api';

const STORAGE_KEY = 'pep_efs_api_key';

@Injectable({ providedIn: 'root' })
export class AppModeService {
  private readonly _apiKey = signal<string | null>(localStorage.getItem(STORAGE_KEY));

  readonly apiKey = this._apiKey.asReadonly();
  readonly mode = computed<AppMode>(() => (this._apiKey() ? 'connected-to-efs-api' : 'standalone'));

  setApiKey(key: string | null): void {
    const trimmed = key?.trim() || null;
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    this._apiKey.set(trimmed);
  }
}
