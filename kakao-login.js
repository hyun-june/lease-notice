#!/usr/bin/env node
// 최초 1회 로컬 실행: node kakao-login.js <REST_API_KEY>
const http = require('http');
const { exec } = require('child_process');

const KEY = process.argv[2];
if (!KEY) { console.error('사용법: node kakao-login.js <REST_API_KEY>'); process.exit(1); }

const REDIRECT = 'http://localhost:3000/oauth';
const AUTH = `https://kauth.kakao.com/oauth/authorize?client_id=${KEY}&redirect_uri=${REDIRECT}&response_type=code&scope=talk_message`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');
  if (url.pathname !== '/oauth') { res.writeHead(404).end(); return; }
  const code = url.searchParams.get('code');
  const reply = (msg) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<meta charset="utf-8"><h2>${msg}</h2>`); };

  if (!code) {
    reply('인증 코드가 없습니다. 터미널을 확인하세요.');
    console.error('콜백에 code 없음:', url.search);
    return server.close(() => process.exit(1));
  }

  const r = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=authorization_code&client_id=${encodeURIComponent(KEY)}&redirect_uri=${encodeURIComponent(REDIRECT)}&code=${encodeURIComponent(code)}`,
  });
  const body = await r.text();
  if (!r.ok) {
    reply('토큰 교환 실패. 터미널을 확인하세요.');
    console.error(`\n토큰 교환 실패 (HTTP ${r.status}):\n${body}\n`);
    return server.close(() => process.exit(1));
  }

  const d = JSON.parse(body);
  reply('발급 완료! 터미널로 돌아가세요.');
  console.log('\n' + '='.repeat(60));
  console.log('REFRESH TOKEN:\n');
  console.log('  ' + d.refresh_token);
  console.log('\n' + '='.repeat(60));
  console.log('\n아래 3줄을 그대로 복붙하세요 (GH_PAT은 본인 값으로 교체):\n');
  console.log(`gh secret set KAKAO_REST_KEY -R hyun-june/lease-notice --body "${KEY}"`);
  console.log(`gh secret set KAKAO_REFRESH_TOKEN -R hyun-june/lease-notice --body "${d.refresh_token}"`);
  console.log(`gh secret set GH_PAT -R hyun-june/lease-notice --body "<fine-grained PAT>"`);
  console.log('');
  server.close(() => process.exit(0));
});

server.listen(3000, () => {
  console.log('브라우저에서 카카오 로그인 후 동의하세요:\n' + AUTH + '\n');
  exec(`open "${AUTH}"`);
});
