"use strict";

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { auth, isConfigured, getApprovedStaff } from "./firebase-client.js";

const protectedArea = document.getElementById("privateDashboard");
const checkingNotice = document.getElementById("checkingNotice");
const logoutButton = document.getElementById("logoutButton");
const staffName = document.getElementById("staffName");
const staffEmail = document.getElementById("staffEmail");

function goToLogin(reason = "") {
  window.location.replace(`../index.html${reason ? "?error=" + encodeURIComponent(reason) : ""}`);
}

if (!isConfigured || !auth) {
  goToLogin();
} else {
  onAuthStateChanged(auth, async (user) => {
    protectedArea.hidden = true;
    if (!user) { goToLogin(); return; }
    try {
      const staff = await getApprovedStaff(user);
      if (!staff) {
        await signOut(auth);
        goToLogin("unauthorized");
        return;
      }
      staffName.textContent = staff.name || "직원";
      staffEmail.textContent = staff.email;
      checkingNotice.hidden = true;
      protectedArea.hidden = false;
    } catch (error) {
      checkingNotice.textContent = "승인 정보를 불러오지 못했습니다. 잠시 뒤 다시 로그인해 주세요.";
      try { await signOut(auth); } catch (_) { /* 세션 해제 시도 */ }
      goToLogin("unavailable");
    }
  }, () => goToLogin("unavailable"));
}

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    await signOut(auth);
    goToLogin();
  } catch (error) {
    logoutButton.disabled = false;
    alert("로그아웃에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  }
});

// 달력은 브라우저에서만 표시됩니다. 일정 데이터는 아직 저장하지 않습니다.
const monthTitle = document.getElementById("monthTitle");
const calendarDays = document.getElementById("calendarDays");
const selectedDate = document.getElementById("selectedDate");
const now = new Date();
let displayedMonth = new Date(now.getFullYear(), now.getMonth(), 1);
let selectedDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {year:"numeric",month:"long",day:"numeric",weekday:"long"});
const monthFormatter = new Intl.DateTimeFormat("ko-KR", {year:"numeric",month:"long"});
function isSameDay(a,b) {return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();}
function renderCalendar(){
  monthTitle.textContent=monthFormatter.format(displayedMonth);
  selectedDate.textContent=dateFormatter.format(selectedDay);
  calendarDays.replaceChildren();
  const year=displayedMonth.getFullYear(), month=displayedMonth.getMonth();
  const start=new Date(year,month,1);
  const offset=start.getDay();
  const total=Math.ceil((offset+new Date(year,month+1,0).getDate())/7)*7;
  for(let i=0;i<total;i++){
    const date=new Date(year,month,i-offset+1);
    const button=document.createElement("button");
    button.type="button";
    button.className="calendar-day";
    if(date.getMonth()!==month) button.classList.add("is-outside");
    if(date.getDay()===0) button.classList.add("is-sunday");
    if(date.getDay()===6) button.classList.add("is-saturday");
    if(isSameDay(date,now)) button.classList.add("is-today");
    if(isSameDay(date,selectedDay)) button.classList.add("is-selected");
    button.setAttribute("role","gridcell");
    button.setAttribute("aria-label",dateFormatter.format(date));
    button.setAttribute("aria-selected",String(isSameDay(date,selectedDay)));
    const number=document.createElement("span");
    number.className="day-number";
    number.textContent=String(date.getDate());
    button.append(number);
    button.addEventListener("click",()=>{selectedDay=date;displayedMonth=new Date(date.getFullYear(),date.getMonth(),1);renderCalendar();});
    calendarDays.append(button);
  }
}
document.getElementById("prevMonth").addEventListener("click",()=>{displayedMonth=new Date(displayedMonth.getFullYear(),displayedMonth.getMonth()-1,1);renderCalendar();});
document.getElementById("nextMonth").addEventListener("click",()=>{displayedMonth=new Date(displayedMonth.getFullYear(),displayedMonth.getMonth()+1,1);renderCalendar();});
document.getElementById("todayButton").addEventListener("click",()=>{selectedDay=new Date(now.getFullYear(),now.getMonth(),now.getDate());displayedMonth=new Date(now.getFullYear(),now.getMonth(),1);renderCalendar();});
renderCalendar();
