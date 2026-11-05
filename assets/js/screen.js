import { doc, onSnapshot } from '../vendor/firebase.js';
import { initFirebase, showConfigWarning, sessionName, askUrl, qrCanvas } from './common.js';

const $ = (id) => document.getElementById(id);

$('qr').appendChild(qrCanvas(askUrl(), 900));

const fb = initFirebase();
if (!fb) {
  showConfigWarning($('stage'));
  throw new Error('Firebase not configured');
}

// 把問題字級調到剛好塞滿框
function fitText() {
  const body = $('q-body');
  const text = $('q-text');
  let lo = 16;
  let hi = Math.max(24, Math.floor(window.innerHeight * 0.11));
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    text.style.fontSize = `${mid}px`;
    if (text.scrollHeight <= body.clientHeight && text.scrollWidth <= text.clientWidth + 1) lo = mid;
    else hi = mid - 1;
  }
  text.style.fontSize = `${lo}px`;
}
window.addEventListener('resize', () => { if (!$('question').hidden) fitText(); });

let lastId;
let revealTimer;

function showQuestion(data) {
  $('drawing').hidden = true;
  $('idle').hidden = true;
  $('q-session').textContent = sessionName(data.session);
  $('q-speaker').textContent = `提問對象：${data.speaker}`;
  $('q-text').textContent = data.content;
  $('q-nick').textContent = data.nickname;
  const q = $('question');
  q.hidden = false;
  q.style.animation = 'none';
  void q.offsetWidth; // 重新播放進場動畫
  q.style.animation = '';
  fitText();
}

function showIdle() {
  $('drawing').hidden = true;
  $('question').hidden = true;
  $('idle').hidden = false;
}

onSnapshot(doc(fb.db, 'display', 'current'), (snap) => {
  const data = snap.exists() ? snap.data() : null;
  const firstLoad = lastId === undefined;
  clearTimeout(revealTimer);
  if (!data?.active) {
    lastId = null;
    showIdle();
    return;
  }
  if (!firstLoad && data.questionId !== lastId) {
    // 新抽出的題目：先播放「抽籤中」動畫
    $('drawing').hidden = false;
    revealTimer = setTimeout(() => showQuestion(data), 1400);
  } else {
    showQuestion(data);
  }
  lastId = data.questionId;
}, (err) => console.error(err));

// ---------- 全螢幕按鈕（移動滑鼠才出現） ----------
let uiTimer;
document.addEventListener('mousemove', () => {
  document.body.classList.add('show-ui');
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => document.body.classList.remove('show-ui'), 2500);
});
$('fs').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});
