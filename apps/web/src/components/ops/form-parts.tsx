'use client';

import type { EntityType } from '@elbakri/shared';
import { useI18n } from '@/lib/providers';
import { Input, Textarea } from '@/components/ui/input';
import { Field, FormSection } from '@/components/shared/field';
import { StatusPicker } from '@/components/shared/status';
import { AgencyPicker, CurrencySelect, SuggestInput } from '@/components/shared/pickers';
import { asCurrency, asStatus, type Draft } from './draft';

interface PartProps {
  draft: Draft;
  set: (key: string, value: string) => void;
  errors: Record<string, string>;
}

/** Name, phone, nationality, agency — the same four facts on every booking. */
export function GuestFields({ draft, set, errors, withPax }: PartProps & { withPax?: boolean }) {
  const { t } = useI18n();
  return (
    <FormSection title={t.ops.guestSection}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.ops.guestName} htmlFor="f-guestName" required error={errors.guestName} className="sm:col-span-2">
          <Input id="f-guestName" value={draft.guestName} onChange={(e) => set('guestName', e.target.value)} invalid={Boolean(errors.guestName)} autoComplete="off" />
        </Field>
        <Field label={t.common.phone} htmlFor="f-phone">
          <Input id="f-phone" type="tel" inputMode="tel" dir="ltr" value={draft.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="off" />
        </Field>
        <Field label={t.common.nationality} htmlFor="f-nationality">
          <SuggestInput id="f-nationality" field="nationality" value={draft.nationality} onChange={(v) => set('nationality', v)} />
        </Field>
        <Field label={t.common.agency} htmlFor="f-agencyId" className="sm:col-span-2">
          <AgencyPicker id="f-agencyId" value={draft.agencyId || null} valueLabel={draft.agencyName || null} onChange={(v) => set('agencyId', v ?? '')} />
        </Field>
        {withPax ? (
          <>
            <Field label={t.common.adults} htmlFor="f-adults">
              <Input id="f-adults" inputMode="numeric" value={draft.adults} onChange={(e) => set('adults', e.target.value.replace(/[^\d]/g, ''))} />
            </Field>
            <Field label={t.common.children} htmlFor="f-children">
              <Input id="f-children" inputMode="numeric" value={draft.children} onChange={(e) => set('children', e.target.value.replace(/[^\d]/g, ''))} />
            </Field>
          </>
        ) : null}
      </div>
    </FormSection>
  );
}

export function MoneyInput({ id, value, onChange, invalid }: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <Input
      id={id}
      inputMode="decimal"
      dir="ltr"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
      invalid={invalid}
      className="tabular text-end"
      placeholder="0"
    />
  );
}

/** Currency, cost and sell — optional on operations bookings. */
export function PriceFields({ draft, set, costLabel, sellLabel }: PartProps & { costLabel?: string; sellLabel?: string }) {
  const { t } = useI18n();
  return (
    <FormSection title={t.ops.moneySection} hint={t.ops.moneyHint}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t.common.currency} htmlFor="f-currency">
          <CurrencySelect id="f-currency" value={asCurrency(draft.currency)} onChange={(v) => set('currency', v)} />
        </Field>
        <Field label={costLabel ?? t.common.cost} htmlFor="f-cost">
          <MoneyInput id="f-cost" value={draft.cost} onChange={(v) => set('cost', v)} />
        </Field>
        <Field label={sellLabel ?? t.common.sell} htmlFor="f-sell">
          <MoneyInput id="f-sell" value={draft.sell} onChange={(v) => set('sell', v)} />
        </Field>
      </div>
    </FormSection>
  );
}

export function StatusAndNotes({ draft, set, type }: PartProps & { type: EntityType }) {
  const { t } = useI18n();
  return (
    <FormSection title={t.ops.otherSection}>
      <Field label={t.common.status}>
        <StatusPicker value={asStatus(draft.status)} onChange={(s) => set('status', s)} type={type} />
      </Field>
      <Field label={t.common.notes} htmlFor="f-notes">
        <Textarea id="f-notes" value={draft.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
      </Field>
    </FormSection>
  );
}
