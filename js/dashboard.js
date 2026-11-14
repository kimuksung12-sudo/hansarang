"use strict";

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { auth, isConfigured, getApprovedStaff } from "./firebase-client.js";

const protectedArea = document.getElementById("privateDashboard");
const checkingNotice = document.getElementById("checkingNotice");
const logoutButton = document.getElementById("logoutButton");
const staffName = document.getElementById("staffName");
const staffEmail = document.getElementById("staffEmail");

function goToLogin(reason = "") {
  window.location.replace(`./index.html${reason ? "?error=" + encodeURIComponent(reason) : ""}`);
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
