// crawl_mfa_jul_aug.js
// 用法：node crawl_mfa_jul_aug.js 2022-07-03 2022-08-31 out.csv

const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");
const fs = require("fs");

const START = process.argv[2] || "2022-07-03";
const END   = process.argv[3] || "2022-08-31";
const OUT   = process.argv[4] || "E2022_0703_0831_raw.csv";

const CATEGORIES = [
  // 盡量多給幾個常見入口；實際站點有改版時此清單提高命中率
  "https://www.mfa.gov.cn/fyrbt/",                  // 新站主欄
  "https://www.mfa.gov.cn/fyrbt_673021/",           // 新站舊欄位代碼
  "https://www.fmprc.gov.cn/web/wjdt_674879/fyrbt_674889/", // 舊域名
];

const MAX_INDEX_PAGES = 80;   // 每個欄位最多翻到 index_80.html
const SLEEP_MS = 500;

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function toYMD(d){ return d.toISOString().slice(0,10); }
function parseYMD(s){
  const m = String(s).trim().match(/(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})/);
  if(!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
  return isNaN(d) ? null : d;
}
function inRange(ymd, a, b){ return ymd >= a && ymd <= b; }

async function fetchText(url){
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000, headers:{
    "User-Agent":"Mozilla/5.0"
  }});
  const buf = Buffer.from(res.data);
  // 先猜 header，再看 <meta charset>
  const ct = (res.headers["content-type"]||"").toLowerCase();
  let enc = /charset=([\w-]+)/.exec(ct)?.[1] || null;
  let html = enc ? iconv.decode(buf, enc) : iconv.decode(buf, "utf-8");
  const m = html.match(/charset=["']?([\w-]+)["']?/i);
  if (m && m[1] && m[1].toLowerCase() !== "utf-8"){
    try { html = iconv.decode(buf, m[1]); } catch {}
  }
  return html;
}

// 從列表頁抓出 (url, dateText)
function extractList($, base){
  // 常見列表：li 裡面有 a 與日期
  const out = [];
  $("li, .list li, .news_list li, .clearfix li").each((_, li)=>{
    const $li = $(li);
    const a = $li.find("a[href]").first();
    if(!a.length) return;
    let href = a.attr("href")||"";
    if(/^\/\//.test(href)) href = "https:" + href;
    if(/^https?:\/\//i.test(href)===false){
      // 相對位址
      if(href.startsWith("/")){
        const u = new URL(base);
        href = `${u.origin}${href}`;
      }else{
        // 去掉 base 檔名
        const u = new URL(base);
        const p = u.pathname.replace(/[^/]+$/, "");
        href = `${u.origin}${p}${href}`;
      }
    }
    const textBlock = $li.text().replace(/\s+/g," ").trim();
    const m = textBlock.match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2})/);
    if(m){
      out.push({ url: href, dateText: m[1] });
    }
  });
  return out;
}

// 取正文：優先常見容器，否則退而取所有 <p> 組合
function extractArticle(html){
  const $ = cheerio.load(html, { decodeEntities:false });
  const cands = [
    "#News_Body_Txt_A", ".news_content", ".newsContent", ".content", ".article",
    ".TRS_Editor", ".con", ".wzcon", ".Article_Content", "[class*='content']",
  ];
  let $box = null;
  for(const sel of cands){
    const hit = $(sel).first();
    if(hit && hit.length){ $box = hit; break; }
  }
  let text = "";
  if($box){
    // 只拿段落/內文容器文字，避免側欄/導覽
    const parts = [];
    $box.find("p, div").each((_,el)=>{
      const t = $(el).text().replace(/\s+/g," ").trim();
      if(t) parts.push(t);
    });
    text = parts.join(" ");
  }else{
    // 退而求其次：全頁段落
    const parts = [];
    $("p").each((_,el)=>{
      const t = $(el).text().replace(/\s+/g," ").trim();
      if(t) parts.push(t);
    });
    text = parts.join(" ");
  }
  // 去掉極長的導航尾巴（粗略）
  text = text.replace(/(?:您即將離開外交部.*|京ICP.*|版權所有.*)$/i, "").trim();
  return text;
}

function csvEscape(s){
  return `"${String(s).replace(/"/g,'""')}"`;
}

(async function main(){
  const a = toYMD(parseYMD(START));
  const b = toYMD(parseYMD(END));
  if(!a || !b){ console.error("日期格式錯誤，用法：node crawl_mfa_jul_aug.js 2022-07-03 2022-08-31 out.csv"); process.exit(1); }

  const found = new Map(); // url -> {date, url}
  for(const cat of CATEGORIES){
    for(let i=0;i<MAX_INDEX_PAGES;i++){
      const url = i===0 ? `${cat}index.html` : `${cat}index_${i}.html`;
      try{
        const html = await fetchText(url);
        const $ = cheerio.load(html);
        const items = extractList($, url);
        if(items.length===0){
          // 有些欄位是 index.shtml / index_.shtml，試一下
          const alt = i===0 ? `${cat}index.shtml` : `${cat}index_${i}.shtml`;
          try{
            const html2 = await fetchText(alt);
            const $2 = cheerio.load(html2);
            const items2 = extractList($2, alt);
            if(items2.length===0){ if(i===0) continue; else break; }
            for(const it of items2){
              const d = parseYMD(it.dateText);
              if(!d) continue;
              const ymd = toYMD(d);
              if(inRange(ymd, a, b)) found.set(it.url, {date: ymd, url: it.url});
            }
          }catch{ if(i>0) break; }
          continue;
        }
        for(const it of items){
          const d = parseYMD(it.dateText);
          if(!d) continue;
          const ymd = toYMD(d);
          if(inRange(ymd, a, b)) found.set(it.url, {date: ymd, url: it.url});
        }
      }catch(e){
        if(i>0) break; // 此欄位翻不到更多頁
      }
      await sleep(SLEEP_MS);
    }
  }

  const rows = [];
  for(const {date, url} of found.values()){
    try{
      const html = await fetchText(url);
      const text = extractArticle(html);
      if(text && text.length>50){
        rows.push({date, source:"外交部", text});
      }
    }catch(e){
      // 略過失敗的文章
    }
    await sleep(SLEEP_MS);
  }

  // 依日期排序 & 去重 (date+source+text)
  rows.sort((x,y)=> x.date.localeCompare(y.date));
  const uniq = [];
  const seenKey = new Set();
  for(const r of rows){
    const key = `${r.date}||${r.source}||${r.text.slice(0,200)}`; // 前 200 字做近似去重
    if(!seenKey.has(key)){ seenKey.add(key); uniq.push(r); }
  }

  const lines = [];
  lines.push("date,source,text");
  for(const r of uniq){
    lines.push([r.date, r.source, r.text].map(csvEscape).join(","));
  }
  const csv = "\uFEFF" + lines.join("\r\n"); // UTF-8 with BOM
  fs.writeFileSync(OUT, csv, "utf8");
  console.log(`OK, 共 ${uniq.length} 筆 → ${OUT}`);
})();
