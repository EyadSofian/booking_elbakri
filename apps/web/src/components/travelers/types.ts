/** Shapes returned by `GET /travelers/:id`. */

export interface TravelerTripSummary {
  id: string;
  reference: string;
  status: string;
  travelStartDate: string | null;
  travelEndDate: string | null;
  partner: { id: string; name: string } | null;
  _count: {
    hotelBookings: number;
    transferBookings: number;
    excursionBookings: number;
    visaOrders: number;
  };
}

export interface TravelerDetail {
  id: string;
  fullName: string;
  fullNameAr: string | null;
  phoneRaw: string | null;
  phoneNormalized: string | null;
  phoneDigits: string | null;
  email: string | null;
  passportNumber: string | null;
  nationalityRaw: string | null;
  nationality: { id: string; name: string; nameAr: string | null } | null;
  partner: { id: string; name: string; nameAr: string | null } | null;
  notes: string | null;
  createdAt: string;
  importRun: { id: string; sourceFilename: string } | null;
  legacySource: { workbook?: string; sheet?: string; row?: number } | null;

  tripsAsLead: TravelerTripSummary[];

  hotelBookings: Array<{
    id: string; reference: string; status: string; hotelRaw: string | null;
    hotel: { id: string; name: string } | null;
    tripFile: { id: string; reference: string } | null;
    staySegments: Array<{
      id: string; checkIn: string | null; checkOut: string | null; nights: number | null;
      checkInRaw: string | null; checkOutRaw: string | null;
      hotel: { name: string } | null; hotelRaw: string | null;
    }>;
  }>;

  transferBookings: Array<{
    id: string; reference: string; status: string; paxCount: number | null;
    tripFile: { id: string; reference: string } | null;
    legs: Array<{
      id: string; direction: string; status: string; serviceDate: string | null;
      pickupTimeMinutes: number | null; pickupTimeRaw: string | null;
      flightNumber: string | null; fromRaw: string | null; toRaw: string | null;
      fromLocation: { name: string } | null; toLocation: { name: string } | null;
    }>;
  }>;

  excursionBookings: Array<{
    id: string; reference: string; status: string;
    paxCount: number | null; childCount: number | null;
    hotelRaw: string | null; hotel: { name: string } | null;
    tripFile: { id: string; reference: string } | null;
    items: Array<{
      id: string; status: string; serviceDate: string | null; activityRaw: string | null;
      catalogItem: { name: string; nameAr: string | null } | null;
    }>;
  }>;

  /** Amounts are null unless the caller holds visa finance access. */
  visaOrders: Array<{
    id: string; reference: string; status: string;
    originRaw: string | null; destinationRaw: string | null;
    paxCount: number | null; serviceDate: string | null; currency: string;
    netAmount: number | null; sellAmount: number | null; margin: number | null;
    tripFile: { id: string; reference: string } | null;
  }>;
}

export interface TravelerTabContext {
  traveler: TravelerDetail;
}
