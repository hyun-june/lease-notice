// "내 조건" 목록: 알림과 같은 규칙(lib.js)을 서버에서 적용한다
const { ymd, parseSh, shUrl, REGIONS, loadConfig, lhMine, shOn } = require('../lib');
const LH = 'https://k-skill-proxy.nomadamas.org/v1/lh-notice/search';
const get = url => fetch(url, { signal: AbortSignal.timeout(20000) }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r; });

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  let regions;
  try { ({ regions } = loadConfig()); }
  catch (e) { return res.status(500).json({ error: 'config', message: e.message, allRegions: REGIONS }); }

  const errors = [], items = [];
  const lh = get(`${LH}?panSs=${encodeURIComponent('공고중')}&pageSize=1000`).then(r => r.json()).then(d => {
    if (d.error) throw new Error(d.message || d.error);
    for (const i of (d.items || []).filter(i => lhMine(i, regions))) items.push({
      src: 'LH', title: i.pan_nm, url: i.detail_url || 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do', date: ymd(i.pan_dt), close: ymd(i.clsg_dt),
      region: i.cnp_cd_nm, type: i.ais_tp_cd_nm, status: i.pan_ss,
    });
  }).catch(e => errors.push({ source: 'LH', message: e.message }));
  const sh = shOn(regions) && get(shUrl('2', 1)).then(r => r.text()).then(h => {
    const rows = parseSh(h, '2');
    if (!rows.length) throw new Error('0건 (게시판 구조 변경 의심)');
    for (const i of rows) items.push({ src: 'SH', title: i.title, url: i.url, date: i.date, dept: i.dept, views: i.views });
  }).catch(e => errors.push({ source: 'SH', message: e.message }));
  await Promise.all([lh, sh]);

  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  res.status(200).json({ items, errors, regions, allRegions: REGIONS });
};
