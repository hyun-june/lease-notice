// notify.js · api/* 공통: SH 파싱, 설정 로드, "내 조건" 필터 규칙
const assert = require('assert');

// SH 공고 게시판: 탭마다 프로그램 경로가 다르다 (i-sh.co.kr 네비게이션 기준)
const SH_BOARDS = {
  '2':   ['S1T294C297', 'm_247'],  // 주택임대
  '1':   ['S1T294C296', 'm_244'],  // 주택분양
  '512': ['S1T294C3379', 'm_247'], // 주택매입
  '8':   ['S1T294C299', 'm_255'],  // 토지
  '16':  ['S1T294C300', 'm_256'],  // 상가/공장
  '4':   ['S1T294C298', 'm_248'],  // 입주안내
  '32':  ['S1T294C301', 'm_257'],  // 보상/이주
  '64':  ['S1T294C302', 'm_258'],  // 현상설계
  '256': ['S1T294C304', 'm_260'],  // 기타
};
const shUrl = (seq, page, word) => {
  const [prog, m] = SH_BOARDS[seq] || SH_BOARDS['2'];
  const u = new URL(`https://www.i-sh.co.kr/app/lay2/program/${prog}/www/brd/${m}/list.do`);
  u.searchParams.set('multi_itm_seq', seq);
  if (page) u.searchParams.set('page', page);
  if (word) { u.searchParams.set('srchWord', word); u.searchParams.set('srchTp', '0'); } // srchTp 없으면 SH가 srchWord를 무시함
  return u.toString();
};
const shDetail = (seq, itm) => {
  const [prog, m] = SH_BOARDS[itm] || SH_BOARDS['2'];
  return `https://www.i-sh.co.kr/app/lay2/program/${prog}/www/brd/${m}/view.do?multi_itm_seq=${itm}&seq=${seq}`;
};

const text = h => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function parseSh(html, itm) {
  const body = html.split('<tbody')[1] || '';
  return body.split('<tr').slice(1).map(row => {
    const m = row.match(/getDetailView\('(\d+)'\)/);
    if (!m) return null;
    const a = row.match(/<a[^>]*getDetailView[\s\S]*?<\/a>/);
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => text(x[1]));
    const title = a ? text(a[0].replace(/<span class="icoNew">[\s\S]*?<\/span>/, '')) : '';
    const date = tds.find(t => /^\d{4}-\d{2}-\d{2}$/.test(t)) || '';
    return { seq: m[1], title, dept: tds[2] || '', date, views: tds[tds.length - 1] || '', url: shDetail(m[1], itm) };
  }).filter(Boolean);
}

// LH는 20260921 / 2026.10.16 두 형식이 섞여 내려온다
const ymd = s => { const d = String(s || '').replace(/[.\-]/g, ''); return d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}` : (s || ''); };

// 시도명 단일 출처 (뷰어 지역 목록도 /api/mine 으로 이걸 받는다)
const REGIONS = ['서울특별시','경기도','인천광역시','부산광역시','대구광역시','대전광역시','울산광역시','세종특별자치시','강원특별자치도','충청북도','충청남도','전북특별자치도','전남광주통합특별시','경상북도','경상남도','제주특별자치도'];

function loadConfig() {
  const c = require('./config.json'); // 정적 require → Vercel 번들에 포함됨
  if (!c || !Array.isArray(c.regions)) throw new Error('config.json: regions 는 배열이어야 합니다');
  const bad = c.regions.filter(r => !REGIONS.includes(r));
  if (bad.length) throw new Error(`config.json: 알 수 없는 지역 ${bad.join(', ')} (허용: ${REGIONS.join(', ')})`);
  return c;
}

// 상위 유형명은 프록시가 raw.UPP_AIS_TP_NM 에만 준다
const RENT = ['임대주택', '주거복지'];
const lhMine = (i, regions) => {
  const reg = i.cnp_cd_nm || '';
  const regionOk = !regions.length || reg.includes('전국') || regions.some(r => reg.includes(r));
  const upp = i.upp_ais_tp_nm || i.raw?.UPP_AIS_TP_NM || '';
  const typeOk = RENT.includes(upp) || (i.ais_tp_cd_nm || '').includes('행복주택'); // 행복주택(신혼희망)은 상위가 공공분양(신혼희망)
  return regionOk && typeOk;
};

const shOn = regions => !regions.length || regions.includes('서울특별시');

module.exports = { SH_BOARDS, shUrl, shDetail, text, parseSh, ymd, REGIONS, loadConfig, lhMine, shOn };

if (require.main === module) {
  const R = ['서울특별시', '경기도', '인천광역시'];
  const t = (reg, upp, typ) => ({ cnp_cd_nm: reg, ais_tp_cd_nm: typ, raw: { UPP_AIS_TP_NM: upp } });
  assert(lhMine(t('서울특별시', '임대주택', '국민임대'), R));
  assert(lhMine(t('인천광역시', '임대주택', '행복주택'), R));
  assert(lhMine(t('경기도', '공공분양(신혼희망)', '행복주택(신혼희망)'), R));
  assert(lhMine(t('인천광역시 외', '주거복지', '매입임대'), R));
  assert(lhMine(t('전국', '주거복지', '매입임대'), R));
  assert(lhMine({ cnp_cd_nm: '서울특별시', ais_tp_cd_nm: '국민임대', upp_ais_tp_nm: '임대주택' }, R));
  assert(!lhMine(t('경기도', '토지', '토지'), R));
  assert(!lhMine(t('경기도', '상가', '임대상가(입찰)'), R));
  assert(!lhMine(t('서울특별시', '분양주택', '분양주택'), R));
  assert(!lhMine(t('경기도', '공공분양(신혼희망)', '공공분양(신혼희망)'), R));
  assert(!lhMine(t('부산광역시', '임대주택', '국민임대'), R));
  assert(lhMine(t('부산광역시', '임대주택', '국민임대'), []));
  assert(shOn(R) && shOn([]) && !shOn(['경기도']));
  assert(Array.isArray(loadConfig().regions));
  console.log('ok');
}
