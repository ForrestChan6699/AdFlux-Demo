export type RequestProfile={city:string;device:string;scene:string;userId:string};
export type StrategyConfig={hotCtr:number;frequencyCap:number;coarseTopK:number;fineTopK:number;weights:{ctr:number;quality:number;bid:number;interest:number}};
export type BillingMode="CPM"|"CPC"|"CPA"|"oCPM";
export type Ad={id:string;brand:string;title:string;category:string;regions:string[];devices:string[];scenes:string[];billingMode:BillingMode;bid:number;ctr:number;cvr:number;quality:number;budget:number;frequency:number;status:"active"|"paused";color:string};
export type RankedAd=Ad&{recall:string[];coarseScore?:number;fineScore?:number;ecpm?:number;charge?:number;reason?:string};
export const defaultStrategy:StrategyConfig={hotCtr:.043,frequencyCap:5,coarseTopK:30,fineTopK:8,weights:{ctr:480,quality:32,bid:.8,interest:12}};
export const interests=["数码科技","旅行","户外"];
const categories=["数码科技","旅行","户外","餐饮","汽车","教育","生活","美妆"];
const brands=["NOVA","极光旅途","山野装备","青屿咖啡","云岚汽车","知遇课堂","植味生活","浮光美研","像素工场","漫游酒店"];
const titles=["新一代产品，限时体验价","周末出发，解锁城市新玩法","年度新品首发，预约享礼遇","轻盈升级，让体验快一步","品质之选，为生活增添灵感"];
const colors=["#dce8f5","#e7f0cf","#d7e8dc","#f2dfcc","#deded8","#f1e6b8","#e2ebcf","#eaddeb"];
const billingModes:BillingMode[]=["CPM","CPC","CPA","oCPM"];
export const ads:Ad[]=Array.from({length:240},(_,i)=>({
 id:`ad_${String(1000+i).padStart(4,"0")}`,brand:`${brands[i%brands.length]} ${Math.floor(i/brands.length)+1}`,title:titles[i%titles.length],category:categories[i%categories.length],
 regions:i%5===0?["全国"]:[["上海"],["杭州"],["北京"],["上海","杭州"]][i%4],devices:i%7===0?["Android"]:i%6===0?["iOS"]:["iOS","Android"],scenes:i%6===0?["视频流"]:i%5===0?["信息流","视频流"]:["信息流"],
 billingMode:billingModes[i%4],bid:+([15+(i*7%200)/10,.55+(i*11%70)/100,8+(i*13%180)/10,10+(i*17%220)/10][i%4]).toFixed(2),ctr:+(.021+(i*13%42)/1000).toFixed(3),cvr:+(.031+(i*7%61)/1000).toFixed(3),quality:+(.72+(i*11%27)/100).toFixed(2),budget:i%31===0?0:1800+(i*379%22000),frequency:i%9,status:i%37===0?"paused":"active",color:colors[i%colors.length]
}));
export function runEngine(req:RequestProfile,strategy:StrategyConfig=defaultStrategy){
 const recalled:RankedAd[]=ads.map(ad=>({...ad,recall:[...(ad.regions.includes(req.city)||ad.regions.includes("全国")?["定向召回"]:[]),...(interests.includes(ad.category)?["兴趣召回"]:[]),...(ad.ctr>=strategy.hotCtr?["热门召回"]:[])]})).filter(ad=>ad.recall.length);
 const rejected=recalled.map(ad=>{let reason="";if(ad.status!=="active")reason="广告已暂停";else if(!ad.devices.includes(req.device))reason="设备不匹配";else if(!ad.scenes.includes(req.scene))reason="场景不匹配";else if(!(ad.regions.includes(req.city)||ad.regions.includes("全国")))reason="地域不匹配";else if(ad.budget<=0)reason="预算已耗尽";else if(ad.frequency>=strategy.frequencyCap)reason="超过频控上限";return{...ad,reason};});
 const filtered=rejected.filter(ad=>!ad.reason);
 const w=strategy.weights;const coarse=filtered.map(ad=>({...ad,coarseScore:+(ad.ctr*w.ctr+ad.quality*w.quality+ad.bid*w.bid+(interests.includes(ad.category)?w.interest:0)).toFixed(2)})).sort((a,b)=>b.coarseScore-a.coarseScore).slice(0,strategy.coarseTopK);
 const fine=coarse.map(ad=>{const ecpm=ad.billingMode==="CPM"?ad.bid:ad.billingMode==="CPC"?ad.bid*ad.ctr*1000:ad.bid*ad.ctr*ad.cvr*1000;return{...ad,ecpm:+ecpm.toFixed(2),fineScore:+(ecpm*ad.quality).toFixed(3)}}).sort((a,b)=>b.fineScore-a.fineScore).slice(0,strategy.fineTopK);
 const winner=fine[0],runner=fine[1];const denominator=winner?.billingMode==="CPM"?1:winner?.billingMode==="CPC"?winner.ctr*1000:(winner?.ctr||0)*(winner?.cvr||0)*1000;const billing=winner?{...winner,charge:+Math.min(winner.bid,Math.max(.01,(runner?.ecpm||.01)/denominator+.01)).toFixed(2)}:undefined;
 return{recalled,rejected,filtered,coarse,fine,billing};
}
