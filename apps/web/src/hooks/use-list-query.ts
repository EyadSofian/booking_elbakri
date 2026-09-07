'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

export interface ListState {
  page: number;
  pageSize: number;
  q: string;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
  /** Every other filter, as read from the query string. */
  filters: Record<string, string>;
}

/**
 * Keeps list state in the URL.
 *
 * Putting page, search, sort and filters in the query string means a
 * coordinator can bookmark "unassigned transfers this week", share it with a
 * colleague, and land on the same view after a refresh — which a component
 * holding this in local state cannot do.
 */
export function useListQuery(defaults: Partial<ListState> = {}) {
  const router = useRouter();
  const params = useSearchParams();

  const state = useMemo<ListState>(() => {
    const filters: Record<string, string> = {};
    params.forEach((value, key) => {
      if (!['page', 'pageSize', 'q', 'sortBy', 'sortDir'].includes(key)) {
        filters[key] = value;
      }
    });
    return {
      page: Number(params.get('page') ?? defaults.page ?? 1),
      pageSize: Number(params.get('pageSize') ?? defaults.pageSize ?? 25),
      q: params.get('q') ?? defaults.q ?? '',
      sortBy: params.get('sortBy') ?? defaults.sortBy,
      sortDir: (params.get('sortDir') as 'asc' | 'desc') ?? defaults.sortDir ?? 'desc',
      filters,
    };
    // `defaults` is a literal at every call site; re-reading it per render is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const update = useCallback(
    (patch: Record<string, string | number | undefined | null>, opts: { resetPage?: boolean } = {}) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      // Any change to a filter or the search term starts again from page one,
      // otherwise a narrowed result set can land the user on an empty page.
      if (opts.resetPage !== false && !('page' in patch)) next.delete('page');
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams();
    if (state.pageSize !== 25) next.set('pageSize', String(state.pageSize));
    router.replace(`?${next.toString()}`, { scroll: false });
  }, [router, state.pageSize]);

  const activeFilterCount = Object.keys(state.filters).length + (state.q ? 1 : 0);

  return { state, update, clearFilters, activeFilterCount };
}
