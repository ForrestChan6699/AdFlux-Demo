import { calculateBilling } from "./billing";
import { defaultStrategy } from "./config";
import { ads } from "./data";
import { filterAds } from "./filter";
import { coarseRank, fineRank } from "./rank";
import { recallAds } from "./recall";
import type { EngineResult, RequestProfile, StrategyConfig } from "./types";

export function runEngine(
  request: RequestProfile,
  strategy: StrategyConfig = defaultStrategy,
): EngineResult {
  const recalled = recallAds(ads, request, strategy);
  const { rejected, filtered } = filterAds(recalled, request, strategy);
  const coarse = coarseRank(filtered, strategy);
  const fine = fineRank(coarse, strategy);
  const billing = calculateBilling(fine);

  return { recalled, rejected, filtered, coarse, fine, billing };
}

export { ads } from "./data";
export { defaultStrategy, interests } from "./config";
export { calculateBilling } from "./billing";
export { calculateEcpm, coarseRank, fineRank } from "./rank";
export { filterAds } from "./filter";
export { recallAds } from "./recall";
export type { Ad, BillingMode, EngineResult, RankedAd, RequestProfile, StrategyConfig } from "./types";
