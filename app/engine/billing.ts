import type { RankedAd } from "./types";
import { runAuction } from "./auction";

export function calculateBilling(rankedAds: RankedAd[]): RankedAd | undefined {
  return runAuction(rankedAds, "gsp")?.winner;
}
