import type { StrategyConfig } from "./types";

// Demo profile covers every inventory category so the recall stage consistently
// starts with the canonical 50-ad pool; targeting is enforced in filtering.
export const interestOptions = ["数码科技", "旅行", "户外", "餐饮", "汽车", "教育", "生活", "美妆"];
export const interests = ["数码科技", "旅行", "户外", "教育", "美妆"];

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
