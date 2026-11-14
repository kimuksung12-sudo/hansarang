import { extractCarePlan } from "./excel-import.js";
"use strict";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { auth, db, getApprovedStaff } from "./firebase-client.js";
const $=id=>document.getElementById(id); let plans=[], currentUser=null;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
function goLogin(reason=""){location.replace(`../index.html${reason?"?error="+encodeURIComponent(reason):""}`)}
function addNeed(text="") { const row=document.createElement("div");row.className="need-row";const input=document.createElement("input");input.type="text";input.maxLength=300;input.placeholder="예: 옷 갈아입기 도움 / 외출 시 동행 / 병원 동행";input.value=text;const del=document.createElement("button");del.type="button";del.className="secondary-plan-btn";del.textContent="삭제";del.addEventListener("click",()=>row.remove());row.append(input,del);$("needItems").append(row);}
function openEditor(plan=null){$("planEditor").hidden=false;$("planForm").reset();$("needItems").replaceChildren();$("formStatus").textContent="";$("planId").value=plan?.id||"";$("editorHeading").textContent=plan?"계획서 수정":"계획서 등록";$("personName").value=plan?.personName||"";$("recognitionNumber").value=plan?.recognitionNumber||"";$("careGrade").value=plan?.careGrade||"";$("periodStart").value=plan?.periodStart||"";$("periodEnd").value=plan?.periodEnd||"";$("weeklyCount").value=plan?.weeklyCount??"";$("weeklyUnit").value=plan?.weeklyUnit||"회";$("overallOpinion").value=plan?.overallOpinion||"";(plan?.needs?.length?plan.needs:[""]).forEach(addNeed);$("planEditor").scrollIntoView({behavior:"smooth"});}
function render(){const q=$("planSearch").value.trim().toLowerCase();const rows=plans.filter(p=>[p.personName,p.recognitionNumber].some(v=>String(v||"").toLowerCase().includes(q)));$("listCount").textContent=`${rows.length}건`;const tbody=$("planRows");tbody.replaceChildren();if(!rows.length){const tr=document.createElement("tr");const td=document.createElement("td");td.colSpan=6;td.textContent="등록된 계획서가 없습니다.";tr.append(td);tbody.append(tr);return;}for(const p of rows){const tr=document.createElement("tr");for(const val of [p.personName,p.recognitionNumber,p.careGrade,`${p.periodStart} ~ ${p.periodEnd}`,p.weeklyCount===null||p.weeklyCount===undefined?"미입력":`주 ${p.weeklyCount}${p.weeklyUnit||"회"}`]){const td=document.createElement("td");td.textContent=val||"-";tr.append(td);}const td=document.createElement("td");const edit=document.createElement("button");edit.type="button";edit.className="secondary-plan-btn";edit.textContent="보기/수정";edit.addEventListener("click",()=>openEditor(p));const del=document.createElement("button");del.type="button";del.className="delete-plan-btn";del.textContent="삭제";del.addEventListener("click",async()=>{if(!confirm("이 계획서를 영구 삭제하시겠습니까?"))return;try{await deleteDoc(doc(db,"carePlans",p.id));await loadPlans();}catch(e){alert("삭제에 실패했습니다. 관리자 권한 및 보안 규칙을 확인하세요.");}});td.append(edit,del);tr.append(td);tbody.append(tr);}}
async function loadPlans(){const snaps=await getDocs(collection(db,"carePlans"));plans=snaps.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.periodStart||"").localeCompare(String(a.periodStart||"")));render();}
$("newPlan").addEventListener("click",()=>openEditor());$("closeEditor").addEventListener("click",()=>{$("planEditor").hidden=true});$("addNeed").addEventListener("click",()=>addNeed());$("planSearch").addEventListener("input",render);
$("planForm").addEventListener("submit",async e=>{e.preventDefault();if(!currentUser)return;const start=$("periodStart").value,end=$("periodEnd").value;if(end<start){$("formStatus").textContent="종료일이 시작일보다 빠릅니다.";return;}const raw=$("weeklyCount").value;const weeklyCount=raw===""?null:Number(raw);const data={personName:$("personName").value.trim(),recognitionNumber:$("recognitionNumber").value.trim(),careGrade:$("careGrade").value,periodStart:start,periodEnd:end,needs:[...$("needItems").querySelectorAll("input")].map(el=>el.value.trim()).filter(Boolean),weeklyCount,weeklyUnit:$("weeklyUnit").value,overallOpinion:$("overallOpinion").value.trim(),updatedBy:currentUser.uid,updatedAt:serverTimestamp()};const btn=$("savePlan");btn.disabled=true;$("formStatus").textContent="저장 중...";try{const id=$("planId").value;if(id){await updateDoc(doc(db,"carePlans",id),data);}else{await addDoc(collection(db,"carePlans"),{...data,createdBy:currentUser.uid,createdAt:serverTimestamp()});}$("formStatus").textContent="저장되었습니다.";await loadPlans();$("planEditor").hidden=true;}catch(err){console.error("Plan save error",err.code||err.message);$("formStatus").textContent="저장 실패: Firebase 규칙 또는 연결 상태를 확인하세요.";}finally{btn.disabled=false;}});
$("logoutButton").addEventListener("click",async()=>{await signOut(auth);goLogin();});
onAuthStateChanged(auth,async user=>{if(!user){goLogin();return;}try{const staff=await getApprovedStaff(user);if(!staff){await signOut(auth);goLogin("unauthorized");return;}if(staff.role!=="admin"){$("checkingNotice").textContent="계획서 보관함은 관리자 계정만 이용할 수 있습니다.";return;}currentUser=user;await loadPlans();$("checkingNotice").hidden=true;$("privateDashboard").hidden=false;}catch(err){console.error("Plan loading error",err.code||err.message);$("checkingNotice").textContent="계획서를 불러올 수 없습니다. Firestore 규칙을 확인해 주세요.";}});


