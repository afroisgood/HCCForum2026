import {
  doc, collection, query, orderBy, onSnapshot, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp, writeBatch,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from '../vendor/firebase.js';
import {
  initFirebase, showConfigWarning, ADMIN_EMAIL, SESSIONS, sessionName, speakerLabel, escapeHtml, askUrl, qrCanvas, formatTime, EVENT,
} from './common.js';
import { buildDocx, download } from './docx.js';

const $ = (id) => document.getElementById(id);

const fb = initFirebase();
if (!fb) {
  showConfigWarning($('app'));
  throw new Error('Firebase not configured');
}
const { db, auth } = fb;
const displayRef = doc(db, 'display', 'current');
const settingsRef = doc(db, 'settings', 'app');

const state = {
  questions: [],
  display: null,
  open: true,
  drawSession: SESSIONS[0].id,
};

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ============================================================
// 登入
// ============================================================
$('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  try {
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, $('password').value);
    $('password').value = '';
  } catch (err) {
    console.error(err);
    $('login-error').textContent = '密碼錯誤或尚未建立管理者帳號';
  }
});
$('logout').addEventListener('click', () => signOut(auth));

let unsubs = [];
onAuthStateChanged(auth, (user) => {
  unsubs.forEach((u) => u());
  unsubs = [];
  const ok = user?.email === ADMIN_EMAIL;
  $('login').hidden = ok;
  $('dashboard').hidden = !ok;
  $('top-actions').hidden = !ok;
  if (user && !ok) signOut(auth);
  if (ok) start();
});

// ============================================================
// 即時資料
// ============================================================
function start() {
  unsubs.push(onSnapshot(query(collection(db, 'questions'), orderBy('createdAt', 'desc')), (snap) => {
    state.questions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  }, (err) => { console.error(err); toast('讀取提問失敗，請重新登入'); }));

  unsubs.push(onSnapshot(displayRef, (snap) => {
    state.display = snap.exists() ? snap.data() : null;
    renderPreview();
    renderList();
  }));

  unsubs.push(onSnapshot(settingsRef, (snap) => {
    state.open = !snap.exists() || snap.data().open !== false;
    $('open-pill').textContent = state.open ? '開放中' : '已關閉';
    $('open-pill').className = `status-pill ${state.open ? 'open' : 'closed'}`;
    $('toggle-open').textContent = state.open ? '關閉提問' : '重新開放提問';
  }));
}

// ============================================================
// 抽籤區
// ============================================================
$('draw-session').innerHTML = SESSIONS.map((s) => `<button type="button" data-id="${s.id}">${escapeHtml(s.name)}</button>`).join('');
$('draw-session').addEventListener('click', (e) => {
  const id = e.target.closest('button')?.dataset.id;
  if (!id) return;
  state.drawSession = id;
  renderDrawControls();
});

function renderDrawControls() {
  for (const b of $('draw-session').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.id === state.drawSession));
  }
  const s = SESSIONS.find((x) => x.id === state.drawSession);
  const cur = $('draw-speaker').value;
  $('draw-speaker').innerHTML = `<option value="">全部與談者</option>${s.speakers.map((sp) => `<option value="${escapeHtml(sp)}"${sp === cur ? ' selected' : ''}>${escapeHtml(speakerLabel(sp))}</option>`).join('')}`;
  renderPoolCount();
}
$('draw-speaker').addEventListener('change', renderPoolCount);

function drawCandidates() {
  const sp = $('draw-speaker').value;
  return state.questions.filter((q) => q.session === state.drawSession && q.status === 'pool' && (!sp || q.speaker === sp));
}
function renderPoolCount() {
  const n = drawCandidates().length;
  $('pool-count').textContent = n;
  $('draw').disabled = n === 0;
}

$('draw').addEventListener('click', async () => {
  const btn = $('draw');
  btn.disabled = true;
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const list = drawCandidates();
      if (!list.length) { toast('籤筒已經沒有問題了'); return; }
      const pick = list[Math.floor(Math.random() * list.length)];
      const ok = await runTransaction(db, async (tx) => {
        const ref = doc(db, 'questions', pick.id);
        const snap = await tx.get(ref);
        if (!snap.exists() || snap.data().status !== 'pool') return false;
        const q = snap.data();
        tx.update(ref, { status: 'drawn', drawnAt: serverTimestamp() });
        tx.set(displayRef, {
          active: true, questionId: pick.id, session: q.session, speaker: q.speaker,
          nickname: q.nickname, content: q.content, drawnAt: serverTimestamp(),
        });
        return true;
      });
      if (ok) { toast('已抽出，大螢幕更新中'); return; }
    }
    toast('抽籤失敗，請再試一次');
  } catch (err) {
    console.error(err);
    toast('抽籤失敗，請再試一次');
  } finally {
    renderPoolCount();
  }
});

