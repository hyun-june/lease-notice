#!/usr/bin/env node
// LH + SH 신규 임대공고 → 카카오톡 "나에게 보내기". 의존성 0개, Node 20 내장 fetch만 사용.
const fs = require('fs');
const path = require('path');
const { shUrl, parseSh, ymd, loadConfig, lhMine, shOn } = require('./lib');

const SEEN_PATH = path.join(__dirname, 'seen.json');
const LH_API = 'https://k-skill-proxy.nomadamas.org/v1/lh-notice/search';
const LH_LIST_URL = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do';
const MAX_SEND = 5;
const KEEP = 500;

const dday = c => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c || '')) return ''; // 파싱 불가한 clsg_dt → 마감줄 생략
  const n = Math.ceil((new Date(c + 'T00:00:00+09:00') - Date.now()) / 864e5);
  return Number.isNaN(n) ? '' : n < 0 ? '마감' : n === 0 ? '오늘 마감' : `D-${n}`;
};

// 두 목록을 번갈아 뽑아 한쪽이 발송 슬롯을 독점하지 못하게 한다
const roundRobin = (a, b) => {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
};

const TIMEOUT = () => AbortSignal.timeout(30000);

const form = o => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clip = (s, n = 200) => (s.length <= n ? s : s.slice(0, n - 1) + '…');

async function refreshToken(key, refresh) {
  const r = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ grant_type: 'refresh_token', client_id: key, refresh_token: refresh }),
    signal: TIMEOUT(),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error(`토큰 갱신 실패: ${r.status} ${JSON.stringify(d)}`);
  // refresh_token은 잔여 유효기간 1개월 미만일 때만 함께 내려온다
  if (d.refresh_token && process.env.GITHUB_OUTPUT) {
    // step output 은 secrets.* 와 달리 자동 마스킹되지 않는다 → 직접 마스크 등록
    console.log('::add-mask::' + d.refresh_token);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `new_refresh_token=${d.refresh_token}\n`);
    console.log('갱신된 refresh_token 수신 → GITHUB_OUTPUT 기록');
  }
  return d.access_token;
}

