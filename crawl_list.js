/**
 * crawl_list.js —— 指定一欄（含分頁），僅抓「每日例行記者會／文字實錄」，日期優先過濾
 *
 * 預設：t0=2022-08-04、before=30、after=0、out=E20220804_b30.csv
 * 用法：
 *   node crawl_list.js
 *   node crawl_list.js <t0 YYYY-MM-DD> <beforeDays> <afterDays> <out.csv>
 */

"use strict";

const { JSDOM } = require("jsdom");
const iconv = require("iconv-lite");
const { format: csvFormat } = require("@fast-csv/format");
const { parseISO, isValid, subDays, addDays, isBefore, isAfter } = require("date-fns");
const fs = require("fs");

const UA = "Mozilla/5.0 (compatible; NCI-research-crawler/1.5; +https://example.org)";
const ACCEPT_LANG = "zh-CN,zh;q=0.9,en;q=0.6";

// ─────────────────────────────────────────────────────────────
// 只針對你指定的「外交部例行記者會」欄位；自動探索 index 分頁
// ─────────────────────────────────────────────────────────────
const LIST_SEEDS = [
  {
    source: "外交部",
    seed: "https://www.mfa.gov.cn/web/wjdt_674879/fyrbt_674889/index_21.shtml",
    allowReg: /\/web\/wjdt_674879\/fyrbt_674889\/index(?:_\d+)?\.shtml$/i,
    fallbackGen: (dir) =>
      Array.from({ length: 120 }, (_, i) =>
        i === 0 ? `${dir}/index.shtml` : `${dir}/index_${i}.shtml`
      ),
  },
];

const MAX_LIST_PAGES = 150;
const MAX_ANCHORS_PER_PAGE = 1200;

