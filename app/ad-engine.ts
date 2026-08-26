export type RequestProfile = { city: string; device: string; scene: string; userId: string };
export type Ad = { id:string; brand:string; title:string; category:string; regions:string[]; devices:string[]; scenes:string[]; bid:number; ctr:number; cvr:number; quality:number; budget:number; frequency:number; status:"active"|"paused"; color:string };
export type RankedAd = Ad & { recall:string[]; coarseScore?:number; fineScore?:number; ecpm?:number; charge?:number; reason?:string };
const ads: Ad[] = [
  {id:"ad_1042",brand:"极光旅途",title:"周末飞往海岛，机票低至 ¥399",category:"旅行",regions:["上海","杭州"],devices:["iOS","Android"],scenes:["信息流"],bid:18.6,ctr:.038,cvr:.071,quality:.94,budget:8400,frequency:1,status:"active",color:"#e7f0cf"},
  {id:"ad_2088",brand:"NOVA",title:"新一代降噪耳机，安静再进化",category:"数码科技",regions:["全国"],devices:["iOS","Android"],scenes:["信息流","视频流"],bid:21.2,ctr:.045,cvr:.058,quality:.91,budget:12600,frequency:2,status:"active",color:"#dce8f5"},
  {id:"ad_3214",brand:"青屿咖啡",title:"夏日冷萃，两杯立减 15 元",category:"餐饮",regions:["上海"],devices:["iOS","Android"],scenes:["信息流"],bid:15.8,ctr:.052,cvr:.063,quality:.88,budget:3200,frequency:1,status:"active",color:"#f2dfcc"},
  {id:"ad_4096",brand:"云岚汽车",title:"智能纯电 SUV，预约试驾礼遇",category:"汽车",regions:["上海","杭州","北京"],devices:["iOS"],scenes:["信息流"],bid:28.4,ctr:.027,cvr:.082,quality:.96,budget:22600,frequency:3,status:"active",color:"#deded8"},
  {id:"ad_5110",brand:"像素工场",title:"AI 修图助手，让创作快一步",category:"数码科技",regions:["全国"],devices:["iOS"],scenes:["信息流","视频流"],bid:17.9,ctr:.047,cvr:.076,quality:.92,budget:7600,frequency:1,status:"active",color:"#e8ddf3"},
  {id:"ad_6227",brand:"山野装备",title:"轻量冲锋衣，去更远的地方",category:"户外",regions:["全国"],devices:["Android","iOS"],scenes:["信息流"],bid:16.4,ctr:.036,cvr:.054,quality:.85,budget:5100,frequency:4,status:"active",color:"#d7e8dc"},
  {id:"ad_7341",brand:"知遇课堂",title:"30 天掌握数据分析",category:"教育",regions:["全国"],devices:["Android","iOS"],scenes:["视频流"],bid:19.3,ctr:.031,cvr:.069,quality:.82,budget:6100,frequency:2,status:"active",color:"#f1e6b8"},
  {id:"ad_8065",brand:"漫游酒店",title:"城市度假套餐，住二晚赠早餐",category:"旅行",regions:["杭州","北京"],devices:["iOS"],scenes:["信息流"],bid:20.1,ctr:.041,cvr:.052,quality:.87,budget:0,frequency:1,status:"active",color:"#d7e9e7"},
  {id:"ad_9183",brand:"光年影像",title:"口袋相机，记录每一次出发",category:"数码科技",regions:["全国"],devices:["iOS","Android"],scenes:["信息流"],bid:22.5,ctr:.043,cvr:.048,quality:.89,budget:9800,frequency:6,status:"active",color:"#e5e1da"},
  {id:"ad_1290",brand:"植味生活",title:"每日鲜蔬直达餐桌",category:"生活",regions:["上海"],devices:["iOS","Android"],scenes:["信息流"],bid:13.6,ctr:.049,cvr:.044,quality:.84,budget:2800,frequency:2,status:"paused",color:"#e2ebcf"},
];
export const interests = ["数码科技","旅行","户外"];
export function runEngine(req: RequestProfile) {
  const recalled: RankedAd[] = ads.map(ad => ({...ad, recall:[...(ad.regions.includes(req.city)||ad.regions.includes("全国")?["定向召回"]:[]),...(interests.includes(ad.category)?["兴趣召回"]:[]),...(ad.ctr>=.043?["热门召回"]:[])]})).filter(ad=>ad.recall.length);
  const filtered = recalled.map(ad=>{let reason="";if(ad.status!=="active")reason="广告已暂停";else if(!ad.devices.includes(req.device))reason="设备不匹配";else if(!ad.scenes.includes(req.scene))reason="场景不匹配";else if(!(ad.regions.includes(req.city)||ad.regions.includes("全国")))reason="地域不匹配";else if(ad.budget<=0)reason="预算已耗尽";else if(ad.frequency>=5)reason="超过频控上限";return {...ad,reason};}).filter(ad=>!ad.reason);
  const coarse=filtered.map(ad=>({...ad,coarseScore:+(ad.ctr*480+ad.quality*32+ad.bid*.8+(interests.includes(ad.category)?12:0)).toFixed(2)})).sort((a,b)=>b.coarseScore-a.coarseScore).slice(0,5);
  const fine=coarse.map(ad=>({...ad,ecpm:+(ad.bid*ad.ctr*1000).toFixed(2),fineScore:+(ad.bid*ad.ctr*ad.cvr*ad.quality*10000).toFixed(3)})).sort((a,b)=>b.fineScore-a.fineScore).slice(0,3);
  const winner=fine[0],runner=fine[1]; const billing=winner?{...winner,charge:+Math.min(winner.bid,Math.max(.01,(runner?.ecpm||.01)/(winner.ctr*1000)+.01)).toFixed(2)}:undefined;
  return {recalled,filtered,coarse,fine,billing};
}
