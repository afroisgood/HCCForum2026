import {
  initializeApp, getFirestore, connectFirestoreEmulator, getAuth, connectAuthEmulator,
} from '../vendor/firebase.js';
import qrcode from '../vendor/qrcode.mjs';
import { firebaseConfig, ADMIN_EMAIL } from './firebase-config.js';

export { ADMIN_EMAIL };

export const EVENT = {
  title: '下一代花蓮地方實踐指南',
  date: '2026.11.07',
  weekday: 'SAT.',
};

// 場次與可指定的與談者（資料庫存 id，畫面顯示 name）
// speakers 是存進資料庫的值，也寫在 firestore.rules 裡，請勿更改；畫面上的稱謂改 SPEAKER_TITLES 即可
export const SESSIONS = [
  { id: 'cross', name: '跨域對話與交流', speakers: ['楊政賢', '陳運成', '文化局'] },
  { id: 'guide', name: '花蓮實踐指南問與答', speakers: ['黃紋綺', '沙力浪', '陳柏均 Sra'] },
];
export const sessionName = (id) => SESSIONS.find((s) => s.id === id)?.name ?? id;

const SPEAKER_TITLES = {
  '楊政賢': '楊政賢主任',
  '陳運成': '陳運成老師',
  '文化局': '花蓮縣文化局',
  '黃紋綺': '黃紋綺執行長',
  '沙力浪': '沙力浪老師',
  '陳柏均 Sra': '陳柏均 Sra 理事長',
};
export const speakerLabel = (id) => SPEAKER_TITLES[id] ?? id;

export const LIMITS = { content: 200, nickname: 20, cooldownSec: 30 };

export function isConfigured() {
  return !String(firebaseConfig.apiKey).startsWith('YOUR_');
}

// 本機測試：網址加 ?emulator=1 會連到 Firebase 模擬器（加 ?emulator=0 取消）
function useEmulator() {
  const p = new URLSearchParams(location.search).get('emulator');
  if (p !== null) localStorage.setItem('hcc-emulator', p === '1' ? '1' : '0');
  return localStorage.getItem('hcc-emulator') === '1';
}

let cached;
export function initFirebase() {
  if (cached) return cached;
  const emu = useEmulator();
  if (!emu && !isConfigured()) return null;
  const app = initializeApp(emu ? { apiKey: 'demo-key', projectId: 'demo-hccforum2026', appId: 'demo' } : firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);
  if (emu) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  cached = { app, db, auth };
  return cached;
}

export function showConfigWarning(container) {
  container.innerHTML = `
    <div class="notice notice--warn">
      <strong>尚未完成 Firebase 設定</strong>
      <p>請依照 README 的「Firebase 設定步驟」填寫 <code>assets/js/firebase-config.js</code> 後重新整理。</p>
    </div>`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 提問頁網址（QR Code 用），以目前頁面所在資料夾為準
export function askUrl() {
  return new URL('./', location.href).href;
}

// 產生 QR Code，回傳 canvas
export function qrCanvas(text, size = 600, margin = 4) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = Math.floor(size / (n + margin * 2));
  const px = cell * (n + margin * 2);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
    }
  }
  return canvas;
}

export function formatTime(ts, withDate = false) {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
  if (!d) return '—';
  const p = (n) => String(n).padStart(2, '0');
  const t = `${p(d.getHours())}:${p(d.getMinutes())}`;
  return withDate ? `${d.getMonth() + 1}/${d.getDate()} ${t}` : t;
}