// 僅限「每日例行記者會／文字實錄」相關
const PRESSER_KEYWORDS = /(例行记者会|例行記者會|發言人|发言人|文字實錄|文字实录|新聞發布會|新闻发布会)/i;
// 欄目代碼也可作為「文字實錄/發言人」線索
const COLUMN_HINTS = /(fyrbt|jzhsl|xwfyr|fyrthhdjzw|jzh)/i;

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function sniffEncoding(buf){
  const head = buf.slice(0, 4096).toString("latin1").toLowerCase();
  const m = head.match(/charset\s*=\s*["']?\s*([\w\-]+)/i);
  let enc = m ? m[1].replace(/["']/g,"").toLowerCase() : "";
  if (!enc){
    if (head.includes("gb18030") || head.includes("gbk") || head.includes("gb2312")) enc = "gb18030";
    else enc = "utf-8";
  }
  if (enc === "gbk" || enc === "gb2312") enc = "gb18030";
  if (enc === "utf8") enc = "utf-8";
  return enc;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": ACCEPT_LANG } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  const enc = sniffEncoding(buf);
  try {
    return iconv.decode(buf, enc);
  } catch {
    return buf.toString("utf-8");
  }
}

function absUrl(u, base) {
  try { return new URL(u, base).href; } catch { return null; }
}
function dirnameOf(u){
  try { const url = new URL(u); url.pathname = url.pathname.replace(/\/[^\/]*$/, ""); return url.origin + url.pathname; }
  catch { return null; }
}

function pickText(doc, sel) {
  return Array.from(doc.querySelectorAll(sel))
    .map(n => (n.textContent || "").trim())
    .filter(Boolean)
    .join(" ");
}

/** 解析日期（YYYY-MM-DD / YYYY.MM.DD / YYYY年M月D日 / ISO） */
function tryParseDate(s) {
  if (!s) return null;
  s = String(s).replace(/\s+/g, " ").trim();

  let m = s.match(/(\d{4})[.\-\/_](\d{1,2})[.\-\/_](\d{1,2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isValid(d) ? d : null;
  }
  m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isValid(d) ? d : null;
  }
  const iso = parseISO(s);
  if (isValid(iso)) return iso;
  return null;
}

/** 嘗試從「超連結的 href 或文字」推斷日期（優先用在列表階段） */
function inferDateFromLink(href, text) {
  const s = `${href} ${text || ""}`;
  // 常見：/.../2022-07/05/... 或 /2022/07/05/ 或 2022-07-05.html
  let d = tryParseDate(s);
  if (d) return d;
  // 有些標題寫「2022年7月5日外交部例行记者会」
  d = tryParseDate(text || "");
  return d;
}

function extractDateFromPage(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const metas = [
    "article:published_time","pubdate","PublishTime","publishdate",
    "og:updated_time","OriginalPublicationDate","date","PubDate","ctime"
  ];
  for (const k of metas) {
    const m1 = doc.querySelector(`meta[property="${k}"]`);
    const m2 = doc.querySelector(`meta[name="${k}"]`);
    const v = (m1?.content || m2?.content || "").trim();
    const d = tryParseDate(v);
    if (d) return d;
  }

  const dateHints = pickText(doc, "time, .time, .pubtime, .date, .info, .source, .title, h1, h2, h3");
  let d = tryParseDate(dateHints);
  if (d) return d;

  d = tryParseDate(doc.body.textContent || "");
  return d;
}

/** 抽正文 */
function extractBodyText(html, url) {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  let root = doc.querySelector("article") || doc.querySelector("#content, #Article, .article, .content, .page-content, .TRS_Editor");
  let pieces = [];
  if (root) {
    pieces = Array.from(root.querySelectorAll("p, li"))
      .map(p => (p.textContent || "").trim())
      .filter(Boolean);
  }
  if (pieces.length < 5) {
    pieces = Array.from(doc.querySelectorAll("p, li"))
      .map(p => (p.textContent || "").trim())
      .filter(Boolean);
  }
  let text = pieces.join(" ").replace(/\s+/g, " ").trim();
  if (text.length < 80) text = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  return text;
}

/** 是否像每日例行記者會／文字實錄的連結 */
function looksLikePresser(href, text) {
  const s = `${href} ${text || ""}`;
  return PRESSER_KEYWORDS.test(s) || COLUMN_HINTS.test(s);
}

/** 探索同欄位的分頁（index 與 index_*），限制在 allowReg 之內 */
async function discoverListPages(seedUrl, allowReg, fallbackGen) {
  const dir = dirnameOf(seedUrl);
  const pages = new Set();
  if (seedUrl) pages.add(seedUrl);

  try {
    const html = await fetchText(seedUrl);
    const dom = new JSDOM(html, { url: seedUrl });
    const doc = dom.window.document;

    const anchors = Array.from(doc.querySelectorAll("a")).slice(0, MAX_ANCHORS_PER_PAGE);
    for (const a of anchors) {
      const href = absUrl(a.getAttribute("href") || "", seedUrl);
      if (!href) continue;
      if (!allowReg.test(href)) continue;
      pages.add(href);
      if (pages.size >= MAX_LIST_PAGES) break;
    }
  } catch { /* 用 fallback */ }

  if (pages.size <= 1 && dir && fallbackGen) {
    for (const u of fallbackGen(dir)) {
      pages.add(u);
      if (pages.size >= MAX_LIST_PAGES) break;
    }
  }

  // 依 index 序號排序
  const arr = Array.from(pages);
  arr.sort((a, b) => {
    const aIdx = a.match(/index(?:_(\d+))?\.(s)?html$/i);
    const bIdx = b.match(/index(?:_(\d+))?\.(s)?html$/i);
    const aN = aIdx ? Number(aIdx[1] || 0) : 0;
    const bN = bIdx ? Number(bIdx[1] || 0) : 0;
    return aN - bN;
  });
  return arr;
}

/** 從多個列表頁蒐集候選連結（在此先以「日期＋關鍵字」過濾） */
async function collectFromLists(pages, source, startDate, endDate) {
  const out = [];
  const seen = new Set();

  for (const url of pages) {
    try {
      const html = await fetchText(url);
      const dom = new JSDOM(html, { url });
      const doc = dom.window.document;

      const anchors = Array.from(doc.querySelectorAll("a")).slice(0, MAX_ANCHORS_PER_PAGE);
      for (const a of anchors) {
        const href = absUrl(a.getAttribute("href") || "", url);
        const text = (a.textContent || "").trim();
        if (!href) continue;

        // 僅收像「例行記者會／文字實錄」的連結
        if (!looksLikePresser(href, text)) continue;

        // 優先從連結文本/URL 推斷日期；不在區間就跳過，節省請求
        const inferred = inferDateFromLink(href, text);
        if (inferred) {
          if (isBefore(inferred, startDate) || isAfter(inferred, endDate)) continue;
        }
        // 防重
        if (seen.has(href)) continue;
        seen.add(href);

        out.push({ href, text, source, inferredDate: inferred ? inferred.toISOString().slice(0,10) : "" });
      }
      process.stdout.write(`\r[${source}] 分頁掃描中… 已累計候選：${out.length}   `);
      await sleep(100);
    } catch {
      await sleep(60);
    }
  }
  process.stdout.write("\n");
  return out;
}

async function main() {
  // 預設參數（已改成 2022-08-04、前30、後0、輸出檔名也跟著改）
  const [argT0, argBefore, argAfter, argOut] = process.argv.slice(2);
  const t0Str     = argT0     || "2022-08-04";
  const beforeStr = argBefore || "30";
  const afterStr  = argAfter  || "0";
  const outFile   = argOut    || "E20220804_b30.csv";

  const t0 = parseISO(t0Str);
  if (!isValid(t0)) { console.error("t0 日期格式錯誤（YYYY-MM-DD）"); process.exit(1); }
  const before = Number(beforeStr);
  const after  = Number(afterStr);
  if (Number.isNaN(before) || Number.isNaN(after)) {
    console.error("before / after 需為數字天數"); process.exit(1);
  }

  const startDate = subDays(t0, before);
  const endDate   = addDays(t0, after);
  console.log(`抓取區間：${startDate.toISOString().slice(0,10)} ～ ${endDate.toISOString().slice(0,10)}（含）`);

  const ws = fs.createWriteStream(outFile, { encoding: "utf-8" });
  ws.write("\uFEFF"); // BOM：Excel 友善
  const csv = csvFormat({ headers: ["date","source","text","url","date_inferred"] });
  csv.pipe(ws);

  let kept = 0, totalCandidates = 0;

  for (const seed of LIST_SEEDS) {
    console.log(`\n=== 探索分頁（${seed.source}）：${seed.seed} ===`);
    const listPages = await discoverListPages(seed.seed, seed.allowReg, seed.fallbackGen);
    console.log(`分頁數：${listPages.length}（示例）→ ${listPages.slice(0, 6).join(" , ")}${listPages.length>6?" , …":""}`);

    const links = await collectFromLists(listPages, seed.source, startDate, endDate);
    totalCandidates += links.length;
    console.log(`[${seed.source}] 候選連結（已按日期粗篩）：${links.length}，開始抓正文…`);

    for (const { href, source, inferredDate } of links) {
      try {
        const html = await fetchText(href);

        // 頁面層再做一次日期驗證；若抓不到就回退用 inferred
        let pub = extractDateFromPage(html);
        let useDate = pub && isValid(pub) ? pub : (inferredDate ? parseISO(inferredDate) : null);
        if (!useDate) { await sleep(25); continue; }

        if (isBefore(useDate, startDate) || isAfter(useDate, endDate)) { await sleep(20); continue; }

        const text = extractBodyText(html, href);
        if (!text || text.length < 80) { await sleep(20); continue; }

        const dateStr = useDate.toISOString().slice(0,10);
        csv.write({ date: dateStr, source, text, url: href, date_inferred: inferredDate || "" });
        kept++;
        process.stdout.write(`\r已寫入 ${kept} 筆（來源：${source}）…`);
        await sleep(140);
      } catch {
        await sleep(50);
      }
    }
    process.stdout.write("\n");
  }

  csv.end();
  console.log(`\n完成！候選總數：${totalCandidates}；實得：${kept} 筆 → ${outFile}`);
}

main().catch(err => { console.error(err); process.exit(1); });
