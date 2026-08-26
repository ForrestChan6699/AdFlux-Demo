import { interests } from "./config";
import type { RankedAd, StrategyConfig } from "./types";

export function calculateEcpm(ad: RankedAd): number {
  if (ad.billingMode === "CPM") return ad.bid;
  if (ad.billingMode === "CPC") return ad.bid * ad.ctr * 1000;
  return ad.bid * ad.ctr * ad.cvr * 1000;
}

export function coarseRank(ads: RankedAd[], strategy: StrategyConfig): RankedAd[] {
  const weights = strategy.weights;
  return ads
    .map((ad) => ({
      ...ad,
      coarseScore: Number((
        ad.ctr * weights.ctr +
        ad.quality * weights.quality +
        ad.bid * weights.bid +
        (interests.includes(ad.category) ? weights.interest : 0)
      ).toFixed(2)),
    }))
    .sort((a, b) => (b.coarseScore ?? 0) - (a.coarseScore ?? 0))
    .slice(0, strategy.coarseTopK);
}

export function fineRank(ads: RankedAd[], strategy: StrategyConfig): RankedAd[] {
  return ads
    .map((ad) => {
      const ecpm = calculateEcpm(ad);
      return {
        ...ad,
        ecpm: Number(ecpm.toFixed(2)),
        fineScore: Number((ecpm * ad.quality).toFixed(3)),
      };
    })
    .sort((a, b) => (b.fineScore ?? 0) - (a.fineScore ?? 0))
    .slice(0, strategy.fineTopK);
}
