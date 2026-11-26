import { computeDashboardInsights, fillDailySeries } from './dashboard-insights';

describe('dashboard insights & predictions', () => {
  it('fills missing calendar days continuously', () => {
    const asOf = new Date('2026-11-26T12:00:00Z');
    const filled = fillDailySeries(
      [
        { date: '2026-11-24', revenue: 1000, orders: 2 },
        { date: '2026-11-26', revenue: 1500, orders: 3 },
      ],
      3,
      asOf,
    );
    expect(filled).toEqual([
      { date: '2026-11-24', revenue: 1000, orders: 2 },
      { date: '2026-11-25', revenue: 0, orders: 0 },
      { date: '2026-11-26', revenue: 1500, orders: 3 },
    ]);
  });

  it('forecasts upward revenue trend, stockout risks, and high-priority restock recommendations', () => {
    const asOf = new Date('2026-11-26T12:00:00Z');
    const result = computeDashboardInsights({
      days: 7,
      revenue: 21000,
      orders: 21,
      discounts: 500,
      previousRevenue: 15000,
      daily: [
        { date: '2026-11-20', revenue: 1500, orders: 2 },
        { date: '2026-11-21', revenue: 2000, orders: 2 },
        { date: '2026-11-22', revenue: 2500, orders: 3 },
        { date: '2026-11-23', revenue: 3000, orders: 3 },
        { date: '2026-11-24', revenue: 3500, orders: 3 },
        { date: '2026-11-25', revenue: 4000, orders: 4 },
        { date: '2026-11-26', revenue: 4500, orders: 4 },
      ],
      topProducts: [
        { productId: 'p1', name: 'Solar Inverter', qty: 14, revenue: 14000 },
        { productId: 'p2', name: 'Battery Pack', qty: 7, revenue: 7000 },
      ],
      paymentModes: [
        { mode: 'cash', count: 19, revenue: 19000 },
        { mode: 'card', count: 2, revenue: 2000 },
      ],
      lowStockProducts: [
        { productId: 'p1', name: 'Solar Inverter', sku: 'SOL-1', stockQty: 4, lowStockThreshold: 5, unit: 'pcs' },
        { productId: 'p3', name: 'Cable Kit', sku: 'CAB-1', stockQty: 0, lowStockThreshold: 5, unit: 'pcs' },
      ],
      soldByProductId: { p1: 14, p3: 7 },
      asOfDate: asOf,
    });

    expect(result.predictions.trendDirection).toBe('up');
    expect(result.predictions.trendPercent).toBe(40);
    expect(result.predictions.confidence).toBe('high');
    expect(result.predictions.forecastDaily).toHaveLength(7);
    expect(result.predictions.forecastDaily[0].date).toBe('2026-11-27');
    expect(result.predictions.next7DaysRevenue).toBeGreaterThan(21000);
    expect(result.predictions.stockoutRisks[0]).toMatchObject({ productId: 'p3', estimatedDaysLeft: 0 });
    expect(result.predictions.stockoutRisks[1]).toMatchObject({ productId: 'p1', dailyVelocity: 2, estimatedDaysLeft: 2 });
    expect(result.recommendations.some((r) => r.id === 'restock-out-of-stock' && r.priority === 'high')).toBe(true);
    expect(result.recommendations.some((r) => r.id === 'sku-concentration')).toBe(true);
  });

  it('flags revenue slowdown and empty periods cleanly without negative forecasts', () => {
    const asOf = new Date('2026-11-26T12:00:00Z');
    const empty = computeDashboardInsights({
      days: 7, revenue: 0, orders: 0, discounts: 0, previousRevenue: 0,
      daily: [], topProducts: [], paymentModes: [], lowStockProducts: [], soldByProductId: {}, asOfDate: asOf,
    });
    expect(empty.predictions.next7DaysRevenue).toBe(0);
    expect(empty.predictions.confidence).toBe('low');
    expect(empty.recommendations[0].id).toBe('no-orders-window');

    const declining = computeDashboardInsights({
      days: 7, revenue: 7000, orders: 7, discounts: 1500, previousRevenue: 14000,
      daily: [{ date: '2026-11-26', revenue: 7000, orders: 7 }],
      topProducts: [{ productId: 'p1', name: 'Item A', qty: 7, revenue: 7000 }],
      paymentModes: [{ mode: 'card', count: 7, revenue: 7000 }],
      lowStockProducts: [], soldByProductId: {}, asOfDate: asOf,
    });
    expect(declining.predictions.trendDirection).toBe('down');
    expect(declining.predictions.trendPercent).toBe(-50);
    expect(declining.recommendations.some((r) => r.id === 'revenue-slowdown')).toBe(true);
    expect(declining.recommendations.some((r) => r.id === 'discount-margin-watch')).toBe(true);
  });
});
