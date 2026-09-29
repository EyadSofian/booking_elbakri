'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityItem, AgencyItem, HotelItem, ListResponse, Role } from '@elbakri/shared';
import { api } from './api-client';
import { compact } from './utils';

/**
 * Everything the screens read goes through these hooks, keyed so that saving a
 * booking refreshes the lists, the dashboard and the search that show it.
 */

export type ListParams = Record<string, string | number | undefined | null>;

export function useList<T>(endpoint: string, params: ListParams) {
  return useQuery({
    queryKey: [endpoint, 'list', compact(params)],
    queryFn: () => api.get<ListResponse<T>>(endpoint, compact(params)),
    placeholderData: keepPreviousData,
  });
}

export function useRecord<T>(endpoint: string, id: string | null | undefined) {
  return useQuery({
    queryKey: [endpoint, 'one', id],
    queryFn: () => api.get<T>(`${endpoint}/${id}`),
    enabled: Boolean(id),
  });
}

export function useActivity(endpoint: string, id: string | null | undefined) {
  return useQuery({
    queryKey: [endpoint, 'activity', id],
    queryFn: () => api.get<ActivityItem[]>(`${endpoint}/${id}/activity`),
    enabled: Boolean(id),
  });
}

/** After any change: refresh that module, the dashboard, search and linked sales. */
export function useInvalidate() {
  const qc = useQueryClient();
  return (endpoint: string) => {
    void qc.invalidateQueries({ queryKey: [endpoint] });
    void qc.invalidateQueries({ queryKey: ['/dashboard'] });
    void qc.invalidateQueries({ queryKey: ['/search'] });
    if (endpoint !== '/sales') void qc.invalidateQueries({ queryKey: ['/sales'] });
  };
}

export function useAgencies(includeHidden = false) {
  return useQuery({
    queryKey: ['/lookups/agencies', includeHidden],
    queryFn: () => api.get<AgencyItem[]>('/lookups/agencies', includeHidden ? { all: 1 } : undefined),
    staleTime: 60_000,
  });
}

export function useHotels(includeHidden = false) {
  return useQuery({
    queryKey: ['/lookups/hotels', includeHidden],
    queryFn: () => api.get<HotelItem[]>('/lookups/hotels', includeHidden ? { all: 1 } : undefined),
    staleTime: 60_000,
  });
}

export function useTeam() {
  return useQuery({
    queryKey: ['/users/team'],
    queryFn: () => api.get<Array<{ id: string; name: string; role: Role }>>('/users/team'),
    staleTime: 5 * 60_000,
  });
}

export type SuggestionField =
  | 'nationality' | 'mealPlan' | 'rooms' | 'activity' | 'place' | 'destination' | 'serviceType' | 'city' | 'vehicle';

export function useSuggestions(field: SuggestionField) {
  return useQuery({
    queryKey: ['/lookups/suggestions', field],
    queryFn: () => api.get<string[]>('/lookups/suggestions', { field }),
    staleTime: 5 * 60_000,
  });
}

export function useCreateAgency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<AgencyItem>('/lookups/agencies', { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/lookups/agencies'] }),
  });
}

export function useCreateHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<HotelItem>('/lookups/hotels', { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/lookups/hotels'] }),
  });
}
