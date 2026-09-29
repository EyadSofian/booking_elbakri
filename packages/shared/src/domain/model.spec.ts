import { computeSaleTotals, formatRef, countNights, roomsText } from './model';

describe('computeSaleTotals — the sales sheet formulas', () => {
  it('matches the sheet for a full row', () => {
    const t = computeSaleTotals({
      hotelCost: 10_000, hotelSell: 12_500,
      flightCost: 8_000, flightSell: 9_500, flightCommission: 300,
      transferCost: 600, transferSell: 900,
      serviceCost: 200, serviceSell: 350,
      commissionRate: 10, paid: 15_000,
    });
    expect(t.hotelProfit).toBe(2_500);
    // flight profit subtracts the flight commission
    expect(t.flightProfit).toBe(1_200);
    expect(t.transferProfit).toBe(300);
    expect(t.serviceProfit).toBe(150);
    // total cost includes the flight commission
    expect(t.totalCost).toBe(19_100);
    expect(t.totalSell).toBe(23_250);
    expect(t.totalProfit).toBe(4_150);
    expect(t.commission).toBe(415);
    expect(t.customerTotal).toBe(23_250);
    expect(t.remaining).toBe(8_250);
  });

  it('defaults the commission rate to 10% and treats missing values as zero', () => {
    const t = computeSaleTotals({ hotelCost: 1000, hotelSell: 1500 });
    expect(t.commission).toBe(50);
    expect(t.remaining).toBe(1500);
  });

  it('pays no commission on a loss', () => {
    const t = computeSaleTotals({ hotelCost: 2000, hotelSell: 1500 });
    expect(t.totalProfit).toBe(-500);
    expect(t.commission).toBe(0);
  });

  it('keeps cents exact', () => {
    const t = computeSaleTotals({ hotelCost: 0.1, hotelSell: 0.3, commissionRate: 10 });
    expect(t.totalProfit).toBe(0.2);
    expect(t.commission).toBe(0.02);
  });
});

describe('helpers', () => {
  it('counts nights', () => {
    expect(countNights('2026-10-01', '2026-10-06')).toBe(5);
    expect(countNights('2026-10-06', '2026-10-01')).toBeNull();
    expect(countNights(null, '2026-10-01')).toBeNull();
  });

  it('formats references and rooms', () => {
    expect(formatRef('HOTEL', 12)).toBe('H-12');
    expect(roomsText(1, 2, 0)).toBe('1 SGL + 2 DBL');
    expect(roomsText(0, 0, 0)).toBe('');
  });
});
