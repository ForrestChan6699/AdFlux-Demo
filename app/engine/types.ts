export type RequestProfile = {
  city: string;
  device: string;
  scene: string;
  userId: string;
  interests?: string[];
};

export type StrategyConfig = {
  hotCtr: number;
  frequencyCap: number;
  coarseTopK: number;
  fineTopK: number;
  weights: {
    ctr: number;
    quality: number;
    bid: number;
    interest: number;
  };
};

export type BillingMode = "CPM" | "CPC" | "CPA" | "oCPM";
export type AuctionType = "first_price" | "gsp";
export type ChargeEvent = "impression" | "click" | "conversion";

export type Ad = {
  id: string;
  brand: string;
  title: string;
  category: string;
  regions: string[];
  devices: string[];
  scenes: string[];
  billingMode: BillingMode;
  bid: number;
  ctr: number;
  cvr: number;
  quality: number;
  budget: number;
  frequency: number;
  status: "active" | "paused";
  color: string;
};

export type RankedAd = Ad & {
  recall: string[];
  coarseScore?: number;
  fineScore?: number;
  ecpm?: number;
  charge?: number;
  reason?: string;
};

export type EngineResult = {
  recalled: RankedAd[];
  rejected: RankedAd[];
  filtered: RankedAd[];
  coarse: RankedAd[];
  fine: RankedAd[];
  billing?: RankedAd;
};

export type EngineDiagnostics = {
  timingsMs: { recall: number; filter: number; coarse: number; fine: number; billing: number; total: number };
  recallChannels: Record<string, number>;
  filterReasons: Record<string, number>;
};

export type AuctionResult = {
  winner: RankedAd;
  runnerUp?: RankedAd;
  winnerEcpm: number;
  runnerUpEcpm: number;
  auctionType: AuctionType;
  clearingEcpm: number;
  unitPrice: number;
  eventCharge: number;
  chargeEvent: ChargeEvent;
};
