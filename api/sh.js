// SH 게시판 목록 스크래핑. 게시판은 SH_BOARDS 키만, page 는 1~100.
const { SH_BOARDS, shUrl, parseSh } = require('../lib');

module.exports = async (req, res) => {
  const inp = new URL(req.url, 'http://x').searchParams;
  const itm = Object.hasOwn(SH_BOARDS, inp.get('itm')) ? inp.get('itm') : '2';
  const page = Math.min(100, Math.max(1, parseInt(inp.get('page'), 10) || 1));
  try {
    const r = await fetch(shUrl(itm, page, inp.get('q')), { signal: AbortSignal.timeout(20000) });
    res.status(r.status).json({ items: parseSh(await r.text(), itm) });
  } catch (e) { res.status(502).json({ error: String(e) }); }
};
