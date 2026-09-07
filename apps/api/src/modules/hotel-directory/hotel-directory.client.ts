import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * One hotel as the Rate Hub directory exposes it.
 *
 * This is the whole contract. Pricing, rate counts and packages are absent by
 * design — the two products stay separate and the boundary is descriptive
 * metadata only.
 */
export interface DirectoryHotel {
  id: number;
  hotel_name: string;
  hotel_group_id: number | null;
  group_name: string | null;
  region: string | null;
  sub_region: string | null;
  star_rating: number | null;
  address: string | null;
  description: string | null;
  facilities: string | null;
  child_policy_default: string | null;
  transfer_notes_default: string | null;
  status: string | null;
  updated_at: string | null;
}

/**
 * Fields the Booking OS will accept from the directory.
 *
 * The producer enforces this too, but a consumer that trusts an upstream
 * payload wholesale is one careless JOIN away from storing prices it was never
 * meant to hold. Anything outside this list is dropped and logged.
 */
export const ALLOWED_DIRECTORY_FIELDS: ReadonlyArray<keyof DirectoryHotel> = [
  'id',
  'hotel_name',
  'hotel_group_id',
  'group_name',
  'region',
  'sub_region',
  'star_rating',
  'address',
  'description',
  'facilities',
  'child_policy_default',
  'transfer_notes_default',
  'status',
  'updated_at',
];

/** Name fragments that must never reach this system. */
export const FORBIDDEN_FIELD_FRAGMENTS = [
  'price', 'rate', 'currency', 'package', 'commission',
  'cost', 'selling', 'markup', 'amount', 'ready_count',
];

export class HotelDirectoryUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'HotelDirectoryUnavailableError';
  }
}

export interface DirectoryFetchResult {
  hotels: DirectoryHotel[];
  /** Field names that were present upstream but refused by the allowlist. */
  droppedFields: string[];
  fetchedAt: Date;
}

/**
 * Reads the hotel directory from the ELBAKRI Rate Hub.
 *
 * Server-to-server only. The browser never talks to the Rate Hub, and the
 * integration key never appears in any `NEXT_PUBLIC_*` variable or client
 * bundle — a synchronisation credential must not depend on, or be exposed by,
 * a human's browser session.
 */
@Injectable()
export class HotelDirectoryClient {
  private readonly logger = new Logger(HotelDirectoryClient.name);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(this.baseUrl && this.integrationKey);
  }

  private get baseUrl(): string {
    return (this.config.get<string>('ELBAKRI_RATE_API_URL') ?? '').replace(/\/$/, '');
  }

  private get integrationKey(): string {
    return this.config.get<string>('ELBAKRI_RATE_INTEGRATION_KEY') ?? '';
  }

  /**
   * Strips anything not on the allowlist and reports what was dropped.
   *
   * Rebuilt key by key rather than filtered, so an unexpected upstream field
   * cannot survive by having a harmless-looking name.
   */
  private sanitize(raw: Record<string, unknown>, dropped: Set<string>): DirectoryHotel | null {
    for (const key of Object.keys(raw)) {
      if (!(ALLOWED_DIRECTORY_FIELDS as readonly string[]).includes(key)) {
        dropped.add(key);
      }
    }

    if (raw.id === undefined || raw.id === null || !raw.hotel_name) return null;

    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const str = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s.length ? s : null;
    };

    return {
      id: Number(raw.id),
      hotel_name: String(raw.hotel_name).trim(),
      hotel_group_id: num(raw.hotel_group_id),
      group_name: str(raw.group_name),
      region: str(raw.region),
      sub_region: str(raw.sub_region),
      star_rating: num(raw.star_rating),
      address: str(raw.address),
      description: str(raw.description),
      facilities: str(raw.facilities),
      child_policy_default: str(raw.child_policy_default),
      transfer_notes_default: str(raw.transfer_notes_default),
      status: str(raw.status) ?? 'Active',
      updated_at: str(raw.updated_at),
    };
  }

  async fetchHotels(since?: Date | null): Promise<DirectoryFetchResult> {
    if (!this.configured) {
      throw new HotelDirectoryUnavailableError(
        'The hotel directory integration is not configured. Set ELBAKRI_RATE_API_URL and ELBAKRI_RATE_INTEGRATION_KEY.',
      );
    }

    const url = new URL(`${this.baseUrl}/api/integrations/hotels`);
    if (since) url.searchParams.set('since', since.toISOString());

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.integrationKey}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      throw new HotelDirectoryUnavailableError('Could not reach the Rate Hub.', err);
    }

    if (!response.ok) {
      throw new HotelDirectoryUnavailableError(
        `The Rate Hub returned ${response.status}.`,
        await response.text().catch(() => null),
      );
    }

    const payload = (await response.json().catch(() => null)) as
      | { data?: unknown[] }
      | null;
    if (!payload || !Array.isArray(payload.data)) {
      throw new HotelDirectoryUnavailableError('The Rate Hub returned an unexpected payload.');
    }

    const dropped = new Set<string>();
    const hotels = payload.data
      .map((row) => this.sanitize(row as Record<string, unknown>, dropped))
      .filter((h): h is DirectoryHotel => h !== null);

    // A dropped field that looks financial is worth shouting about: it means
    // the upstream contract changed in the one direction it must not.
    const financial = [...dropped].filter((f) =>
      FORBIDDEN_FIELD_FRAGMENTS.some((frag) => f.toLowerCase().includes(frag)),
    );
    if (financial.length) {
      this.logger.error(
        { fields: financial },
        'The hotel directory returned pricing-related fields. They were discarded; the upstream endpoint needs review.',
      );
    } else if (dropped.size) {
      this.logger.warn({ fields: [...dropped] }, 'Unrecognised hotel directory fields were ignored');
    }

    return { hotels, droppedFields: [...dropped], fetchedAt: new Date() };
  }
}
