/**
 * GitHub Gist 推送脚本 — 将AI改写后的选题/二创数据推送到公开Gist
 * 用法: node push-gist.js
 *
 * 前置条件:
 *   - config.json 中有 github_token 和 gist_id
 *   - inspire.json 和 remix.json 已生成
 *
 * 如 gist_id 为空则自动创建新Gist
 */
const fs = require('fs');
const path = require('path');

const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const TOKEN = CONFIG.github_token;
let GIST_ID = CONFIG.gist_id || '';

if (!TOKEN) {
  console.error('❌ 请先在 config.json 中填入 github_token');
  process.exit(1);
}

// 读取AI改写后的数据
let inspireData, remixData;
try {
  inspireData = JSON.parse(fs.readFileSync(path.join(__dirname, 'inspire.json'), 'utf8'));
  remixData   = JSON.parse(fs.readFileSync(path.join(__dirname, 'remix.json'), 'utf8'));
} catch {
  console.error('❌ 未找到 inspire.json 或 remix.json，请先运行AI改写步骤');
  process.exit(1);
}

const GIST_API = 'https://api.github.com/gists';

async function ghAPI(url, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': `token ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'WorkBuddy-Creator-Workbench'
    }
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(url, opts);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`GitHub API ${resp.status}: ${err}`);
  }
  return resp.json();
}

async function main() {
  const dateStr = new Date().toISOString().split('T')[0];
  const description = `创作工作台数据 - ${dateStr}`;

  const files = {
    'inspire.json': {
      content: JSON.stringify(inspireData, null, 2)
    },
    'remix.json': {
      content: JSON.stringify(remixData, null, 2)
    }
  };

  if (GIST_ID) {
    // 更新已有 Gist
    console.log(`📝 更新 Gist: ${GIST_ID}`);
    await ghAPI(`${GIST_API}/${GIST_ID}`, 'PATCH', {
      description,
      files
    });
    console.log(`✅ Gist 已更新`);
    console.log(`   查看: https://gist.github.com/${GIST_ID}`);
  } else {
    // 创建新 Gist
    console.log('🆕 创建新 Gist...');
    const result = await ghAPI(GIST_API, 'POST', {
      description,
      public: true,
      files
    });
    GIST_ID = result.id;
    console.log(`✅ Gist 已创建`);
    console.log(`   ID: ${GIST_ID}`);
    console.log(`   链接: ${result.html_url}`);

    // 自动写回 config.json
    CONFIG.gist_id = GIST_ID;
    fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(CONFIG, null, 2), 'utf8');
    console.log('   📌 Gist ID 已写入 config.json');
  }

  // 同时输出一个文本摘要方便查看
  const summaryPath = path.join(__dirname, 'gist-summary.txt');
  let summary = `创作工作台 — ${dateStr} 数据更新\n`;
  summary += `================================\n\n`;
  summary += `📋 选题灵感 (${inspireData.length}条):\n`;
  inspireData.forEach((item, i) => {
    summary += `  ${i+1}. ${item.title}\n     ${item.desc}\n`;
  });
  summary += `\n🔥 二创角度 (${remixData.length}条):\n`;
  remixData.forEach((item, i) => {
    summary += `  ${i+1}. ${item.title} → ${item.angle}\n`;
  });
  fs.writeFileSync(summaryPath, summary, 'utf8');
  console.log(`   摘要: ${summaryPath}`);
}

main().catch(e => {
  console.error('❌ 推送失败:', e.message);
  process.exit(1);
});
