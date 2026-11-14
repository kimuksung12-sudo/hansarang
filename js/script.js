"use strict";

import {
  signInWithEmailAndPassword,
  setPersistence,
  browserSessionPersistence,
  signOut
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { auth, isConfigured, getApprovedStaff } from "./firebase-client.js";

const form = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const rememberUsername = document.getElementById("rememberUsername");
const passwordToggle = document.getElementById("passwordToggle");
const formNotice = document.getElementById("formNotice");
const submitButton = document.getElementById("submitButton");
const USERNAME_STORAGE_KEY = "careplan.rememberedEmail";
let submitting = false;

function loadRememberedUsername() {
  try {
    const saved = localStorage.getItem(USERNAME_STORAGE_KEY);
    if (saved) {
      usernameInput.value = saved;
      rememberUsername.checked = true;
    }
  } catch (_) { /* 저장소 접근 차단 시 무시 */ }
}

function saveRememberedUsername() {
  try {
    if (rememberUsername.checked) {
      localStorage.setItem(USERNAME_STORAGE_KEY, usernameInput.value.trim());
    } else {
      localStorage.removeItem(USERNAME_STORAGE_KEY);
    }
  } catch (_) { /* 비밀번호는 저장하지 않습니다. */ }
}

function setFieldError(input, message) {
  const error = document.getElementById(`${input.id}Error`);
  const shell = document.getElementById(`${input.id}Shell`);
  error.textContent = message;
  shell.classList.toggle("is-invalid", Boolean(message));
  input.setAttribute("aria-invalid", String(Boolean(message)));
}

function showNotice(message, isError = true) {
  formNotice.textContent = message;
  formNotice.classList.toggle("is-error", isError);
  formNotice.hidden = false;
}
function hideNotice() {
  formNotice.textContent = "";
  formNotice.hidden = true;
}
function validateForm() {
  let firstInvalid = null;
  const email = usernameInput.value.trim();
  if (!email) {
    setFieldError(usernameInput, "직원 이메일을 입력해 주세요.");
    firstInvalid = usernameInput;
  } else if (!usernameInput.validity.valid) {
    setFieldError(usernameInput, "올바른 이메일 주소를 입력해 주세요.");
    firstInvalid = usernameInput;
  } else {
    setFieldError(usernameInput, "");
  }
  if (!passwordInput.value) {
    setFieldError(passwordInput, "비밀번호를 입력해 주세요.");
    firstInvalid ||= passwordInput;
  } else {
    setFieldError(passwordInput, "");
  }
  if (firstInvalid) { firstInvalid.focus(); return false; }
  return true;
}
function setBusy(busy) {
  submitting = busy;
  submitButton.disabled = busy;
  submitButton.querySelector("span").textContent = busy ? "확인 중..." : "로그인";
  usernameInput.readOnly = busy;
  passwordInput.readOnly = busy;
}
function getLoginErrorMessage(error) {
  const code = error?.code || "";
  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/invalid-email"].includes(code)) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  if (code === "auth/user-disabled") return "비활성화된 계정입니다. 관리자에게 문의해 주세요.";
  if (code === "auth/too-many-requests") return "로그인 시도가 많습니다. 잠시 뒤 다시 시도하거나 관리자에게 문의해 주세요.";
  if (code === "auth/network-request-failed") return "네트워크 연결을 확인해 주세요.";
  if (code === "auth/operation-not-allowed") return "Firebase에서 이메일/비밀번호 로그인 방식을 활성화해 주세요.";
  if (code === "auth/unauthorized-domain") return "Firebase 인증 설정에서 현재 사이트 도메인을 확인해 주세요.";
  if (code === "auth/invalid-api-key" || code === "auth/api-key-not-valid.-please-pass-a-valid-api-key.") return "Firebase 설정값이 올바른지 확인해 주세요.";
  return "로그인 중 문제가 발생했습니다. Firebase 설정과 직원 승인 정보를 확인해 주세요.";
}

usernameInput.addEventListener("input", () => { setFieldError(usernameInput, ""); hideNotice(); });
passwordInput.addEventListener("input", () => { setFieldError(passwordInput, ""); hideNotice(); });

passwordToggle.addEventListener("click", () => {
  const showing = passwordInput.type === "password";
  passwordInput.type = showing ? "text" : "password";
  passwordToggle.setAttribute("aria-label", showing ? "비밀번호 숨기기" : "비밀번호 표시");
  passwordToggle.setAttribute("title", showing ? "비밀번호 숨기기" : "비밀번호 표시");
  passwordToggle.setAttribute("aria-pressed", String(showing));
  passwordToggle.querySelector(".eye-show").hidden = showing;
  passwordToggle.querySelector(".eye-hide").hidden = !showing;
});

rememberUsername.addEventListener("change", saveRememberedUsername);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting) return;
  hideNotice();
  if (!validateForm()) return;
  if (!isConfigured || !auth) {
    showNotice("Firebase 연결 정보가 없습니다. js/firebase-config.js 파일에 웹 앱 설정을 입력해 주세요.");
    return;
  }
  setBusy(true);
  let credentials;
  try {
    // 공용 PC 환경에서 창/탭을 닫으면 세션이 종료되도록 설정합니다.
    await setPersistence(auth, browserSessionPersistence);
    credentials = await signInWithEmailAndPassword(auth, usernameInput.value.trim(), passwordInput.value);
    const staff = await getApprovedStaff(credentials.user);
    if (!staff) {
      await signOut(auth);
      showNotice("관리자 승인이 없는 계정입니다. Firebase Firestore의 staff 명단을 확인해 주세요.");
      return;
    }
    saveRememberedUsername(); // 이메일만 선택적으로 기억합니다.
    passwordInput.value = "";
    window.location.replace("./dashboard.html");
  } catch (error) {
    // 승인 조회 실패 등 중간 오류로 세션이 남지 않게 처리합니다.
    if (credentials && auth) {
      try { await signOut(auth); } catch (_) { /* 처리 불가 시 안내 */ }
    }
    showNotice(getLoginErrorMessage(error));
  } finally {
    setBusy(false);
  }
});

loadRememberedUsername();
if (!isConfigured) {
  showNotice("시작하려면 Firebase 콘솔에서 웹 앱을 등록한 뒤 설정값을 입력해 주세요.", false);
} else if (auth) {
  auth.authStateReady().then(async () => {
    const user = auth.currentUser;
    if (!user || submitting) return;
    try {
      const staff = await getApprovedStaff(user);
      if (staff) window.location.replace("./dashboard.html");
      else await signOut(auth);
    } catch (_) {
      try { await signOut(auth); } catch (_) { /* 네트워크 오류 때는 로그인 화면 유지 */ }
    }
  }).catch(() => { /* 로그인 화면 유지 */ });
}

const loginReason = new URLSearchParams(window.location.search).get("error");
if (loginReason === "unauthorized") {
  showNotice("관리자 승인 정보가 확인되지 않아 로그아웃되었습니다.");
} else if (loginReason === "unavailable") {
  showNotice("직원 승인 정보를 확인할 수 없습니다. 네트워크 또는 Firestore 설정을 확인해 주세요.");
}
