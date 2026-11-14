// 케어포 XLS/XLSX 파일을 브라우저 내부에서 분석합니다. 원본은 서버에 전송하지 않습니다.
// SheetJS 런타임은 외부 CDN에서 불러오므로 네트워크/콘텐츠 차단 시 불러오기가 실패할 수 있습니다.
const LIBRARIES = [
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
];
let libraryPromise;
async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  if (!libraryPromise) libraryPromise = (async () => {
    for (const url of LIBRARIES) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = url; script.async = true;
          script.onload = resolve; script.onerror = () => {script.remove(); reject(new Error('라이브러리 로딩 실패'));};
          document.head.append(script);
        });
        if (window.XLSX) return window.XLSX;
      } catch { /* try fallback */ }
    }
    throw new Error('엑셀 읽기 도구를 불러오지 못했습니다. 인터넷 연결 또는 보안 차단 설정을 확인해 주세요.');
  })();
  return libraryPromise;
}
const clean = value => String(value ?? '').replace(/\u00a0/g, ' ').replace(/[\t\r]+/g,' ').replace(/ {2,}/g, ' ').trim();
const compact = value => clean(value).replace(/\s/g,'');
function dateValue(value, XLSX){
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  if (typeof value === 'number' && value > 30000 && value < 90000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if(parsed) return `${parsed.y}-${String(parsed.m).padStart(2,'0')}-${String(parsed.d).padStart(2,'0')}`;
  }
  const text = clean(value);
  const match = text.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (match){const [,y,m,d]=match;const dt = new Date(Number(y),Number(m)-1,Number(d));if(dt.getFullYear()===Number(y)&&dt.getMonth()===Number(m)-1&&dt.getDate()===Number(d))return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;}
  return '';
}
function findText(rows, labels, {avoid=[]}={}){
  const labelRx = new RegExp(labels,'i');
  for (const row of rows){
    for(let i=0;i<row.length;i++){
      const cell=clean(row[i]);
      if (!cell || !labelRx.test(compact(cell))) continue;
      if(avoid.some(a=>compact(cell).includes(a))) continue;
      const val = clean(cell.replace(labelRx,'').replace(/^[\s:：|\-]+/,''));
      if(val && val.length < 100 && !/^(내용|항목|적용|번호)$/.test(val))return val;
      for (let n=i+1;n<Math.min(row.length,i+5);n++) {
        const next=clean(row[n]);if(next && next.length<100 && !labelRx.test(compact(next)))return next;
      }
    }
  }
  return '';
}
function getPeriod(rows,XLSX){
  const allLines = rows.map(row=>row.map(clean).filter(Boolean).join(' | '));
  for (let i=0;i<allLines.length;i++) {
    if (!/적용\s*기간|계획\s*기간|제공\s*기간|적용\s*시작|계약\s*기간/.test(allLines[i]))continue;
    const block=allLines.slice(i,Math.min(i+3,allLines.length)).join(' ');
    const matches=[...block.matchAll(/20\d{2}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}/g)].map(m=>dateValue(m[0],XLSX));
    if(matches.length>=2)return [matches[0],matches[1]];
    const cells=rows.slice(i,i+3).flat();
    const parsed=cells.map(c=>dateValue(c,XLSX)).filter(Boolean);
    if(parsed.length>=2)return [parsed[0],parsed[1]];
  }
  return ['',''];
}
function findNeeds(rows){
  let start=-1;
  for(let i=0;i<rows.length;i++){
    if(rows[i].some(v=>/장기요양\s*필요\s*내용|장기요양\s*필요\s*서비스/.test(clean(v)))) {start=i;break;}
  }
  if(start<0)return [];
  const blocked=/종합\s*의견|개인별\s*장기요양|작성\s*일자|계획서\s*작성|급여\s*제공\s*계획|총괄|서명|특이사항|확인자/;
  const boilerplate=/^(장기요양\s*필요\s*(내용|서비스)|서비스\s*내용|급여\s*내용|항목|내용|제공\s*빈도|횟수|단위|비고|구분|번호|계|합계)$/;
  const needs=[];
  for(let i=start+1;i<Math.min(rows.length,start+65);i++){
    const text=rows[i].map(clean).filter(Boolean);
    if(text.some(t=>blocked.test(t)))break;
    for(const val of text){
      if(!val || boilerplate.test(val) || /^(\d+|\d+회|주\s*\d+회|일\s*\d+회)$/.test(val))continue;
      if(/^(20\d\d[./-]|\d+등급|인정번호)/.test(val))continue;
      if(val.length>=3 && val.length<=180 && !needs.includes(val))needs.push(val);
    }
  }
  return needs.slice(0,50);
}
function getOpinion(rows){
  const lines=rows.map(r=>r.map(clean).filter(Boolean).join(' '));
  let ix=lines.findIndex(v=>/종합\s*의견/.test(v));
  if(ix<0)ix=lines.findIndex(v=>/개인별\s*장기요양이용계획서/.test(v));
  if(ix<0)return '';
  const result=[];
  for(let n=ix;n<Math.min(lines.length,ix+22);n++){
    const t=lines[n];if(n>ix && /^(작성자|확인자|보호자|서명|수급자\s*서명|급여\s*제공\s*계획\s*작성)/.test(t))break;
    if(t && !result.includes(t))result.push(t);
  }
  return result.join('\n').slice(0,5000);
}
function extractWeekly(opinion,rows){
  const all=rows.map(row=>row.map(clean).filter(Boolean).join(' ')).join('\n');
  const index=all.search(/개인별\s*장기요양이용계획서|종합\s*의견/);
  const scope=index>=0?all.slice(index,index+2500):all;
  const found=[...scope.matchAll(/주\s*(\d{1,2})\s*(회|일)/g)].map(m=>({value:+m[1],unit:m[2],context:scope.slice(Math.max(0,m.index-22),m.index+30)}));
  return {weeklyCount:found.length===1?found[0].value:null, weeklyUnit:found.length===1?found[0].unit:'회', candidates:found.slice(0,12)};
}
export async function extractCarePlan(file){
  if(!/\.(xls|xlsx)$/i.test(file.name))throw new Error('xls 또는 xlsx 파일만 선택할 수 있습니다.');
  if(file.size>10*1024*1024)throw new Error('10MB 이하 파일만 불러올 수 있습니다.');
  const XLSX=await loadXLSX();
  let wb;
  try{wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true,cellText:true,raw:false});}
  catch {throw new Error('엑셀 파일을 열지 못했습니다. 암호가 걸려 있거나 지원하지 않는 파일일 수 있습니다.');}
  const rows=[];
  for(const name of wb.SheetNames){
    const ws=wb.Sheets[name];
    const data=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false,blankrows:false});
    rows.push(...data.map(r=>r.map(v=>clean(v))));
  }
  if(!rows.length)throw new Error('엑셀에 읽을 수 있는 데이터가 없습니다.');
  const full=rows.flat().map(clean).filter(Boolean).join('\n');
  let personName=findText(rows,'(?:수급자|대상자|어르신)?성명|수급자명');
  if(/성명|수급자|대상자/.test(personName))personName='';
  const idHit=full.match(/\bL\s*\d[\d\s-]{8,14}\b/i);
  let recognitionNumber=findText(rows,'장기요양인정번호|인정번호|인정\s*번호');
  if(idHit && !/L\d/i.test(recognitionNumber))recognitionNumber=idHit[0].replace(/[\s-]/g,'');
  if(recognitionNumber && recognitionNumber.length>40)recognitionNumber='';
  const gradeHit=full.match(/(?:장기요양\s*등급|요양\s*등급|인정\s*등급|\b등급)\s*[:：]?\s*(1|2|3|4|5)\s*등급|인지지원\s*등급/);
  let careGrade=gradeHit?(gradeHit[1]?`${gradeHit[1]}등급`:'인지지원등급'):'';
  if(!careGrade){const s=findText(rows,'장기요양등급|인정등급');const m=s.match(/[1-5]\s*등급|인지지원\s*등급/);if(m)careGrade=m[0].replace(/\s/g,'');}
  const [periodStart,periodEnd]=getPeriod(rows,XLSX);
  const needs=findNeeds(rows);
  const overallOpinion=getOpinion(rows);
  const weekly=extractWeekly(overallOpinion,rows);
  const extracted={personName,recognitionNumber,careGrade,periodStart,periodEnd,needs,overallOpinion,weeklyCount:weekly.weeklyCount,weeklyUnit:weekly.weeklyUnit};
  const warnings=[];
  for(const [key,label] of [['personName','성명'],['recognitionNumber','장기요양인정번호'],['careGrade','등급'],['periodStart','적용 시작일'],['periodEnd','적용 종료일']])if(!extracted[key])warnings.push(`${label}을(를) 확실히 찾지 못했습니다.`);
  if(!needs.length)warnings.push('장기요양 필요내용을 확인하지 못했습니다.');
  if(weekly.candidates.length!==1)warnings.push(weekly.candidates.length?'주당 횟수가 여러 번 발견되어 자동 선택하지 않았습니다.':'주당 횟수를 찾지 못했습니다.');
  return {extracted,warnings,candidates:weekly.candidates,sheetNames:wb.SheetNames};
}
