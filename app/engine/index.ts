import { calculateBilling } from "./billing";
import { defaultStrategy, interests } from "./config";
import { ads } from "./data";
import { filterAds } from "./filter";
import { coarseRank, fineRank } from "./rank";
import { recallAds } from "./recall";
import type { EngineDiagnostics, EngineResult, RequestProfile, StrategyConfig } from "./types";

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

export function runEngineWithDiagnostics(
  inventory: import("./types").Ad[], request: RequestProfile,
  strategy: StrategyConfig = defaultStrategy,
): { result: EngineResult; diagnostics: EngineDiagnostics } {
  const started = performance.now();
  const recalled = recallAds(inventory, request, strategy); const recallAt = performance.now();
  const { rejected, filtered } = filterAds(recalled, request, strategy); const filterAt = performance.now();
  const coarse = coarseRank(filtered, strategy, request.interests ?? interests); const coarseAt = performance.now();
  const fine = fineRank(coarse, strategy); const fineAt = performance.now();
  const billing = calculateBilling(fine); const billingAt = performance.now();
  const countBy = (values: string[]) => values.reduce<Record<string, number>>((counts, value) => { counts[value] = (counts[value] ?? 0) + 1; return counts; }, {});
  return {
    result: { recalled, rejected, filtered, coarse, fine, billing },
    diagnostics: {
      timingsMs: { recall: recallAt - started, filter: filterAt - recallAt, coarse: coarseAt - filterAt, fine: fineAt - coarseAt, billing: billingAt - fineAt, total: billingAt - started },
      recallChannels: countBy(recalled.flatMap((ad) => ad.recall)),
      filterReasons: countBy(rejected.map((ad) => ad.reason ?? "").filter(Boolean)),
    },
  };
}

export { ads } from "./data";
export { defaultStrategy, interestOptions, interests } from "./config";
export { calculateBilling } from "./billing";
export { runAuction } from "./auction";
export { calculateEcpm, coarseRank, fineRank } from "./rank";
export { filterAds } from "./filter";
export { recallAds } from "./recall";
export type { Ad, AuctionResult, AuctionType, BillingMode, ChargeEvent, EngineDiagnostics, EngineResult, RankedAd, RequestProfile, StrategyConfig } from "./types";
