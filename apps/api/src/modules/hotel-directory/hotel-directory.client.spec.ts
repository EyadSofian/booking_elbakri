import { ConfigService } from '@nestjs/config';
import {
  ALLOWED_DIRECTORY_FIELDS,
  FORBIDDEN_FIELD_FRAGMENTS,
  HotelDirectoryClient,
  HotelDirectoryUnavailableError,
} from './hotel-directory.client';

/**
 * The Booking OS side of the integration boundary.
 *
 * The Rate Hub enforces the allowlist too, but a consumer that trusts an
 * upstream payload wholesale is one careless JOIN away from storing prices it
 * was never meant to hold. These assert that nothing financial survives the
 * crossing even if the producer regresses.
 */

function clientWith(config: Record<string, string>): HotelDirectoryClient {
  return new HotelDirectoryClient({
    get: (key: string) => config[key],
  } as unknown as ConfigService);
}

const CONFIGURED = {
  ELBAKRI_RATE_API_URL: 'https://rates.example.test',
  ELBAKRI_RATE_INTEGRATION_KEY: 'test-integration-key',
};

/** A directory row polluted with every field that must not cross. */
const POLLUTED_ROW = {
  id: 42,
  hotel_name: 'Gravity Hotel',
  hotel_group_id: 7,
  group_name: 'Gravity',
  region: 'Hurghada',
  sub_region: 'Sahl Hasheesh',
  star_rating: 5,
  address: 'Sahl Hasheesh Bay',
  description: 'Beachfront resort.',
  facilities: 'Pool, Spa',
  child_policy_default: 'Under 6 free.',
  transfer_notes_default: '25 minutes from HRG.',
  status: 'Active',
  updated_at: '2026-09-07 10:00:00',
  // Must all be discarded.
  rates_count: 12,
  ready_count: 8,
  base_price: 1200.5,
  currency: 'EUR',
  package_id: 3,
  commission_pct: 12.5,
  cost_price: 900,
  selling_price: 1400,
  markup: 300,
};

function mockFetch(payload: unknown, ok = true, status = 200): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });
  (globalThis as { fetch: unknown }).fetch = fn;
  return fn;
}

describe('HotelDirectoryClient — the integration boundary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps only allowlisted fields', async () => {
    mockFetch({ data: [POLLUTED_ROW] });
    const { hotels } = await clientWith(CONFIGURED).fetchHotels();

    expect(hotels).toHaveLength(1);
    expect(Object.keys(hotels[0]).sort()).toEqual([...ALLOWED_DIRECTORY_FIELDS].sort());
  });

  it('discards every pricing-related field', async () => {
    mockFetch({ data: [POLLUTED_ROW] });
    const { hotels } = await clientWith(CONFIGURED).fetchHotels();

    const serialised = JSON.stringify(hotels[0]).toLowerCase();
    for (const fragment of FORBIDDEN_FIELD_FRAGMENTS) {
      expect(Object.keys(hotels[0]).some((k) => k.toLowerCase().includes(fragment))).toBe(false);
    }
    for (const value of ['1200.5', '1400', '900', 'eur', 'commission']) {
      expect(serialised).not.toContain(value);
    }
  });

  it('reports what it dropped, so an upstream change is visible', async () => {
    mockFetch({ data: [POLLUTED_ROW] });
    const { droppedFields } = await clientWith(CONFIGURED).fetchHotels();

    expect(droppedFields).toEqual(
      expect.arrayContaining(['base_price', 'currency', 'rates_count', 'selling_price']),
    );
  });

  it('never declares a forbidden field in its own allowlist', () => {
    for (const field of ALLOWED_DIRECTORY_FIELDS) {
      for (const fragment of FORBIDDEN_FIELD_FRAGMENTS) {
        expect(field.toLowerCase()).not.toContain(fragment);
      }
    }
  });

  it('skips rows with no id or name rather than importing a blank hotel', async () => {
    mockFetch({ data: [{ hotel_name: 'No id' }, { id: 5 }, POLLUTED_ROW] });
    const { hotels } = await clientWith(CONFIGURED).fetchHotels();
    expect(hotels).toHaveLength(1);
  });

  it('coerces types and normalises blank strings to null', async () => {
    mockFetch({ data: [{ id: '9', hotel_name: '  Small Inn  ', region: '   ', star_rating: '4' }] });
    const { hotels } = await clientWith(CONFIGURED).fetchHotels();

    expect(hotels[0].id).toBe(9);
    expect(hotels[0].hotel_name).toBe('Small Inn');
    expect(hotels[0].region).toBeNull();
    expect(hotels[0].star_rating).toBe(4);
    expect(hotels[0].status).toBe('Active');
  });

  it('sends the integration key as a server-to-server credential', async () => {
    const fetchMock = mockFetch({ data: [] });
    await clientWith(CONFIGURED).fetchHotels();

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-integration-key',
    );
  });

  it('asks only for what changed when given a cursor', async () => {
    const fetchMock = mockFetch({ data: [] });
    await clientWith(CONFIGURED).fetchHotels(new Date('2026-09-01T00:00:00Z'));

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('since=2026-09-01T00%3A00%3A00.000Z');
  });

  it('refuses to run when the integration is not configured', async () => {
    await expect(clientWith({}).fetchHotels()).rejects.toBeInstanceOf(
      HotelDirectoryUnavailableError,
    );
  });

  it('treats an upstream failure as unavailable, not as bad data', async () => {
    mockFetch({ error: 'boom' }, false, 500);
    await expect(clientWith(CONFIGURED).fetchHotels()).rejects.toBeInstanceOf(
      HotelDirectoryUnavailableError,
    );
  });

  it('rejects a payload that is not the expected shape', async () => {
    mockFetch({ hotels: [] });
    await expect(clientWith(CONFIGURED).fetchHotels()).rejects.toBeInstanceOf(
      HotelDirectoryUnavailableError,
    );
  });
});
