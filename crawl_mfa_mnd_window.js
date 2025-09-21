# 1) 回到你的專案資料夾
Set-Location C:\Users\julia\nci-web

# 2) 安裝此腳本會用到的套件（jsdom / fast-csv / date-fns）
npm i jsdom @fast-csv/format date-fns

# 3) 建立/覆蓋 crawl_list.js（支援「前 N 日 + 後 M 日」，含你提到的國防部 4 個欄目）
@'
/**
 * crawl_list.js —— 外交部 / 國防部「列表翻頁」抓取（支援 t0 前後窗口）
 * 用法（相容舊版）：
 *  - 前 N 日： node crawl_list.js 2022-08-02 30 out.csv
 *  - 前後 N/M 日：node crawl_list.js 2022-08-02 30 30 out.csv
 *  - 僅後 M 日：node crawl_list.js 2022-08-02 0 30 out.csv
 */

const { JSDOM } = require("jsdom");
const { format: csvFormat } = require("@fast-csv/format");
const { parseISO, isValid, subDays, addDays, isBefore, isAfter } = require("date-fns");
const fs = require("fs");

const UA = "Mozilla/5.0 (compatible; NCI-research-crawler/1.1; +https://example.org)";

const LIST_SEEDS = [
  // ── 外交部（MFA）
  // 新域名：例行記者會
  { source: "外交部", base: "https://www.mfa.gov.cn/wjdt_674879/fyrbt_674889/index.html",
    pageFmt: "https://www.mfa.gov.cn/wjdt_674879/fyrbt_674889/index_{i}.shtml", start: 0, end: 60 },
  // 舊域名：例行記者會
  { source: "外交部", base: "https://www.fmprc.gov.cn/wjdt_674879/fyrbt_674889/index.shtml",
    pageFmt: "https://www.fmprc.gov.cn/wjdt_674879/fyrbt_674889/index_{i}.shtml", start: 0, end: 60 },
  // 舊域名：記者會實錄（有些年份的彙總）
  { source: "外交部", base: "https://www.fmprc.gov.cn/fyrbt_673021/jzhsl_673025/index.shtml",
    pageFmt: "https://www.fmprc.gov.cn/fyrbt_673021/jzhsl_673025/index_{i}.shtml", start: 0, end: 60 },

  // ── 國防部（MND）— 你點名的 4 個欄目 + 既有兩個
  { source: "國防部", base: "http://www.mod.gov.cn/gfbw/xwfyr/yzxwfb/index.html",
    pageFmt: "http://www.mod.gov.cn/gfbw/xwfyr/yzxwfb/index_{i}.html", start: 0, end: 60 },
  { source: "國防部", base: "http://www.mod.gov.cn/gfbw/xwfyr/fyrthhdjzw/index.html",
    pageFmt: "http://www.mod.gov.cn/gfbw/xwfyr/fyrthhdjzw/index_{i}.html", start: 0, end: 60 },
  { source: "國防部", base: "http://www.mod.gov.cn/gfbw/xwfyr/lxjzh_246940/index.html",
    pageFmt: "http://www.mod.gov.cn/gfbw/xwfyr/lxjzh_246940/index_{i}.html", start: 0, end: 60 },
  { source: "國防部", base: "http://www.mod.gov.cn/gfbw/xwfyr/ztjzh/index.html",
    pageFmt: "http://www.mod.gov.cn/gfbw/xwfyr/ztjzh/index_{i}.html", start: 0, end: 60 },

  // 既有：發言人/例行記者會 + 文字實錄
  { source: "國防部", base: "https://www.mod.gov.cn/gfbw/xwfyr/jt/index.html",
    pageFmt: "https://www.mod.gov.cn/gfbw/xwfyr/jt/index_{i}.html", start: 0, end: 60 },
  { source: "國防部", base: "https://www.mod.gov.cn/gfbw/sy/rt/index.html",
    pageFmt: "https://www.mod.gov.cn/gfbw/sy/rt/index_{i}.html", start: 0, end: 60 }
];

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function absUrl(u, base) { try { return new URL(u, base).href; } catch { return null; } }
function pickText(doc, sel) {
  return Array.from(doc.querySelectorAll(sel))
    .map(n => (n.textContent||"").trim())
    .filter(Boolean).join(" ");
}

// 解析日期：meta / 常見日期塊 / 全文掃描
function tryParseDate(s) {
  if (!s) return null;
  s = String(s).replace(/\s+/g," ").trim();
  let m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (m) { const d = new Date(+m[1], +m[2]-1, +m[3]); return isValid(d) ? d : null; }
  m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) { const d = new Date(+m[1], +m[2]-1, +m[3]); return isValid(d) ? d : null; }
  const iso = parseISO(s); if (isValid(iso)) return iso;
  return null;
}

function extractDateFromPage(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const metas = ["article:published_time","pubdate","PublishTime","publishdate","og:updated_time","OriginalPublicationDate","date"];
  for (const k of metas) {
    const m1 = doc.querySelector(`meta[property="${k}"]`);
    const m2 = doc.querySelector(`meta[name="${k}"]`);
    const v = (m1?.content || m2?.content || "").trim();
    const d = tryParseDate(v);
    if (d) return d;
  }
  const dateHints = pickText(doc, "time, .time, .pubtime, .date, .info, .source, .title, h1, h2, h3");
  let d = tryParseDate(dateHints); if (d) return d;
  d = tryParseDate(doc.body.textContent || "");
  return d;
}

