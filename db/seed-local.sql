PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO placements (id, name, auction_type, floor_ecpm, slots, status) VALUES
  ('feed_home', '首页信息流', 'gsp', 8.00, 1, 'active'),
  ('video_recommend', '推荐视频流', 'first_price', 12.00, 1, 'active');

INSERT OR IGNORE INTO advertisers (id, name, balance, status) VALUES
  ('adv_nova', 'NOVA 科技', 284630.00, 'active'),
  ('adv_aurora', '极光旅途', 168200.00, 'active'),
  ('adv_coffee', '青屿咖啡', 82500.00, 'active'),
  ('adv_auto', '云岚汽车', 520000.00, 'active');

INSERT OR IGNORE INTO campaigns
  (id, advertiser_id, name, daily_budget, spent, status)
VALUES
  ('cmp_nova_summer', 'adv_nova', 'NOVA 夏季新品增长', 120000.00, 68420.00, 'active'),
  ('cmp_aurora_weekend', 'adv_aurora', '极光周末出游', 80000.00, 52280.00, 'active'),
  ('cmp_coffee_coldbrew', 'adv_coffee', '青屿冷萃城市计划', 45000.00, 34720.00, 'active'),
  ('cmp_auto_testdrive', 'adv_auto', '云岚 SUV 试驾季', 260000.00, 191600.00, 'active');

INSERT OR IGNORE INTO ads
  (id, campaign_id, brand, title, category, regions, devices, scenes,
   billing_mode, bid, ctr, cvr, quality, budget, frequency, status, color)
VALUES
  ('local_ad_001', 'cmp_nova_summer', 'NOVA', '新一代降噪耳机，安静再进化', '数码科技', '["全国"]', '["iOS","Android"]', '["信息流","视频流"]', 'CPM', 28.00, 0.045, 0.058, 0.91, 12600, 2, 'active', '#dce8f5'),
  ('local_ad_002', 'cmp_nova_summer', 'NOVA', '旗舰手机影像升级，预约享礼遇', '数码科技', '["上海","杭州"]', '["iOS","Android"]', '["信息流"]', 'CPC', 1.20, 0.052, 0.061, 0.94, 18400, 1, 'active', '#d7e8dc'),
  ('local_ad_003', 'cmp_nova_summer', '像素工场', 'AI 修图助手，让创作快一步', '数码科技', '["全国"]', '["iOS"]', '["信息流"]', 'CPA', 22.00, 0.047, 0.076, 0.92, 7600, 1, 'active', '#e8ddf3'),
  ('local_ad_004', 'cmp_aurora_weekend', '极光旅途', '周末飞往海岛，机票低至 ¥399', '旅行', '["上海","杭州"]', '["iOS","Android"]', '["信息流"]', 'oCPM', 68.00, 0.038, 0.071, 0.94, 8400, 1, 'active', '#e7f0cf'),
  ('local_ad_005', 'cmp_aurora_weekend', '漫游酒店', '城市度假套餐，住二晚赠早餐', '旅行', '["上海","北京"]', '["iOS"]', '["信息流"]', 'CPC', 0.96, 0.041, 0.052, 0.87, 9200, 3, 'active', '#d7e9e7'),
  ('local_ad_006', 'cmp_aurora_weekend', '山野装备', '轻量冲锋衣，去更远的地方', '户外', '["全国"]', '["iOS","Android"]', '["信息流"]', 'CPM', 19.50, 0.036, 0.054, 0.85, 5100, 4, 'active', '#d7e8dc'),
  ('local_ad_007', 'cmp_coffee_coldbrew', '青屿咖啡', '夏日冷萃，两杯立减 15 元', '餐饮', '["上海"]', '["iOS","Android"]', '["信息流"]', 'CPA', 18.00, 0.052, 0.063, 0.88, 3200, 1, 'active', '#f2dfcc'),
  ('local_ad_008', 'cmp_coffee_coldbrew', '青屿咖啡', '城市限定早餐，会员专享', '餐饮', '["杭州"]', '["iOS","Android"]', '["信息流"]', 'oCPM', 42.00, 0.049, 0.068, 0.90, 4300, 2, 'active', '#f1e6b8'),
  ('local_ad_009', 'cmp_coffee_coldbrew', '植味生活', '每日鲜蔬直达餐桌', '生活', '["上海"]', '["iOS","Android"]', '["信息流"]', 'CPC', 0.72, 0.049, 0.044, 0.84, 2800, 2, 'paused', '#e2ebcf'),
  ('local_ad_010', 'cmp_auto_testdrive', '云岚汽车', '智能纯电 SUV，预约试驾礼遇', '汽车', '["上海","杭州","北京"]', '["iOS"]', '["信息流"]', 'CPA', 120.00, 0.027, 0.082, 0.96, 22600, 3, 'active', '#deded8'),
  ('local_ad_011', 'cmp_auto_testdrive', '云岚汽车', '城市智驾体验日，限量开放', '汽车', '["全国"]', '["iOS","Android"]', '["视频流"]', 'oCPM', 95.00, 0.031, 0.069, 0.93, 19800, 1, 'active', '#dce8f5'),
  ('local_ad_012', 'cmp_auto_testdrive', '云岚汽车', '家庭纯电新选择', '汽车', '["全国"]', '["iOS","Android"]', '["信息流"]', 'CPM', 32.00, 0.033, 0.057, 0.89, 15600, 6, 'active', '#e5e1da');

INSERT OR IGNORE INTO ad_requests
  (id, user_id, placement_id, city, device, scene, recalled_count,
   filtered_count, winner_ad_id, charge, result_json, created_at)
VALUES
  ('local_req_001', 'u_90382', 'feed_home', '上海', 'iOS', '信息流', 10, 7, 'local_ad_004', 52.36, '{"coarseCount":7,"fineCount":5,"billingMode":"oCPM"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-20 minutes')),
  ('local_req_002', 'u_18420', 'feed_home', '杭州', 'Android', '信息流', 9, 5, 'local_ad_002', 0.88, '{"coarseCount":5,"fineCount":5,"billingMode":"CPC"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes')),
  ('local_req_003', 'u_66731', 'video_recommend', '北京', 'iOS', '视频流', 8, 4, 'local_ad_011', 78.42, '{"coarseCount":4,"fineCount":4,"billingMode":"oCPM"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')),
  ('local_req_004', 'u_40128', 'feed_home', '上海', 'Android', '信息流', 11, 6, 'local_ad_007', 14.60, '{"coarseCount":6,"fineCount":6,"billingMode":"CPA"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 minutes')),
  ('local_req_005', 'u_90382', 'feed_home', '上海', 'iOS', '信息流', 10, 7, 'local_ad_001', 24.80, '{"coarseCount":7,"fineCount":7,"billingMode":"CPM"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

PRAGMA optimize;
