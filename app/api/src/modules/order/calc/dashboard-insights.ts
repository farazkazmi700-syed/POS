export interface DailyPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface ForecastPoint {
  date: string;
  predictedRevenue: number;
  lowBand: number;
  highBand: number;
}

export interface StockoutRisk {
  productId: string;
  name: string;
  sku?: string;
  stockQty: number;
  lowStockThreshold: number;
  unit?: string;
  dailyVelocity: number;
  estimatedDaysLeft: number | null;
  recommendedReorderQty: number;
}

export interface DashboardRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'inventory' | 'revenue' | 'pricing' | 'operations';
  title: string;
  detail: string;
  actionLabel: string;
  actionTo: string;
}

export interface DashboardPredictions {
  next7DaysRevenue: number;
  next30DaysRevenue: number;
  projectedDailyAvg: number;
  trendDirection: 'up' | 'down' | 'flat';
  trendPercent: number;
  confidence: 'high' | 'medium' | 'low';
  forecastDaily: ForecastPoint[];
  stockoutRisks: StockoutRisk[];
}

export interface DashboardInsightsInput {
  days: number;
  revenue: number;
  orders: number;
  discounts: number;
  previousRevenue: number;
  daily: DailyPoint[];
  topProducts: { productId: string; name: string; qty: number; revenue: number }[];
  paymentModes: { mode: string; count: number; revenue: number }[];
  lowStockProducts: {
    productId: string;
    name: string;
    sku?: string;
    stockQty: number;
    lowStockThreshold: number;
    unit?: string;
  }[];
  soldByProductId: Record<string, number>;
  asOfDate?: Date;
}

const DAY_MS = 86_400_000;
const round2 = (n: number): number => Math.round(n * 100) / 100;

const toUtcYmd = (d: Date): string => d.toISOString().slice(0, 10);

/** Fills missing calendar days inside the trailing `days` window with zero revenue/orders. */
export function fillDailySeries(daily: DailyPoint[], days: number, asOfDate = new Date()): DailyPoint[] {
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const end = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate()));
  const count = Math.max(1, days);
  const series: DailyPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const ymd = toUtcYmd(new Date(end.getTime() - i * DAY_MS));
    const existing = byDate.get(ymd);
    series.push(existing ? { date: ymd, revenue: round2(existing.revenue), orders: existing.orders } : { date: ymd, revenue: 0, orders: 0 });
  }
  return series;
}

/**
 * Computes deterministic 7-day and 30-day revenue forecasts using ordinary least-squares
 * linear trend blended with trailing average, plus period-over-period growth and confidence.
 */
