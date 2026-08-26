import type { StrategyConfig } from "./types";

export const interests = ["数码科技", "旅行", "户外"];

export const defaultStrategy: StrategyConfig = {
  hotCtr: 0.043,
  frequencyCap: 5,
  coarseTopK: 30,
  fineTopK: 8,
  weights: {
    ctr: 480,
    quality: 32,
    bid: 0.8,
    interest: 12,
  },
};
