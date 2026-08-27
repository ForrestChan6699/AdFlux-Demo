import { calculateBilling } from "./billing";
import { defaultStrategy, interests } from "./config";
import { ads } from "./data";
import { filterAds } from "./filter";
import { coarseRank, fineRank } from "./rank";
import { recallAds } from "./recall";
import type { EngineResult, RequestProfile, StrategyConfig } from "./types";

export function runEngine(
  request: RequestProfile,
  strategy: StrategyConfig = defaultStrategy,
): EngineResult {
  return runEngineWithAds(ads, request, strategy);
}

export function runEngineWithAds(
  inventory: import("./types").Ad[],
  request: RequestProfile,
  strategy: StrategyConfig = defaultStrategy,
): EngineResult {
  const recalled = recallAds(inventory, request, strategy);
  const { rejected, filtered } = filterAds(recalled, request, strategy);
  const coarse = coarseRank(filtered, strategy, request.interests ?? interests);
  const fine = fineRank(coarse, strategy);
  const billing = calculateBilling(fine);

  return { recalled, rejected, filtered, coarse, fine, billing };
}

export { ads } from "./data";
export { defaultStrategy, interestOptions, interests } from "./config";
export { calculateBilling } from "./billing";
export { runAuction } from "./auction";
export { calculateEcpm, coarseRank, fineRank } from "./rank";
export { filterAds } from "./filter";
export { recallAds } from "./recall";
export type { Ad, AuctionResult, AuctionType, BillingMode, ChargeEvent, EngineResult, RankedAd, RequestProfile, StrategyConfig } from "./types";