// 抽正文：優先 article/常見容器，退回所有 <p>/<li>
function extractBodyText(html, url) {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  let root = doc.querySelector("article") || doc.querySelector("#content, #Article, .article, .content, .page-content, .TRS_Editor");
  let pieces = [];
  if (root) pieces = Array.from(root.querySelectorAll("p, li")).map(p => (p.textContent||"").trim()).filter(Boolean);
  if (pieces.length < 5) pieces = Array.from(doc.querySelectorAll("p, li")).map(p => (p.textContent||"").trim()).filter(Boolean);

  let text = pieces.join(" ").replace(/\s+/g," ").trim();
  if (text.length < 50) text = (doc.body.textContent||"").replace(/\s+/g," ").trim();
  return text;
}

function looksLikeArticleLink(href, text) {
  const s = `${href} ${text}`;
  return /fyrbt|jzhsl|press|xwfyr|rt|news|xw/.test(s);
}

// 支援 endDate（t0 之後 M 日）
async function collectFromList(seed, startDate, endDate) {
  const out = [];
  const seen = new Set();

  const pages = [];
  pages.push(seed.base);
  for (let i = seed.start; i <= seed.end; i++) {
    const u = seed.pageFmt.replace("{i}", String(i));
    if (!pages.includes(u)) pages.push(u);
  }

  for (const url of pages) {
    try {
      const html = await fetchText(url);
      const dom = new JSDOM(html, { url });
      const doc = dom.window.document;

      const anchors = Array.from(doc.querySelectorAll("a")).slice(0, 1200);
      for (const a of anchors) {
        const href = absUrl(a.getAttribute("href") || "", url);
        const text = (a.textContent || "").trim();
        if (!href || !looksLikeArticleLink(href, text)) continue;
        if (seen.has(href)) continue;
        seen.add(href);

        // 快速過濾
        let quick = tryParseDate(text) || tryParseDate(href);
        if (quick && (isBefore(quick, startDate) || isAfter(quick, endDate))) continue;

        out.push({ href, text });
      }
      process.stdout.write(`\r[${seed.source}] 列表掃描… 候選累計：${out.length} `);
      await sleep(150);
    } catch {
      await sleep(100);
    }
  }
  process.stdout.write("\n");
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length !== 3 && argv.length !== 4) {
    console.log("用法：");
    console.log("  前 N 日：node crawl_list.js 2022-08-02 30 out.csv");
    console.log("  前後 N/M 日：node crawl_list.js 2022-08-02 30 30 out.csv");
    console.log("  僅後 M 日：node crawl_list.js 2022-08-02 0 30 out.csv");
    process.exit(1);
  }

  const t0Str = argv[0];
  const beforeDays = Number(argv[1]);
  if (!Number.isFinite(beforeDays) || beforeDays < 0) { console.error("前置天數需為非負整數"); process.exit(1); }

  let afterDays = 0, outFile = "";
  if (argv.length === 3) {
    outFile = argv[2];
  } else {
    afterDays = Number(argv[2]);
    if (!Number.isFinite(afterDays) || afterDays < 0) { console.error("後置天數需為非負整數"); process.exit(1); }
    outFile = argv[3];
  }

  const t0 = parseISO(t0Str);
  if (!isValid(t0)) { console.error("t0 日期格式錯誤（YYYY-MM-DD）"); process.exit(1); }

  const start = subDays(t0, beforeDays);
  const end   = addDays(t0, afterDays);
  console.log(`抓取區間：${start.toISOString().slice(0,10)} ～ ${end.toISOString().slice(0,10)}（含）`);

  const ws = fs.createWriteStream(outFile, { encoding: "utf-8" });
  const csv = csvFormat({ headers: ["date","source","text"] });
  csv.pipe(ws);

  let kept = 0;

  for (const seed of LIST_SEEDS) {
    console.log(`\n=== 掃描欄目：${seed.base} ===`);
    const links = await collectFromList(seed, start, end);
    console.log(`候選連結：${links.length}，開始抓正文…`);

    for (const { href } of links) {
      try {
        const html = await fetchText(href);
        const pub = extractDateFromPage(html);
        if (!pub) { await sleep(60); continue; }
        if (isBefore(pub, start) || isAfter(pub, end)) { await sleep(40); continue; }

        const text = extractBodyText(html, href);
        if (!text || text.length < 50) { await sleep(40); continue; }

        const dateStr = pub.toISOString().slice(0,10);
        csv.write({ date: dateStr, source: seed.source, text });
        kept++;
        process.stdout.write(`\r已寫入 ${kept} 筆…`);
        await sleep(180);
      } catch {
        await sleep(60);
      }
    }
    process.stdout.write("\n");
  }

  csv.end();
  console.log(`\n完成！輸出：${outFile}（共寫入 ${kept} 筆）`);
}

main().catch(err => { console.error(err); process.exit(1); });
'@ | Set-Content -Encoding UTF8 .\crawl_list.js

# 4) 驗證檔案真的在這裡
Test-Path .\crawl_list.js

# 5) 執行（前後各 30 日）
node crawl_list.js 2022-08-02 30 30 E20220802_pm30.csv
