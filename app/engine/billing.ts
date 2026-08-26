import type { RankedAd } from "./types";

function getBillingDenominator(ad: RankedAd): number {
  if (ad.billingMode === "CPM") return 1;
  if (ad.billingMode === "CPC") return ad.ctr * 1000;
  return ad.ctr * ad.cvr * 1000;
}

export function calculateBilling(rankedAds: RankedAd[]): RankedAd | undefined {
  const winner = rankedAds[0];
  const runnerUp = rankedAds[1];
  if (!winner) return undefined;

  const minimumIncrement = 0.01;
  const runnerUpEcpm = runnerUp?.ecpm ?? minimumIncrement;
  const clearingPrice = runnerUpEcpm / getBillingDenominator(winner) + minimumIncrement;
  const charge = Math.min(winner.bid, Math.max(minimumIncrement, clearingPrice));

  return { ...winner, charge: Number(charge.toFixed(2)) };
}
