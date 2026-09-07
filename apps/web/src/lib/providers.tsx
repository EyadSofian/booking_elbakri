'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Toaster } from 'sonner';
import { ApiError, api, tokenStore } from './api-client';
import { DEFAULT_LOCALE, dirFor, isLocale, type Locale } from '@/i18n/config';
import { en } from '@/i18n/dictionaries/en';
import { ar } from '@/i18n/dictionaries/ar';
import type { Dictionary } from '@/i18n/dictionaries/en';

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

const DICTIONARIES: Record<Locale, Dictionary> = { en, ar };

interface I18nValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: Dictionary;
  /** Localises a canonical status value such as `CONFIRMED`. */
  status: (value: string | null | undefined) => string;
  /** Localises a server error code into a message the user can act on. */
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
  email: string;
  fullName: string;
  locale: string;
  roles: string[];
  permissions: string[];
}

interface SessionValue {
  user: SessionUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /**
   * Whether the signed-in user holds a permission.
   *
   * This controls what the interface offers, not what the system allows — the
   * API enforces the same checks independently on every request.
   */
  can: (...permissions: string[]) => boolean;
  canAny: (...permissions: string[]) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside AppProviders');
  return ctx;
}

// ---------------------------------------------------------------------------

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Retrying an auth or permission failure only delays the real message.
          if (error instanceof ApiError && [400, 401, 403, 404, 409].includes(error.status)) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

export function AppProviders({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: string;
}) {
  const router = useRouter();
  const [queryClient] = useState(makeQueryClient);
  const [locale, setLocaleState] = useState<Locale>(
    initialLocale && isLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE,
  );
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const dir = dirFor(locale);

  /**
   * Whether the person picked a language on this device.
   *
   * An explicit choice outranks the account's stored preference: someone who
   * switches to Arabic on the sign-in screen should still be in Arabic after
   * signing in, not snapped back to whatever their profile happens to say.
   */
  const explicitLocale = useRef(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('elbakri.locale');
      if (saved && isLocale(saved)) {
        explicitLocale.current = true;
        setLocaleState(saved);
      }
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  // Keep the document in step with the active locale so CSS logical properties,
  // form controls and the scrollbar side all mirror correctly.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const loadSession = useCallback(async () => {
    if (!tokenStore.access) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<SessionUser>('/auth/me');
      setUser(me);
      if (!explicitLocale.current && isLocale(me.locale)) setLocaleState(me.locale);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await api.post<{
        accessToken: string;
        refreshToken: string;
        user: SessionUser;
      }>('/auth/login', { email, password });
      tokenStore.set(result.accessToken, result.refreshToken);
      setUser(result.user);
      if (!explicitLocale.current && isLocale(result.user.locale)) {
        setLocaleState(result.user.locale);
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // A failed logout call must still clear the local session.
    }
    tokenStore.clear();
    setUser(null);
    queryClient.clear();
    router.push('/login');
  }, [queryClient, router]);

  const can = useCallback(
    (...permissions: string[]) => {
      if (!user) return false;
      return permissions.every((p) => user.permissions.includes(p));
    },
    [user],
  );

  const canAny = useCallback(
    (...permissions: string[]) => {
      if (!user) return false;
      return permissions.some((p) => user.permissions.includes(p));
    },
    [user],
  );

  const setLocale = useCallback((next: Locale) => {
    explicitLocale.current = true;
    setLocaleState(next);
    try {
      window.localStorage.setItem('elbakri.locale', next);
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  const i18n = useMemo<I18nValue>(() => {
    const t = DICTIONARIES[locale];
    return {
      locale,
      dir,
      t,
      status: (value) => {
        if (!value) return t.common.notSet;
        return (t.status as Record<string, string>)[value] ?? value;
      },
      errorMessage: (error) => {
        if (error instanceof ApiError) {
          const localised = (t.errors as Record<string, string>)[error.code];
          return localised ?? error.message ?? t.errors.INTERNAL_ERROR;
        }
        if (error instanceof Error) return error.message;
        return t.errors.INTERNAL_ERROR;
      },
      setLocale,
    };
  }, [locale, dir, setLocale]);

  const session = useMemo<SessionValue>(
    () => ({ user, loading, signIn, signOut, refresh: loadSession, can, canAny }),
    [user, loading, signIn, signOut, loadSession, can, canAny],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <I18nContext.Provider value={i18n}>
        <SessionContext.Provider value={session}>
          {children}
          <Toaster
            position={dir === 'rtl' ? 'top-left' : 'top-right'}
            dir={dir}
            closeButton
            richColors
            toastOptions={{ className: 'font-sans text-sm' }}
          />
        </SessionContext.Provider>
      </I18nContext.Provider>
    </QueryClientProvider>
  );
}
