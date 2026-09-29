export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** The team works in Arabic; English is one click away in the top bar. */
export const DEFAULT_LOCALE: Locale = 'ar';

export const LOCALE_META: Record<Locale, { label: string; nativeLabel: string; dir: 'ltr' | 'rtl' }> = {
  ar: { label: 'Arabic', nativeLabel: 'العربية', dir: 'rtl' },
  en: { label: 'English', nativeLabel: 'English', dir: 'ltr' },
};

export function isLocale(value: string | null | undefined): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? '');
}

export function dirFor(locale: Locale): 'ltr' | 'rtl' {
  return LOCALE_META[locale].dir;
}