// 케어포 엑셀 업로드 → 추출 결과 검토 → 기존 Firebase 저장 양식으로 전달.
let lastImported = null;
$("planExcelFile").addEventListener("change", async event => {
  const file=event.target.files?.[0];
  if (!file) return;
  const status=$("uploadStatus");
  $("uploadReview").hidden=true;
  lastImported=null;
  status.textContent="엑셀을 분석하고 있습니다. 원본 파일은 업로드되지 않습니다...";
  try {
    const result=await extractCarePlan(file);
    lastImported=result;
    const d=result.extracted;
    $("uploadReviewText").textContent=`${file.name} · ${result.sheetNames.length}개 시트 · 성명: ${d.personName||'미확인'} · 인정번호: ${d.recognitionNumber||'미확인'} · 등급: ${d.careGrade||'미확인'} · 적용기간: ${d.periodStart||'?'} ~ ${d.periodEnd||'?'} · 필요내용 ${d.needs.length}건 · 주당 횟수: ${d.weeklyCount===null?'검토 필요':d.weeklyCount+d.weeklyUnit}`;
    const preview=$("importedNeedPreview");
    preview.replaceChildren();
    if(d.needs.length===0) {
      const li=document.createElement("li");li.textContent="자동 추출 결과가 없습니다.";preview.append(li);
    } else {
      d.needs.forEach(value=>{const li=document.createElement("li");li.textContent=value;preview.append(li);});
    }
    const warnings=$("uploadWarnings"); warnings.replaceChildren();
    for(const warning of result.warnings){const li=document.createElement('li');li.textContent=warning;warnings.append(li);}
    if(result.candidates.length>1){const li=document.createElement('li');li.textContent=`감지된 횟수 후보: ${result.candidates.map(x=>'주 '+x.value+x.unit).join(', ')}. 원문을 확인하고 직접 선택하세요.`;warnings.append(li);}
    status.textContent="추출이 끝났습니다. 결과를 확인하고 저장 전 반드시 원본과 대조해 주세요.";
    $("uploadReview").hidden=false;
  } catch(err){status.textContent=`불러오기 실패: ${err.message}`;}
  event.target.value='';
});
$("reviewEditor").addEventListener("click",()=>{
  if(!lastImported)return;
  const d=lastImported.extracted;
  openEditor();
  for(const key of ['personName','recognitionNumber','careGrade','periodStart','periodEnd','overallOpinion'])$(key).value=d[key]||'';
  $("weeklyCount").value=d.weeklyCount??'';
  $("weeklyUnit").value=d.weeklyUnit||'회';
  $("needItems").replaceChildren();
  (d.needs.length?d.needs:['']).forEach(addNeed);
  $("formStatus").textContent="자동 추출된 정보입니다. 원본과 비교한 뒤 Firebase에 저장하세요.";
  $("planEditor").scrollIntoView({behavior:'smooth'});
});
