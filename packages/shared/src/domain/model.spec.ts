import { computeSaleTotals, formatRef, countNights, pricingFromLines, roomsText, saleLineProfit } from './model';

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

describe('sale lines — several hotels, flights, transfers and services on one sale', () => {
  const lines = [
    { kind: 'HOTEL' as const, cost: 10_000, sell: 12_000, commission: 0 },
    { kind: 'HOTEL' as const, cost: 4_000, sell: 5_000, commission: 0 },
    { kind: 'FLIGHT' as const, cost: 8_000, sell: 9_500, commission: 300 },
    { kind: 'TRANSFER' as const, cost: 300, sell: 450, commission: 0 },
    { kind: 'TRANSFER' as const, cost: 300, sell: 450, commission: 0 },
  ];

  it('adds each kind up into the sheet columns', () => {
    const p = pricingFromLines(lines, 10, 1_000);
    expect(p.hotelCost).toBe(14_000);
    expect(p.hotelSell).toBe(17_000);
    expect(p.flightCommission).toBe(300);
    expect(p.transferSell).toBe(900);
    expect(p.serviceSell).toBe(0);
    const t = computeSaleTotals(p);
    expect(t.totalCost).toBe(22_900);
    expect(t.totalSell).toBe(27_400);
    expect(t.totalProfit).toBe(4_500);
    expect(t.remaining).toBe(26_400);
  });

  it('gives each line its own profit, taking the commission off flights only', () => {
    expect(saleLineProfit(lines[2])).toBe(1_200);
    expect(saleLineProfit({ kind: 'HOTEL', cost: 100, sell: 150, commission: 20 })).toBe(50);
  });

  it('adds nothing for a sale without lines', () => {
    expect(computeSaleTotals(pricingFromLines([], 10, 0)).totalSell).toBe(0);
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
