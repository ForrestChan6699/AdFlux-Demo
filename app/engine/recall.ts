import { interests as defaultInterests } from "./config";
import type { Ad, RankedAd, RequestProfile, StrategyConfig } from "./types";

function getRecallChannels(ad: Ad, request: RequestProfile, strategy: StrategyConfig): string[] {
  const channels: string[] = [];
  if (ad.regions.includes(request.city) || ad.regions.includes("全国")) channels.push("定向召回");
  if ((request.interests ?? defaultInterests).includes(ad.category)) channels.push("兴趣召回");
  if (ad.ctr >= strategy.hotCtr) channels.push("热门召回");
  return channels;
}

export function recallAds(ads: Ad[], request: RequestProfile, strategy: StrategyConfig): RankedAd[] {
  return ads
    .map((ad) => ({ ...ad, recall: getRecallChannels(ad, request, strategy) }))
    .filter((ad) => ad.recall.length > 0);
}
