import {
  ExcursionStatus, HotelBookingStatus, TransferStatus, TripFileStatus, VisaStatus,
} from '../domain/enums';

export type TransitionMap<T extends string> = Record<T, readonly T[]>;

/**
 * Allowed status transitions. Enforced by the API only — the frontend can
 * request a transition but never decides whether it is legal.
 */
export const TRIP_TRANSITIONS: TransitionMap<TripFileStatus> = {
  DRAFT: ['REQUESTED', 'CONFIRMED', 'CANCELLED'],
  REQUESTED: ['CONFIRMED', 'ON_HOLD', 'CANCELLED', 'DRAFT'],
  CONFIRMED: ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'ON_HOLD', 'CANCELLED'],
  ON_HOLD: ['REQUESTED', 'CONFIRMED', 'IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const HOTEL_BOOKING_TRANSITIONS: TransitionMap<HotelBookingStatus> = {
  DRAFT: ['REQUESTED', 'CONFIRMED', 'CANCELLED'],
  REQUESTED: ['CONFIRMED', 'CANCELLED', 'DRAFT'],
  CONFIRMED: ['CHECKED_IN', 'NO_SHOW', 'CANCELLED'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  NO_SHOW: [],
  CANCELLED: [],
};

/**
 * A dispatched transfer can never be sent back to DRAFT — the operational
 * history of a leg that was already handed to a driver must remain truthful.
 */
export const TRANSFER_TRANSITIONS: TransitionMap<TransferStatus> = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['ASSIGNED', 'CANCELLED', 'DRAFT'],
  ASSIGNED: ['DISPATCHED', 'SCHEDULED', 'CANCELLED', 'NO_SHOW'],
  DISPATCHED: ['PICKED_UP', 'NO_SHOW', 'CANCELLED'],
  PICKED_UP: ['COMPLETED', 'NO_SHOW'],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

export const EXCURSION_TRANSITIONS: TransitionMap<ExcursionStatus> = {
  DRAFT: ['REQUESTED', 'CONFIRMED', 'CANCELLED'],
  REQUESTED: ['CONFIRMED', 'CANCELLED', 'DRAFT'],
  CONFIRMED: ['IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'NO_SHOW'],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

export const VISA_TRANSITIONS: TransitionMap<VisaStatus> = {
  DRAFT: ['DOCUMENTS_PENDING', 'SUBMITTED', 'CANCELLED'],
  DOCUMENTS_PENDING: ['SUBMITTED', 'CANCELLED', 'DRAFT'],
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['COMPLETED', 'CANCELLED'],
  REJECTED: ['DOCUMENTS_PENDING', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition<T extends string>(map: TransitionMap<T>, from: T, to: T): boolean {
  if (from === to) return true;
  return (map[from] ?? []).includes(to);
}

export function allowedTransitions<T extends string>(map: TransitionMap<T>, from: T): readonly T[] {
  return map[from] ?? [];
}

/** Statuses that mean the record is finished and must not be edited further. */
export function isTerminal<T extends string>(map: TransitionMap<T>, status: T): boolean {
  return (map[status] ?? []).length === 0;
}