const clearScreen = () => setDoc(displayRef, { active: false, clearedAt: serverTimestamp() });
$('clear-screen').addEventListener('click', async () => {
  await clearScreen();
  toast('大螢幕已回到待機畫面');
});

function renderPreview() {
  const d = state.display;
  const el = $('preview');
  if (!d?.active) {
    el.className = 'preview preview--idle';
    el.textContent = '待機畫面：活動名稱、日期與提問 QR Code';
    return;
  }
  el.className = 'preview';
  el.innerHTML = `
    <span class="tag tag--session">${escapeHtml(sessionName(d.session))}</span>
    <span class="tag tag--speaker">${escapeHtml(speakerLabel(d.speaker))}</span>
    <p>${escapeHtml(d.content)}</p>
    <div class="by">— ${escapeHtml(d.nickname)}</div>`;
}

// ============================================================
// 提問開關、QR Code、匯出
// ============================================================
$('toggle-open').addEventListener('click', async () => {
  const next = !state.open;
  if (!next && !confirm('確定要關閉提問？關閉後參與者將無法再送出問題。')) return;
  await setDoc(settingsRef, { open: next }, { merge: true });
  toast(next ? '已重新開放提問' : '已關閉提問');
});

$('download-qr').addEventListener('click', () => {
  const canvas = qrCanvas(askUrl(), 1200);
  canvas.toBlob((blob) => download(blob, 'HCCForum2026_QRCode.png'));
});

$('export-word').addEventListener('click', () => {
  const statusText = { pool: '未抽中', drawn: '已抽中', excluded: '不參加抽籤' };
  const all = [...state.questions].sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
  const now = new Date();
  const blocks = [
    { text: `${EVENT.title}｜線上提問紀錄`, bold: true, size: 18, align: 'center', spaceAfter: 4 },
    { text: `花蓮縣文化局社造論壇　${EVENT.date}（六）`, size: 11, align: 'center', color: '555555', spaceAfter: 2 },
    { text: `匯出時間：${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${formatTime(now)}　總提問數：${all.length} 題　已抽中：${all.filter((q) => q.status === 'drawn').length} 題`, size: 10, align: 'center', color: '555555', spaceAfter: 18 },
  ];
  for (const s of SESSIONS) {
    const inSession = all.filter((q) => q.session === s.id);
    blocks.push({ text: `【${s.name}】共 ${inSession.length} 題`, bold: true, size: 15, color: '13702C', spaceAfter: 10 });

    const drawn = inSession.filter((q) => q.status === 'drawn').sort((a, b) => (a.drawnAt?.toMillis?.() ?? 0) - (b.drawnAt?.toMillis?.() ?? 0));
    if (drawn.length) {
      blocks.push({ text: '現場抽中順序', bold: true, size: 12, spaceAfter: 4 });
      drawn.forEach((q, i) => blocks.push({ text: `${i + 1}. ${q.content}（${speakerLabel(q.speaker)}／${q.nickname}，${formatTime(q.drawnAt)} 抽出）`, size: 11, indent: 12, spaceAfter: 4 }));
      blocks.push({ text: '', spaceAfter: 6 });
    }

    for (const sp of s.speakers) {
      const list = inSession.filter((q) => q.speaker === sp);
      blocks.push({ text: `提問對象：${speakerLabel(sp)}（${list.length} 題）`, bold: true, size: 13, spaceAfter: 6 });
      if (!list.length) blocks.push({ text: '（無）', size: 11, color: '777777', indent: 12 });
      list.forEach((q, i) => {
        blocks.push({ text: `${i + 1}. ${q.content}`, size: 11, indent: 12, spaceAfter: 2 });
        blocks.push({ text: `暱稱：${q.nickname}｜提問時間：${formatTime(q.createdAt, true)}｜狀態：${statusText[q.status] ?? q.status}`, size: 9, color: '666666', indent: 24, spaceAfter: 8 });
      });
      blocks.push({ text: '', spaceAfter: 6 });
    }
  }
  const p = (n) => String(n).padStart(2, '0');
  download(buildDocx(blocks), `HCCForum2026_QA_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}.docx`);
});

$('wipe').addEventListener('click', async () => {
  const n = state.questions.length;
  if (!n) { toast('目前沒有提問'); return; }
  if (prompt(`將永久刪除全部 ${n} 則提問，無法復原。\n請輸入「清空」確認：`) !== '清空') return;
  try {
    const ids = state.questions.map((q) => q.id);
    for (let i = 0; i < ids.length; i += 400) {
      const batch = writeBatch(db);
      ids.slice(i, i + 400).forEach((id) => batch.delete(doc(db, 'questions', id)));
      await batch.commit();
    }
    await clearScreen();
    toast(`已清空 ${n} 則提問`);
  } catch (err) {
    console.error(err);
    toast('清空失敗，請再試一次');
  }
});

