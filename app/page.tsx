'use client';

import React, { useMemo, useState, useRef } from 'react';

/** =========================================================
 * 0) keywords（保留）
 * ========================================================= */
const KEYWORDS = [
  "台灣","台灣","台海","軍演","演訓","佩洛西","制裁","嚴正","堅決","強烈",
  "導彈","东风","實彈","實彈","行動","行動","嚴重後果","維權","維穩"
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
  "台灣","台灣","臺灣","台海","臺海","台灣地區","台島","台島",
  "兩岸","兩岸","海峽兩岸","海峽兩岸","中線","中線","台島周邊","台島周邊"
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

function makeRe(list: string[], flags = "") {
  return new RegExp(uniqStr(list).map(esc).join("|"), flags);
}

function stripBom(s: string){ return s.replace(/^\uFEFF/, ""); }
function toYMD(d: Date){
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0,10);
}

function parseYMD(s: string){
  let t = String(s ?? "").trim().replace(/["']/g,"");
  if (t.includes(" ")) t = t.split(" ")[0];
  if (t.includes("T")) t = t.split("T")[0];
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

/** * Z-Score 計算 (基於 Log 轉換後的數據) */
function zScore(arr: number[]) {
  const n = arr.length;
  if (n === 0) return [];
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
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

/** ====== regex ====== */
const TW_RE = makeRe(TAIWAN_LEXICON); 

/** ====== 斷句 ====== */
function splitSentences(text: string){
  const s = String(text ?? "").replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
  if (!s) return [];
  const parts = s.split(/(?<=[。！？!?；;])\s+|\n+/g).map(x=>x.trim()).filter(Boolean);
  if (parts.length<=1) return s.split(/[，,、]\s*/g).map(x=>x.trim()).filter(Boolean);
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
    const style = cat === 'escalate' ? { bg:'#fee2e2', fg:'#991b1b' } :
                  cat === 'deter'    ? { bg:'#fef3c7', fg:'#92400e' } :
                                       { bg:'#dcfce7', fg:'#065f46' };
    const cur: HiTok = { t: token, cat, ...style, prio: prio[cat] };
    const old = m.get(token);
    if (!old || cur.prio > old.prio) m.set(token, cur);
  };

  BAG_JUSTIFY.forEach(t => put(t, 'justify'));
  BAG_DETER.forEach(t => put(t, 'deter'));
  BAG_ESCALATE.forEach(t => put(t, 'escalate'));

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
  const startsWithAt = (str: string, sub: string, pos: number) => str.substring(pos, pos + sub.length) === sub;
  const bestAt = (pos:number): HiTok | null => {
    for (const tok of HILITE_TOKENS) if (startsWithAt(text, tok.t, pos)) return tok;
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
          style={{background: best.bg, color: best.fg, padding: "0 2px", borderRadius: 4, margin: "0 1px"}}
        >
          {best.t}
        </span>
      );
      i += best.t.length;
    } else {
      const next = findNextMatch(i + 1);
      out.push(<span key={key++}>{text.slice(i, next)}</span>);
      i = next;
    }
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
    headers.forEach((h, j) => obj[h] = (cols[j] ?? "").replace(/(^"|"$)/g,""));
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
        if (line[i+1] === '"'){ cur += '"'; i++; } else q = false;
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
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [visibleCount, setVisibleCount] = useState(100);

  const [w1, setW1] = useState(0.5);
  const [w2, setW2] = useState(0.75);
  const [w3, setW3] = useState(1.0);
  const [ma, setMA] = useState(3);
  const [useLog] = useState(true);

  // 🟢 修改：預設設為 "ALL" 以對應「全部軍演」選項
  const [selectedExercise, setSelectedExercise] = useState<string>("ALL");

  const [showNci, setShowNci] = useState(true);
  const [showJ, setShowJ] = useState(true);
  const [showD, setShowD] = useState(true);
  const [showE, setShowE] = useState(true);

  const [winStart, setWinStart] = useState<string>("");
  const [winEnd, setWinEnd] = useState<string>("");

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0];
    if (!f) return;
    setLoading(true); setErrorMsg("");
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const text = typeof fr.result === 'string'
          ? fr.result
          : new TextDecoder("utf-8").decode(fr.result as ArrayBuffer);

        const {rows} = parseTable(text);
        if (rows.length === 0) setErrorMsg("讀取失敗：檔案內容為空。");
        else {
          setRows(rows);
          // 🟢 修改：讀檔後預設為全部
          setSelectedExercise("ALL");
          setWinStart(""); setWinEnd("");
          setVisibleCount(100);
        }
      } catch (err) {
        setErrorMsg("解析錯誤");
      } finally {
        setLoading(false);
      }
    };
    fr.readAsText(f);
  }

  const keys = useMemo(()=>{
    const kEx   = findKeyFromArray(rows, ["所屬軍演","軍演","事件","event","exercise"]);
    const kDate = findKeyFromArray(rows, ["date","日期","Date"]);
    const kSrc  = findKeyFromArray(rows, ["source","來源","Media"]);
    const kText = findKeyFromArray(rows, ["text","內容","content","Content"]);
    const kManual = findKeyFromArray(rows, ["人工校正", "人工標註", "Manual_Label"]);
    const kAuto   = findKeyFromArray(rows, ["Signal_Type", "BERT_Label", "Signal"]);
    return { kEx, kDate, kSrc, kText, kManual, kAuto };
  },[rows]);

  // 全域資料（放寬匹配條件）
  const allValidRows = useMemo(() => {
    if (rows.length === 0) return [];
    const set7 = new Set(EXERCISE_ORDER.map(s => s.trim())); // 確保比對時沒有前後空格
    
    return rows.filter(r => {
      const val = String(r[keys.kEx] ?? "").trim();
      // 如果你選「全部」，這裡必須確保 CSV 裡的軍演名稱能在你的清單中找到
      return val !== "" && set7.has(val);
    });
  }, [rows, keys]);

  // 🟢 修改：篩選邏輯增加 "ALL" 判斷
  const filteredRows = useMemo(() => {
    if (rows.length > 0 && allValidRows.length === 0) {
  console.warn("目前沒有任何有效行(allValidRows 為空)，請檢查 CSV 軍演名稱是否匹配");
}
    
    if (selectedExercise === "ALL") {
      console.log("已選取全部，回傳行數：", allValidRows.length);
      return allValidRows;
    }

    const { kEx } = keys;
    const res = allValidRows.filter(r => String(r[kEx] ?? "").trim() === selectedExercise);
    console.log(`篩選單場 ${selectedExercise}，結果行數：`, res.length);
    return res;
  }, [allValidRows, selectedExercise, keys]);

  // minDateStr / maxDateStr（依目前 filteredRows）
  const {minDateStr, maxDateStr} = useMemo(()=>{
    if (filteredRows.length===0) return {minDateStr:"", maxDateStr:""};
    let min: Date|null = null;
    let max: Date|null = null;
    for (const r of filteredRows){
      const d = parseYMD(String(r[keys.kDate] ?? ""));
      if (d){
        if (!min || d < min) min = d;
        if (!max || d > max) max = d;
      }
    }
    return {
      minDateStr: min ? toYMD(min) : "",
      maxDateStr: max ? toYMD(max) : ""
    };
  }, [filteredRows, keys]);

  const windowRange = useMemo(()=>{
    const start0 = minDateStr;
    const end0 = maxDateStr;
    if (!start0 || !end0) return { start:"", end:"" };
    const start = (winStart && winStart >= start0) ? winStart : start0;
    const end   = (winEnd && winEnd <= end0) ? winEnd : end0;
    return { start, end };
  }, [minDateStr, maxDateStr, winStart, winEnd]);

  const rowsInWindow = useMemo(()=>{
    if (!windowRange.start || !windowRange.end) return [];
    const kDate = keys.kDate;
    return filteredRows.filter(r => {
      const d = parseYMD(String(r[kDate] ?? ""));
      if (!d) return false;
      const day = toYMD(d);
      return day >= windowRange.start && day <= windowRange.end;
    });
  }, [filteredRows, keys, windowRange]);

  /** 核心運算：全域基線 + Log10 + 真實 Z-score */
  const preview = useMemo(()=>{
    if (allValidRows.length===0) return null;
    const kDate = keys.kDate;

    let dmin: Date|undefined, dmax: Date|undefined;
    allValidRows.forEach(r => {
      const d = parseYMD(String(r[kDate] ?? ""));
      if (!d) return;
      dmin = dmin ? (d<dmin?d:dmin) : d;
      dmax = dmax ? (d>dmax?d:dmax) : d;
    });
    if (!dmin || !dmax) return null;
    const allDays = rangeDays(dmin, dmax);

    const mapJ = new Map<string, number>();
    const mapD = new Map<string, number>();
    const mapE = new Map<string, number>();

    allValidRows.forEach(r => {
      const d = parseYMD(String(r[kDate] ?? ""));
      if (!d) return;
      const day = toYMD(d);
      const rawMan  = String(r[keys.kManual] ?? "").trim();
      const rawAuto = String(r[keys.kAuto]   ?? "").trim();
      const targetStr = (rawMan && rawMan.toLowerCase() !== "nan") ? rawMan : rawAuto;
      let val = 0;
      if (!isNaN(parseFloat(targetStr))) val = parseInt(targetStr, 10);
      else if (targetStr.includes("_")) val = parseInt(targetStr.split("_")[0], 10);
      if (val === 1) mapJ.set(day, (mapJ.get(day)||0) + 1);
      if (val === 2) mapD.set(day, (mapD.get(day)||0) + 1);
      if (val >= 3)  mapE.set(day, (mapE.get(day)||0) + 1);
    });

    const seriesJ = allDays.map(d => mapJ.get(d) || 0);
    const seriesD = allDays.map(d => mapD.get(d) || 0);
    const seriesE = allDays.map(d => mapE.get(d) || 0);

    const tJ = useLog ? seriesJ.map(x => Math.log10(x + 1)) : seriesJ;
    const tD = useLog ? seriesD.map(x => Math.log10(x + 1)) : seriesD;
    const tE = useLog ? seriesE.map(x => Math.log10(x + 1)) : seriesE;

    const zJ = zScore(tJ);
    const zD = zScore(tD);
    const zE = zScore(tE);

    const rawNci = allDays.map((_, i) => (w1 * zJ[i]) + (w2 * zD[i]) + (w3 * zE[i]));
    const lineNci = movingAvg(rawNci, ma);
    const lineJ   = movingAvg(zJ, ma);
    const lineD   = movingAvg(zD, ma);
    const lineE   = movingAvg(zE, ma);

    const displayStartStr = windowRange.start || toYMD(dmin);
    const displayEndStr   = windowRange.end   || toYMD(dmax);

    const indices = allDays
      .map((d, i) => (d >= displayStartStr && d <= displayEndStr) ? i : -1)
      .filter(i => i !== -1);

    const displayDates = indices.map(i => allDays[i]);
    const displayNci = indices.map(i => lineNci[i]);
    const displayJ = indices.map(i => lineJ[i]);
    const displayD = indices.map(i => lineD[i]);
    const displayE = indices.map(i => lineE[i]);

    const subJ = rowsInWindow.reduce((acc, r) => {
      const target = (r[keys.kManual] && String(r[keys.kManual]).toLowerCase()!=='nan') ? r[keys.kManual] : r[keys.kAuto];
      return (String(target).startsWith('1')) ? acc+1 : acc;
    }, 0);
    const subD = rowsInWindow.reduce((acc, r) => {
      const target = (r[keys.kManual] && String(r[keys.kManual]).toLowerCase()!=='nan') ? r[keys.kManual] : r[keys.kAuto];
      return (String(target).startsWith('2')) ? acc+1 : acc;
    }, 0);
    const subE = rowsInWindow.reduce((acc, r) => {
      const target = (r[keys.kManual] && String(r[keys.kManual]).toLowerCase()!=='nan') ? r[keys.kManual] : r[keys.kAuto];
      const v = parseFloat(String(target));
      return (v>=3) ? acc+1 : acc;
    }, 0);
    const subAll = subJ + subD + subE;

    return {
      dates: displayDates,
      cover: `${displayStartStr} ~ ${displayEndStr}`,
      count: rowsInWindow.length,
      lineNci: displayNci, lineJ: displayJ, lineD: displayD, lineE: displayE,
      totJ: subJ, totD: subD, totE: subE, totAll: subAll,
      wStart: displayStartStr, wEnd: displayEndStr
    };
  }, [allValidRows, rowsInWindow, keys, ma, w1, w2, w3, useLog, windowRange]);

  const top10 = useMemo(()=>{
    if (rowsInWindow.length===0) return null;
    const textAll = rowsInWindow.map(r => `${r[keys.kText] ?? ""} ${r[keys.kSrc] ?? ""}`).join("\n");
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
  }, [rowsInWindow, keys]);

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

  function MultiLineChart({ x, nci, j, d, e }: any){
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    if (!x.length) return null;
    const W=1360, H=540, pad=96;
    const allVals: number[] = [];
    if (showNci) allVals.push(...nci);
    if (showJ) allVals.push(...j);
    if (showD) allVals.push(...d);
    if (showE) allVals.push(...e);
    allVals.push(1.5);
    let minV = Math.min(...allVals);
    let maxV = Math.max(...allVals);
    const range = maxV - minV;
    minV -= range * 0.05; maxV += range * 0.05;
    if (range === 0) { minV -= 1; maxV += 1; }
    const xs = x.map((_:any, i:number)=> pad + i*(W-2*pad)/Math.max(1,x.length-1));
    const yMap = (v:number) => pad + (H-2*pad)*(1 - (v - minV)/(maxV - minV));
    const toPath = (arr:number[]) => {
      return xs.map((X:number,i:number)=> `${i===0?"M":"L"} ${X.toFixed(1)} ${yMap(arr[i]).toFixed(1)}`).join(" ");
    };
    const yThreshold = yMap(1.5);
    const tickCount = Math.min(x.length, 8);
    const xticks: number[] = [];
    for(let k=0; k<tickCount; k++) xticks.push(Math.floor(k*(x.length-1)/(tickCount-1)));
    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = W / rect.width;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const gap = (W - 2 * pad) / Math.max(1, x.length - 1);
      let idx = Math.round((mouseX - pad) / gap);
      if (idx < 0) idx = 0; if (idx >= x.length) idx = x.length - 1;
      setHoverIdx(idx);
    };
    return (
      <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`} style={{border:"1px solid #d6dde8", background:"#fff", cursor: "crosshair", borderRadius: 18, boxShadow: "0 10px 30px rgba(15,23,42,0.08)"}}
        onMouseMove={handleMouseMove} onMouseLeave={()=>setHoverIdx(null)}>
        <rect x={0} y={0} width={W} height={H} fill="#fff"/>
        {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
          const val = minV + (maxV - minV) * r;
          const Y = pad + (H-2*pad)*(1-r);
          return (
            <g key={i}><line x1={pad} y1={Y} x2={W-pad} y2={Y} stroke="#e5e7eb"/>
            <text x={pad-5} y={Y+4} fontSize="22" textAnchor="end" fill="#64748b">{val.toFixed(1)}</text></g>
          );
        })}
        <line x1={pad} y1={yThreshold} x2={W-pad} y2={yThreshold} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5,3" />
        <text x={W-pad-10} y={yThreshold-6} fill="#ef4444" fontSize="24" textAnchor="end" fontWeight="bold">預警門檻 (Z=1.5)</text>
        {showJ && <path d={toPath(j)} fill="none" stroke="#16a34a" strokeWidth={3} opacity={0.8} />}
        {showD && <path d={toPath(d)} fill="none" stroke="#f59e0b" strokeWidth={3} opacity={0.8} />}
        {showE && <path d={toPath(e)} fill="none" stroke="#dc2626" strokeWidth={3} opacity={0.8} />}
        {showNci && <path d={toPath(nci)} fill="none" stroke="#2563eb" strokeWidth={4} />}
        {hoverIdx !== null && (
          <g>
            <line x1={xs[hoverIdx]} y1={pad} x2={xs[hoverIdx]} y2={H-pad} stroke="#475569" strokeWidth={1.5} strokeDasharray="6,4" />
            <g transform={`translate(${xs[hoverIdx] > W/2 ? xs[hoverIdx] - 280 : xs[hoverIdx] + 10}, ${pad + 10})`}>
  <rect x={0} y={0} width={250} height={164} fill="rgba(255, 255, 255, 0.9)" stroke="#ccc" rx={6} />
  <text x={10} y={34} fontSize="24" fontWeight="bold" fill="#333">{x[hoverIdx]}</text>
  {showNci && <text x={10} y={70} fontSize="22" fill="#2563eb" fontWeight="bold">NCI: {nci[hoverIdx].toFixed(2)}</text>}
  {showE && <text x={10} y={100} fontSize="22" fill="#dc2626">升級(L3): {e[hoverIdx].toFixed(2)}</text>}
  {showD && <text x={10} y={130} fontSize="22" fill="#f59e0b">威懲(L2): {d[hoverIdx].toFixed(2)}</text>}
  {showJ && <text x={10} y={160} fontSize="22" fill="#16a34a">意圖(L1): {j[hoverIdx].toFixed(2)}</text>}
</g>
            {showNci && <circle cx={xs[hoverIdx]} cy={yMap(nci[hoverIdx])} r={6} fill="#2563eb" stroke="#fff" strokeWidth={2} />}
          </g>
        )}
        <line x1={pad} y1={pad} x2={pad} y2={H-pad} stroke="#334155" strokeWidth={1.5}/>
        <line x1={pad} y1={H-pad} x2={W-pad} y2={H-pad} stroke="#334155" strokeWidth={1.5}/>
        {xticks.map((i, idx) => (<text key={idx} x={xs[i]} y={H-pad+28} fontSize="24" textAnchor="middle">{x[i]}</text>))}
        <text x={34} y={H/2} transform={`rotate(-90, 34, ${H/2})`} fontSize="28" fill="#0f172a" fontWeight="700">NCI 指數 (Z-score)</text>
      </svg>
    );
  }

  const tableRows = useMemo(()=>{
    if (rowsInWindow.length===0) return [];
    const kDate = keys.kDate;
    const arr = rowsInWindow.slice();
    arr.sort((a,b)=>{
      const da = parseYMD(String(a[kDate]??""))?.getTime() ?? 0;
      const db = parseYMD(String(b[kDate]??""))?.getTime() ?? 0;
      return da - db;
    });
    return arr;
  }, [rowsInWindow, keys]);

  const visibleRows = tableRows.slice(0, visibleCount);
  const resetWindow = () => { setWinStart(""); setWinEnd(""); };

  return (
    <main style={styles.main}>
      {errorMsg && (<div style={{background:"#fef2f2", color:"#b91c1c", padding:12, borderRadius:8, marginBottom:10, border:"1px solid #fecaca"}}>🚨 {errorMsg}</div>)}
      <div style={{margin:"8px 0", display:"flex", alignItems:"center"}}>
        <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={onPickFile} disabled={loading}/>
        {loading && <span style={{marginLeft:10, color:"#2563eb", fontWeight:600}}>⚡ 處理中，請稍候...</span>}
      </div>

      <section style={styles.sectionCard}>
        <label>所屬軍演：
          <select
            value={selectedExercise}
            onChange={e=>setSelectedExercise(e.target.value)}
            style={{...styles.ibox, width:320, marginLeft:6}}
          >
            <option value="ALL">全部 (顯示全時期 7 場軍演數據)</option>
            {EXERCISE_ORDER.map(op => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
        </label>
        <span style={{marginLeft:10, color:"#64748b", fontSize:14}}>
          {selectedExercise === "ALL" ? "(已整合 7 場軍演數據)" : "(已鎖定特定軍演場次)"}
        </span>
      </section>

      <section style={styles.heroWrap}>
        <div style={styles.heroTitleRow}>
          <div>
            <div style={styles.eyebrow}>NARRATIVE COERCION INDEX</div>
            <h1 style={styles.h1}>敘事脅迫指數（NCI）預警平台</h1>
            <div style={styles.heroSub}>供論文截圖與展示使用的放大版介面</div>
          </div>
          <div style={styles.statusPill}>PRINT MODE</div>
        </div>

        <div style={styles.kpiGrid}>
          <div style={styles.kpiCard}>
            <div style={styles.kpiLabel}>事件窗內筆數</div>
            <div style={styles.kpiValue}>{preview?.count ?? 0}</div>
            <div style={styles.kpiNote}>目前載入資料筆數</div>
          </div>
          <div style={styles.kpiCard}>
            <div style={styles.kpiLabel}>涵蓋期間</div>
            <div style={{...styles.kpiValue, fontSize: 28}}>{preview?.cover ?? "~"}</div>
            <div style={styles.kpiNote}>依目前事件窗自動計算</div>
          </div>
          <div style={styles.kpiCard}>
            <div style={styles.kpiLabel}>顯示模式</div>
            <div style={{...styles.kpiValue, fontSize: 28}}>{selectedExercise === "ALL" ? "全部軍演" : "單一軍演"}</div>
            <div style={styles.kpiNote}>{selectedExercise === "ALL" ? "整合 7 場軍演資料" : selectedExercise}</div>
          </div>
        </div>
      </section>

      <section style={styles.sectionCard}>
        <div style={{...styles.grid3, fontSize: 20, fontWeight: 700}}>
          <label>MA 平滑天數<input type="number" value={ma} onChange={e=>setMA(+e.target.value||0)} style={styles.ibox}/></label>
          <div /><div />
          <label>事件窗起<input type="date" value={winStart} min={minDateStr||undefined} max={maxDateStr||undefined} onChange={e=>setWinStart(e.target.value)} style={styles.ibox}/>
            <div style={{fontSize:16, color:"#64748b", marginTop:6, fontWeight:500}}>不填則用：{minDateStr || "—"}</div>
          </label>
          <label>事件窗訖<input type="date" value={winEnd} min={minDateStr||undefined} max={maxDateStr||undefined} onChange={e=>setWinEnd(e.target.value)} style={styles.ibox}/>
            <div style={{fontSize:16, color:"#64748b", marginTop:6, fontWeight:500}}>不填則用：{maxDateStr || "—"}</div>
          </label>
          <div style={{display:"flex", alignItems:"flex-end"}}><button onClick={resetWindow} style={styles.btn} disabled={!minDateStr || !maxDateStr}>重置事件窗</button></div>
          <label>意圖權重 (L1)<input type="number" step="0.1" value={w1} onChange={e=>setW1(+e.target.value||0)} style={styles.ibox}/></label>
          <label>威懲權重 (L2)<input type="number" step="0.1" value={w2} onChange={e=>setW2(+e.target.value||0)} style={styles.ibox}/></label>
          <label>升級權重 (L3)<input type="number" step="0.1" value={w3} onChange={e=>setW3(+e.target.value||0)} style={styles.ibox}/></label>
        </div>
      </section>

      <div style={styles.noticeBox}>
        <strong>⚠️ 模式鎖定：</strong> NCI 計算使用「人工校正/Signal_Type」欄位，事件窗同步影響圖、統計與列表。
      </div>

      <section style={styles.sectionCard}>
      <div style={styles.toggleRow}>
        <span style={{color:"#666"}}>顯示線條：</span>
        <label><input type="checkbox" checked={showJ} onChange={e=>setShowJ(e.target.checked)} /> 意圖-L1（綠）</label>
        <label><input type="checkbox" checked={showD} onChange={e=>setShowD(e.target.checked)} /> 威懲-L2（黃）</label>
        <label><input type="checkbox" checked={showE} onChange={e=>setShowE(e.target.checked)} /> 升級-L3（紅）</label>
        <label><input type="checkbox" checked={showNci} onChange={e=>setShowNci(e.target.checked)} /> NCI（藍）</label>
        <button onClick={downloadNciCsv} disabled={!preview} style={{...styles.btn, marginLeft:"auto"}}>下載 NCI CSV</button>
      </div>
      </section>

      <section style={styles.sectionCard}>
      <h2 style={styles.sectionTitle}>指數圖（Z-Score）</h2>
      {preview && (<MultiLineChart x={preview.dates} nci={preview.lineNci} j={preview.lineJ} d={preview.lineD} e={preview.lineE} />)}
      </section>

      {preview && (
        <section style={styles.sectionCard}>
          <h3 style={styles.subTitle}>L1/L2/L3 文章統計（事件窗內）</h3>
          <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12}}>
            <div style={styles.card}><div style={styles.cardLabel}>L1 (意圖)</div><div style={styles.cardValue}>{preview.totJ}</div><div style={styles.cardNote}>比例：{preview.totAll ? ((preview.totJ/preview.totAll)*100).toFixed(1) : "0.0"}%</div></div>
            <div style={styles.card}><div style={styles.cardLabel}>L2 (威懲)</div><div style={styles.cardValue}>{preview.totD}</div><div style={styles.cardNote}>比例：{preview.totAll ? ((preview.totD/preview.totAll)*100).toFixed(1) : "0.0"}%</div></div>
            <div style={styles.card}><div style={styles.cardLabel}>L3 (升級)</div><div style={styles.cardValue}>{preview.totE}</div><div style={styles.cardNote}>比例：{preview.totAll ? ((preview.totE/preview.totAll)*100).toFixed(1) : "0.0"}%</div></div>
            <div style={styles.card}><div style={styles.cardLabel}>總文章數</div><div style={styles.cardValue}>{preview.totAll}</div><div style={styles.cardNote}>事件窗：{preview.wStart} ～ {preview.wEnd}</div></div>
          </div>
        </section>
      )}

      {top10 && (
        <section style={styles.sectionCard}>
          <h3 style={styles.subTitle}>關鍵詞 Top-10（事件窗內）</h3>
          <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12}}>
            <div style={styles.card}><div style={{...styles.cardLabel, color:"#065f46"}}>意圖詞庫</div><ol style={styles.keywordList}>{top10.J.map(x => <li key={x.t}>{x.t} <span style={{color:"#666"}}>({x.c})</span></li>)}</ol></div>
            <div style={styles.card}><div style={{...styles.cardLabel, color:"#92400e"}}>威懲詞庫</div><ol style={styles.keywordList}>{top10.D.map(x => <li key={x.t}>{x.t} <span style={{color:"#666"}}>({x.c})</span></li>)}</ol></div>
            <div style={styles.card}><div style={{...styles.cardLabel, color:"#991b1b"}}>升級詞庫</div><ol style={styles.keywordList}>{top10.E.map(x => <li key={x.t}>{x.t} <span style={{color:"#666"}}>({x.c})</span></li>)}</ol></div>
          </div>
        </section>
      )}

      <section style={styles.sectionCard}>
        <h3 style={styles.subTitle}>全部列出（目前顯示：{visibleRows.length} / {tableRows.length}）</h3>
        <div style={{marginBottom:8, display:"flex", gap:10}}>
          {visibleRows.length < tableRows.length && (
            <><button onClick={()=>setVisibleCount(prev=>prev+100)} style={styles.btn}>顯示更多 (+100)</button>
              <button onClick={()=>setVisibleCount(tableRows.length)} style={styles.btn}>顯示全部</button></>
          )}
        </div>
        <div style={styles.tableShell}>
          <div style={styles.tableScroll}>
            <table style={styles.table}>
              <thead style={{position:"sticky", top:0, zIndex:2}}>
                <tr><th style={styles.th}>日期</th><th style={styles.th}>所屬軍演</th><th style={styles.th}>來源</th><th style={styles.th}>台灣議題斷句</th></tr>
              </thead>
              <tbody>
                {visibleRows.map((r, idx)=>{
                  const date = String(r[keys.kDate] ?? ""); const ex = String(r[keys.kEx] ?? "");
                  const src = String(r[keys.kSrc] ?? ""); const txt = String(r[keys.kText] ?? "");
                  const sents = taiwanIssueSentences(txt);
                  return (
                    <tr key={idx}><td style={styles.tdSmall}>{date}</td><td style={styles.tdSmall}>{ex}</td><td style={styles.tdSmall}>{src}</td>
                      <td style={styles.td}>{sents.length ? (<div style={styles.sentWrap}>{sents.map((s,i)=>(<div key={i} style={styles.sentItem}><span style={{color:"#666"}}>({i+1}) </span><span>{highlightSentence3Colors(s)}</span></div>))}</div>) : (<span style={{color:"#999"}}>（無台灣語彙句）</span>)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}

/** ====== 樣式 ====== */
const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 1380,
    margin: "24px auto 48px",
    padding: "0 24px 48px",
    fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,'Noto Sans TC',sans-serif",
    color: "#0f172a",
    background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)",
  },
  heroWrap: {
    border: "1px solid #dbe5f0",
    borderRadius: 24,
    padding: "28px 32px",
    background: "linear-gradient(135deg, #f8fbff 0%, #eef6ff 100%)",
    boxShadow: "0 12px 32px rgba(15,23,42,0.08)",
    marginBottom: 18,
  },
  heroTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    flexWrap: "wrap",
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: "0.12em",
    color: "#2563eb",
    marginBottom: 8,
  },
  h1: { fontSize: 40, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" },
  heroSub: { fontSize: 18, color: "#475569", marginTop: 8 },
  statusPill: {
    alignSelf: "center",
    padding: "10px 16px",
    borderRadius: 999,
    border: "1px solid #bfdbfe",
    background: "#dbeafe",
    color: "#1d4ed8",
    fontWeight: 800,
    fontSize: 15,
    letterSpacing: "0.06em",
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 16,
    marginTop: 22,
  },
  kpiCard: {
    border: "1px solid #dbe5f0",
    borderRadius: 20,
    padding: "20px 22px",
    background: "#ffffff",
    boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
  },
  kpiLabel: { fontSize: 15, color: "#64748b", fontWeight: 700, marginBottom: 8 },
  kpiValue: { fontSize: 36, fontWeight: 800, lineHeight: 1.2, color: "#0f172a" },
  kpiNote: { fontSize: 15, color: "#64748b", marginTop: 8 },
  sectionCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 20,
    padding: "22px 24px",
    background: "#ffffff",
    boxShadow: "0 10px 28px rgba(15,23,42,0.05)",
    marginTop: 18,
  },
  sectionTitle: { fontSize: 28, fontWeight: 800, margin: "0 0 16px" },
  subTitle: { fontSize: 23, fontWeight: 800, margin: "0 0 14px" },
  noticeBox: {
    marginTop: 14,
    padding: "14px 16px",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 14,
    fontSize: 16,
    color: "#1d4ed8",
    lineHeight: 1.65,
  },
  grid3: {
    display:"grid",
    gridTemplateColumns:"repeat(3, minmax(0, 1fr))",
    gap:18,
    marginTop:10,
    alignItems: "start",
  },
  ibox: {
    display:"block",
    width:"100%",
    minHeight: 48,
    marginTop:8,
    padding:"10px 12px",
    border:"1px solid #cbd5e1",
    borderRadius:12,
    fontSize:22,
    fontWeight: 700,
    background:"#fff",
  },
  btn:  {
    padding:"13px 20px",
    border:"1px solid #cbd5e1",
    borderRadius:12,
    background:"#fff",
    cursor:"pointer",
    fontSize:20,
    fontWeight:800,
    color:"#0f172a",
  },
  toggleRow: {
    marginTop: 0,
    display:"flex",
    gap:18,
    flexWrap:"wrap",
    alignItems:"center",
    fontSize: 16,
    lineHeight: 1.6,
  },
  tableShell: { border:"1px solid #dbe5f0", borderRadius:16, overflow:"hidden", background:"#fff" },
  tableScroll: { maxHeight:700, overflow:"auto" },
  table: { width:"100%", borderCollapse:"collapse", tableLayout:"fixed" },
  th:   {
    textAlign:"left",
    borderBottom:"1px solid #dbe5f0",
    padding:"14px 12px",
    background:"#f8fafc",
    fontWeight:800,
    fontSize:16,
    color:"#334155",
  },
  td:   {
    borderBottom:"1px solid #eef2f7",
    verticalAlign:"top",
    padding:"14px 12px",
    fontSize:17,
    lineHeight: 1.8,
  },
  tdSmall: {
    borderBottom:"1px solid #eef2f7",
    verticalAlign:"top",
    padding:"14px 12px",
    fontSize:15,
    color:"#334155",
    whiteSpace:"nowrap",
  },
  card: {
    border:"1px solid #dbe5f0",
    borderRadius:16,
    padding:"18px 18px",
    background:"#fff",
    boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
  },
  cardLabel: { fontSize:20, color:"#64748b", fontWeight:800 },
  cardValue: { fontSize:34, fontWeight:800, marginTop:8, lineHeight: 1.15 },
  cardNote: { fontSize:15, color:"#64748b", marginTop:6, lineHeight: 1.55 },
  keywordList: { margin:"12px 0 0 24px", fontSize:22, lineHeight:1.9, fontWeight: 600 },
  sentWrap: { lineHeight:1.9, fontSize:17 },
  sentItem: { whiteSpace:"pre-wrap", marginBottom:10 },
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