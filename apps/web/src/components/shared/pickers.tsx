'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { CURRENCIES, type CurrencyCode } from '@elbakri/shared';
import { useI18n } from '@/lib/providers';
import { useAgencies, useCreateAgency, useCreateHotel, useHotels, useSuggestions, useTeam, type SuggestionField } from '@/lib/queries';
import { Combobox } from '@/components/ui/combobox';
import { Input, NativeSelect } from '@/components/ui/input';

export function AgencyPicker({
  id,
  value,
  valueLabel,
  onChange,
  invalid,
}: {
  id?: string;
  value: string | null;
  valueLabel?: string | null;
  onChange: (id: string | null) => void;
  invalid?: boolean;
}) {
  const { t, errorMessage } = useI18n();
  const agencies = useAgencies();
  const create = useCreateAgency();
  const options = React.useMemo(
    () => (agencies.data ?? []).map((a) => ({ id: a.id, label: a.name, sub: a.isDirect ? t.common.directCustomer : null })),
    [agencies.data, t],
  );
  return (
    <Combobox
      id={id}
      value={value}
      valueLabel={valueLabel}
      options={options}
      loading={agencies.isLoading}
      onChange={(v) => onChange(v)}
      onCreate={async (name) => {
        try {
          const a = await create.mutateAsync(name);
          return { id: a.id, label: a.name };
        } catch (e) {
          toast.error(errorMessage(e));
          throw e;
        }
      }}
      placeholder={t.common.selectOrType}
      emptyText={t.common.noOptions}
      createLabel={t.common.createNamed}
      clearLabel={t.common.clear}
      invalid={invalid}
    />
  );
}

export function HotelPicker({
  id,
  value,
  valueLabel,
  onChange,
  invalid,
}: {
  id?: string;
  value: string | null;
  valueLabel?: string | null;
  onChange: (id: string | null, name: string | null) => void;
  invalid?: boolean;
}) {
  const { t, errorMessage } = useI18n();
  const hotels = useHotels();
  const create = useCreateHotel();
  const options = React.useMemo(
    () => (hotels.data ?? []).map((h) => ({ id: h.id, label: h.name, sub: h.city })),
    [hotels.data],
  );
  return (
    <Combobox
      id={id}
      value={value}
      valueLabel={valueLabel}
      options={options}
      loading={hotels.isLoading}
      onChange={(v, o) => onChange(v, o?.label ?? null)}
      onCreate={async (name) => {
        try {
          const h = await create.mutateAsync(name);
          return { id: h.id, label: h.name };
        } catch (e) {
          toast.error(errorMessage(e));
          throw e;
        }
      }}
      placeholder={t.common.selectOrType}
      emptyText={t.common.noOptions}
      createLabel={t.common.createNamed}
      clearLabel={t.common.clear}
      invalid={invalid}
    />
  );
}

const DEFAULTS: Partial<Record<SuggestionField, string[]>> = {
  mealPlan: ['Room Only', 'Bed & Breakfast', 'Half Board', 'Full Board', 'All Inclusive', 'Soft All Inclusive', 'Ultra All Inclusive'],
  nationality: ['Egyptian', 'Lebanese', 'Algerian', 'Saudi', 'Iraqi', 'Jordanian'],
  place: ['Cairo Airport', 'SSH Airport', 'Hurghada Airport', 'Marsa Alam Airport', 'Luxor Airport', 'Aswan Airport'],
};

/**
 * A free-text field that suggests what the team typed before (native
 * datalist), so the same meal plan or airport is written the same way.
 */
export const SuggestInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
    field: SuggestionField;
    value: string;
    onChange: (value: string) => void;
    invalid?: boolean;
  }
>(({ field, value, onChange, invalid, id, ...props }, ref) => {
  const suggestions = useSuggestions(field);
  const listId = `${id ?? field}-suggestions`;
  const options = React.useMemo(() => {
    const seen = new Set<string>();
    return [...(suggestions.data ?? []), ...(DEFAULTS[field] ?? [])].filter((v) => {
      const k = v.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [suggestions.data, field]);
  return (
    <>
      <Input
        ref={ref}
        id={id}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        invalid={invalid}
        autoComplete="off"
        {...props}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
});
SuggestInput.displayName = 'SuggestInput';

export function CurrencySelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: CurrencyCode;
  onChange: (v: CurrencyCode) => void;
}) {
  const { t } = useI18n();
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value as CurrencyCode)}>
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {t.currencies[c]} ({c})
        </option>
      ))}
    </NativeSelect>
  );
}

export function SellerSelect({
  id,
  value,
  onChange,
  includeAll,
  allLabel,
}: {
  id?: string;
  value: string | null;
  onChange: (v: string | null) => void;
  includeAll?: boolean;
  allLabel?: string;
}) {
  const { t } = useI18n();
  const team = useTeam();
  return (
    <NativeSelect id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {includeAll ? <option value="">{allLabel ?? t.common.all}</option> : <option value="">{t.common.none}</option>}
      {(team.data ?? []).map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </NativeSelect>
  );
}

export function AgencyFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const agencies = useAgencies();
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} className="w-auto min-w-[9rem]" aria-label={t.common.agency}>
      <option value="">{t.ops.agencyAll}</option>
      {(agencies.data ?? []).map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </NativeSelect>
  );
}
