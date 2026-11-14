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
  // 케어포 표의 장기요양 필요내용과 횟수를 같은 데이터 행에서 묶습니다.
  // '필요시'와 '수시'는 숫자 횟수가 아니지만 정식 횟수 값으로 보존합니다.
  const normalize = value => compact(value).replace(/[()（）]/g,'');
  const needHeader = value => normalize(value) === '장기요양필요내용';
  const freqHeader = value => normalize(value) === '횟수';
  const skippedHeader = value => /^(장기요양필요영역|장기요양세부목표|세부제공내용|작성자|작성자명|시간분|시간|내용|구분)$/.test(normalize(value));
  const section = value => /^(종합의견|개인별장기요양이용계획서|장기요양급여제공계획서적용기간|급여제공계획작성|확인사항)$/.test(normalize(value));
  function parseFrequency(value){
    const text=clean(value).replace(/[\n\r]/g,' ').replace(/\s+/g,' ').trim();
    if(!text)return '';
    // 빈도를 뜻하는 조건부 표기. 이 값을 빈칸으로 처리하면 안 됩니다.
    if(/^(필요\s*시|수\s*시|상\s*시|매\s*회|요청\s*시|상황\s*에\s*따라|수시로|필요할\s*때)(?:\s*제공)?$/.test(text)){
      return text.replace(/\s+/g,'').replace('수시로','수시').replace('필요할때','필요시');
    }
    // '일 1회', '주 2회', '월 1회', '일 5회' 등 숫자 빈도.
    const numeric=text.match(/^(일|주|월|년|매일|매주|매월)\s*(\d{1,3})\s*회(?:\s*(?:이상|정도))?$/);
    if(numeric)return `${numeric[1]} ${Number(numeric[2])}회`;
    // 한 시트의 표기 변종: '1일 1회', '1주 2회'
    const duration=text.match(/^(\d{1,2})\s*(일|주|개월|월)\s*(\d{1,3})\s*회$/);
    if(duration)return `${duration[1]}${duration[2]} ${Number(duration[3])}회`;
    return '';
  }
  const details=[];
  const seen=new Set();
  let foundHeader=false,foundFrequencyColumn=false,rawUnrecognized=[];
  // 각 시트의 표를 순차적으로 살피고 '횟수'라는 열이 헤더와 같은 줄에 있는지 확인합니다.
  for(let r=0;r<rows.length;r++){
    const header=rows[r].map(clean);
    const needCol=header.findIndex(needHeader);
    if(needCol===-1)continue;
    foundHeader=true;
    let freqCol=header.findIndex(freqHeader);
    // 케어포 병합 셀에서 헤더가 위/아래 한 줄 어긋나 있을 수 있음.
    if(freqCol<0){
      for(const shift of [-1,1]){
        const candidate=rows[r+shift];
        if(!candidate)continue;
        const col=candidate.findIndex(freqHeader);
        if(col>needCol && col<=needCol+6){freqCol=col;break;}
      }
    }
    if(freqCol>=0)foundFrequencyColumn=true;
    for(let j=r+1;j<rows.length;j++){
      const row=rows[j].map(clean);
      if(row.some(section) || row.some(needHeader))break;
      const need=clean(row[needCol]);
      if(!need || skippedHeader(need) || needHeader(need))continue;
      if(need.length>300)continue;
      let frequency='';
      let rawFreq='';
      if(freqCol>=0){
        rawFreq=clean(row[freqCol]);
        frequency=parseFrequency(rawFreq);
        // 헤더 바로 옆 병합셀로 값을 읽었을 때만 보조 확인합니다.
        if(!frequency && !rawFreq){
          for(const c of [freqCol+1,freqCol-1]){
            if(c<=needCol || c<0 || c>=row.length)continue;
            const v=clean(row[c]);
            const candidate=parseFrequency(v);
            if(candidate){frequency=candidate;rawFreq=v;break;}
          }
        }
      }
      const key=`${need}|${frequency}`;
      if(seen.has(key))continue;
      seen.add(key);
      details.push({text:need,frequency});
      if(rawFreq && !frequency)rawUnrecognized.push({need,rawFreq});
    }
  }
  const missing=details.filter(item=>!item.frequency);
  return {
    needs:details.slice(0,50).map(item=>item.text),
    needDetails:details.slice(0,50),
    foundHeader,foundFrequencyColumn,
    missing:missing.slice(0,50),
    rawUnrecognized:rawUnrecognized.slice(0,50),
    truncated:details.length>50
  };
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
  if(needResult.missing.length){
    warnings.push(`횟수 미확인 ${needResult.missing.length}건: ${needResult.missing.map(x=>x.text).join(' / ')}. 원본의 횟수 열을 확인해 주세요.`);
  }
  if(needResult.rawUnrecognized.length){
    warnings.push(`횟수 표기 검토: ${needResult.rawUnrecognized.map(x=>`${x.need} → ${x.rawFreq}`).join(' / ')}`);
  }
  if(needResult.truncated)warnings.push('장기요양 필요내용이 50건을 넘어 일부가 제외되었습니다.');
  if(weekly.candidates.length!==1)warnings.push(weekly.candidates.length?'주당 횟수가 여러 번 발견되어 자동 선택하지 않았습니다.':'주당 횟수를 찾지 못했습니다.');
  return {extracted,warnings,candidates:weekly.candidates,sheetNames:wb.SheetNames};
}