export function computeDashboardInsights(input: DashboardInsightsInput): {
  daily: DailyPoint[];
  predictions: DashboardPredictions;
  recommendations: DashboardRecommendation[];
} {
  const asOf = input.asOfDate ?? new Date();
  const series = fillDailySeries(input.daily, input.days, asOf);
  const n = series.length;
  const activeDays = series.filter((d) => d.orders > 0 || d.revenue > 0).length;

  const meanY = n > 0 ? series.reduce((sum, d) => sum + d.revenue, 0) / n : 0;
  let slope = 0;
  let intercept = meanY;
  if (n >= 3) {
    const meanX = (n - 1) / 2;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const dx = i - meanX;
      num += dx * (series[i].revenue - meanY);
      den += dx * dx;
    }
    slope = den > 0 ? num / den : 0;
    intercept = meanY - slope * meanX;
  }

  // Residual std dev for +/- confidence band; damped when few active days exist.
  const residuals = series.map((d, i) => d.revenue - Math.max(0, intercept + slope * i));
  const variance = n > 1 ? residuals.reduce((sum, r) => sum + r * r, 0) / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const bandSpread = Math.max(stdDev * 0.85, meanY * 0.12);

  const endUtc = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const forecastDaily: ForecastPoint[] = Array.from({ length: 7 }, (_, idx) => {
    const x = n + idx;
    // Blend linear projection with trailing mean to avoid runaway slopes on short windows.
    const rawLinear = Math.max(0, intercept + slope * x);
    const predicted = round2(Math.max(0, 0.55 * rawLinear + 0.45 * meanY));
    const stepBand = bandSpread * (1 + idx * 0.06);
    return {
      date: toUtcYmd(new Date(endUtc + (idx + 1) * DAY_MS)),
      predictedRevenue: predicted,
      lowBand: round2(Math.max(0, predicted - stepBand)),
      highBand: round2(predicted + stepBand),
    };
  });

  const next7DaysRevenue = round2(forecastDaily.reduce((sum, d) => sum + d.predictedRevenue, 0));
  const projectedDailyAvg = round2(next7DaysRevenue / 7);
  const next30DaysRevenue = round2(projectedDailyAvg * 30);

  let trendPercent = 0;
  if (input.previousRevenue > 0) {
    trendPercent = round2(((input.revenue - input.previousRevenue) / input.previousRevenue) * 100);
  } else if (meanY > 0 && slope !== 0) {
    trendPercent = round2(Math.max(-100, Math.min(200, ((slope * Math.min(7, n)) / meanY) * 100)));
  }

  const trendDirection: 'up' | 'down' | 'flat' =
    trendPercent >= 3 ? 'up' : trendPercent <= -3 ? 'down' : 'flat';

  const confidence: 'high' | 'medium' | 'low' =
    activeDays >= 10 || (n <= 7 && activeDays >= 5) ? 'high' : activeDays >= 3 ? 'medium' : 'low';

  const windowDays = Math.max(1, input.days);
  const stockoutRisks: StockoutRisk[] = input.lowStockProducts
    .map((p) => {
      const sold = input.soldByProductId[p.productId] ?? 0;
      const dailyVelocity = round2(sold / windowDays);
      const estimatedDaysLeft = p.stockQty <= 0 ? 0 : dailyVelocity > 0 ? Math.floor(p.stockQty / dailyVelocity) : null;
      const targetStock = Math.max(p.lowStockThreshold * 2, Math.ceil(dailyVelocity * 14));
      const recommendedReorderQty = Math.max(1, targetStock - p.stockQty);
      return {
        productId: p.productId,
        name: p.name,
        sku: p.sku,
        stockQty: p.stockQty,
        lowStockThreshold: p.lowStockThreshold,
        unit: p.unit,
        dailyVelocity,
        estimatedDaysLeft,
        recommendedReorderQty,
      };
    })
    .sort((a, b) => {
      const aDays = a.estimatedDaysLeft ?? 9999;
      const bDays = b.estimatedDaysLeft ?? 9999;
      return aDays - bDays || a.stockQty - b.stockQty;
    })
    .slice(0, 6);

  const recommendations: DashboardRecommendation[] = [];

  const outOfStockCount = stockoutRisks.filter((item) => item.stockQty <= 0).length;
  const urgentRestock = stockoutRisks.find((item) => item.stockQty > 0 && (item.estimatedDaysLeft ?? 99) <= 7);
  if (outOfStockCount > 0) {
    const first = stockoutRisks.find((item) => item.stockQty <= 0)!;
    recommendations.push({
      id: 'restock-out-of-stock',
      priority: 'high',
      category: 'inventory',
      title: `Restock ${outOfStockCount} out-of-stock item${outOfStockCount === 1 ? '' : 's'}`,
      detail: `${first.name} is at 0 ${first.unit ?? 'units'}. Suggested reorder: +${first.recommendedReorderQty} ${first.unit ?? 'units'} to cover 14 days.`,
      actionLabel: 'Manage inventory',
      actionTo: '/products',
    });
  } else if (urgentRestock) {
    recommendations.push({
      id: 'restock-soon',
      priority: 'high',
      category: 'inventory',
      title: `${urgentRestock.name} predicted to run out in ~${urgentRestock.estimatedDaysLeft}d`,
      detail: `Selling ${urgentRestock.dailyVelocity}/day with ${urgentRestock.stockQty} left. Reorder +${urgentRestock.recommendedReorderQty} ${urgentRestock.unit ?? 'units'}.`,
      actionLabel: 'Review stock',
      actionTo: '/products',
    });
  } else if (stockoutRisks.length > 0) {
    recommendations.push({
      id: 'low-stock-watch',
      priority: 'medium',
      category: 'inventory',
      title: `${stockoutRisks.length} low-stock product${stockoutRisks.length === 1 ? '' : 's'} below threshold`,
      detail: `Top item to replenish: ${stockoutRisks[0].name} (${stockoutRisks[0].stockQty} left vs threshold ${stockoutRisks[0].lowStockThreshold}).`,
      actionLabel: 'Open inventory',
      actionTo: '/products',
    });
  }

  if (input.orders === 0) {
    recommendations.push({
      id: 'no-orders-window',
      priority: 'medium',
      category: 'operations',
      title: 'No completed sales in the selected window',
      detail: 'Complete transactions in POS or switch to the 30-day window to generate trend lines and demand forecasts.',
      actionLabel: 'Open POS',
      actionTo: '/pos',
    });
  } else {
    if (trendDirection === 'down') {
      recommendations.push({
        id: 'revenue-slowdown',
        priority: 'high',
        category: 'revenue',
        title: `Revenue is down ${Math.abs(trendPercent)}% vs previous ${windowDays}d`,
        detail: `Projected 7-day pace is ${round2(next7DaysRevenue).toLocaleString('en-US')}. Bundle slow-moving items with ${input.topProducts[0]?.name ?? 'top sellers'} to lift basket size.`,
        actionLabel: 'View sales report',
        actionTo: '/reports',
      });
    } else if (trendDirection === 'up') {
      recommendations.push({
        id: 'revenue-momentum',
        priority: 'low',
        category: 'revenue',
        title: `Positive revenue momentum (+${trendPercent}%)`,
        detail: `Current pace projects ${round2(next7DaysRevenue).toLocaleString('en-US')} over the next 7 days. Keep top sellers stocked ahead of peak demand.`,
        actionLabel: 'Inspect orders',
        actionTo: '/orders',
      });
    }

    const topShare = input.revenue > 0 && input.topProducts[0]
      ? round2((input.topProducts[0].revenue / input.revenue) * 100)
      : 0;
    if (topShare >= 45 && input.topProducts.length > 1) {
      recommendations.push({
        id: 'sku-concentration',
        priority: 'medium',
        category: 'revenue',
        title: `${topShare}% of revenue comes from ${input.topProducts[0].name}`,
        detail: 'High reliance on one product increases stockout risk. Cross-promote secondary items at checkout.',
        actionLabel: 'Review catalog',
        actionTo: '/products',
      });
    }

    const grossBeforeDiscount = input.revenue + input.discounts;
    const discountRate = grossBeforeDiscount > 0 ? round2((input.discounts / grossBeforeDiscount) * 100) : 0;
    if (discountRate >= 12) {
      recommendations.push({
        id: 'discount-margin-watch',
        priority: 'medium',
        category: 'pricing',
        title: `Discounts equal ${discountRate}% of gross sales`,
        detail: 'Review cashier discount approvals and promotional pricing to protect net margin.',
        actionLabel: 'View reports',
        actionTo: '/reports',
      });
    }

    const totalModeRev = input.paymentModes.reduce((sum, m) => sum + m.revenue, 0);
    const cashMode = input.paymentModes.find((m) => m.mode === 'cash');
    if (totalModeRev > 0 && cashMode && cashMode.revenue / totalModeRev >= 0.85 && input.orders >= 5) {
      recommendations.push({
        id: 'payment-diversification',
        priority: 'low',
        category: 'operations',
        title: `${Math.round((cashMode.revenue / totalModeRev) * 100)}% of collections are cash`,
        detail: 'Promoting card, mobile wallet, or installment tenders can increase average order value.',
        actionLabel: 'Open POS',
        actionTo: '/pos',
      });
    }
  }

  return {
    daily: series,
    predictions: {
      next7DaysRevenue,
      next30DaysRevenue,
      projectedDailyAvg,
      trendDirection,
      trendPercent,
      confidence,
      forecastDaily,
      stockoutRisks,
    },
    recommendations: recommendations.slice(0, 5),
  };
}
