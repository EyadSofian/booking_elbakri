'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Toaster } from 'sonner';
import type { EntityType, Role, Status } from '@elbakri/shared';
import { ApiError, api, tokenStore } from './api-client';
import { DEFAULT_LOCALE, dirFor, isLocale, type Locale } from '@/i18n/config';
import { en, type Dictionary } from '@/i18n/dictionaries/en';
import { ar } from '@/i18n/dictionaries/ar';

const DICTIONARIES: Record<Locale, Dictionary> = { en, ar };

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

interface I18nValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: Dictionary;
  /** A status as the person reads it — visas word their statuses differently. */
  statusLabel: (status: Status, type?: EntityType) => string;
  errorMessage: (error: unknown) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside AppProviders');
  return ctx;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface SessionValue {
  user: SessionUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Whether the signed-in person's role is one of these (admins always are).
   * This only shapes what the screen offers; the API checks every request.
   */
  is: (...roles: Role[]) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside AppProviders');
  return ctx;
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

type Theme = 'light' | 'dark';
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside AppProviders');
  return ctx;
}

// ---------------------------------------------------------------------------

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 20_000,
        refetchOnWindowFocus: true,
        retry: (count, error) => {
          if (error instanceof ApiError && [400, 401, 403, 404, 409].includes(error.status)) return false;
          return count < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage can be unavailable; the choice then lasts for this page only */
  }
}

export function AppProviders({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [queryClient] = useState(makeQueryClient);
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [theme, setTheme] = useState<Theme>('light');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const dir = dirFor(locale);

  // Restore this device's choices (the inline script in <head> already
  // applied them to the document before first paint).
  useEffect(() => {
    const savedLocale = readStored('elbakri.locale');
    if (isLocale(savedLocale)) setLocaleState(savedLocale);
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  useEffect(() => {
    if (!tokenStore.access && !tokenStore.refresh) {
      setLoading(false);
      return;
    }
    api
      .get<SessionUser>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ accessToken: string; refreshToken: string; user: SessionUser }>('/auth/login', {
      email,
      password,
    });
    tokenStore.set(result.accessToken, result.refreshToken);
    setUser(result.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Signing out locally must work even when the server call fails.
    }
    tokenStore.clear();
    setUser(null);
    queryClient.clear();
    router.replace('/login');
  }, [queryClient, router]);

  const is = useCallback((...roles: Role[]) => Boolean(user && (user.role === 'ADMIN' || roles.includes(user.role))), [user]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStored('elbakri.locale', next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      writeStored('elbakri.theme', next);
      return next;
    });
  }, []);

  const i18n = useMemo<I18nValue>(() => {
    const t = DICTIONARIES[locale];
    return {
      locale,
      dir,
      t,
      statusLabel: (status, type) => (type === 'VISA' ? t.visaStatus[status] : t.status[status]) ?? status,
      errorMessage: (error) => {
        if (error instanceof ApiError) return t.errors[error.code] ?? error.message ?? t.errors.INTERNAL_ERROR;
        return t.errors.INTERNAL_ERROR;
      },
      setLocale,
    };
  }, [locale, dir, setLocale]);

  const session = useMemo<SessionValue>(() => ({ user, loading, signIn, signOut, is }), [user, loading, signIn, signOut, is]);
  const themeValue = useMemo(() => ({ theme, toggle: toggleTheme }), [theme, toggleTheme]);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nContext.Provider value={i18n}>
        <ThemeContext.Provider value={themeValue}>
          <SessionContext.Provider value={session}>
            {children}
            <Toaster
              position={dir === 'rtl' ? 'bottom-left' : 'bottom-right'}
              dir={dir}
              theme={theme}
              closeButton
              richColors
              toastOptions={{ className: 'font-sans' }}
            />
          </SessionContext.Provider>
        </ThemeContext.Provider>
      </I18nContext.Provider>
    </QueryClientProvider>
  );
}
