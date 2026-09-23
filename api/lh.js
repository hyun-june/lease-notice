// LH 공고 검색 (프록시 경유). 허용 파라미터만 넘긴다.
const { ymd } = require('../lib');
const LH = 'https://k-skill-proxy.nomadamas.org/v1/lh-notice/search';

module.exports = async (req, res) => {
  const inp = new URL(req.url, 'http://x').searchParams, p = new URLSearchParams();
  for (const k of ['q', 'uppAisTpCd', 'panSs', 'cnpCdNm']) if (inp.get(k)) p.set(k, inp.get(k));
  if (inp.has('pageSize')) p.set('pageSize', Math.min(1000, Math.max(1, parseInt(inp.get('pageSize'), 10) || 1000)));
  const region = p.get('cnpCdNm');
  try {
    const r = await fetch(LH + '?' + p, { signal: AbortSignal.timeout(20000) });
    const d = await r.json();
    const rows = region ? (d.items || []).filter(i => (i.cnp_cd_nm || '').includes(region)) : (d.items || []);
    res.status(r.status).json({
      items: rows.map(i => ({
        title: i.pan_nm, region: i.cnp_cd_nm, type: i.ais_tp_cd_nm, status: i.pan_ss,
        date: ymd(i.pan_dt), close: ymd(i.clsg_dt), url: i.detail_url, id: i.pan_id,
      })),
      total: region ? rows.length : (d.summary?.total_count ?? d.items?.[0]?.raw?.ALL_CNT ?? null), error: d.error, message: d.message,
    });
  } catch (e) { res.status(502).json({ error: String(e) }); }
};
