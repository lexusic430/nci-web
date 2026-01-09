'use client';

import React, { useMemo, useState } from 'react';

/** =========================================================
 * 0) keywords（保留）
 * ========================================================= */
const KEYWORDS = [
  "台灣","台湾","台海","軍演","演訓","佩洛西","制裁","嚴正","堅決","強烈",
  "導彈","东风","實彈","实弹","行动","行動","嚴重後果","維權","維穩"
];

/** =========================================================
 * 1) 三籃字典
 * ========================================================= */
const BAG_JUSTIFY = [
  "維護","捍衛","堅持","反對","遏制","不承諾放棄","不承諾放棄（武力）","武力","致力於","實現",
  "主權","領土完整","一中原則","九二共識","和平統一","一國兩制","核心利益","民族復興","歷史任務",
  "祖國統一","底線","紅線","基本方針","堅定","堅決","不可動搖","矢志不渝","一貫","明確",
  "正當","合法","堅強","意志","堅強（意志）"
];

const BAG_DETER = [
  "嚴正警告","嚴懲","粉碎","清算","打擊","玩火","自焚","埋葬","挑釁","分裂","勾連","注定失敗",
  "後果自負","死路一條","付出代價","頭破血流","妄想","災難性後果","雷霆之勢","絕不姑息",
  "萬劫不復","歷史罪人","勿謂言之不預","必將","一定會","不得不","不惜一切代價","任何時候","任何形式"
];

const BAG_ESCALATE = [
  "演練","演習","聯合演訓","警巡","戰備","封鎖","實彈射擊","抵近","懾壓","常態化","巡航","越線",
  "立體","全天候","進一步","升級","採取","採取（必要）行動","必要行動","反制","拭目以待","奉陪到底",
  "絕不坐視","反擊","加大","加大（力度）","台島周邊","海空域","越過中線","多軍兵種","全要素",
  "關門打狗","區域拒止"
];

const EXERCISE_ORDER = [
  "2022環台軍演",
  "2023聯合利劍",
  "2023海空聯合戰備警巡演練",
  "聯合利劍2024A",
  "聯合利劍2024B",
  "海峽雷霆2025",
  "正義使命2025",
];

const TAIWAN_LEXICON = [
  "台灣","台湾","臺灣","台海","臺海","台湾地区","台岛","台島",
  "兩岸","两岸","海峽兩岸","海峡两岸","中線","中线","台島周邊","台岛周边"
];

/** ====== 小工具 ====== */
function esc(s: string){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function uniqStr(arr: string[]) {
  const s = new Set<string>();
  for (const x of arr) {
    const v = String(x || "").trim();
    if (v) s.add(v);
  }
  return Array.from(s);
}
function makeRe(list: string[]){ return new RegExp(uniqStr(list).map(esc).join("|"), "g"); }
function stripBom(s: string){ return s.replace(/^\uFEFF/, ""); }
function toYMD(d: Date){
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0,10);
}

