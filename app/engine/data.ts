import type { Ad, BillingMode } from "./types";

const categories = ["数码科技", "旅行", "户外", "餐饮", "汽车", "教育", "生活", "美妆"];
const brands = ["NOVA", "极光旅途", "山野装备", "青屿咖啡", "云岚汽车", "知遇课堂", "植味生活", "浮光美研", "像素工场", "漫游酒店"];
const titles = ["新一代产品，限时体验价", "周末出发，解锁城市新玩法", "年度新品首发，预约享礼遇", "轻盈升级，让体验快一步", "品质之选，为生活增添灵感"];
const colors = ["#dce8f5", "#e7f0cf", "#d7e8dc", "#f2dfcc", "#deded8", "#f1e6b8", "#e2ebcf", "#eaddeb"];
const billingModes: BillingMode[] = ["CPM", "CPC", "CPA", "oCPM"];

function createBid(index: number, mode: BillingMode): number {
  const bids = {
    CPM: 15 + ((index * 7) % 200) / 10,
    CPC: 0.55 + ((index * 11) % 70) / 100,
    CPA: 8 + ((index * 13) % 180) / 10,
    oCPM: 10 + ((index * 17) % 220) / 10,
  };
  return Number(bids[mode].toFixed(2));
}

function createAd(index: number): Ad {
  const billingMode = billingModes[index % billingModes.length];
  return {
    id: `ad_${String(1000 + index).padStart(4, "0")}`,
    brand: `${brands[index % brands.length]} ${Math.floor(index / brands.length) + 1}`,
    title: titles[index % titles.length],
    category: categories[index % categories.length],
    regions: index % 5 === 0 ? ["全国"] : [["上海"], ["杭州"], ["北京"], ["上海", "杭州"]][index % 4],
    devices: index % 7 === 0 ? ["Android"] : index % 6 === 0 ? ["iOS"] : ["iOS", "Android"],
    scenes: index % 6 === 0 ? ["视频流"] : index % 5 === 0 ? ["信息流", "视频流"] : ["信息流"],
    billingMode,
    bid: createBid(index, billingMode),
    ctr: Number((0.021 + ((index * 13) % 42) / 1000).toFixed(3)),
    cvr: Number((0.031 + ((index * 7) % 61) / 1000).toFixed(3)),
    quality: Number((0.72 + ((index * 11) % 27) / 100).toFixed(2)),
    budget: index % 31 === 0 ? 0 : 1800 + ((index * 379) % 22000),
    frequency: index % 9,
    status: "active",
    color: colors[index % colors.length],
  };
}

export const ads: Ad[] = Array.from({ length: 100 }, (_, index) => createAd(index));
