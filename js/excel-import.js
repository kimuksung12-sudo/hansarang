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
  // 계약기간이나 장기요양급여 계약기간은 추출 대상이 아닙니다.
  // 오직 '장기요양급여 제공계획서 적용기간' 머리글에 연결된 날짜만 사용합니다.
  const wanted = /장기요양급여제공계획서적용기간/;
  const datePattern = /20\d{2}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}/g;
  const readRange = value => {
    const dates = [...clean(value).matchAll(datePattern)].map(m => dateValue(m[0],XLSX)).filter(Boolean);
    if(dates.length === 2 && dates[0] <= dates[1]) return dates;
    return null;
  };
  for(let rowIndex=0; rowIndex<rows.length; rowIndex++) {
    const row = rows[rowIndex];
    for(let col=0; col<row.length; col++) {
      if(!wanted.test(compact(row[col]))) continue;
      // 같은 셀에 적용기간이 적힌 양식
      const inline = readRange(row[col]);
      if(inline) return inline;
      // 케어포 양식: 머리글 바로 아래 같은 열에 '시작일~종료일' 표기
      for(let offset=1; offset<=3 && rowIndex+offset<rows.length; offset++) {
        const candidateRow=rows[rowIndex+offset];
        const candidate=clean(candidateRow[col]);
        if(/계약기간|계약일|작성일|통보일/.test(compact(candidate))) break;
        const matched=readRange(candidate);
        if(matched) return matched;
        // 날짜가 다른 두 셀로 쪼개진 경우, 동일 머리글 아래 인접 셀만 확인
        if(offset===1 && candidate) {
          const next=clean(candidateRow[col+1]);
          const left=dateValue(candidate,XLSX);
          const right=dateValue(next,XLSX);
          if(left && right && left<=right) return [left,right];
        }
      }
    }
  }
  // 찾을 수 없으면 계약기간으로 대체하지 않고 수동 확인을 요청합니다.
  return ['',''];
}
function findNeeds(rows){
  // 급여제공계획내용 표의 '장기요양 필요내용'과 '횟수' 열을 같은 행 기준으로 추출합니다.
  // '장기요양 필요영역', '세부제공내용', '작성자'는 사용하지 않습니다.
  const normalized = value => compact(value);
  const needHeader = value => normalized(value)==='장기요양필요내용';
  const freqHeader = value => normalized(value)==='횟수';
  const otherHeader = value => /^(장기요양필요영역|장기요양세부목표|세부제공내용|작성자|시간\(분\)|시간|내용)$/.test(normalized(value));
  const section = value => /종합의견|개인별장기요양이용계획서|급여제공계획작성|장기요양급여제공계획서적용기간|급여제공계획작성/.test(normalized(value));
  const itemPattern = /^(일|주|월|년)\s*(\d{1,3})\s*회(?:\s*이상)?$/;
  const parseFreq = value => {
    const v=clean(value).replace(/\s+/g,' ');
    const m=v.match(itemPattern);
    if (m) return `${m[1]} ${m[2]}회`;
    // "일 1회"와 "일1회" 뿐 아니라 "주 2회" 형태를 지원.
    if (/^(일|주|월|년)\s*\d+\s*회/.test(v)) return v;
    return '';
  };
  const details = [];
  let foundHeader = false;
  const seen=new Set();
  for(let r=0;r<rows.length;r++){
    const cols=rows[r], needCol=cols.findIndex(needHeader);
    if(needCol<0) continue;
    foundHeader=true;
    // 같은 표 머리글 줄에서 '횟수' 열 위치를 정확히 찾습니다.
    const freqCol=cols.findIndex(freqHeader);
    for(let j=r+1;j<rows.length;j++){
      const row=rows[j].map(clean);
      if(row.some(section))break;
      if(j>r+1 && row.some(needHeader))break;
      const need=clean(row[needCol]);
      if(!need || needHeader(need) || otherHeader(need))continue;
      // 열 위치가 같은 행에 있어야 필요내용-횟수를 짝지을 수 있습니다.
      const frequency = freqCol >= 0 ? parseFreq(row[freqCol]) : '';
      const key=need+'|'+frequency;
      if(!seen.has(key) && need.length<=300 && details.length<50){
        details.push({text:need,frequency});
        seen.add(key);
      }
    }
  }
  return {needs:details.map(x=>x.text), needDetails:details, foundHeader, foundFrequencyColumn:rows.some(r=>r.some(freqHeader)), truncated:details.length>=50};
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
  const needResult=findNeeds(rows);
  const needs=needResult.needs;
  const needDetails=needResult.needDetails;
  const overallOpinion=getOpinion(rows);
  const weekly=extractWeekly(overallOpinion,rows);
  const extracted={personName,recognitionNumber,careGrade,periodStart,periodEnd,needs,needDetails,overallOpinion,weeklyCount:weekly.weeklyCount,weeklyUnit:weekly.weeklyUnit};
  const warnings=[];
  for(const [key,label] of [['personName','성명'],['recognitionNumber','장기요양인정번호'],['careGrade','등급'],['periodStart','제공계획서 적용 시작일'],['periodEnd','제공계획서 적용 종료일']])if(!extracted[key])warnings.push(`${label}을(를) 확실히 찾지 못했습니다.`);
  if(!needResult.foundHeader)warnings.push('장기요양 필요내용 열 제목을 찾지 못해 임의로 다른 열을 가져오지 않았습니다.');
  if(!needs.length)warnings.push('장기요양 필요내용이 자동 추출되지 않았습니다. 엑셀 원문을 확인해 주세요.');
  if(!needResult.foundFrequencyColumn)warnings.push('횟수 열을 찾지 못했습니다. 항목별 횟수를 직접 확인해 주세요.');
  if(needDetails.some(item=>!item.frequency))warnings.push('횟수를 확인하지 못한 항목이 있습니다. 저장 전 원본과 대조해 주세요.');
  if(needResult.truncated)warnings.push('장기요양 필요내용이 50건을 넘어 일부가 제외되었습니다.');
  if(weekly.candidates.length!==1)warnings.push(weekly.candidates.length?'주당 횟수가 여러 번 발견되어 자동 선택하지 않았습니다.':'주당 횟수를 찾지 못했습니다.');
  return {extracted,warnings,candidates:weekly.candidates,sheetNames:wb.SheetNames};
}
