import { doc, collection, onSnapshot, writeBatch, serverTimestamp } from '../vendor/firebase.js';
import { initFirebase, showConfigWarning, SESSIONS, LIMITS, escapeHtml, speakerLabel } from './common.js';

const $ = (id) => document.getElementById(id);
const form = $('ask-form');
const errorEl = $('form-error');
const submitBtn = $('submit');
const contentEl = $('content');
const nicknameEl = $('nickname');

const fb = initFirebase();
if (!fb) {
  showConfigWarning($('app'));
  throw new Error('Firebase not configured');
}
const { db } = fb;

// ---------- 裝置識別（防洗版用） ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 無痕模式 */ } },
};
let deviceId = store.get('hcc-device');
if (!deviceId) {
  deviceId = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  store.set('hcc-device', deviceId);
}
nicknameEl.value = store.get('hcc-nickname', '');

// ---------- 場次與與談者選項 ----------
$('session-choices').innerHTML = SESSIONS.map((s) => `
  <label class="choice"><input type="radio" name="session" value="${s.id}"><span>${escapeHtml(s.name)}</span></label>
`).join('');

form.addEventListener('change', (e) => {
  if (e.target.name !== 'session') return;
  const s = SESSIONS.find((x) => x.id === e.target.value);
  $('speaker-choices').innerHTML = s.speakers.map((sp) => `
    <label class="choice"><input type="radio" name="speaker" value="${escapeHtml(sp)}"><span>${escapeHtml(speakerLabel(sp))}</span></label>
  `).join('');
  $('speaker-hint').hidden = true;
});

// ---------- 字數 ----------
const normalize = (s) => s.replace(/\s+/g, ' ').trim();
function updateCounter() {
  const n = contentEl.value.length;
  $('counter').textContent = `${n} / ${LIMITS.content}`;
  $('counter').classList.toggle('over', n > LIMITS.content);
}
contentEl.addEventListener('input', updateCounter);

// ---------- 30 秒冷卻 ----------
let cooldownTimer;
function remainingCooldown() {
  const last = store.get('hcc-last-submit', 0);
  return Math.max(0, Math.ceil((last + LIMITS.cooldownSec * 1000 - Date.now()) / 1000));
}
function refreshCooldown() {
  clearInterval(cooldownTimer);
  const tick = () => {
    const left = remainingCooldown();
    submitBtn.disabled = left > 0;
    submitBtn.textContent = left > 0 ? `請稍候 ${left} 秒再提問` : '送出提問';
    if (left <= 0) clearInterval(cooldownTimer);
  };
  tick();
  cooldownTimer = setInterval(tick, 500);
}
refreshCooldown();

// ---------- 提問開關 ----------
onSnapshot(doc(db, 'settings', 'app'), (snap) => {
  const open = !snap.exists() || snap.data().open !== false;
  $('closed').hidden = open;
  if (!open) { form.hidden = true; $('success').hidden = true; }
  else if ($('success').hidden) form.hidden = false;
}, () => { /* 讀取失敗時維持可提問，送出時由規則把關 */ });

// ---------- 送出 ----------
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  const fd = new FormData(form);
  const session = fd.get('session');
  const speaker = fd.get('speaker');
  const nickname = normalize(nicknameEl.value);
  const content = contentEl.value.trim();

  const fail = (msg) => { errorEl.textContent = msg; };
  if (!session) return fail('請選擇場次');
  if (!speaker) return fail('請選擇想問的與談者');
  if (!nickname) return fail('請填寫暱稱');
  if (nickname.length > LIMITS.nickname) return fail(`暱稱請在 ${LIMITS.nickname} 字以內`);
  if (!content) return fail('請輸入問題內容');
  if (content.length > LIMITS.content) return fail(`問題請在 ${LIMITS.content} 字以內`);
  if (!$('agree').checked) return fail('請勾選同意個人資料蒐集告知');
  if (remainingCooldown() > 0) return fail(`送出太頻繁，請稍候 ${remainingCooldown()} 秒`);

  const key = await sha256(`${deviceId}|${normalize(content)}`);
  const sent = store.get('hcc-sent', []);
  if (sent.includes(key)) return fail('這個問題你已經送出過了');

  submitBtn.disabled = true;
  submitBtn.textContent = '送出中…';
  try {
    const batch = writeBatch(db);
    batch.set(doc(collection(db, 'questions'), key), {
      session, speaker, nickname, content, deviceId, status: 'pool', createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'devices', deviceId), { lastAt: serverTimestamp() });
    await withTimeout(batch.commit(), 15000);

    store.set('hcc-sent', [...sent, key].slice(-100));
    store.set('hcc-last-submit', Date.now());
    store.set('hcc-nickname', nickname);
    contentEl.value = '';
    updateCounter();
    form.hidden = true;
    $('success').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    console.error(err);
    if (err.message === 'timeout') fail('網路連線不穩，請確認網路後再試一次');
    else if (err.code === 'permission-denied') fail('送出失敗：可能是送出太頻繁、重複提問或提問已截止，請稍後再試');
    else fail('送出失敗，請稍後再試');
  } finally {
    refreshCooldown();
  }
});

$('again').addEventListener('click', () => {
  $('success').hidden = true;
  form.hidden = false;
  contentEl.focus();
});
