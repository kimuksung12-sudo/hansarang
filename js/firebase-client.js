// Firebase 공식 모듈 SDK (2026-11-11 출시 버전으로 고정)
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const isConfigured = ["apiKey", "authDomain", "projectId", "appId"].every(
  (key) => typeof firebaseConfig[key] === "string" && firebaseConfig[key].trim().length > 0
);

const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
const database = db;

// 관리자 승인 여부는 Firestore staff/{UID} 문서로 확인합니다.
// 허용 여부는 화면뿐 아니라 Firestore/Storage 보안 규칙으로도 강제해야 합니다.
export async function getApprovedStaff(user) {
  if (!user || !database) return null;
  const snapshot = await getDoc(doc(database, "staff", user.uid));
  if (!snapshot.exists()) return null;
  const info = snapshot.data();
  if (info.active !== true) return null;
  return {
    uid: user.uid,
    email: user.email || "",
    name: typeof info.name === "string" ? info.name.trim() : "",
    role: typeof info.role === "string" ? info.role.trim() : "staff"
  };
}
