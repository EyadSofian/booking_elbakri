/** Shapes returned by `GET /trips/:id`, shared by the trip detail tab modules. */

export interface TimelineEvent {
  date: string | null;
  time: string | null;
  type: string;
  title: string;
  detail: string | null;
  entityType: string;
  entityId: string;
  status?: string;
}

export interface TripStaySegment {
  id: string;
  checkIn: string | null;
  checkOut: string | null;
  nights: number | null;
  checkInRaw: string | null;
  checkOutRaw: string | null;
  hotel: { name: string } | null;
  hotelRaw: string | null;
  mealPlan: { name: string; nameAr: string | null } | null;
  mealPlanRaw: string | null;
  roomAllocations: Array<{
    id: string;
    quantity: number;
    roomTypeRaw: string | null;
    roomType: { name: string } | null;
  }>;
}

export interface TripHotelBooking {
  id: string;
  reference: string;
  status: string;
  hotelRaw: string | null;
  confirmationNumber: string | null;
  securityApprovalRequired: boolean;
  notes: string | null;
  hotel: { id: string; name: string } | null;
  staySegments: TripStaySegment[];
}

export interface TripTransferLeg {
  id: string;
  direction: string;
  status: string;
  serviceDate: string | null;
  pickupTimeMinutes: number | null;
  pickupTimeRaw: string | null;
  flightNumber: string | null;
  fromRaw: string | null;
  toRaw: string | null;
  fromLocation: { name: string } | null;
  toLocation: { name: string } | null;
  driver: { fullName: string } | null;
  vehicle: { plateNumber: string } | null;
}

export interface TripTransferBooking {
  id: string;
  reference: string;
  status: string;
  paxCount: number | null;
  legs: TripTransferLeg[];
}

export interface TripExcursionItem {
  id: string;
  status: string;
  serviceDate: string | null;
  activityRaw: string | null;
  transferRequired: boolean;
  catalogItem: { name: string; nameAr: string | null } | null;
}

export interface TripExcursionBooking {
  id: string;
  reference: string;
  status: string;
  paxCount: number | null;
  childCount: number | null;
  legacyRestRaw: string | null;
  hotelRaw: string | null;
  hotel: { name: string } | null;
  items: TripExcursionItem[];
}

export interface TripVisaOrder {
  id: string;
  reference: string;
  status: string;
  originRaw: string | null;
  destinationRaw: string | null;
  paxCount: number | null;
  serviceDate: string | null;
  currency: string;
  /** Omitted by the API entirely without `visas.finance.read`. */
  netAmount?: number | string | null;
  sellAmount?: number | string | null;
  margin?: number | string | null;
}

export interface TripFinancialDocument {
  id: string;
  reference: string;
  status: string;
  totalAmount: string | number;
  /** Derived by the server from the ledger; never recomputed in the UI. */
  paidAmount?: string | number;
  outstanding?: string | number;
  currency: string;
  serviceDescription: string | null;
  dueDate: string | null;
  counterparty: { name: string } | null;
}

export interface TripDetail {
  id: string;
  reference: string;
  status: string;
  version: number;
  travelStartDate: string | null;
  travelEndDate: string | null;
  travelDatesOverridden: boolean;
  paxCount: number | null;
  childCount: number | null;
  notes: string | null;
  legacySource: { workbook?: string; sheet?: string; row?: number } | null;
  leadTraveler: {
    id: string;
    fullName: string;
    phoneRaw: string | null;
    phoneNormalized: string | null;
    nationalityRaw: string | null;
    nationality: { name: string; nameAr: string | null } | null;
  } | null;
  partner: { id: string; name: string; nameAr: string | null } | null;
  travelers: Array<{ id: string; role: string; traveler: { id: string; fullName: string } }>;
  hotelBookings: TripHotelBooking[];
  transferBookings: TripTransferBooking[];
  excursionBookings: TripExcursionBooking[];
  visaOrders: TripVisaOrder[];
  financialDocuments: TripFinancialDocument[];
  attachments: Array<{ id: string; filename: string; category: string; createdAt: string }>;
  statusHistory: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    createdAt: string;
  }>;
  timeline: TimelineEvent[];
}

/** Context handed to every trip detail tab. */
export interface TripTabContext {
  trip: TripDetail;
}
