/**
 * 热点采集脚本 v2 — 使用公开免费 API
 * 用法: node fetch-trends.js
 * 输出: trends-raw.json
 */
const fs = require('fs');
const path = require('path');

// ========== 配置 ==========
let config = {};
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch {
  config.niche_keywords = ['创作', '内容', '短视频'];
}
const KEYWORDS = config.niche_keywords || ['创作', '内容', '短视频'];

// ========== 工具函数 ==========
async function fetchJSON(url, opts = {}) {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        ...(opts.headers || {})
      },
      signal: AbortSignal.timeout(20000)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    return JSON.parse(text);
  } catch (e) {
    console.warn(`[WARN] ${url} — ${e.message}`);
    return null;
  }
}

async function fetchText(url) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(20000)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } catch (e) {
    console.warn(`[WARN] ${url} — ${e.message}`);
    return '';
  }
}

function relevanceScore(text, keywords) {
  const t = text.toLowerCase();
  let score = 0;
  keywords.forEach(kw => {
    const kl = kw.toLowerCase();
    if (t.includes(kl)) score += 5;
    // 部分匹配
    for (let i = 0; i < kl.length - 1; i++) {
      if (t.includes(kl.substring(i, i + 2))) { score += 1; break; }
    }
  });
  const hotWords = ['热点', '爆款', '流量', '涨粉', '变现', '算法', '推荐', '选题', '创作', '文案', '剪辑', '自媒体', '博主'];
  hotWords.forEach(w => { if (t.includes(w)) score += 1; });
  return score;
}

// ========== 数据源 ==========

// 1. 微博热搜 (TenAPI)
async function fetchWeiboV2() {
  console.log('[采集] 微博热搜 (TenAPI)...');
  const data = await fetchJSON('https://tenapi.cn/v2/weibohot');
  if (!data?.data) return [];
  return data.data.slice(0, 30).map(item => ({
    title: item.name || item.word || '',
    hot: parseInt(String(item.hot || item.num || '0').replace(/[^0-9]/g, '')) || 0,
    source: '微博热搜',
    url: `https://s.weibo.com/weibo?q=${encodeURIComponent(item.name || item.word || '')}`
  }));
}

// 2. 知乎热榜 (VVHAN)
async function fetchZhihuV2() {
  console.log('[采集] 知乎热榜 (VVHAN)...');
  const data = await fetchJSON('https://api.vvhan.com/api/hotlist/zhihuHot');
  if (!data?.data) return [];
  return data.data.slice(0, 30).map(item => ({
    title: item.title || item.name || '',
    hot: parseInt(String(item.hot || '0').replace(/[^0-9]/g, '')) || 0,
    source: '知乎热榜',
    url: item.url || item.mobilUrl || ''
  }));
}

// 3. 百度热搜 (VVHAN)
async function fetchBaiduV2() {
  console.log('[采集] 百度热搜 (VVHAN)...');
  const data = await fetchJSON('https://api.vvhan.com/api/hotlist/baiduRD');
  // This API might have different structure, try alternatives
  if (!data?.data) return [];
  return data.data.slice(0, 30).map(item => ({
    title: item.title || item.word || item.name || '',
    hot: parseInt(String(item.hotScore || item.hot || '0').replace(/[^0-9]/g, '')) || 0,
    source: '百度热搜',
    url: item.url || ''
  }));
}

// 4. 今日头条热搜
async function fetchToutiao() {
  console.log('[采集] 今日头条热搜...');
  const data = await fetchJSON('https://tenapi.cn/v2/toutiaohot');
  if (!data?.data) return [];
  return data.data.slice(0, 30).map(item => ({
    title: item.name || item.word || item.title || '',
    hot: parseInt(String(item.hot || item.num || '0').replace(/[^0-9]/g, '')) || 0,
    source: '头条热搜',
    url: `https://so.toutiao.com/search?keyword=${encodeURIComponent(item.name || '')}`
  }));
}

// 5. 抖音热搜
async function fetchDouyin() {
  console.log('[采集] 抖音热搜...');
  const data = await fetchJSON('https://tenapi.cn/v2/douyinhot');
  if (!data?.data) return [];
  return data.data.slice(0, 30).map(item => ({
    title: item.name || item.word || item.title || '',
    hot: parseInt(String(item.hot || item.num || '0').replace(/[^0-9]/g, '')) || 0,
    source: '抖音热搜',
    url: ''
  }));
}

// 6. 备用: news.qq.com 热点
async function fetchQQNews() {
  console.log('[采集] 腾讯新闻热点...');
  try {
    const html = await fetchText('https://news.qq.com/');
    const items = [];
    // 尝试匹配新闻标题
    const regex = /"title"\s*:\s*"([^"]+)"/g;
    let match;
    while ((match = regex.exec(html)) !== null && items.length < 30) {
      const title = match[1].trim();
      if (title.length > 4 && title.length < 80 && !title.startsWith('http')) {
        items.push({ title, hot: 0, source: '腾讯新闻', url: '' });
      }
    }
    // 如果上面没匹配到，尝试另一种模式
    if (items.length === 0) {
      const altRegex = /<a[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/gi;
      while ((match = altRegex.exec(html)) !== null && items.length < 30) {
        const title = match[1].trim();
        if (title.length > 4 && title.length < 80) {
          items.push({ title, hot: 0, source: '腾讯新闻', url: '' });
        }
      }
    }
    return items;
  } catch (e) {
    console.warn('[WARN] 腾讯新闻获取失败:', e.message);
    return [];
  }
}

// ========== 主流程 ==========
async function main() {
  console.log('🚀 开始采集热点数据...\n');

  const results = await Promise.all([
    fetchWeiboV2(),
    fetchZhihuV2(),
    fetchBaiduV2(),
    fetchToutiao(),
    fetchDouyin(),
    fetchQQNews(),
  ]);

  // 合并去重
  const seen = new Set();
  let allItems = [];
  results.forEach((list, i) => {
    const sources = ['微博', '知乎', '百度', '头条', '抖音', '腾讯新闻'];
    console.log(`   ${sources[i]}: ${list.length} 条`);
    list.forEach(item => {
      const key = item.title.substring(0, 20);
      if (!item.title || seen.has(key)) return;
      seen.add(key);
      allItems.push(item);
    });
  });

  console.log(`\n📊 去重后共 ${allItems.length} 条热点\n`);

  // 相关性打分
  allItems.forEach(item => {
    item._relevance = relevanceScore(item.title, KEYWORDS);
  });

  // 排序
  allItems.sort((a, b) => b._relevance - a._relevance || b.hot - a.hot);

  const relevant = allItems.filter(i => i._relevance > 0).slice(0, 20);
  const hotOnly = allItems.slice(0, 20);

  const output = {
    generated_at: new Date().toISOString(),
    niche_keywords: KEYWORDS,
    relevant_items: relevant,
    hot_items: hotOnly,
    all_items_count: allItems.length
  };

  const outPath = path.join(__dirname, 'trends-raw.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`✅ 已保存到 trends-raw.json`);
  console.log(`   高相关: ${relevant.length} 条`);
  console.log(`   最热榜: ${hotOnly.length} 条`);

  // 输出高相关摘要
  if (relevant.length > 0) {
    console.log('\n📌 与赛道相关热点:');
    relevant.slice(0, 5).forEach((item, i) => {
      console.log(`   ${i+1}. [${item.source}] ${item.title}`);
    });
  }
}

main().catch(e => {
  console.error('❌ 采集失败:', e.message);
  process.exit(1);
});
