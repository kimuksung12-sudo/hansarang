"use strict";

// 첫 단계: 화면 동작만 구현합니다. 실제 사용자 인증은 서버에서 처리해야 합니다.
// 비밀번호, 세션 토큰 등 민감한 인증 정보는 브라우저 저장소에 저장하지 않습니다.

const form = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const rememberUsername = document.getElementById("rememberUsername");
const passwordToggle = document.getElementById("passwordToggle");
const formNotice = document.getElementById("formNotice");

const USERNAME_STORAGE_KEY = "careplan.rememberedUsername";

function loadRememberedUsername() {
  try {
    const savedUsername = window.localStorage.getItem(USERNAME_STORAGE_KEY);
    if (savedUsername) {
      usernameInput.value = savedUsername;
      rememberUsername.checked = true;
    }
  } catch (error) {
    // 사생활 보호 모드 등에서 저장소 접근이 막혀도 로그인 폼은 사용 가능해야 합니다.
  }
}

function setFieldError(input, message) {
  const error = document.getElementById(`${input.id}Error`);
  const shell = document.getElementById(`${input.id}Shell`);
  error.textContent = message;
  shell.classList.toggle("is-invalid", Boolean(message));
  input.setAttribute("aria-invalid", String(Boolean(message)));
}

function hideNotice() {
  formNotice.hidden = true;
  formNotice.textContent = "";
}

function validateForm() {
  let firstInvalid = null;

  if (!usernameInput.value.trim()) {
    setFieldError(usernameInput, "아이디를 입력해 주세요.");
    firstInvalid = usernameInput;
  } else {
    setFieldError(usernameInput, "");
  }

  if (!passwordInput.value) {
    setFieldError(passwordInput, "비밀번호를 입력해 주세요.");
    firstInvalid ??= passwordInput;
  } else {
    setFieldError(passwordInput, "");
  }

  if (firstInvalid) {
    firstInvalid.focus();
    return false;
  }
  return true;
}

usernameInput.addEventListener("input", () => {
  setFieldError(usernameInput, "");
  hideNotice();
});
passwordInput.addEventListener("input", () => {
  setFieldError(passwordInput, "");
  hideNotice();
});

passwordToggle.addEventListener("click", () => {
  const showPassword = passwordInput.type === "password";
  passwordInput.type = showPassword ? "text" : "password";
  passwordToggle.setAttribute("aria-label", showPassword ? "비밀번호 숨기기" : "비밀번호 표시");
  passwordToggle.setAttribute("title", showPassword ? "비밀번호 숨기기" : "비밀번호 표시");
  passwordToggle.setAttribute("aria-pressed", String(showPassword));
  passwordToggle.querySelector(".eye-show").hidden = showPassword;
  passwordToggle.querySelector(".eye-hide").hidden = !showPassword;
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  hideNotice();
  if (!validateForm()) return;

  try {
    if (rememberUsername.checked) {
      window.localStorage.setItem(USERNAME_STORAGE_KEY, usernameInput.value.trim());
    } else {
      window.localStorage.removeItem(USERNAME_STORAGE_KEY);
    }
  } catch (error) {
    // 저장 기능이 막혀 있어도 정상적인 안내 메시지를 보여 줍니다.
  }

  formNotice.textContent = "입력값 확인이 완료되었습니다. 현재는 시연 화면이므로 실제 로그인은 진행되지 않습니다. 다음 단계에서 서버 인증 기능을 연결할 수 있습니다.";
  formNotice.hidden = false;
});

rememberUsername.addEventListener("change", () => {
  if (!rememberUsername.checked) {
    try {
      window.localStorage.removeItem(USERNAME_STORAGE_KEY);
    } catch (error) {
      // 로컬 저장소 접근이 제한된 경우 무시합니다.
    }
  }
});

loadRememberedUsername();