// 원본 items 반환 (0건 판정은 필터 전 기준)
async function fetchLhRaw() {
  // 지역 필터는 LH가 지원하지 않아 전량 받은 뒤 걸러야 한다 → 공고중 전체를 받는다
  const r = await fetch(`${LH_API}?panSs=${encodeURIComponent('공고중')}&pageSize=1000`, { signal: TIMEOUT() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(d.message || d.error);
  const items = d.items || [];
  if (items.length >= 1000) console.warn(`경고: LH 결과가 ${items.length}건 → pageSize 1000 한도에 걸려 누락됐을 수 있습니다.`);
  return items;
}

const lhAlerts = (items, regions) =>
  items.filter(i => i.pan_id && lhMine(i, regions)).map(i => { // id 없으면 버린다 (seen 오염 방지)
    const close = ymd(i.clsg_dt), dd = dday(close);
    return {
      src: 'LH',
      id: String(i.pan_id),
      url: i.detail_url || LH_LIST_URL,
      text: [
        `[LH] ${[i.cnp_cd_nm, i.ais_tp_cd_nm].filter(Boolean).join(' · ')}`,
        i.pan_nm,
        dd ? `마감 ${close} (${dd})` : '',
      ].filter(Boolean).join('\n'),
    };
  });

async function fetchShBoard() {
  const r = await fetch(shUrl('2', 1, null), { signal: TIMEOUT() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseSh(await r.text(), '2').filter(i => i.seq).map(i => ({
    src: 'SH',
    id: String(i.seq),
    url: i.url,
    text: [`[SH] 주택임대`, i.title, i.date ? `등록 ${i.date}` : ''].filter(Boolean).join('\n'),
  }));
}

async function send(token, body, url) {
  const template = JSON.stringify({
    object_type: 'text',
    text: clip(body),
    link: { web_url: url, mobile_web_url: url },
    button_title: '공고 보기',
  });
  try {
    const r = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: `template_object=${encodeURIComponent(template)}`,
      signal: TIMEOUT(),
    });
    if (!r.ok) { console.error(`전송 실패 ${r.status}: ${await r.text()}`); return false; }
    return true;
  } catch (e) {
    // 네트워크 예외로 루프가 죽으면 이미 보낸 건이 seen 에 안 남아 재발송된다
    console.error('전송 예외:', e.message);
    return false;
  }
}

async function main() {
  const { regions } = loadConfig(); // 설정이 깨졌으면 여기서 실패로 끝낸다

  const key = process.env.KAKAO_REST_KEY;
  const refresh = process.env.KAKAO_REFRESH_TOKEN;
  if (!key || !refresh) {
    console.error('환경변수 KAKAO_REST_KEY / KAKAO_REFRESH_TOKEN 가 필요합니다. README의 시크릿 등록 단계를 확인하세요.');
    process.exit(1);
  }

  // 신규가 0건이어도 매번 갱신해야 refresh_token 회전이 끊기지 않는다
  const token = await refreshToken(key, refresh);

  const seen = fs.existsSync(SEEN_PATH) ? JSON.parse(fs.readFileSync(SEEN_PATH, 'utf8')) : {};
  const seenLh = new Set(seen.lh || []);
  const seenSh = new Set(seen.sh || []);

  // 한쪽이 죽어도 다른 쪽은 보낸다 (fail-soft). 실패/0건 소스는 seen 을 건드리지 않고, 끝에 실행을 실패 처리한다
  const failed = [];
  let lh = [], sh = [];
  try {
    const raw = await fetchLhRaw();
    if (!raw.length) failed.push('LH: 0건');
    else lh = lhAlerts(raw, regions).filter(i => !seenLh.has(i.id)); // 필터 밖 공고는 seen 에 안 남는다
  } catch (e) { failed.push('LH: ' + e.message); }
  if (shOn(regions)) {
    try {
      const r = await fetchShBoard();
      if (!r.length) failed.push('SH: 0건 (게시판 구조 변경 의심)');
      else sh = r.filter(i => !seenSh.has(i.id));
    } catch (e) { failed.push('SH: ' + e.message); }
  }

  // LH 물량이 SH 슬롯을 굶기지 않도록 번갈아 배치
  const all = roundRobin(lh, sh);
  console.log(`지역 ${regions.join(', ') || '전국'} / LH 신규 ${lh.length}건 / SH 신규 ${sh.length}건`);

  let sent = 0;
  const recorded = new Set();
  for (const item of all.slice(0, MAX_SEND)) {
    if (sent) await sleep(300);
    if (await send(token, item.text, item.url)) { sent++; recorded.add(item.id); }
  }
  const rest = all.slice(MAX_SEND);
  if (rest.length) {
    await sleep(300);
    const a = rest.filter(i => i.src === 'LH').length, b = rest.length - a;
    // 요약 전송이 실패하면 초과분은 기록하지 않는다 (조용한 유실 방지)
    if (await send(token, `외 ${rest.length}건 더 있음 (LH ${a}건 · SH ${b}건)`, a ? LH_LIST_URL : shUrl('2'))) {
      sent++;
      rest.forEach(i => recorded.add(i.id));
    } else console.error(`요약 전송 실패 → 초과 ${rest.length}건은 다음 실행에 재시도`);
  }

  // 전송(또는 요약)에 성공한 건만 기록 → 실패분은 다음 실행에 재시도
  const merge = (old, add) => [...(old || []), ...add.filter(i => recorded.has(i.id)).map(i => i.id)].slice(-KEEP);
  if (all.length) fs.writeFileSync(SEEN_PATH, JSON.stringify({ lh: merge(seen.lh, lh), sh: merge(seen.sh, sh) }, null, 0) + '\n');

  console.log(`전송 ${sent}건`);
  if (failed.length) {
    // 실행을 실패로 표시해야 GitHub 이 메일로 알려준다
    console.error('조회 실패 → 실행을 실패 처리합니다:\n  ' + failed.join('\n  '));
    process.exitCode = 1;
  }
  if (all.length && !sent) {
    // 권한 누락·토큰 문제로 전부 실패하면 조용히 재시도만 반복된다
    console.error('카카오 전송이 전부 실패 → 실행을 실패 처리합니다');
    process.exitCode = 1;
  }
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

