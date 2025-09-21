'use client';

import React, { useMemo, useState } from 'react';

/* ==================== 關鍵詞 ==================== */
/** 一般「關鍵詞」（不含你剛剛那 9 個；它們已移到威懲黃籃） */
const KEYWORDS = [
  '台灣','台湾','台海','軍演','演訓','佩洛西','制裁','嚴正','堅決','強烈',
  '導彈','东风','實彈','实弹','行动','行動','嚴重後果','严重后果','維權','維穩'
];
const KW_RE = new RegExp(KEYWORDS.map(esc).join('|'), 'g');

/* 台灣主題詞（決定是否屬台灣議題，必須共現） */
const TW_TERMS = [
  '台灣','台湾','臺灣','台海','臺海','兩岸','两岸','海峽','海峡','環台','环台',
  '台獨','台独','台灣當局','台湾當局','民進黨','民进党','金門','金门','馬祖','马祖','澎湖',
  '台北','臺北','高雄','新北','台中','臺中','台澎金馬','海峽中線','臺澎金馬'
];
const TW_RE = new RegExp(TW_TERMS.map(esc).join('|'), 'g');

/* 三籃字典：意圖 / 威懲 / 升級 */
const BAG_JUSTIFY = [
  '正當','正当','正當化','正当化','合理','必要','不得已','維護主權','维护主权',
  '捍衛','捍卫','維護','维护','嚴正','严正','堅決','坚决','嚴肅','严肃','正告','郑重'
];
const BAG_DETER = [
  '威懾','威慑','懲罰','惩罚','制裁','反制','嚴重後果','严重后果','必將付出代价','付出代價',
  '警告','譴責','谴责','報復','报复','強硬措施','强硬措施','停約','中止','斷交','驅逐','驅離','扣押',
  // 你要求的「黃色（新增）」＋「原先藍色新增的 9 個也併入黃色」
  '災難性後果','灾难性后果','發出錯誤信號','发出错误信号','死路一條','死路一条','粉碎',
  '外部勢力干涉','外部势力干涉','嚴重威脅','严重威胁','分裂','反對','反对','威脅','威胁'
];
const BAG_ESCALATE = [
  '升級','升级','加碼','加码','擴大','扩大','加強','加强','進一步','进一步','強化','强化','加快',
  '節奏','节奏','頻次','频次','多點','多域','多方向','聯合演訓','联合演训','環台','环台','封控','封鎖','封锁',
  '實彈','实弹','導彈','导弹','遠火','远火','演習範圍','演习范围','臨時管制區','临时管制区'
];
const RE_JUSTIFY  = makeRe(BAG_JUSTIFY);
const RE_DETER    = makeRe(BAG_DETER);
const RE_ESCALATE = makeRe(BAG_ESCALATE);

/* 顏色 */
const COLOR_BLUE  = '#3b82f6'; // NCI
const COLOR_GREEN = '#16a34a'; // 意圖
const COLOR_YELL  = '#f59e0b'; // 威懲
const COLOR_RED   = '#ef4444'; // 升級

