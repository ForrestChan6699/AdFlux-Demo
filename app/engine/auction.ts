import type { AuctionResult, AuctionType, ChargeEvent, RankedAd } from "./types";

function chargeEventFor(ad: RankedAd): ChargeEvent {
  if (ad.billingMode === "CPC") return "click";
  if (ad.billingMode === "CPA") return "conversion";
  return "impression";
}

function unitPriceFromEcpm(ad: RankedAd, clearingEcpm: number): number {
  if (ad.billingMode === "CPM" || ad.billingMode === "oCPM") return clearingEcpm;
  if (ad.billingMode === "CPC") return clearingEcpm / (ad.ctr * 1000);
  return clearingEcpm / (ad.ctr * ad.cvr * 1000);
}

export function runAuction(
  rankedAds: RankedAd[],
  auctionType: AuctionType = "gsp",
  floorEcpm = 0,
): AuctionResult | undefined {
  const eligible = rankedAds.filter((ad) => (ad.ecpm ?? 0) >= floorEcpm);
  const winner = eligible[0];
  if (!winner) return undefined;

  const runnerUpEcpm = eligible[1]?.ecpm ?? floorEcpm;
  const winnerEcpm = winner.ecpm ?? 0;
  const clearingEcpm = auctionType === "first_price"
    ? winnerEcpm
    : Math.min(winnerEcpm, Math.max(floorEcpm, runnerUpEcpm + 0.01));
  const unitPrice = unitPriceFromEcpm(winner, clearingEcpm);
  const chargeEvent = chargeEventFor(winner);
  const eventCharge = chargeEvent === "impression" ? unitPrice / 1000 : unitPrice;

  return {
    winner: { ...winner, charge: Number(unitPrice.toFixed(4)) },
    auctionType,
    clearingEcpm: Number(clearingEcpm.toFixed(4)),
    unitPrice: Number(unitPrice.toFixed(4)),
    eventCharge: Number(eventCharge.toFixed(6)),
    chargeEvent,
  };
}
