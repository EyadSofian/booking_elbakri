'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Loader2, Plus, X } from 'lucide-react';
import {
  ATTACHMENT_MAX_BYTES, ATTACHMENT_MIME_TYPES, type AttachmentItem, type AttachmentKind, type EntityType,
} from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from './feedback';

/** A file chosen on a form that is not saved yet; it is uploaded right after the save. */
export interface PendingFile {
  key: string;
  kind: AttachmentKind;
  file: File;
}

const ACCEPT = ATTACHMENT_MIME_TYPES.join(',');
const listKey = (entityType: EntityType, entityId: string) => ['/attachments', entityType, entityId] as const;

/** Uploads the files chosen before the booking existed. Returns how many failed. */
export async function uploadPending(entityType: EntityType, entityId: string, files: PendingFile[]): Promise<number> {
  let failed = 0;
  for (const f of files) {
    try {
      await api.upload('/attachments', f.file, 'file', { entityType, entityId, kind: f.kind });
    } catch {
      failed += 1;
    }
  }
  return failed;
}

/** An object URL for a blob or file, released when it is no longer shown. */
function useObjectUrl(source: Blob | undefined): string | null {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!source) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(source);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [source]);
  return url;
}

function Tile({
  name,
  mimeType,
  source,
  loading,
  note,
  onRemove,
  removeLabel,
}: {
  name: string;
  mimeType: string;
  source: Blob | undefined;
  loading?: boolean;
  note?: string;
  onRemove?: () => void;
  removeLabel: string;
}) {
  const { t } = useI18n();
  const url = useObjectUrl(source);
  const image = mimeType.startsWith('image/');
  return (
    <li className="group relative w-28">
      <button
        type="button"
        disabled={!url}
        onClick={() => url && window.open(url, '_blank', 'noopener')}
        title={`${t.files.open} · ${name}`}
        className="grid h-28 w-28 place-items-center overflow-hidden rounded-lg border bg-surface-sunken outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
      >
        {loading || !url ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : image ? (
          // A protected file fetched with the session and shown from memory.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name} className="h-full w-full object-cover" />
        ) : (
          <FileText className="size-8 text-muted-foreground" />
        )}
      </button>
      <p className="mt-1 truncate text-[0.7rem] text-muted-foreground" dir="ltr" title={name}>
        {name}
      </p>
      {note ? <p className="truncate text-[0.65rem] text-sun-foreground dark:text-sun">{note}</p> : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${removeLabel} · ${name}`}
          className="absolute -end-1.5 -top-1.5 grid size-5 place-items-center rounded-full border bg-surface text-muted-foreground shadow-xs hover:bg-danger-subtle hover:text-danger"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </li>
  );
}

function SavedTile({ item, onRemove }: { item: AttachmentItem; onRemove?: () => void }) {
  const { t } = useI18n();
  const file = useQuery({
    queryKey: ['/attachments', 'file', item.id],
    queryFn: () => api.blob(`/attachments/${item.id}/file`),
    staleTime: Infinity,
  });
  return (
    <Tile name={item.fileName} mimeType={item.mimeType} source={file.data} loading={file.isLoading} onRemove={onRemove} removeLabel={t.files.remove} />
  );
}

/**
 * Passport copies and tickets kept with a booking.
 *
 * With an `entityId` the files are read from the server and a chosen file is
 * uploaded straight away. Without one (a new booking that is not saved yet) the
 * chosen files wait in `pending` and are uploaded by the form after the save.
 */
export function Attachments({
  entityType,
  entityId,
  kinds,
  canEdit = true,
  pending = [],
  onPending,
  onChanged,
}: {
  entityType: EntityType;
  entityId?: string;
  kinds: readonly AttachmentKind[];
  canEdit?: boolean;
  pending?: PendingFile[];
  onPending?: (files: PendingFile[]) => void;
  onChanged?: () => void;
}) {
  const { t, errorMessage } = useI18n();
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState<AttachmentKind | null>(null);
  const [removing, setRemoving] = React.useState<AttachmentItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const inputs = React.useRef<Partial<Record<AttachmentKind, HTMLInputElement | null>>>({});

  const saved = useQuery({
    queryKey: entityId ? listKey(entityType, entityId) : ['/attachments', 'none'],
    queryFn: () => api.get<AttachmentItem[]>('/attachments', { entityType, entityId }),
    enabled: Boolean(entityId),
  });

  const refresh = () => {
    if (entityId) void qc.invalidateQueries({ queryKey: listKey(entityType, entityId) });
    onChanged?.();
  };

  const choose = async (kind: AttachmentKind, list: FileList | null) => {
    const chosen = Array.from(list ?? []);
    const good: File[] = [];
    for (const file of chosen) {
      if (!(ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) toast.error(`${file.name}: ${t.files.wrongType}`);
      else if (file.size > ATTACHMENT_MAX_BYTES) toast.error(`${file.name}: ${t.files.tooLarge}`);
      else good.push(file);
    }
    if (!good.length) return;

    if (!entityId) {
      onPending?.([...pending, ...good.map((file) => ({ key: `${kind}-${file.name}-${file.size}-${Math.random()}`, kind, file }))]);
      return;
    }
    setBusy(kind);
    try {
      for (const file of good) {
        await api.upload('/attachments', file, 'file', { entityType, entityId, kind });
      }
      toast.success(t.files.uploaded);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const remove = async () => {
    if (!removing) return;
    setDeleting(true);
    try {
      await api.delete(`/attachments/${removing.id}`);
      toast.success(t.common.deleted);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-4">
      {kinds.map((kind) => {
        const savedOfKind = (saved.data ?? []).filter((a) => a.kind === kind);
        const pendingOfKind = pending.filter((p) => p.kind === kind);
        const empty = !savedOfKind.length && !pendingOfKind.length;
        return (
          <div key={kind}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[0.8rem] font-medium text-foreground/85">{t.files[kind]}</span>
              {canEdit ? (
                <>
                  <input
                    ref={(el) => {
                      inputs.current[kind] = el;
                    }}
                    type="file"
                    accept={ACCEPT}
                    multiple
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                      void choose(kind, e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <Button variant="outline" size="sm" loading={busy === kind} onClick={() => inputs.current[kind]?.click()}>
                    <Plus />
                    {t.files.add} {t.files[kind]}
                  </Button>
                </>
              ) : null}
            </div>
            {entityId && saved.isLoading ? (
              <div className="h-28 w-28 animate-pulse rounded-lg bg-surface-sunken" />
            ) : empty ? (
              <p className={cn('rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground')}>
                {t.files.empty} {canEdit ? t.files.hint : ''}
              </p>
            ) : (
              <ul className="flex flex-wrap gap-3">
                {savedOfKind.map((a) => (
                  <SavedTile key={a.id} item={a} onRemove={canEdit ? () => setRemoving(a) : undefined} />
                ))}
                {pendingOfKind.map((p) => (
                  <Tile
                    key={p.key}
                    name={p.file.name}
                    mimeType={p.file.type}
                    source={p.file}
                    note={t.files.pendingHint}
                    removeLabel={t.files.remove}
                    onRemove={() => onPending?.(pending.filter((x) => x.key !== p.key))}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t.files.removeTitle}
        body={removing?.fileName}
        confirmLabel={t.files.remove}
        busy={deleting}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