// 🔥 修改點 1：增強版日期解析 (解決日期讀不到或帶時間的問題)
function parseYMD(s: string){
  let t = String(s ?? "").trim().replace(/["']/g,"");
  // 移除時間部分 (例如 "2024-05-20 10:00:00")
  if (t.includes(" ")) t = t.split(" ")[0];
  if (t.includes("T")) t = t.split("T")[0]; // ISO 格式

  const m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function addDays(d: Date, n: number){
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate()+n);
  return x;
}
function rangeDays(a: Date, b: Date){
  const out: string[] = [];
  for(let d=new Date(a); d<=b; d=addDays(d,1)) out.push(toYMD(d));
  return out;
}

// 修改點：新增 Z-Score 計算 (符合論文標準化邏輯)
function zScore(arr: number[]) {
  const n = arr.length;
  if (n === 0) return [];
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  // 若標準差為0 (數值全相同)，回傳0
  if (std === 0) return arr.map(() => 0);
  return arr.map(v => (v - mean) / std);
}

function movingAvg(arr: number[], k: number){
  if (k<=1) return arr.slice();
  const out: number[] = new Array(arr.length).fill(0);
  let sum = 0;
  for (let i=0;i<arr.length;i++){
    sum += arr[i];
    if (i>=k) sum -= arr[i-k];
    out[i] = i>=k-1 ? sum/k : sum/(i+1);
  }
  return out;
}
function shift(arr: number[], lead: number){
  const n = arr.length;
  const out = new Array(n).fill(0);
  for(let i=0;i<n;i++){
    const j = i + lead;
    if (j>=0 && j<n) out[i] = arr[j];
  }
  return out;
}
function minMaxNormByWindow(series: number[], dates: string[], winStart: string, winEnd: string){
  let lo = +Infinity, hi = -Infinity;
  for (let i=0;i<dates.length;i++){
    if (dates[i]>=winStart && dates[i]<=winEnd){
      if (series[i]<lo) lo = series[i];
      if (series[i]>hi) hi = series[i];
    }
  }
  if (!isFinite(lo) || !isFinite(hi) || hi===lo) {
    lo = Math.min(...series);
    hi = Math.max(...series);
    if (hi===lo){ return series.map(_=>0.5); }
  }
  const span = hi - lo;
  return series.map(v => Math.max(0, Math.min(1, (v - lo) / span)));
}

/** ====== regex ====== */
const TW_RE = makeRe(TAIWAN_LEXICON);

/** ====== 斷句 ====== */
function splitSentences(text: string){
  const s = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return [];
  const parts = s.split(/(?<=[。！？!?；;])\s+|\n+/g).map(x=>x.trim()).filter(Boolean);
  if (parts.length<=1){
    return s.split(/[，,、]\s*/g).map(x=>x.trim()).filter(Boolean);
  }
  return parts;
}
function taiwanIssueSentences(text: string){
  const sents = splitSentences(text);
  return sents.filter(s => TW_RE.test(s));
}

/** =========================================================
 * 4) 關鍵詞上色
 * ========================================================= */
type TokCat = 'justify' | 'deter' | 'escalate';
type HiTok = { t: string; cat: TokCat; bg: string; fg: string; prio: number };

const HILITE_TOKENS: HiTok[] = (() => {
  const prio = { escalate: 3, deter: 2, justify: 1 } as const;
  const m = new Map<string, HiTok>();

  const put = (t: string, cat: TokCat) => {
    const token = String(t||"").trim();
    if (!token) return;
    const style =
      cat === 'escalate' ? { bg:'#fee2e2', fg:'#991b1b' } :
      cat === 'deter'    ? { bg:'#fef3c7', fg:'#92400e' } :
                           { bg:'#dcfce7', fg:'#065f46' };
    const cur: HiTok = { t: token, cat, ...style, prio: prio[cat] };
    const old = m.get(token);
    if (!old || cur.prio > old.prio) m.set(token, cur);
  };

  for (const t of BAG_JUSTIFY)  put(t, 'justify');
  for (const t of BAG_DETER)    put(t, 'deter');
  for (const t of BAG_ESCALATE) put(t, 'escalate');

  const all = Array.from(m.values());
  all.sort((a,b)=> b.t.length - a.t.length);
  return all;
})();

function highlightSentence3Colors(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const text = s || "";
  const n = text.length;
  let i = 0;
  let key = 0;

  const startsWithAt = (str: string, sub: string, pos: number) => {
    return str.substring(pos, pos + sub.length) === sub;
  };

  const bestAt = (pos:number): HiTok | null => {
    for (const tok of HILITE_TOKENS){
      if (startsWithAt(text, tok.t, pos)) return tok;
    }
    return null;
  };

  const findNextMatch = (from: number): number => {
    let next = n;
    for (const tok of HILITE_TOKENS) {
      const j = text.indexOf(tok.t, from);
      if (j !== -1 && j < next) next = j;
    }
    return next;
  };

  while (i < n) {
    const best = bestAt(i);
    if (best) {
      out.push(
        <span
          key={key++}
          style={{
            background: best.bg, color: best.fg,
            padding: "0 2px", borderRadius: 4, margin: "0 1px",
            boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone",
          }}
        >
          {best.t}
        </span>
      );
      i += best.t.length;
      continue;
    }
    const next = findNextMatch(i + 1);
    const chunk = text.slice(i, next);
    out.push(<span key={key++}>{chunk}</span>);
    i = next;
  }
  return out;
}

/** =========================================================
 * 5) 解析 CSV/TSV
 * ========================================================= */
function parseTable(text: string): {rows: any[], headers: string[], delim: string}{
  const raw = stripBom(text.replace(/\r\n/g, "\n"));
  const firstLine = raw.split("\n")[0] ?? "";
  const delim = firstLine.includes("\t") ? "\t" : ",";

  const lines = raw.split("\n").filter(l => l.length>0);
  if (lines.length===0) return {rows:[], headers:[], delim};

  const headers = parseLine(lines[0], delim).map(h => stripBom(h).replace(/(^"|"$)/g,""));
  const rows: any[] = [];
  for (let i=1;i<lines.length;i++){
    const cols = parseLine(lines[i], delim);
    if (cols.length===0) continue;
    const obj: any = {};
    for (let j=0;j<headers.length;j++){
      obj[headers[j]] = (cols[j] ?? "").replace(/(^"|"$)/g,"");
    }
    rows.push(obj);
  }
  return {rows, headers, delim};
}
function parseLine(line: string, delim: string){
  const out: string[] = [];
  let cur = "", q = false;
  for (let i=0;i<line.length;i++){
    const c = line[i];
    if (q){
      if (c === '"'){
        if (line[i+1] === '"'){ cur += '"'; i++; }
        else q = false;
      }else cur += c;
    }else{
      if (c === '"') q = true;
      else if (c === delim) { out.push(cur); cur=""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

export default function Page(){
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows]           = useState<any[]>([]);
  const [headers, setHeaders]     = useState<string[]>([]);
  
  // 🔥 修改點 2：加入載入狀態與錯誤訊息
  const [loading, setLoading]     = useState(false);
  const [errorMsg, setErrorMsg]   = useState("");

  // 🔥 修改點 3：加入分頁顯示 (解決瀏覽器卡死問題)
  const [visibleCount, setVisibleCount] = useState(100);

  // 參數 - 修改點：預設權重設為論文的 1.0, 1.5, 2.0
  const [w1, setW1] = useState(1.0); // 意圖 (Intent)
  const [w2, setW2] = useState(1.5); // 威懲 (Punish)
  const [w3, setW3] = useState(2.0); // 升級 (Escalate)
  const [ma, setMA] = useState(3);   // 平滑 (Smoothing) 預設 3 日
  const [lead, setLead] = useState(0);

  // 選單
  const [selectedExercise, setSelectedExercise] = useState<string>("全部");

  // 視覺
  const [showNci, setShowNci] = useState(true);
  const [showJ, setShowJ]     = useState(true);
  const [showD, setShowD]     = useState(true);
  const [showE, setShowE]     = useState(true);

  // 事件窗
  const [winStart, setWinStart] = useState<string>("");
  const [winEnd,   setWinEnd]   = useState<string>("");

  /** 讀檔 */
  function onPickFile(e: React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0];
    if (!f) return;
    
    // 設定載入中
    setLoading(true);
    setErrorMsg("");
    setFileName(f.name);

    const fr = new FileReader();
    fr.onload = () => {
      try {
        const text = typeof fr.result === 'string'
          ? fr.result
          : new TextDecoder("utf-8").decode(fr.result as ArrayBuffer);

        const {rows, headers} = parseTable(text);
        
        if (rows.length === 0) {
            setErrorMsg("讀取失敗：檔案內容為空或格式無法解析。");
        } else {
            setRows(rows);
            setHeaders(headers);
            setSelectedExercise("全部");
            setWinStart("");
            setWinEnd("");
            // 重置分頁顯示
            setVisibleCount(100);
        }
      } catch (err) {
        console.error(err);
        setErrorMsg("發生未預期的錯誤，請檢查 Console");
      } finally {
        // 解除載入中
        setLoading(false);
      }
    };
    fr.readAsText(f);
  }

  /** 欄位偵測 */
  const keys = useMemo(()=>{
    const kEx   = findKeyFromArray(rows, ["所屬軍演","军演","事件","event","exercise","exercise_name","campaign"]);
    const kDate = findKeyFromArray(rows, ["date","日期","Date"]);
    const kSrc  = findKeyFromArray(rows, ["source","來源","Media","media"]);
    const kText = findKeyFromArray(rows, ["text","內容","content","Content","內文"]);
    const kLink = findKeyFromArray(rows, ["Link","link","URL","url"]);
    
    // ⭐ 修改點：偵測人工校正(優先) 與 自動預測(候補)
    const kManual = findKeyFromArray(rows, ["人工校正", "人工標註", "Manual_Label"]);
    const kAuto   = findKeyFromArray(rows, ["Signal_Type", "BERT_Label", "BERT_預測結果(文字)", "Signal"]);
    
    return { kEx, kDate, kSrc, kText, kLink, kManual, kAuto };
  },[rows]);

  /** 資料篩選 */
  const cleanedRows = useMemo(()=>{
    if (rows.length===0) return [];
    const set7 = new Set(EXERCISE_ORDER);
    const {kEx} = keys;
    return rows.filter(r => set7.has(String(r[kEx] ?? "").trim()));
  }, [rows, keys]);

  const filteredRows = useMemo(()=>{
    if (cleanedRows.length===0) return [];
    if (selectedExercise === "全部") return cleanedRows;
    const {kEx} = keys;
    return cleanedRows.filter(r => String(r[kEx] ?? "").trim() === selectedExercise);
  }, [cleanedRows, selectedExercise, keys]);

  const exerciseOptions = useMemo(()=>{
    return ["全部", ...EXERCISE_ORDER];
  }, []);

  const {minDateStr, maxDateStr} = useMemo(()=>{
    const ds: Date[] = [];
    for (const r of filteredRows){
      const raw = String(r[keys.kDate] ?? "");
      const d = parseYMD(raw);
      if (d) ds.push(d);
    }
    if (ds.length===0) return {minDateStr:"", maxDateStr:""};
    ds.sort((a,b)=>+a-+b);
    return {minDateStr: toYMD(ds[0]), maxDateStr: toYMD(ds[ds.length-1])};
  }, [filteredRows, keys]);

  function onChangeExercise(v: string){
    setSelectedExercise(v);
    setWinStart("");
    setWinEnd("");
    // 切換演習時也重置分頁
    setVisibleCount(100);
  }

  /** ⭐ 核心計算：修正為符合論文的 Z-score + 階梯權重 */
  const preview = useMemo(()=>{
    if (filteredRows.length===0) return null;

    const kDate  = keys.kDate;
    
    // 1. 日期範圍
    let dmin: Date|undefined, dmax: Date|undefined;
    for (const r of filteredRows){
      const d = parseYMD(String(r[kDate] ?? ""));
      if (!d) continue;
      dmin = dmin ? (d<dmin?d:dmin) : d;
      dmax = dmax ? (d>dmax?d:dmax) : d;
    }
    if (!dmin || !dmax) return null;

    const days = rangeDays(dmin, dmax);

    // 2. 初始化
    // const mapScore = new Map<string, number>();  // 原本總分邏輯暫不使用
    const mapJ = new Map<string, number>();      
    const mapD = new Map<string, number>();      
    const mapE = new Map<string, number>();      

    // 3. 遍歷資料
    for (const r of filteredRows){
      const d = parseYMD(String(r[kDate] ?? ""));
      if (!d) continue;
      const day = toYMD(d);

      // 🛑 雙重取值邏輯
      const rawMan  = String(r[keys.kManual] ?? "").trim();
      const rawAuto = String(r[keys.kAuto]   ?? "").trim();

      let targetStr = "";
      if (rawMan && rawMan.toLowerCase() !== "nan") {
        targetStr = rawMan;
      } else {
        targetStr = rawAuto; // Fallback
      }

      // 解析類別
      let val = 0;
      if (!isNaN(parseFloat(targetStr))) {
        val = parseInt(targetStr, 10);
      } else if (targetStr.includes("_")) {
        val = parseInt(targetStr.split("_")[0], 10);
      }

      // 分類計數
      if (val === 1) mapJ.set(day, (mapJ.get(day)||0) + 1); // 意圖 (0或1視代碼定義，假設1為意圖)
      if (val === 2) mapD.set(day, (mapD.get(day)||0) + 1); // 威懲
      if (val >= 3)  mapE.set(day, (mapE.get(day)||0) + 1); // 升級 (假設3為升級)
    }

    // 4. 序列化 (原始頻次)
    const seriesJ = days.map(d => mapJ.get(d) || 0); 
    const seriesD = days.map(d => mapD.get(d) || 0); 
    const seriesE = days.map(d => mapE.get(d) || 0); 

    // 5. NCI 運算 (修改點：Z-score + 加權)
    // (A) Z-Score 標準化
    const zJ = zScore(seriesJ);
    const zD = zScore(seriesD);
    const zE = zScore(seriesE);

    // (B) 加權聚合 (NCI = w1*Z_J + w2*Z_D + w3*Z_E)
    // w1=意圖, w2=威懲, w3=升級
    const rawNci = days.map((_, i) => {
        return (w1 * zJ[i]) + (w2 * zD[i]) + (w3 * zE[i]);
    });

    // (C) 平滑化 (MA)
    const smoothedNci = movingAvg(rawNci, ma);

    // (D) 視覺化歸一 (維持原本圖表的 0-1 顯示)
    const wStart = (winStart||minDateStr||days[0]);
    const wEnd   = (winEnd  ||maxDateStr||days[days.length-1]);

    const nci0 = minMaxNormByWindow(smoothedNci, days, wStart, wEnd);
    
    // 平滑化各類別曲線供顯示
    const sJ_smooth = movingAvg(seriesJ, ma);
    const sD_smooth = movingAvg(seriesD, ma);
    const sE_smooth = movingAvg(seriesE, ma);
    
    const j0 = minMaxNormByWindow(sJ_smooth, days, wStart, wEnd);
    const d0 = minMaxNormByWindow(sD_smooth, days, wStart, wEnd);
    const e0 = minMaxNormByWindow(sE_smooth, days, wStart, wEnd);

    const nci = shift(nci0, lead);
    const jN  = shift(j0, lead);
    const dN  = shift(d0, lead);
    const eN  = shift(e0, lead);

    const totJ = seriesJ.reduce((a,b)=>a+b,0);
    const totD = seriesD.reduce((a,b)=>a+b,0);
    const totE = seriesE.reduce((a,b)=>a+b,0);
    const totAll = totJ + totD + totE; 

    return {
      dates: days, cover: `${toYMD(dmin)} ~ ${toYMD(dmax)}`, count: filteredRows.length,
      lineNci: nci, lineJ: jN, lineD: dN, lineE: eN,
      totJ, totD, totE, totAll,
      wStart, wEnd,
    };
  }, [filteredRows, keys, ma, lead, w1, w2, w3, winStart, winEnd, minDateStr, maxDateStr]);

  const top10 = useMemo(()=>{
    if (filteredRows.length===0) return null;
    const textAll = filteredRows.map(r => `${r[keys.kText] ?? ""} ${r[keys.kSrc] ?? ""}`).join("\n");
    const countPerToken = (tokens: string[]) => {
      const uniq = uniqStr(tokens).sort((a,b)=>b.length-a.length);
      const arr = uniq.map(t=>{
        const re = new RegExp(esc(t), "g");
        const c = (textAll.match(re) || []).length;
        return { t, c };
      }).filter(x=>x.c>0);
      arr.sort((a,b)=>b.c-a.c);
      return arr.slice(0,10);
    };
    return {
      J: countPerToken(BAG_JUSTIFY),
      D: countPerToken(BAG_DETER),
      E: countPerToken(BAG_ESCALATE),
    };
  }, [filteredRows, keys]);

  function downloadNciCsv(){
    if (!preview) return;
    const lines = ["date,nci"];
    for (let i=0;i<preview.dates.length;i++){
      lines.push(`${preview.dates[i]},${preview.lineNci[i].toFixed(6)}`);
    }
    const csv = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nci_result.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function MultiLineChart(props: { x: string[]; nci: number[]; j: number[]; d: number[]; e: number[]; showNci: boolean; showJ: boolean; showD: boolean; showE: boolean; }){
    const {x, nci, j, d, e, showNci, showJ, showD, showE} = props;
    if (!x.length) return null;
    const W=1000, H=360, pad=36;
    const xs = x.map((_,i)=> pad + i*(W-2*pad)/Math.max(1,x.length-1));
    const minY=0, maxY=1;
    const yMap = (arr:number[]) => arr.map(v => pad + (H-2*pad)*(1-(v-minY)/(maxY-minY)));
    const toPath = (arr:number[]) => {
      const ys = yMap(arr);
      return xs.map((X,i)=> `${i===0?"M":"L"} ${X.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
    };
    let tickCount = x.length <= 14 ? x.length : Math.min(9, Math.max(6, Math.floor((W-2*pad)/120)));
    if (x.length === 1) tickCount = 1;
    const idxCand: number[] = [];
    for (let k=0; k<tickCount; k++){
      const i = (tickCount===1) ? 0 : Math.round(k*(x.length-1)/(tickCount-1));
      idxCand.push(i);
    }
    const seen = new Set<number>();
    const xticks = idxCand.filter(i => (seen.has(i)? false : (seen.add(i), true)));
    const C_NCI = "#2563eb"; 
    const C_J   = "#16a34a"; 
    const C_D   = "#f59e0b"; 
    const C_E   = "#dc2626"; 

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{border:"1px solid #eee", background:"#fff"}}>
        <rect x={0} y={0} width={W} height={H} fill="#fff"/>
        {[0,0.25,0.5,0.75,1].map((g,idx)=>{
          const Y = pad + (H-2*pad)*(1-g);
          return (
            <g key={idx}>
              <line x1={pad} y1={Y} x2={W-pad} y2={Y} stroke="#eee"/>
              <text x={pad-10} y={Y+4} fontSize="10" textAnchor="end">{g.toFixed(2)}</text>
            </g>
          );
        })}
        <line x1={pad} y1={pad} x2={pad} y2={H-pad} stroke="#333"/>
        <line x1={pad} y1={H-pad} x2={W-pad} y2={H-pad} stroke="#333"/>
        {xticks.map((i,idx)=>{
          const X = xs[i];
          return (
            <g key={idx}>
              <line x1={X} y1={H-pad} x2={X} y2={H-pad+6} stroke="#333"/>
              <text x={X} y={H-pad+20} fontSize="10" textAnchor="middle">{x[i]}</text>
            </g>
          );
        })}
        <text x={14} y={H/2} transform={`rotate(-90, 14, ${H/2})`} fontSize="12" fill="#333">
          NCI 脅迫指數 (Z-score 歸一化)
        </text>
        {showJ && <path d={toPath(j)}   fill="none" stroke={C_J}   strokeWidth={2} />}
        {showD && <path d={toPath(d)}   fill="none" stroke={C_D}   strokeWidth={2} />}
        {showE && <path d={toPath(e)}   fill="none" stroke={C_E}   strokeWidth={2} />}
        {showNci && <path d={toPath(nci)} fill="none" stroke={C_NCI} strokeWidth={2.5} />}
        <g>
          <rect x={W-pad-330} y={pad-22} width={320} height={18} fill="#fff" opacity={0.9}/>
          <text x={W-pad-320} y={pad-8} fontSize="11" fill="#333">
            {showJ ? "意圖-L1(綠)  " : ""}
            {showD ? "威懲-L2(黃)  " : ""}
            {showE ? "升級-L3(紅)  " : ""}
            {showNci ? "NCI(藍)" : ""}
          </text>
        </g>
      </svg>
    );
  }

  const count = preview?.count ?? 0;
  const cover = preview?.cover ?? "~";
  
  // 🔥🔥🔥 這裡做了 Lazy Loading，防止一次渲染 3000 行卡死瀏覽器
  const tableRows = useMemo(()=>{
    if (filteredRows.length===0) return [];
    const kDate = keys.kDate;
    const arr = filteredRows.slice();
    arr.sort((a,b)=>{
      const da = parseYMD(String(a[kDate]??""))?.getTime() ?? 0;
      const db = parseYMD(String(b[kDate]??""))?.getTime() ?? 0;
      return da - db;
    });
    return arr;
  }, [filteredRows, keys]);

  const visibleRows = tableRows.slice(0, visibleCount);

  return (
    <main style={styles.main}>
      <h1 style={styles.h1}>NCI：上傳資料並分析（效能優化版）</h1>
      
      {errorMsg && (
        <div style={{background:"#fef2f2", color:"#b91c1c", padding:12, borderRadius:8, marginBottom:10, border:"1px solid #fecaca"}}>
          🚨 {errorMsg}
        </div>
      )}

      <div style={{margin:"8px 0", display:"flex", alignItems:"center"}}>
        <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={onPickFile} disabled={loading}/>
        {loading && <span style={{marginLeft:10, color:"#2563eb", fontWeight:600}}>⚡ 處理中，請稍候...</span>}
      </div>

      <div style={{margin:"10px 0 8px"}}>
        <label>所屬軍演：
          <select
            value={selectedExercise}
            onChange={e=>onChangeExercise(e.target.value)}
            style={{...styles.ibox, width:320, marginLeft:6}}
          >
            {exerciseOptions.map(op => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
        </label>
        <span style={{marginLeft:10, color:"#666", fontSize:12}}>
          「全部」也只保留你指定的 7 場軍演資料。
        </span>
      </div>
      <div style={{display:"flex", gap:40, flexWrap:"wrap", margin:"8px 0"}}>
        <div>
          <div style={{color:"#666"}}>筆數</div>
          <div style={{fontSize:22, fontWeight:600}}>{count}</div>
        </div>
        <div>
          <div style={{color:"#666"}}>涵蓋</div>
          <div style={{fontSize:18}}>{cover}</div>
        </div>
      </div>
      <div style={styles.grid3}>
        <label>MA 平滑天數
          <input type="number" value={ma} onChange={e=>setMA(+e.target.value||0)} style={styles.ibox}/>
        </label>
        <label>Lead-time（日）
          <input type="number" value={lead} onChange={e=>setLead(parseInt(e.target.value||"0"))} style={styles.ibox}/>
        </label>
        <div/>
        <label>事件窗起
          <input type="date" value={winStart||minDateStr} onChange={e=>setWinStart(e.target.value)} style={styles.ibox}/>
        </label>
        <label>事件窗訖
          <input type="date" value={winEnd||maxDateStr} onChange={e=>setWinEnd(e.target.value)} style={styles.ibox}/>
        </label>
        <div/>
        <label>意圖權重 (L1)
          <input type="number" step="0.1" value={w1} onChange={e=>setW1(+e.target.value||0)} style={styles.ibox}/>
        </label>
        <label>威懲權重 (L2)
          <input type="number" step="0.1" value={w2} onChange={e=>setW2(+e.target.value||0)} style={styles.ibox}/>
        </label>
        <label>升級權重 (L3)
          <input type="number" step="0.1" value={w3} onChange={e=>setW3(+e.target.value||0)} style={styles.ibox}/>
        </label>
      </div>

      <div style={{marginTop:12, padding:8, background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:6, fontSize:13, color:"#0369a1"}}>
        <strong>⚠️ 模式鎖定：</strong> NCI 計算已強制使用 Excel/CSV 內的「人工校正/Signal_Type」欄位（優先用人工，空值用 Signal_Type 補位）。
      </div>

      <div style={{marginTop:10, display:"flex", gap:14, flexWrap:"wrap", alignItems:"center"}}>
        <span style={{color:"#666"}}>顯示線條：</span>
        <label><input type="checkbox" checked={showJ} onChange={e=>setShowJ(e.target.checked)} /> 意圖-L1（綠）</label>
        <label><input type="checkbox" checked={showD} onChange={e=>setShowD(e.target.checked)} /> 威懲-L2（黃）</label>
        <label><input type="checkbox" checked={showE} onChange={e=>setShowE(e.target.checked)} /> 升級-L3（紅）</label>
        <label><input type="checkbox" checked={showNci} onChange={e=>setShowNci(e.target.checked)} /> NCI（藍）</label>
        <button onClick={downloadNciCsv} disabled={!preview} style={{...styles.btn, marginLeft:"auto"}}>
          下載 NCI CSV（date,nci）
        </button>
      </div>

      <h2 style={{marginTop:16}}>指數圖（0..1）</h2>
      {preview && (
        <MultiLineChart
          x={preview.dates} nci={preview.lineNci}
          j={preview.lineJ} d={preview.lineD} e={preview.lineE}
          showNci={showNci} showJ={showJ} showD={showD} showE={showE}
        />
      )}

      {preview && (
        <section style={{marginTop:14}}>
          <h3 style={{margin:"10px 0 6px"}}>L1/L2/L3 文章統計（依 Excel 標註）</h3>
          <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12}}>
            <div style={styles.card}>
              <div style={styles.cardLabel}>L1 (意圖)</div>
              <div style={styles.cardValue}>{preview.totJ}</div>
              <div style={styles.cardNote}>比例：{preview.totAll ? ((preview.totJ/preview.totAll)*100).toFixed(1) : "0.0"}%</div>
            </div>
            <div style={styles.card}>
              <div style={styles.cardLabel}>L2 (威懲)</div>
              <div style={styles.cardValue}>{preview.totD}</div>
              <div style={styles.cardNote}>比例：{preview.totAll ? ((preview.totD/preview.totAll)*100).toFixed(1) : "0.0"}%</div>
            </div>
            <div style={styles.card}>
              <div style={styles.cardLabel}>L3 (升級)</div>
              <div style={styles.cardValue}>{preview.totE}</div>
              <div style={styles.cardNote}>比例：{preview.totAll ? ((preview.totE/preview.totAll)*100).toFixed(1) : "0.0"}%</div>
            </div>
            <div style={styles.card}>
              <div style={styles.cardLabel}>總文章數</div>
              <div style={styles.cardValue}>{preview.totAll}</div>
              <div style={styles.cardNote}>事件窗：{preview.wStart} ～ {preview.wEnd}</div>
            </div>
          </div>
        </section>
      )}

      {top10 && (
        <section style={{marginTop:14}}>
          <h3 style={{margin:"10px 0 6px"}}>關鍵詞 Top-10（各類別，命中次數）</h3>
          <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12}}>
            <div style={styles.card}>
              <div style={{...styles.cardLabel, color:"#065f46"}}>意圖詞庫（綠）</div>
              <ol style={{margin:"8px 0 0 18px"}}>
                {top10.J.map(x => <li key={x.t}><span>{x.t}</span> <span style={{color:"#666"}}>({x.c})</span></li>)}
              </ol>
            </div>
            <div style={styles.card}>
              <div style={{...styles.cardLabel, color:"#92400e"}}>威懲詞庫（黃）</div>
              <ol style={{margin:"8px 0 0 18px"}}>
                {top10.D.map(x => <li key={x.t}><span>{x.t}</span> <span style={{color:"#666"}}>({x.c})</span></li>)}
              </ol>
            </div>
            <div style={styles.card}>
              <div style={{...styles.cardLabel, color:"#991b1b"}}>升級詞庫（紅）</div>
              <ol style={{margin:"8px 0 0 18px"}}>
                {top10.E.map(x => <li key={x.t}><span>{x.t}</span> <span style={{color:"#666"}}>({x.c})</span></li>)}
              </ol>
            </div>
          </div>
        </section>
      )}

      <section style={{marginTop:16}}>
        <h3 style={{margin:"10px 0 6px"}}>全部列出（僅先顯示前 {visibleCount} 筆，避免當機）</h3>
        <div style={{marginBottom:8, display:"flex", gap:10}}>
            {visibleRows.length < tableRows.length && (
                <>
                    <button onClick={()=>setVisibleCount(prev=>prev+100)} style={styles.btn}>
                        顯示更多 (+100)
                    </button>
                    <button onClick={()=>setVisibleCount(tableRows.length)} style={styles.btn}>
                        顯示全部 ({tableRows.length})
                    </button>
                </>
            )}
            <span style={{color:"#666", alignSelf:"center"}}>目前顯示：{visibleRows.length} / {tableRows.length}</span>
        </div>
        <div style={{border:"1px solid #eee", borderRadius:10, overflow:"hidden"}}>
          <div style={{maxHeight:560, overflow:"auto"}}>
            <table style={{width:"100%", borderCollapse:"collapse"}}>
              <thead style={{position:"sticky", top:0, zIndex:2}}>
                <tr>
                  <th style={styles.th}>日期</th>
                  <th style={styles.th}>所屬軍演</th>
                  <th style={styles.th}>來源</th>
                  <th style={styles.th}>台灣議題斷句（上色）</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, idx)=>{
                  const date = String(r[keys.kDate] ?? "");
                  const ex   = String(r[keys.kEx] ?? "");
                  const src  = String(r[keys.kSrc] ?? "");
                  const txt  = String(r[keys.kText] ?? "");
                  const sents = taiwanIssueSentences(txt);
                  return (
                    <tr key={idx}>
                      <td style={styles.tdSmall}>{date}</td>
                      <td style={styles.tdSmall}>{ex}</td>
                      <td style={styles.tdSmall}>{src}</td>
                      <td style={styles.td}>
                        {sents.length ? (
                          <div style={{lineHeight:1.6}}>
                            {sents.map((s,i)=>(
                              <div key={i} style={{whiteSpace:"pre-wrap", marginBottom:6}}>
                                <span style={{color:"#666"}}>({i+1}) </span>
                                <span>{highlightSentence3Colors(s)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span style={{color:"#999"}}>（無台灣語彙句）</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{marginTop:8, color:"#666", fontSize:12}}>
          顏色規則（優先順序）：升級（紅） &gt; 威懲（黃） &gt; 意圖（綠）。同一詞若同時存在多籃，只用最高優先顏色顯示。
        </div>
      </section>
    </main>
  );
}

/** ====== 樣式 ====== */
const styles: Record<string, React.CSSProperties> = {
  main: { maxWidth: 1150, margin: "20px auto", padding: "0 16px", fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,'Noto Sans TC',sans-serif" },
  h1: { fontSize: 24, fontWeight: 700, marginBottom: 8 },
  grid3: { display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:14, marginTop:10 },
  ibox: { display:"block", width:180, marginTop:4, padding:"6px 8px", border:"1px solid #ddd", borderRadius:6 },
  btn:  { padding:"8px 14px", border:"1px solid #ddd", borderRadius:8, background:"#fff", cursor:"pointer" },
  th:   { textAlign:"left", borderBottom:"1px solid #eee", padding:"8px 8px", background:"#fafafa", fontWeight:700, fontSize:13 },
  td:   { borderBottom:"1px solid #f2f2f2", verticalAlign:"top", padding:"8px 8px", fontSize:14 },
  tdSmall: { borderBottom:"1px solid #f2f2f2", verticalAlign:"top", padding:"8px 8px", fontSize:13, color:"#333", whiteSpace:"nowrap" },
  card: { border:"1px solid #eee", borderRadius:10, padding:"10px 12px", background:"#fff" },
  cardLabel: { fontSize:12, color:"#666" },
  cardValue: { fontSize:22, fontWeight:700, marginTop:4 },
  cardNote: { fontSize:12, color:"#666", marginTop:2 },
};

function findKey(obj:any, cands:string[]){
  const keys = Object.keys(obj).map(k=>stripBom(k));
  for (const c of cands){
    const hit = keys.find(k => k.toLowerCase()===c.toLowerCase());
    if (hit) return hit;
  }
  return null;
}
function findKeyFromArray(rows:any[], cands:string[]){
  for (const r of rows){
    const k = findKey(r, cands);
    if (k) return k;
  }
  return cands[0];
}