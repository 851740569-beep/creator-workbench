/**
 * 推送热点数据到 GitHub 仓库 — 通过 Contents API 更新 inspire.json / remix.json
 * 用法: node push-repo.js
 *
 * 前置条件:
 *   - config.json 中有 github_token (需 repo 权限)
 *   - inspire.json 和 remix.json 已生成
 */
const fs = require('fs');
const path = require('path');

const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const TOKEN = CONFIG.github_token;
const REPO = CONFIG.repo || '851740569-beep/creator-workbench';
const BRANCH = CONFIG.branch || 'master';

if (!TOKEN) { console.error('❌ 请先在 config.json 中填入 github_token'); process.exit(1); }

async function ghAPI(url, method, body) {
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

async function updateFile(filepath, content, message) {
  // 获取当前文件 sha（如果存在）
  const url = `https://api.github.com/repos/${REPO}/contents/${filepath}?ref=${BRANCH}`;
  let sha = '';
  try {
    const info = await ghAPI(url, 'GET', null);
    sha = info.sha;
  } catch(_) { /* 文件可能不存在，跳过 */ }

  const body = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch: BRANCH
  };
  if (sha) body.sha = sha;

  const result = await ghAPI(`https://api.github.com/repos/${REPO}/contents/${filepath}`, 'PUT', body);
  console.log(`✅ ${filepath} 已更新 (commit: ${result.commit.sha.slice(0,7)})`);
  return result;
}

async function main() {
  const inspireContent = fs.readFileSync(path.join(__dirname, 'inspire.json'), 'utf8');
  const remixContent   = fs.readFileSync(path.join(__dirname, 'remix.json'), 'utf8');
  const dateStr = new Date().toISOString().split('T')[0];

  console.log(`📦 推送数据到仓库: ${REPO} (${BRANCH})`);
  await updateFile('inspire.json', inspireContent, `data: 更新选题灵感 ${dateStr}`);
  await updateFile('remix.json', remixContent, `data: 更新二创角度 ${dateStr}`);
  console.log(`✅ 全部完成 → GitHub Pages 将自动部署`);
}

main().catch(e => { console.error('❌ 推送失败:', e.message); process.exit(1); });