/* 工具 */
function esc(s: string){ return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); }
function makeRe(list: string[]){ return new RegExp(list.map(esc).join('|'), 'g'); }
function hitCount(re: RegExp, s: string){ return (s.match(re) || []).length; }
function stripBom(s: string){ return s.replace(/^\uFEFF/, ''); }
function toYMD(d: Date){ return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0,10); }
function parseYMD(s: string){
  const t = s.trim().replace(/["']/g,'');
  const m = t.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
}
function addDays(d: Date, n: number){ const x = new Date(d); x.setUTCDate(x.getUTCDate()+n); return x; }
function rangeDays(a: Date, b: Date){ const out:string[]=[]; for(let d=new Date(a); d<=b; d=addDays(d,1)) out.push(toYMD(d)); return out; }
function movingAvg(arr:number[], k:number){ if(k<=1) return arr.slice(); const out=new Array(arr.length).fill(0); let sum=0; for(let i=0;i<arr.length;i++){ sum+=arr[i]; if(i>=k) sum-=arr[i-k]; out[i]=i>=k-1?sum/k:sum/(i+1);} return out; }
function diffAbs(a:number[]){ const out=new Array(a.length).fill(0); for(let i=1;i<a.length;i++) out[i]=Math.abs(a[i]-a[i-1]); return out; }
function secondDiffAbs(a:number[]){ return diffAbs(diffAbs(a)); }
function shift(a:number[], lead:number){ const n=a.length, out=new Array(n).fill(0); for(let i=0;i<n;i++){ const j=i+lead; if(j>=0&&j<n) out[i]=a[j]; } return out; }
function minMaxNormByWindow(series:number[], dates:string[], winStart:string, winEnd:string){
  let lo=+Infinity, hi=-Infinity;
  for(let i=0;i<dates.length;i++) if(dates[i]>=winStart && dates[i]<=winEnd){ if(series[i]<lo) lo=series[i]; if(series[i]>hi) hi=series[i]; }
  if(!isFinite(lo)||!isFinite(hi)||hi===lo){ lo=Math.min(...series); hi=Math.max(...series); if(hi===lo) return series.map(()=>0.5); }
  const span=hi-lo; return series.map(v=>Math.max(0,Math.min(1,(v-lo)/span)));
}

/* 解析 CSV/TSV */
function parseTable(text: string): {rows:any[], headers:string[], delim:string}{
  const raw = stripBom(text.replace(/\r\n/g,'\n'));
  const firstLine = raw.split('\n')[0] ?? '';
  const delim = firstLine.includes('\t') ? '\t' : ',';
  const lines = raw.split('\n').filter(l=>l.length>0);
  if (lines.length===0) return {rows:[], headers:[], delim};
  const headers = parseLine(lines[0], delim).map(h=>stripBom(h).replace(/(^"|"$)/g,''));
  const rows:any[] = [];
  for (let i=1;i<lines.length;i++){
    const cols = parseLine(lines[i], delim); if(cols.length===0) continue;
    const obj:any = {}; for(let j=0;j<headers.length;j++) obj[headers[j]] = (cols[j] ?? '').replace(/(^"|"$)/g,'');
    rows.push(obj);
  }
  return {rows, headers, delim};
}
function parseLine(line:string, delim:string){
  const out:string[]=[]; let cur='', q=false;
  for(let i=0;i<line.length;i++){ const c=line[i];
    if(q){ if(c=== '"'){ if(line[i+1] === '"'){ cur+='"'; i++; } else q=false; } else cur+=c; }
    else { if(c=== '"') q=true; else if(c===delim){ out.push(cur); cur=''; } else cur+=c; }
  }
  out.push(cur); return out;
}

/* 型別 */
type F1Mode = 'docs' | 'keywords' | 'chars' | 'intent';
type ViewLine = 'all' | 'nci' | 'justify' | 'deter' | 'escalate';

/* 記者提問判斷（不計分） */
function isReporterQuestion(txt:string){
  const t = txt.trim();
  return /^(（?記者[^）]*）?\s*|^記者[:：]|^提問[:：]|^問[:：]|^Q[:：])/m.test(t);
}

/* 斷句＋台灣議題過濾（僅保留：含台灣語彙 且 含三籃或一般關鍵詞 的句子） */
function splitSentences(s:string){
  return s.replace(/\s+/g,' ').split(/(?<=[。！？!?；;])/g).map(x=>x.trim()).filter(Boolean);
}
function keepTaiwanIntentSentence(sent:string){
  // 共現檢查：台灣語彙 + （三籃或一般關鍵詞）
  TW_RE.lastIndex = RE_JUSTIFY.lastIndex = RE_DETER.lastIndex = RE_ESCALATE.lastIndex = KW_RE.lastIndex = 0;
  const hasTW = TW_RE.test(sent);
  if (!hasTW) return false;
  return RE_JUSTIFY.test(sent) || RE_DETER.test(sent) || RE_ESCALATE.test(sent) || KW_RE.test(sent);
}

/* 高亮（綠/黃/紅可同時存在） */
function highlight(text:string, enable:boolean){
  if (!enable || !text) return text;
  let out = text;
  RE_JUSTIFY.lastIndex = RE_DETER.lastIndex = RE_ESCALATE.lastIndex = 0;
  out = out.replace(RE_JUSTIFY,  m=>`<mark style="background:transparent;color:${COLOR_GREEN};font-weight:700">${m}</mark>`);
  out = out.replace(RE_DETER,    m=>`<mark style="background:${COLOR_YELL};color:#111;padding:0 2px;border-radius:3px">${m}</mark>`);
  out = out.replace(RE_ESCALATE, m=>`<mark style="background:${COLOR_RED};color:#fff;padding:0 2px;border-radius:3px">${m}</mark>`);
  return out;
}

/* ==================== 主元件 ==================== */
export default function Page(){
  const [fileName, setFileName] = useState<string>('');
  const [rows, setRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [delim, setDelim] = useState<string>(',');

  // 參數
  const [w1, setW1] = useState(0.4);
  const [w2, setW2] = useState(0.3);
  const [w3, setW3] = useState(0.3);
  const [ma, setMA] = useState(7);
  const [lead, setLead] = useState(0);
  const [f1Mode, setF1Mode] = useState<F1Mode>('docs');

  // 額外控制
  const [enableHighlight, setEnableHighlight] = useState(true);
  const [dropReporterQ, setDropReporterQ] = useState(true);

  // 顯示哪一條線
  const [viewLine, setViewLine] = useState<ViewLine>('all');

  // 事件窗（依資料起迄）
  const {minDateStr, maxDateStr} = useMemo(()=>{
    const ds:Date[] = [];
    for (const r of rows){
      const k = findKey(r, ['date','日期']); const d = k ? parseYMD(String(r[k])) : null;
      if (d) ds.push(d);
    }
    if (ds.length===0) return {minDateStr:'', maxDateStr:''};
    ds.sort((a,b)=>+a-+b);
    return {minDateStr:toYMD(ds[0]), maxDateStr:toYMD(ds[ds.length-1])};
  },[rows]);

  const [winStart, setWinStart] = useState('');
  const [winEnd, setWinEnd] = useState('');

  /* 讀檔 */
  function onPickFile(e:React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0]; if(!f) return;
    setFileName(f.name);
    const fr = new FileReader();
    fr.onload = () => {
      const text = typeof fr.result === 'string' ? fr.result : new TextDecoder('utf-8').decode(fr.result as ArrayBuffer);
      const {rows, headers, delim} = parseTable(text);
      setRows(rows); setHeaders(headers); setDelim(delim);
      if (!winStart && !winEnd){ setWinStart(prev=>prev||''); setWinEnd(prev=>prev||''); }
    };
    fr.readAsText(f);
  }

  /* 清洗：去記者提問 → 斷句取台灣議題短句；無短句則丟棄（=> 只剩發言人回答且與台灣共現） */
  const filteredRows = useMemo(()=>{
    if (rows.length===0) return rows;
    const kText = findKeyFromArray(rows, ['text','內容','content','文本']);
    const kSrc  = findKeyFromArray(rows, ['source','來源','source_name']);
    return rows
      .filter(r=>{
        const txt = ((kText ? r[kText] : '') + ' ' + (kSrc ? r[kSrc] : '')).toString();
        return dropReporterQ ? !isReporterQuestion(txt) : true;
      })
      .map(r=>{
        const raw = ((kText ? r[kText] : '') + ' ' + (kSrc ? r[kSrc] : '')).toString();
        const kept = splitSentences(raw).filter(keepTaiwanIntentSentence);
        const shortText = kept.join(' ');
        return shortText ? {...r, [kText]: shortText} : null;
      })
      .filter(Boolean) as any[];
  },[rows, dropReporterQ]);

  /* 計算四條指數＋表格（全部以 filteredRows 為準） */
  const preview = useMemo(()=>{
    const R = filteredRows;
    if (R.length===0) return null;

    const kDate = findKeyFromArray(R, ['date','日期']);
    const kText = findKeyFromArray(R, ['text','內容','content','文本']);
    const kSrc  = findKeyFromArray(R, ['source','來源','source_name']);

    const dayMap = new Map<string, {f1:number; j:number; d:number; e:number}>();
    let dmin:Date|undefined, dmax:Date|undefined;

    const tfJ = new Map<string, number>();
    const tfD = new Map<string, number>();
    const tfE = new Map<string, number>();

    for (const r of R){
      const raw = kDate ? String(r[kDate]) : '';
      const d = parseYMD(raw); if(!d) continue;
      const day = toYMD(d);
      const txt = ((kText ? r[kText] : '') + ' ' + (kSrc ? r[kSrc] : '')).toString();

      // f1（若選 keywords，也只會在過濾後的、與台灣共現的短句上計數）
      let f1Val = 0;
      if (f1Mode==='docs') f1Val = 1;
      else if (f1Mode==='chars') f1Val = txt.length/1000;
      else if (f1Mode==='keywords') f1Val = (txt.match(KW_RE)||[]).length;

      const j = hitCount(RE_JUSTIFY, txt);
      const dHit = hitCount(RE_DETER, txt);
      const e = hitCount(RE_ESCALATE, txt);

      // 詞頻
      for (const w of BAG_JUSTIFY){ const c=(txt.match(new RegExp(esc(w),'g'))||[]).length; if(c) tfJ.set(w,(tfJ.get(w)||0)+c); }
      for (const w of BAG_DETER){   const c=(txt.match(new RegExp(esc(w),'g'))||[]).length; if(c) tfD.set(w,(tfD.get(w)||0)+c); }
      for (const w of BAG_ESCALATE){const c=(txt.match(new RegExp(esc(w),'g'))||[]).length; if(c) tfE.set(w,(tfE.get(w)||0)+c); }

      const prev = dayMap.get(day) || {f1:0,j:0,d:0,e:0};
      dayMap.set(day, {f1: prev.f1 + (f1Mode==='intent' ? j+dHit+e : f1Val), j: prev.j + j, d: prev.d + dHit, e: prev.e + e});

      dmin = dmin ? (d<dmin?d:dmin) : d;
      dmax = dmax ? (d>dmax?d:dmax) : d;
    }

    if (!dmin || !dmax){
      return {
        count: R.length, cover:'~', dates:[], nci:[], jIdx:[], dIdx:[], eIdx:[],
        totals:{J:0,D:0,E:0}, proportions:{J:0,D:0,E:0}, tfTop:{J:[],D:[],E:[]}, rowsForPreview:[], kDate:'date', kText:'text'
      } as const;
    }

    const days = rangeDays(dmin, dmax);
    const f1 = days.map(d => (dayMap.get(d)?.f1)||0);
    const jSeries = days.map(d => (dayMap.get(d)?.j)||0);
    const dSeries = days.map(d => (dayMap.get(d)?.d)||0);
    const eSeries = days.map(d => (dayMap.get(d)?.e)||0);

    const s1 = movingAvg(f1, ma);
    const s2 = movingAvg(diffAbs(f1), ma);
    const s3 = movingAvg(secondDiffAbs(f1), ma);
    const mix = s1.map((_,i)=> w1*s1[i] + w2*s2[i] + w3*s3[i]);

    const wStart = (winStart || days[0]);
    const wEnd   = (winEnd   || days[days.length-1]);

    const nci0 = minMaxNormByWindow(mix, days, wStart, wEnd);
    const jIdx0 = minMaxNormByWindow(movingAvg(jSeries, ma), days, wStart, wEnd);
    const dIdx0 = minMaxNormByWindow(movingAvg(dSeries, ma), days, wStart, wEnd);
    const eIdx0 = minMaxNormByWindow(movingAvg(eSeries, ma), days, wStart, wEnd);

    const nci = shift(nci0, lead);
    const jIdx = shift(jIdx0, lead);
    const dIdx = shift(dIdx0, lead);
    const eIdx = shift(eIdx0, lead);

    const sum = (arr:number[])=>arr.reduce((a,b)=>a+b,0);
    const totals = { J: sum(jSeries), D: sum(dSeries), E: sum(eSeries) };
    const totalHits = totals.J + totals.D + totals.E || 1;
    const proportions = { J: totals.J/totalHits, D: totals.D/totalHits, E: totals.E/totalHits };

    const topN = (m:Map<string,number>, n=10)=>Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).slice(0,n);

    return {
      count:R.length,
      cover:`${toYMD(dmin)} ~ ${toYMD(dmax)}`,
      dates:days,
      nci, jIdx, dIdx, eIdx,
      totals, proportions,
      tfTop:{ J: topN(tfJ), D: topN(tfD), E: topN(tfE) },
      rowsForPreview:R, kDate, kText
    } as const;
  },[filteredRows, f1Mode, w1,w2,w3, ma, lead, winStart, winEnd]);

  /* 下載四線 CSV */
  function downloadNciCsv(){
    if (!preview) return;
    const lines = ['date,nci,intent_justify,intent_deter,intent_escalate'];
    for (let i=0;i<preview.dates.length;i++){
      lines.push(`${preview.dates[i]},${preview.nci[i].toFixed(6)},${preview.jIdx[i].toFixed(6)},${preview.dIdx[i].toFixed(6)},${preview.eIdx[i].toFixed(6)}`);
    }
    const csv = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nci_with_intents.csv';
    a.click(); URL.revokeObjectURL(a.href);
  }

  /* 圖表（可單選） */
  function ChartMulti({x, series}:{x:string[]; series:Array<{label:string;color:string;data:number[]}>}){
    if (x.length===0) return null;
    const W=1000, H=380, pad=30;
    const xs = x.map((_,i)=> pad + i*(W-2*pad)/Math.max(1,x.length-1));
    const minY=0, maxY=1;
    const pathFor=(data:number[])=>{
      const ys = data.map(v=> pad + (H-2*pad)*(1-(v-minY)/(maxY-minY)));
      return xs.map((X,i)=>`${i===0?'M':'L'} ${X.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
    };

    let tickCount = x.length<=14 ? x.length : Math.min(9, Math.max(6, Math.floor((W-2*pad)/120)));
    if (x.length===1) tickCount = 1;
    const idxCand:number[]=[]; for(let k=0;k<tickCount;k++){ const i = (tickCount===1)?0:Math.round(k*(x.length-1)/(tickCount-1)); idxCand.push(i); }
    const seen = new Set<number>(); const xticks = idxCand.filter(i=> seen.has(i)?false:(seen.add(i),true));

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{border:'1px solid #eee', background:'#fff'}}>
        <rect x={0} y={0} width={W} height={H} fill="#fff"/>
        {[0,0.25,0.5,0.75,1].map((g,idx)=>{ const Y=pad+(H-2*pad)*(1-g); return <g key={idx}><line x1={pad} y1={Y} x2={W-pad} y2={Y} stroke="#eee"/><text x={pad-8} y={Y+4} fontSize="10" textAnchor="end">{g.toFixed(2)}</text></g>; })}
        <line x1={pad} y1={pad} x2={pad} y2={H-pad} stroke="#333"/><line x1={pad} y1={H-pad} x2={W-pad} y2={H-pad} stroke="#333"/>
        {xticks.map((i,idx)=>{ const X=xs[i]; return (<g key={idx}><line x1={X} y1={H-pad} x2={X} y2={H-pad+6} stroke="#333"/><text x={X} y={H-pad+20} fontSize="10" textAnchor="middle">{x[i]}</text></g>); })}
        <text x={12} y={H/2} transform={`rotate(-90, 12, ${H/2})`} fontSize="12" fill="#333">指數值（0..1；事件窗內相對化）</text>
        {series.map((s,idx)=> (<path key={idx} d={pathFor(s.data)} fill="none" stroke={s.color} strokeWidth={2.5}/>))}
        {/* 圖例 */}
        <g>{series.map((s,i)=> (<g key={i} transform={`translate(${pad + i*180}, 8)`}><rect width={18} height={3} y={6} fill={s.color}/><text x={24} y={10} fontSize="12">{s.label}</text></g>))}</g>
      </svg>
    );
  }

  const count = preview?.count ?? 0;
  const cover = preview?.cover ?? '~';

  const chartSeries = useMemo(()=>{
  if (!preview) return [];
  const menu: Record<ViewLine, Array<{label:string;color:string;data:number[]}>> = {
    all: [
      { label:'NCI（藍）',  color:COLOR_BLUE,  data: [...preview.nci] },
      { label:'意圖（綠）',  color:COLOR_GREEN, data: [...preview.jIdx] },
      { label:'威懲（黃）',  color:COLOR_YELL,  data: [...preview.dIdx] },
      { label:'升級（紅）',  color:COLOR_RED,   data: [...preview.eIdx] },
    ],
    nci:      [{ label:'NCI（藍）',  color:COLOR_BLUE,  data: [...preview.nci] }],
    justify:  [{ label:'意圖（綠）',  color:COLOR_GREEN, data: [...preview.jIdx] }],
    deter:    [{ label:'威懲（黃）',  color:COLOR_YELL,  data: [...preview.dIdx] }],
    escalate: [{ label:'升級（紅）',  color:COLOR_RED,   data: [...preview.eIdx] }],
  };
  return menu[viewLine];
}, [preview, viewLine]);

  return (
    <main style={{maxWidth:1100, margin:'20px auto', padding:'0 16px', fontFamily:"-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,'Noto Sans TC',sans-serif"}}>
      <h1 style={{fontSize:26, fontWeight:700}}>NCI：上傳 TSV/CSV 並預覽（台灣議題過濾版）</h1>

      <div style={{margin:'8px 0'}}>
        <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={onPickFile}/>
        {fileName && <span style={{marginLeft:12, color:'#555'}}>{fileName}</span>}
      </div>

      <div style={{display:'flex', gap:40, flexWrap:'wrap', margin:'10px 0 4px'}}>
        <div><div style={{color:'#666'}}>筆數（過濾後）</div><div style={{fontSize:22, fontWeight:600}}>{count}</div></div>
        <div><div style={{color:'#666'}}>涵蓋</div><div style={{fontSize:18}}>{cover}</div></div>
      </div>

      {/* 參數 */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14, marginTop:8}}>
        <label>MA 天數<input type="number" value={ma} onChange={e=>setMA(+e.target.value||0)} style={ibox}/></label>
        <label>Lead-time（日）<input type="number" value={lead} onChange={e=>setLead(parseInt(e.target.value||'0'))} style={ibox}/></label>
        <div/>
        <label>事件窗起<input type="date" value={winStart||minDateStr} onChange={e=>setWinStart(e.target.value)} style={ibox}/></label>
        <label>事件窗訖<input type="date" value={winEnd||maxDateStr} onChange={e=>setWinEnd(e.target.value)} style={ibox}/></label>
        <div/>
        <label>權重 f1<input type="number" step="0.1" value={w1} onChange={e=>setW1(+e.target.value||0)} style={ibox}/></label>
        <label>權重 f2<input type="number" step="0.1" value={w2} onChange={e=>setW2(+e.target.value||0)} style={ibox}/></label>
        <label>權重 f3<input type="number" step="0.1" value={w3} onChange={e=>setW3(+e.target.value||0)} style={ibox}/></label>
      </div>

      {/* 選單 */}
      <div style={{marginTop:8, display:'flex', gap:18, alignItems:'center', flexWrap:'wrap'}}>
        <label>f1 量度：
          <select value={f1Mode} onChange={e=>setF1Mode(e.target.value as F1Mode)} style={{...ibox, width:300, marginLeft:6}}>
            <option value="docs">每天文件數（原版）</option>
            <option value="keywords">關鍵詞命中數</option>
            <option value="chars">文字長度（千字）</option>
            <option value="intent">意圖詞庫命中（正當化/威懲/升級）</option>
          </select>
        </label>
        <label>顯示指數：
          <select value={viewLine} onChange={e=>setViewLine(e.target.value as ViewLine)} style={{...ibox, width:220, marginLeft:6}}>
            <option value="all">全部</option>
            <option value="nci">NCI（藍）</option>
            <option value="justify">意圖（綠）</option>
            <option value="deter">威懲（黃）</option>
            <option value="escalate">升級（紅）</option>
          </select>
        </label>
        <label style={{display:'inline-flex', alignItems:'center', gap:6}}>
          <input type="checkbox" checked={enableHighlight} onChange={e=>setEnableHighlight(e.target.checked)}/> 文字高亮
        </label>
        <label style={{display:'inline-flex', alignItems:'center', gap:6}}>
          <input type="checkbox" checked={dropReporterQ} onChange={e=>setDropReporterQ(e.target.checked)}/> 清除「記者提問」
        </label>
      </div>

      <div style={{marginTop:14}}>
        <button onClick={downloadNciCsv} disabled={!preview} style={btn}>下載四線 CSV（NCI＋意圖/威懲/升級）</button>
      </div>

      <h2 style={{marginTop:18}}>指數走勢</h2>
      {preview && <ChartMulti x={[...preview.dates]} series={chartSeries} />}

      {/* 統計 */}
      {preview && (
        <section style={{marginTop:22}}>
          <h3>整體統計（台灣議題斷句後，事件窗內）</h3>
          <table style={{width:'100%', borderCollapse:'collapse', marginTop:6}}>
            <thead><tr><th style={th}>類別</th><th style={th}>命中總數</th><th style={th}>比例</th></tr></thead>
            <tbody>
              <tr><td style={td}>意圖（正當化/決心）</td><td style={td}>{preview.totals.J}</td><td style={td}>{(preview.proportions.J*100).toFixed(2)}%</td></tr>
              <tr><td style={td}>威懲</td><td style={td}>{preview.totals.D}</td><td style={td}>{(preview.proportions.D*100).toFixed(2)}%</td></tr>
              <tr><td style={td}>升級</td><td style={td}>{preview.totals.E}</td><td style={td}>{(preview.proportions.E*100).toFixed(2)}%</td></tr>
              <tr><td style={{...td,fontWeight:700}}>合計</td><td style={{...td,fontWeight:700}}>{preview.totals.J+preview.totals.D+preview.totals.E}</td><td style={{...td,fontWeight:700}}>100%</td></tr>
            </tbody>
          </table>

          <h3 style={{marginTop:18}}>關鍵詞 Top-10（各類別）</h3>
          <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12}}>
            {[
              {title:'意圖（綠）', color:COLOR_GREEN, data:preview.tfTop.J, total:preview.totals.J},
              {title:'威懲（黃）', color:COLOR_YELL,  data:preview.tfTop.D, total:preview.totals.D},
              {title:'升級（紅）', color:COLOR_RED,   data:preview.tfTop.E, total:preview.totals.E},
            ].map((blk,bi)=>(
              <table key={bi} style={{width:'100%', borderCollapse:'collapse', border:'1px solid #eee'}}>
                <thead>
                  <tr><th colSpan={3} style={{...th, textAlign:'left'}}><span style={{display:'inline-block', width:10, height:10, background:blk.color, marginRight:6}}/> {blk.title}</th></tr>
                  <tr><th style={th}>詞/詞組</th><th style={th}>次數</th><th style={th}>佔比（類內）</th></tr>
                </thead>
                <tbody>
                  {blk.data.map(([w,c]:any, i:number)=>(
                    <tr key={i}><td style={td}>{w}</td><td style={td}>{c}</td><td style={td}>{(((c as number)/(blk.total||1))*100).toFixed(2)}%</td></tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </section>
      )}

      <h2 style={{marginTop:18}}>NCI 與 意圖—威懲—升級指數（0-1）</h2>
      {preview && (
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead><tr>{['date','NCI','意圖','威懲','升級'].map((h,i)=><th key={i} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {preview.dates.map((d,i)=>(
              <tr key={i}>
                <td style={td}>{d}</td>
                <td style={td}>{preview.nci[i].toFixed(3)}</td>
                <td style={td}>{preview.jIdx[i].toFixed(3)}</td>
                <td style={td}>{preview.dIdx[i].toFixed(3)}</td>
                <td style={td}>{preview.eIdx[i].toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 全部列出（日期＋台灣議題短句，高亮） */}
      {preview && (
        <>
          <h3 style={{marginTop:16}}>全部列出（日期＋台灣議題關鍵字斷句）</h3>
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead><tr><th style={th}>日期</th><th style={th}>短句（綠=意圖、黃=威懲、紅=升級）</th></tr></thead>
            <tbody>
              {preview.rowsForPreview.map((r,ri)=>{
                const dateStr = String(r[preview.kDate] ?? '');
                const raw = String(r[preview.kText] ?? '');
                const show = enableHighlight ? highlight(raw, true) : raw;
                return (<tr key={ri}><td style={td}>{dateStr}</td><td style={{...td, lineHeight:1.5}} dangerouslySetInnerHTML={{__html:show}}/></tr>);
              })}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}

/* 樣式 */
const ibox: React.CSSProperties = { display:'block', width:180, marginTop:4, padding:'6px 8px', border:'1px solid #ddd', borderRadius:6 };
const btn: React.CSSProperties = { padding:'8px 14px', border:'1px solid #ddd', borderRadius:8, background:'#fff', cursor:'pointer' };
const th: React.CSSProperties = { textAlign:'left', borderBottom:'1px solid #eee', padding:'6px 4px', background:'#fafafa', fontWeight:600 };
const td: React.CSSProperties = { borderBottom:'1px solid #f2f2f2', verticalAlign:'top', padding:'6px 4px', fontSize:14 };

/* 找欄位（容錯） */
function findKey(obj:any, cands:string[]){
  const keys = Object.keys(obj).map(k=>stripBom(k));
  for (const c of cands){ const hit = keys.find(k=>k.toLowerCase()===c.toLowerCase()); if (hit) return hit; }
  return null;
}
function findKeyFromArray(rows:any[], cands:string[]){
  for (const r of rows){ const k = findKey(r, cands); if (k) return k; }
  return cands[0];
}
