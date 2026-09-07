import { TransferStatus, TripFileStatus, VisaStatus } from '../domain/enums';
import {
  allowedTransitions, canTransition, isTerminal,
  TRANSFER_TRANSITIONS, TRIP_TRANSITIONS, VISA_TRANSITIONS,
} from './state-machines';

describe('transfer state machine', () => {
  it('allows the normal operational path', () => {
    const path: TransferStatus[] = ['DRAFT', 'SCHEDULED', 'ASSIGNED', 'DISPATCHED', 'PICKED_UP', 'COMPLETED'];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(TRANSFER_TRANSITIONS, path[i], path[i + 1])).toBe(true);
    }
  });
  it('refuses to send a completed leg back to draft', () => {
    expect(canTransition(TRANSFER_TRANSITIONS, 'COMPLETED', 'DRAFT')).toBe(false);
  });
  it('refuses to rewind a dispatched leg to draft', () => {
    expect(canTransition(TRANSFER_TRANSITIONS, 'DISPATCHED', 'DRAFT')).toBe(false);
  });
  it('treats COMPLETED and CANCELLED as terminal', () => {
    expect(isTerminal(TRANSFER_TRANSITIONS, 'COMPLETED')).toBe(true);
    expect(isTerminal(TRANSFER_TRANSITIONS, 'CANCELLED')).toBe(true);
  });
  it('permits a no-show from dispatched', () => {
    expect(canTransition(TRANSFER_TRANSITIONS, 'DISPATCHED', 'NO_SHOW')).toBe(true);
  });
  it('lists the allowed next states', () => {
    expect(allowedTransitions(TRANSFER_TRANSITIONS, 'ASSIGNED')).toContain('DISPATCHED');
  });
});

describe('trip file state machine', () => {
  it('allows confirming a requested trip', () => {
    expect(canTransition(TRIP_TRANSITIONS, 'REQUESTED', 'CONFIRMED')).toBe(true);
  });
  it('does not reopen a completed trip', () => {
    expect(canTransition(TRIP_TRANSITIONS, 'COMPLETED', 'IN_PROGRESS')).toBe(false);
  });
  it('treats a no-op transition as allowed', () => {
    expect(canTransition(TRIP_TRANSITIONS, 'CONFIRMED' as TripFileStatus, 'CONFIRMED' as TripFileStatus)).toBe(true);
  });
});

describe('visa state machine', () => {
  it('allows a rejected application to go back for documents', () => {
    expect(canTransition(VISA_TRANSITIONS, 'REJECTED', 'DOCUMENTS_PENDING')).toBe(true);
  });
  it('does not approve straight from draft', () => {
    expect(canTransition(VISA_TRANSITIONS, 'DRAFT', 'APPROVED' as VisaStatus)).toBe(false);
  });
});
