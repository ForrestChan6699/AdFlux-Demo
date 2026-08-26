import type { RankedAd, RequestProfile, StrategyConfig } from "./types";

function getFilterReason(ad: RankedAd, request: RequestProfile, strategy: StrategyConfig): string {
  if (ad.status !== "active") return "广告已暂停";
  if (!ad.devices.includes(request.device)) return "设备不匹配";
  if (!ad.scenes.includes(request.scene)) return "场景不匹配";
  if (!ad.regions.includes(request.city) && !ad.regions.includes("全国")) return "地域不匹配";
  if (ad.budget <= 0) return "预算已耗尽";
  if (ad.frequency >= strategy.frequencyCap) return "超过频控上限";
  return "";
}

export function filterAds(ads: RankedAd[], request: RequestProfile, strategy: StrategyConfig) {
  const rejected = ads.map((ad) => ({ ...ad, reason: getFilterReason(ad, request, strategy) }));
  const filtered = rejected.filter((ad) => !ad.reason);
  return { rejected, filtered };
}
