'use client';

import * as React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronsUpDown, Loader2, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboOption {
  id: string;
  label: string;
  sub?: string | null;
}

interface ComboboxProps {
  id?: string;
  value: string | null;
  /** Shown while the options load, so an existing choice never looks empty. */
  valueLabel?: string | null;
  options: ComboOption[];
  onChange: (value: string | null, option: ComboOption | null) => void;
  /** When given, typing a new name offers to add it on the spot. */
  onCreate?: (name: string) => Promise<ComboOption>;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText: string;
  createLabel?: (name: string) => string;
  clearLabel?: string;
  invalid?: boolean;
  loading?: boolean;
  className?: string;
}

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Pick one item from a list you can search, or add a new one by typing it —
 * used for agencies and hotels so a name is chosen instead of retyped.
 */
export function Combobox({
  id, value, valueLabel, options, onChange, onCreate, placeholder, searchPlaceholder, emptyText,
  createLabel = (n) => `+ ${n}`, clearLabel = 'Clear', invalid, loading, className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const [creating, setCreating] = React.useState(false);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = React.useId();

  const selected = options.find((o) => o.id === value) ?? null;
  const filtered = React.useMemo(() => {
    const q = normalise(query);
    if (!q) return options.slice(0, 200);
    return options.filter((o) => normalise(`${o.label} ${o.sub ?? ''}`).includes(q)).slice(0, 200);
  }, [options, query]);
  const exact = options.some((o) => normalise(o.label) === normalise(query));
  const canCreate = Boolean(onCreate && query.trim() && !exact);
  const rows = filtered.length + (canCreate ? 1 : 0);

  React.useEffect(() => setActive(0), [query, open]);
  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (option: ComboOption | null) => {
    onChange(option?.id ?? null, option);
    setOpen(false);
    setQuery('');
  };

  const create = async () => {
    if (!onCreate || !query.trim()) return;
    setCreating(true);
    try {
      choose(await onCreate(query.trim()));
    } finally {
      setCreating(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active < filtered.length) choose(filtered[active]);
      else if (canCreate) void create();
    }
  };

  const shown = selected?.label ?? valueLabel ?? null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={cn('relative', className)}>
        <Popover.Trigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-invalid={invalid || undefined}
            className={cn(
              'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-surface px-3 text-start text-sm shadow-xs',
              'transition-colors hover:border-foreground/25 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25',
              'aria-[invalid=true]:border-destructive',
              shown && value ? 'pe-14' : 'pe-8',
            )}
          >
            <span className={cn('truncate', !shown && 'text-muted-foreground/70')}>{shown ?? placeholder}</span>
          </button>
        </Popover.Trigger>
        <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          <ChevronsUpDown className="size-3.5" />
        </span>
        {value ? (
          <button
            type="button"
            onClick={() => choose(null)}
            className="absolute end-7 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={clearLabel}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-[60] w-[var(--radix-popover-trigger-width)] min-w-[16rem] overflow-hidden rounded-lg border bg-popover shadow-md data-[state=open]:animate-pop"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector('input')?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder ?? placeholder}
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
              aria-controls={listId}
              aria-activedescendant={rows ? `${listId}-${active}` : undefined}
              autoComplete="off"
            />
            {loading ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="scroll-thin max-h-64 overflow-y-auto p-1">
            {filtered.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.id === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm',
                  i === active && 'bg-accent',
                )}
              >
                <Check className={cn('size-3.5 shrink-0 text-primary', o.id !== value && 'invisible')} />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.sub ? <span className="shrink-0 text-xs text-muted-foreground">{o.sub}</span> : null}
              </li>
            ))}
            {canCreate ? (
              <li
                id={`${listId}-${filtered.length}`}
                data-index={filtered.length}
                role="option"
                aria-selected={false}
                onMouseEnter={() => setActive(filtered.length)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void create()}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-primary',
                  active === filtered.length && 'bg-accent',
                )}
              >
                {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                {createLabel(query.trim())}
              </li>
            ) : null}
            {!rows ? <li className="px-2.5 py-6 text-center text-sm text-muted-foreground">{emptyText}</li> : null}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