// ============================================================
// 問題列表
// ============================================================
$('f-session').innerHTML = `<option value="">全部場次</option>${SESSIONS.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}`;
function renderSpeakerFilter() {
  const sid = $('f-session').value;
  const cur = $('f-speaker').value;
  const speakers = sid ? SESSIONS.find((s) => s.id === sid).speakers : SESSIONS.flatMap((s) => s.speakers);
  $('f-speaker').innerHTML = `<option value="">全部與談者</option>${speakers.map((sp) => `<option value="${escapeHtml(sp)}"${sp === cur ? ' selected' : ''}>${escapeHtml(speakerLabel(sp))}</option>`).join('')}`;
}
$('f-session').addEventListener('change', () => { renderSpeakerFilter(); renderList(); });
$('f-speaker').addEventListener('change', renderList);
$('f-status').addEventListener('change', renderList);

function renderList() {
  const fs = $('f-session').value;
  const fsp = $('f-speaker').value;
  const fst = $('f-status').value;
  const liveId = state.display?.active ? state.display.questionId : null;
  const list = state.questions.filter((q) => (!fs || q.session === fs) && (!fsp || q.speaker === fsp) && (!fst || q.status === fst));

  const count = (st) => state.questions.filter((q) => q.status === st).length;
  $('stats').innerHTML = `總共 <b>${state.questions.length}</b> 題｜籤筒中 <b>${count('pool')}</b>｜已抽中 <b>${count('drawn')}</b>｜不參加抽籤 <b>${count('excluded')}</b>${list.length !== state.questions.length ? `｜目前篩選 <b>${list.length}</b> 題` : ''}`;

  if (!list.length) {
    $('q-list').innerHTML = '<div class="empty">目前沒有提問</div>';
    return;
  }
  const badge = { pool: ['籤筒中', ''], drawn: ['已抽中', 'drawn'], excluded: ['不參加抽籤', 'excluded'] };
  $('q-list').innerHTML = list.map((q) => {
    const live = q.id === liveId;
    const [label, cls] = badge[q.status] ?? [q.status, ''];
    const actions = [
      q.status === 'pool' ? `<button class="btn btn--sm btn--ghost" data-act="exclude">不參加抽籤</button>` : '',
      q.status === 'excluded' ? `<button class="btn btn--sm btn--lime" data-act="include">恢復抽籤</button>` : '',
      q.status === 'drawn' ? `<button class="btn btn--sm btn--ghost" data-act="include">放回籤筒</button>` : '',
      `<button class="btn btn--sm btn--pink" data-act="delete">刪除</button>`,
    ].join('');
    return `
      <article class="q-item ${q.status === 'drawn' ? 'is-drawn' : ''} ${q.status === 'excluded' ? 'is-excluded' : ''} ${live ? 'is-live' : ''}" data-id="${escapeHtml(q.id)}">
        <div class="q-meta">
          ${live ? '<span class="q-badge live">大螢幕顯示中</span>' : ''}
          <span class="q-badge ${cls}">${label}</span>
          <span class="tag tag--session">${escapeHtml(sessionName(q.session))}</span>
          <span class="tag tag--speaker">${escapeHtml(speakerLabel(q.speaker))}</span>
          <span>${escapeHtml(q.nickname)}</span>
          <span>${formatTime(q.createdAt, true)}</span>
        </div>
        <div class="q-actions">${actions}</div>
        <p class="q-content">${escapeHtml(q.content)}</p>
      </article>`;
  }).join('');
}

$('q-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('.q-item').dataset.id;
  const ref = doc(db, 'questions', id);
  const isLive = state.display?.active && state.display.questionId === id;
  btn.disabled = true;
  try {
    if (btn.dataset.act === 'delete') {
      if (!confirm('確定刪除這則提問？刪除後無法復原。')) { btn.disabled = false; return; }
      await deleteDoc(ref);
      if (isLive) await clearScreen();
      toast('已刪除');
    } else if (btn.dataset.act === 'exclude') {
      await updateDoc(ref, { status: 'excluded' });
    } else if (btn.dataset.act === 'include') {
      await updateDoc(ref, { status: 'pool', drawnAt: null });
      if (isLive) await clearScreen();
    }
  } catch (err) {
    console.error(err);
    toast('操作失敗，請再試一次');
    btn.disabled = false;
  }
});

function renderAll() {
  renderDrawControls();
  renderList();
}
renderSpeakerFilter();
renderDrawControls();
