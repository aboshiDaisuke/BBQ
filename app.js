'use strict';

// =============================================================
// ROLES
// =============================================================
const ROLES = [
  { id: '',            label: '役職なし',       color: '#b0a89e', bg: 'rgba(176,168,158,0.16)', rank: 99 },
  { id: 'president',   label: '社長',           color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)',  rank: 1  },
  { id: 'director',    label: '取締役',         color: '#3b9eff', bg: 'rgba(59,158,255,0.15)',  rank: 2  },
  { id: 'division',    label: '事業部長',       color: '#6c7cff', bg: 'rgba(108,124,255,0.15)', rank: 3  },
  { id: 'head',        label: '室長',           color: '#12b5c9', bg: 'rgba(18,181,201,0.15)',  rank: 4  },
  { id: 'manager',     label: 'マネージャー',   color: '#1bc47d', bg: 'rgba(27,196,125,0.15)',  rank: 5  },
  { id: 'chief',       label: 'チーフ',         color: '#ff9f1c', bg: 'rgba(255,159,28,0.16)',  rank: 6  },
  { id: 'subchief',    label: 'サブチーフ',     color: '#e0a52e', bg: 'rgba(224,165,46,0.16)',  rank: 7  },
  { id: 'leader',      label: 'リーダー',       color: '#ff6b4a', bg: 'rgba(255,107,74,0.15)',  rank: 8  },
  { id: 'subleader',   label: 'サブリーダー',   color: '#ff5c8a', bg: 'rgba(255,92,138,0.15)',  rank: 9  },
];
function getRole(id) {
  return ROLES.find(r => r.id === (id || '')) || ROLES[0];
}
function roleOptionsHTML(selectedId) {
  return ROLES.map(r =>
    `<option value="${r.id}" ${r.id === (selectedId || '') ? 'selected' : ''}>${r.label}</option>`
  ).join('');
}
/** メンバー配列をランク順→五十音順でソートした新配列を返す */
function sortMembers(members) {
  return [...members].sort((a, b) => {
    const ra = getRole(a.role).rank;
    const rb = getRole(b.role).rank;
    if (ra !== rb) return ra - rb;
    return (a.name || '').localeCompare(b.name || '', 'ja');
  });
}

/** 現在の並び替えモード（'role' | 'kana' | 'manual'） */
function getMemberSort() {
  const m = state && state.memberSort;
  return (m === 'kana' || m === 'manual') ? m : 'role';
}

/** モードに応じてメンバー配列を並べ替えた新配列を返す（manual は保存順のまま） */
function sortMembersBy(members, mode) {
  const list = members || [];
  if (mode === 'manual') return [...list];
  if (mode === 'kana') {
    // ※漢字は読み仮名が無いため近似（かな名は正確）
    return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
  }
  return sortMembers(list);
}

/** ドラッグで並んだDOM順(ids)に合わせて元配列を並べ替えて返す */
function reorderByIds(arr, ids) {
  const map = new Map(arr.map(x => [x.id, x]));
  const next = ids.map(id => map.get(id)).filter(Boolean);
  arr.forEach(x => { if (!ids.includes(x.id)) next.push(x); }); // 念のため漏れを追加
  return next;
}

/**
 * コンテナ内の行（直下の .member-item）を、グリップ(handle)のドラッグで並び替える。
 * ポインタイベントなのでマウス・タッチ両対応。idAttr は 'mid' か 'rid'。
 * 並び替え確定時に onReorder(新ID配列) を呼ぶ。
 */
function enableDragSort(container, idAttr, onReorder) {
  container.querySelectorAll('[data-drag-handle]').forEach(handle => {
    handle.addEventListener('pointerdown', e => {
      const row = handle.closest('.member-item');
      if (!row) return;
      e.preventDefault();
      let moved = false;
      row.classList.add('dragging');
      document.body.classList.add('dragging-active');

      // 行をDOM移動すると handle 上の pointer capture が外れて pointermove が
      // 届かなくなるため、移動イベントは document で受ける（マウス・タッチ両対応）。
      const onMove = ev => {
        ev.preventDefault();
        moved = true;
        row.style.pointerEvents = 'none';          // 真下の行を拾うため一時的に透過
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        row.style.pointerEvents = '';
        const target = under && under.closest('.member-item');
        if (!target || target === row || target.parentNode !== container) return;
        const rect = target.getBoundingClientRect();
        const before = ev.clientY < rect.top + rect.height / 2;
        container.insertBefore(row, before ? target : target.nextSibling);
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        row.classList.remove('dragging');
        document.body.classList.remove('dragging-active');
        if (!moved) return;                         // 単なるクリックなら並び替えしない
        const ids = [...container.children]
          .filter(c => c.dataset && c.dataset[idAttr])
          .map(c => c.dataset[idAttr]);
        onReorder(ids);
      };
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  });
}

// =============================================================
// STATE
// =============================================================
let state = {
  events: [],   // [{id, name, date, note, carryover, expenses:[], members:[]}]
  members: []   // 登録済みメンバー [{id, name, role}]
};
let currentEventId = null;
let editingExpenseId = null;
let currentPage = 'events'; // 'events' | 'members' | 'dashboard'
let editingMemberId = null;
let showUnpaidOnly = false;  // 参加者リストを未払いのみに絞り込むか

// =============================================================
// STORAGE
// =============================================================
const STORAGE_KEY = 'nomikai_v2';

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, currentEventId }));
  // ログイン中ならクラウドにも自動バックアップ（cloud.js が定義）
  if (window.__cloudPush) window.__cloudPush();
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = parsed.state || { events: [], members: [] };
      currentEventId = parsed.currentEventId || null;
      if (currentEventId && !state.events.find(e => e.id === currentEventId)) {
        currentEventId = state.events.length ? state.events[state.events.length - 1].id : null;
      }
      // 日付データのマイグレーション: 不正な形式(例:202604-01-21)を修正
      migrateDates();
    } else {
      // 初回（保存データが無い）のときだけチュートリアル用サンプルを投入。
      // 一度でも保存されればキーが残るので、削除しても二度と復活しない。
      loadTutorialSample();
    }
  } catch (e) {
    console.warn('Failed to load state', e);
  }
}

/** チュートリアル用のサンプルデータを投入（初回 / 空状態の「サンプルを見る」から呼ぶ） */
function loadTutorialSample() {
  const reg = [
    { id: uid(), name: '田中 太郎',  role: 'president' },
    { id: uid(), name: '佐藤 花子',  role: 'division' },
    { id: uid(), name: '鈴木 一郎',  role: 'manager' },
    { id: uid(), name: '高橋 美咲',  role: '' },
  ];
  const mem = (r, amount, paid) => ({
    id: uid(), name: r.name, role: r.role, registeredId: r.id,
    attending: true, amount, paid,
  });
  const ev = {
    id: uid(),
    name: '🍻 サンプル飲み会（使い方の例）',
    date: todayISO(),
    note: 'これは使い方の見本です。不要なら右上の「削除」で消せます',
    carryover: 3000,
    completed: false,
    completedAt: null,
    expenses: [
      { id: uid(), desc: 'お店代', amount: 16000 },
    ],
    members: [
      mem(reg[0], 6000, true),
      mem(reg[1], 6000, true),
      mem(reg[2], 6000, true),
      mem(reg[3], 6000, false),   // 未払い → 未集金・未払いフィルタの見本
    ],
  };
  // 既存データは消さず追加（メンバーだけ登録済みでも安全）
  state.members.push(...reg);
  state.events.push(ev);
  currentEventId = ev.id;
  currentPage = 'events';
  saveState();
}

function migrateDates() {
  (state.events || []).forEach(ev => {
    if (ev.date) {
      // '2026' + '04' + '-01-21' のような結合ミスを修正
      // 正常なYYYY-MM-DD: 10文字
      let d = String(ev.date);
      if (d.length > 10) {
        // 最初の10文字だけ取る（yyyymmddTに対応）
        const match = d.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
        if (match) {
          ev.date = `${match[1]}-${match[2]}-${match[3]}`;
        }
      }
    }
  });
}

// =============================================================
// UTILS
// =============================================================
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function fmt(n) {
  const v = Number(n) || 0;
  return '¥' + v.toLocaleString('ja-JP');
}
/** Enterキーで送信。ただしIME変換確定中のEnter（日本語入力など）は無視する */
function onEnterSubmit(el, handler) {
  el.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.isComposing || e.keyCode === 229) return; // 変換確定中は送信しない
    handler();
  });
}
function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function dateLabel(dateStr) {
  if (!dateStr) return '日付未設定';
  // yyyy-mm-dd形式に正規化（スラッシュや不正形式に対応）
  let normalized = String(dateStr).replace(/\//g, '-');
  // 8桁数字の場合 (yyyymmdd) も対応
  if (/^\d{8}$/.test(normalized)) {
    normalized = normalized.slice(0,4) + '-' + normalized.slice(4,6) + '-' + normalized.slice(6,8);
  }
  const d = new Date(normalized + (normalized.includes('T') ? '' : 'T00:00:00'));
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}
function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function currentEvent() {
  return state.events.find(e => e.id === currentEventId) || null;
}

function calcSummary(ev) {
  const carryover = Number(ev.carryover) || 0;
  // 集金は参加・不参加を問わず全メンバーが対象（不参加者からも集金できる）
  const members = ev.members || [];
  const collected = members.reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const paidCollected = members
    .filter(m => m.paid)
    .reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const spent = (ev.expenses || [])
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return {
    carryover,
    collected,                                  // 集金予定額（未払い含む）
    paidCollected,                              // 実際に集まった額（実収）
    unpaidAmount: collected - paidCollected,    // 未集金
    spent,
    balance: carryover + collected - spent,     // 予定残高（従来どおり）
    cashBalance: carryover + paidCollected - spent, // 実収ベースの手元残高
  };
}

/** 参加人数・総予算・一人当たり予算を計算（画面と帳票で共通） */
function calcPerPerson(ev) {
  const { carryover, collected } = calcSummary(ev);
  const count = (ev.members || []).filter(m => m.attending !== false).length;
  const totalBudget = carryover + collected;
  const perPerson = count > 0 ? Math.floor(totalBudget / count) : 0;
  return { count, totalBudget, perPerson };
}

/** 集金合計カードの実収/未収サブ表示を更新 */
function renderCollectedSub(ev) {
  const el = document.getElementById('sumCollectedSub');
  if (!el) return;
  const { collected, unpaidAmount } = calcSummary(ev);
  el.textContent = unpaidAmount > 0
    ? `未集金 ${fmt(unpaidAmount)}`
    : (collected > 0 ? '全額集金済み' : '');
}

/** 一人当たり予算の表示を更新 */
function renderPerPerson(ev) {
  const { count, totalBudget, perPerson } = calcPerPerson(ev);
  document.getElementById('perPersonAmount').textContent = count > 0 ? fmt(perPerson) : '---';
  document.getElementById('perPersonSub').textContent =
    count > 0
      ? `参加者 ${count}人 ／ 総予算 ${fmt(totalBudget)}`
      : '参加者を追加してください';
}

// =============================================================
// RENDER
// =============================================================
function render() {
  renderSidebar();
  if (currentPage === 'members') {
    renderMembersPage();
  } else if (currentPage === 'dashboard') {
    renderDashboard();
  } else {
    renderDetail();
  }
}

/* ----- Sidebar ----- */
function renderSidebar() {
  // イベントリスト
  const el = document.getElementById('eventList');
  if (!state.events.length) {
    el.innerHTML = '<div class="event-empty-sidebar">イベントがありません</div>';
  } else {
    el.innerHTML = state.events.slice().reverse().map(ev => {
      const { balance } = calcSummary(ev);
      const active = (currentPage === 'events' && ev.id === currentEventId) ? 'active' : '';
      const done = ev.completed ? ' completed' : '';
      const check = ev.completed ? '<span class="event-item-check">✓</span>' : '';
      return `
        <div class="event-item ${active}${done}" data-id="${ev.id}" role="button" tabindex="0">
          <div class="event-item-name">${check}${esc(ev.name)}</div>
          <div class="event-item-meta">
            <span>${ev.date ? dateLabel(ev.date) : '日付未設定'}</span>
            <span class="event-item-balance" style="color:${balance < 0 ? 'var(--red)' : 'var(--green)'}">${fmt(balance)}</span>
          </div>
        </div>`;
    }).join('');

    el.querySelectorAll('.event-item').forEach(item => {
      const select = () => {
        currentPage = 'events';
        currentEventId = item.dataset.id;
        saveState();
        render();
        closeMobileSidebar();
      };
      item.addEventListener('click', select);
      item.addEventListener('keydown', e => { if (e.key === 'Enter') select(); });
    });
  }

  // ナビ active 状態
  document.getElementById('btnNavMembers').classList.toggle('active', currentPage === 'members');
  const dashNav = document.getElementById('btnNavDashboard');
  if (dashNav) dashNav.classList.toggle('active', currentPage === 'dashboard');
  const badge = document.getElementById('memberCountBadge');
  badge.textContent = state.members.length > 0 ? String(state.members.length) : '';

  // 最終バックアップ日
  const bi = document.getElementById('backupInfo');
  if (bi) {
    bi.textContent = state.lastBackupAt
      ? `最終バックアップ: ${dateLabel(state.lastBackupAt)}`
      : '⚠️ バックアップ未実施';
    bi.classList.toggle('warn', !state.lastBackupAt);
  }
}

/* ----- Detail ----- */
function renderDetail() {
  const ev = currentEvent();
  const empty = document.getElementById('emptyState');
  const detail = document.getElementById('eventDetail');
  const membersPage = document.getElementById('membersPage');

  // 他ページは非表示
  membersPage.classList.add('hidden');
  document.getElementById('dashboardPage').classList.add('hidden');

  if (!ev) {
    empty.classList.remove('hidden');
    detail.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  detail.classList.remove('hidden');

  const { carryover, collected, spent, balance, cashBalance, unpaidAmount } = calcSummary(ev);

  // タイトル
  document.getElementById('detailTitle').textContent = ev.name;
  document.getElementById('detailSubtitle').textContent = dateLabel(ev.date) + (ev.note ? ' · ' + ev.note : '');

  // サマリー
  document.getElementById('sumCarry').textContent = fmt(carryover);
  document.getElementById('sumCollected').textContent = fmt(collected);
  document.getElementById('sumSpent').textContent = fmt(spent);
  document.getElementById('sumBalance').textContent = fmt(balance);
  const balCard = document.getElementById('cardBalance');
  balCard.classList.toggle('negative', balance < 0);
  renderCollectedSub(ev);

  // 一人当たり予算
  renderPerPerson(ev);

  // 次回への繰越金（実収ベース = 実際に集まった現金）
  const cfAmount = document.getElementById('carryForwardAmount');
  cfAmount.textContent = fmt(cashBalance);
  cfAmount.style.color = cashBalance < 0 ? 'var(--red)' : 'var(--green-deep)';
  document.getElementById('carryForwardSub').textContent =
    unpaidAmount > 0
      ? `未払い ${fmt(unpaidAmount)} は含みません（実際に集まった現金）`
      : '実際に集まった現金（手元）';

  // 完了（精算済み）状態
  const completed = !!ev.completed;
  detail.classList.toggle('is-completed', completed);
  document.getElementById('completeFlag').hidden = !completed;
  const tgl = document.getElementById('btnToggleComplete');
  tgl.textContent = completed ? '🔓 再オープン' : '✅ 精算完了にする';
  tgl.classList.toggle('is-complete', completed);

  // フォーム
  document.getElementById('eventName').value = ev.name || '';
  document.getElementById('eventDate').value = ev.date || '';
  document.getElementById('eventCarry').value = ev.carryover != null ? ev.carryover : '';
  document.getElementById('eventNote').value = ev.note || '';

  renderExpenses(ev);
  renderMembers(ev);
}

/* ----- Expenses ----- */
function renderExpenses(ev) {
  const el = document.getElementById('expenseList');
  if (!ev.expenses || !ev.expenses.length) {
    el.innerHTML = '<div class="list-empty">支出はまだありません</div>';
    return;
  }
  el.innerHTML = ev.expenses.map(exp => `
    <div class="expense-item">
      <span class="expense-desc">${esc(exp.desc)}</span>
      <div class="expense-right">
        <span class="expense-amount">${fmt(exp.amount)}</span>
        <button class="expense-btn edit-exp" data-eid="${exp.id}" title="編集">✏️</button>
        <button class="expense-btn del-exp" data-eid="${exp.id}" title="削除">🗑</button>
      </div>
    </div>`).join('');

  el.querySelectorAll('.edit-exp').forEach(btn => {
    btn.addEventListener('click', () => {
      const exp = currentEvent().expenses.find(e => e.id === btn.dataset.eid);
      if (exp) openExpenseModal(exp);
    });
  });
  el.querySelectorAll('.del-exp').forEach(btn => {
    btn.addEventListener('click', () => {
      const ev2 = currentEvent();
      if (!ev2) return;
      const exp = ev2.expenses.find(e => e.id === btn.dataset.eid);
      openConfirmModal(
        '支出を削除しますか？',
        exp ? `「${exp.desc}」${fmt(exp.amount)} を削除します。` : 'この支出を削除します。',
        () => {
          ev2.expenses = ev2.expenses.filter(e => e.id !== btn.dataset.eid);
          saveState(); render();
        }
      );
    });
  });
}

/* ----- Members ----- */
function renderMembers(ev) {
  const el = document.getElementById('memberList');
  const toolbar = document.getElementById('memberToolbar');
  const mode = getMemberSort();
  const all = sortMembersBy(ev.members || [], mode);
  // 手動並び替えはフィルタOFFの全件表示時のみ有効（部分表示だと並びが曖昧になるため）
  const canDrag = mode === 'manual' && !showUnpaidOnly;

  // 未払いサマリー＆フィルタ用ツールバー
  // 集金対象は参加・不参加を問わず「金額が入っている人」。
  const owes = m => (Number(m.amount) || 0) > 0;
  const collectors = all.filter(owes);
  const unpaid = collectors.filter(m => !m.paid);
  if (toolbar) {
    if (all.length) {
      toolbar.style.display = '';
      const unpaidSum = unpaid.reduce((s, m) => s + (Number(m.amount) || 0), 0);
      document.getElementById('unpaidSummary').textContent =
        unpaid.length ? `未払い ${unpaid.length}名 ／ ${fmt(unpaidSum)}`
          : (collectors.length ? '全員支払い済み 🎉' : '集金額が未設定です');
      document.getElementById('filterUnpaid').checked = showUnpaidOnly;
      document.getElementById('memberSortSelect').value = mode;
    } else {
      toolbar.style.display = 'none';
    }
  }

  if (!all.length) {
    el.innerHTML = '<div class="list-empty">参加者はまだいません</div>';
    return;
  }

  const list = showUnpaidOnly ? unpaid : all;
  if (!list.length) {
    el.innerHTML = '<div class="list-empty">未払いの人はいません 🎉</div>';
    return;
  }

  el.innerHTML = list.map(m => {
    const attending = m.attending !== false;
    const paid = !!m.paid;
    const initials = m.name.slice(0, 2);
    const role = getRole(m.role);
    const handle = canDrag
      ? '<button class="drag-handle" data-drag-handle aria-label="ドラッグして並び替え" title="ドラッグして並び替え">⠿</button>'
      : '';
    return `
      <div class="member-item${canDrag ? ' draggable' : ''}${attending ? '' : ' not-attending'}" data-mid="${m.id}">
        ${handle}
        <div class="member-avatar" style="background:linear-gradient(135deg,${role.color}cc,${role.color}88)">${esc(initials)}</div>
        <div style="min-width:0">
          <div class="member-name">${esc(m.name)}</div>
          ${m.role ? `<div class="role-badge" style="color:${role.color};background:${role.bg}">${role.label}</div>` : ''}
        </div>
        <div class="member-controls">
          <div class="attend-toggle">
            <button class="attend-btn yes ${attending ? 'active' : ''}" data-mid="${m.id}" data-v="true">参加</button>
            <button class="attend-btn no ${!attending ? 'active' : ''}" data-mid="${m.id}" data-v="false">不参加</button>
          </div>
          <div class="amount-field">
            <span class="amount-prefix">¥</span>
            <input class="amount-input" type="number" min="0" placeholder="0"
              value="${m.amount || ''}" data-mid="${m.id}" aria-label="集金額">
          </div>
          <button class="paid-badge ${paid ? 'paid' : 'unpaid'}" data-mid="${m.id}" data-toggle-paid title="クリックで支払状況を切替">
            ${paid ? '✓ 済' : '未払'}
          </button>
        </div>
        <button class="member-remove" data-mid="${m.id}" title="削除">✕</button>
      </div>`;
  }).join('');

  el.querySelectorAll('.attend-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ev2 = currentEvent();
      const mem = ev2.members.find(m => m.id === btn.dataset.mid);
      if (!mem) return;
      mem.attending = btn.dataset.v === 'true';
      // 不参加にしても集金額・支払状況は保持（不参加者からも集金できる）
      saveState(); render();
    });
  });

  el.querySelectorAll('.amount-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const ev2 = currentEvent();
      const mem = ev2.members.find(m => m.id === inp.dataset.mid);
      if (!mem) return;
      mem.amount = Number(inp.value) || 0;
      saveState();
      // サマリーを再描画（メンバーリストは再レンダリングしない）
      const { collected, balance } = calcSummary(ev2);
      document.getElementById('sumCollected').textContent = fmt(collected);
      document.getElementById('sumBalance').textContent = fmt(balance);
      document.getElementById('cardBalance').classList.toggle('negative', balance < 0);
      renderCollectedSub(ev2);
      // 一人当たり予算も更新
      renderPerPerson(ev2);
    });
  });

  el.querySelectorAll('[data-toggle-paid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ev2 = currentEvent();
      const mem = ev2.members.find(m => m.id === btn.dataset.mid);
      if (!mem) return;
      mem.paid = !mem.paid;
      saveState(); render();
    });
  });

  el.querySelectorAll('.member-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const ev2 = currentEvent();
      if (!ev2) return;
      const mem = ev2.members.find(m => m.id === btn.dataset.mid);
      openConfirmModal(
        '参加者を削除しますか？',
        mem ? `「${mem.name}」を参加者リストから削除します。集金額・支払状況も失われます。` : 'この参加者を削除します。',
        () => {
          ev2.members = ev2.members.filter(m => m.id !== btn.dataset.mid);
          saveState(); render();
        }
      );
    });
  });

  // 手動並び替え（ドラッグ）
  if (canDrag) {
    enableDragSort(el, 'mid', ids => {
      const ev2 = currentEvent();
      if (!ev2) return;
      ev2.members = reorderByIds(ev2.members, ids);
      saveState(); render();
    });
  }
}

// =============================================================
// 割り勘オートフィル
// =============================================================
function splitEqually() {
  const ev = currentEvent();
  if (!ev) return;
  const { carryover, spent } = calcSummary(ev);
  const members = ev.members || [];
  const attending = members.filter(m => m.attending !== false);
  const n = attending.length;
  if (n === 0) { alert('参加者がいません。先にメンバーを追加してください。'); return; }
  // 不参加者からの集金分は先に充当し、残りを参加者で均等割りする
  const fromAbsent = members
    .filter(m => m.attending === false)
    .reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const need = Math.max(0, spent - carryover - fromAbsent); // 集金で賄う必要額
  const per = Math.ceil(need / n);             // 不足が出ないよう切り上げ
  openConfirmModal(
    '割り勘で一括入力しますか？',
    `参加者 ${n}名 の集金額をそれぞれ ${fmt(per)} に設定します（支出 ${fmt(spent)} − 繰越 ${fmt(carryover)}${fromAbsent ? ' − 不参加者の集金 ' + fmt(fromAbsent) : ''} を均等割り）。手入力した金額は上書きされます。`,
    () => {
      attending.forEach(m => { m.amount = per; });
      saveState(); render();
    },
    { okText: '設定する', okColor: 'var(--blue)' }
  );
}

// =============================================================
// NEW EVENT MODAL
// =============================================================
function openNewEventModal() {
  document.getElementById('newEventName').value = '';
  document.getElementById('newEventDate').value = todayISO();
  document.getElementById('newEventCarry').value = '';
  document.getElementById('newEventAutoAdd').checked = true;

  // 前回残高の自動繰越（精算完了したイベント優先。なければ最後のイベント）
  const prevEvents = state.events;
  const carryField = document.getElementById('carryFromPrevField');
  const carryCheck = document.getElementById('carryFromPrev');
  const carryHint = document.getElementById('carryFromPrevHint');
  if (prevEvents.length > 0) {
    const completedEvents = prevEvents.filter(e => e.completed);
    const src = completedEvents.length
      ? completedEvents[completedEvents.length - 1]
      : prevEvents[prevEvents.length - 1];
    // 繰越は実収ベース（実際に集まった現金）
    const { cashBalance } = calcSummary(src);
    carryField.style.display = '';
    carryHint.textContent =
      `前回「${src.name}」の手元残高（実収）: ${fmt(cashBalance)}` +
      (src.completed ? '（精算完了）' : '');
    carryCheck.checked = true;
    // チェック時に繰越額フィールドを連動
    const syncCarry = () => {
      if (carryCheck.checked) {
        document.getElementById('newEventCarry').value = cashBalance;
        document.getElementById('newEventCarry').disabled = true;
      } else {
        document.getElementById('newEventCarry').value = '';
        document.getElementById('newEventCarry').disabled = false;
      }
    };
    syncCarry();
    carryCheck.onchange = syncCarry;
  } else {
    carryField.style.display = 'none';
    document.getElementById('newEventCarry').disabled = false;
  }

  document.getElementById('modalNewEvent').classList.remove('hidden');
  setTimeout(() => document.getElementById('newEventName').focus(), 100);
}

function closeNewEventModal() {
  document.getElementById('modalNewEvent').classList.add('hidden');
  document.getElementById('newEventCarry').disabled = false;
}

function createEvent() {
  const name = document.getElementById('newEventName').value.trim();
  if (!name) {
    document.getElementById('newEventName').focus();
    return;
  }
  const date = document.getElementById('newEventDate').value;
  const carryover = Number(document.getElementById('newEventCarry').value) || 0;
  const autoAdd = document.getElementById('newEventAutoAdd').checked;

  const members = autoAdd ? state.members.map(m => ({
    id: uid(), name: m.name, attending: true, amount: 0, paid: false, registeredId: m.id
  })) : [];

  const ev = { id: uid(), name, date, note: '', carryover, completed: false, completedAt: null, expenses: [], members };
  state.events.push(ev);
  currentEventId = ev.id;
  saveState();
  closeNewEventModal();
  render();
}

// =============================================================
// EXPENSE MODAL
// =============================================================
function openExpenseModal(exp) {
  editingExpenseId = exp ? exp.id : null;
  document.getElementById('expenseModalTitle').textContent = exp ? '支出を編集' : '支出を追加';
  document.getElementById('expenseDesc').value = exp ? exp.desc : '';
  document.getElementById('expenseAmount').value = exp ? exp.amount : '';
  document.getElementById('modalExpense').classList.remove('hidden');
  setTimeout(() => document.getElementById('expenseDesc').focus(), 100);
}

function closeExpenseModal() {
  document.getElementById('modalExpense').classList.add('hidden');
  editingExpenseId = null;
}

function saveExpense() {
  const desc = document.getElementById('expenseDesc').value.trim();
  const amount = Number(document.getElementById('expenseAmount').value);
  if (!desc || !amount) {
    if (!desc) document.getElementById('expenseDesc').focus();
    else document.getElementById('expenseAmount').focus();
    return;
  }
  const ev = currentEvent();
  if (!ev) return;
  if (editingExpenseId) {
    const exp = ev.expenses.find(e => e.id === editingExpenseId);
    if (exp) { exp.desc = desc; exp.amount = amount; }
  } else {
    ev.expenses.push({ id: uid(), desc, amount });
  }
  saveState(); closeExpenseModal(); render();
}

// =============================================================
// MEMBER MODAL
// =============================================================
function openMemberModal() {
  renderKnownMembers();
  document.getElementById('newMemberName').value = '';
  document.getElementById('modalMember').classList.remove('hidden');
  setTimeout(() => document.getElementById('newMemberName').focus(), 100);
}

function closeMemberModal() {
  document.getElementById('modalMember').classList.add('hidden');
}

function renderKnownMembers() {
  const ev = currentEvent();
  const existIds = new Set((ev?.members || []).map(m => m.registeredId).filter(Boolean));
  const sec = document.getElementById('knownMembersSection');
  const el = document.getElementById('knownMemberList');

  if (!state.members.length) {
    sec.style.display = 'none';
    return;
  }
  sec.style.display = '';
  el.innerHTML = sortMembers(state.members).map(m => {
    const already = existIds.has(m.id);
    return `<div class="chip ${already ? 'added' : ''}" data-rid="${m.id}" data-name="${esc(m.name)}" title="${already ? 'すでに追加済み' : ''}">
      ${esc(m.name)}${already ? ' ✓' : ''}
    </div>`;
  }).join('');

  el.querySelectorAll('.chip:not(.added)').forEach(chip => {
    chip.addEventListener('click', () => {
      const ev2 = currentEvent();
      if (!ev2) return;
      ev2.members = ev2.members || [];
      ev2.members.push({
        id: uid(), name: chip.dataset.name, attending: true,
        amount: 0, paid: false, registeredId: chip.dataset.rid
      });
      saveState(); render();
      renderKnownMembers(); // リフレッシュ
    });
  });
}

function registerNewMember() {
  const name = document.getElementById('newMemberName').value.trim();
  if (!name) return;
  if (state.members.find(m => m.name === name)) {
    if (!confirm(`「${name}」は既に登録されています。別人として追加しますか？`)) return;
  }
  const regId = uid();
  state.members.push({ id: regId, name });

  const ev = currentEvent();
  if (ev) {
    ev.members = ev.members || [];
    ev.members.push({ id: uid(), name, attending: true, amount: 0, paid: false, registeredId: regId });
  }
  document.getElementById('newMemberName').value = '';
  saveState(); render();
  renderKnownMembers();
}

// =============================================================
// EVENT SETTINGS
// =============================================================
function saveEventSettings() {
  const ev = currentEvent();
  if (!ev) return;
  const name = document.getElementById('eventName').value.trim();
  if (!name) return;
  ev.name = name;
  ev.date = document.getElementById('eventDate').value;
  ev.carryover = Number(document.getElementById('eventCarry').value) || 0;
  ev.note = document.getElementById('eventNote').value.trim();
  saveState(); render();
}

/** イベントの「精算完了」を切り替える（軽量トグル） */
function toggleComplete() {
  const ev = currentEvent();
  if (!ev) return;
  if (ev.completed) {
    // 再オープン（確認不要）
    ev.completed = false;
    ev.completedAt = null;
    saveState(); render();
    return;
  }
  const { unpaidAmount } = calcSummary(ev);
  const done = () => {
    ev.completed = true;
    ev.completedAt = todayISO();
    saveState(); render();
  };
  if (unpaidAmount > 0) {
    openConfirmModal(
      '精算完了にしますか？',
      `未払いが ${fmt(unpaidAmount)} 残っています。次回への繰越は「実際に集まった現金」で計算されます。`,
      done,
      { okText: '完了にする', okColor: 'var(--blue)' }
    );
  } else {
    done();
  }
}

function deleteEvent() {
  const ev = currentEvent();
  if (!ev) return;
  openConfirmModal(
    `「${ev.name}」を削除しますか？`,
    'この操作は取り消せません。',
    () => {
      state.events = state.events.filter(e => e.id !== currentEventId);
      currentEventId = state.events.length ? state.events[state.events.length - 1].id : null;
      saveState(); render();
    }
  );
}

// =============================================================
// CONFIRM MODAL
// =============================================================
let confirmCallback = null;

function openConfirmModal(title, message, onConfirm, opts) {
  opts = opts || {};
  confirmCallback = onConfirm;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  // OKボタンは毎回リセット（既定は破壊的操作＝赤「削除する」）
  const ok = document.getElementById('btnConfirmOk');
  ok.textContent = opts.okText || '削除する';
  ok.style.background = opts.okColor || 'var(--red)';
  document.getElementById('modalConfirm').classList.remove('hidden');
}
function closeConfirmModal() {
  document.getElementById('modalConfirm').classList.add('hidden');
  confirmCallback = null;
}

// =============================================================
// BACKUP
// =============================================================
/** 復元データを正規化し、壊れた/欠損フィールドを安全な既定値で補う */
function normalizeState(raw) {
  const out = { events: [], members: [] };
  if (raw && Array.isArray(raw.events)) {
    out.events = raw.events.filter(e => e && typeof e === 'object').map(e => ({
      id: e.id || uid(),
      name: typeof e.name === 'string' ? e.name : '(無題)',
      date: typeof e.date === 'string' ? e.date : '',
      note: typeof e.note === 'string' ? e.note : '',
      carryover: Number(e.carryover) || 0,
      completed: !!e.completed,
      completedAt: typeof e.completedAt === 'string' ? e.completedAt : null,
      expenses: Array.isArray(e.expenses)
        ? e.expenses.filter(x => x && typeof x === 'object').map(x => ({
            id: x.id || uid(),
            desc: typeof x.desc === 'string' ? x.desc : '',
            amount: Number(x.amount) || 0,
          }))
        : [],
      members: Array.isArray(e.members)
        ? e.members.filter(x => x && typeof x === 'object').map(x => ({
            id: x.id || uid(),
            name: typeof x.name === 'string' ? x.name : '',
            attending: x.attending !== false,
            amount: Number(x.amount) || 0,
            paid: !!x.paid,
            role: typeof x.role === 'string' ? x.role : '',
            registeredId: x.registeredId,
          }))
        : [],
    }));
  }
  if (raw && Array.isArray(raw.members)) {
    out.members = raw.members.filter(m => m && typeof m === 'object').map(m => ({
      id: m.id || uid(),
      name: typeof m.name === 'string' ? m.name : '',
      role: typeof m.role === 'string' ? m.role : '',
    }));
  }
  if (raw && typeof raw.lastBackupAt === 'string') out.lastBackupAt = raw.lastBackupAt;
  if (raw && (raw.memberSort === 'kana' || raw.memberSort === 'manual' || raw.memberSort === 'role')) {
    out.memberSort = raw.memberSort;
  }
  return out;
}

function exportBackup() {
  state.lastBackupAt = todayISO();
  saveState();
  const data = JSON.stringify({ state, currentEventId, exportedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  document.body.appendChild(a);
  a.style.display = 'none';
  a.href = url;
  a.download = `飲み会バックアップ_${todayISO()}.json`;
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  renderSidebar(); // 最終バックアップ日表示を更新
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      const imported = parsed.state || parsed;
      if (!imported || !Array.isArray(imported.events)) throw new Error('Invalid format');
      if (!confirm('バックアップを復元しますか？現在のデータはすべて置き換えられます。')) return;
      state = normalizeState(imported);
      currentEventId = (parsed.currentEventId && state.events.find(ev => ev.id === parsed.currentEventId))
        ? parsed.currentEventId
        : (state.events.length ? state.events[state.events.length - 1].id : null);
      currentPage = 'events';
      saveState(); render();
    } catch {
      alert('ファイルの形式が正しくありません。');
    }
  };
  reader.readAsText(file);
}

// =============================================================
// PDF レポート（印刷 → PDFとして保存）
// =============================================================
function buildReportHTML(ev) {
  const { carryover, collected, spent, balance, cashBalance } = calcSummary(ev);
  const attending = (ev.members || []).filter(m => m.attending !== false);
  const n = attending.length;
  const { perPerson } = calcPerPerson(ev);

  // 未払い集計（参加・不参加を問わず、金額が入っている未払い者）
  const unpaid = (ev.members || []).filter(m => (Number(m.amount) || 0) > 0 && !m.paid);
  const unpaidSum = unpaid.reduce((s, m) => s + (Number(m.amount) || 0), 0);

  // 精算（残高を参加者で割る）。未集金があると手元現金と残高が一致せず
  // 返金額を誤って提示してしまうため、全員集金済みのときだけ計算する。
  let settle = '';
  if (n > 0 && unpaid.length === 0) {
    if (balance > 0) settle = `精算: 一人あたり <b>${fmt(Math.floor(balance / n))}</b> 返金できます（残高 ${fmt(balance)}）`;
    else if (balance < 0) settle = `精算: 一人あたり <b>${fmt(Math.ceil(-balance / n))}</b> 追加徴収が必要です（不足 ${fmt(-balance)}）`;
    else settle = '精算: 残高ちょうど ¥0 です';
  } else if (n > 0) {
    settle = '精算: 集金がすべて完了すると計算できます';
  }

  // 支出明細
  const expRows = (ev.expenses && ev.expenses.length)
    ? ev.expenses.map(e => `<tr><td>${esc(e.desc)}</td><td class="num">${fmt(e.amount)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="muted">支出はありません</td></tr>';

  // 参加者（画面と同じ並び順で出力）
  const memRows = (ev.members && ev.members.length)
    ? sortMembersBy(ev.members, getMemberSort()).map(m => {
        const att = m.attending !== false;
        const role = getRole(m.role);
        // 不参加でも集金額が入っていれば金額・支払を表示する
        const showMoney = att || (Number(m.amount) || 0) > 0;
        return `<tr>
          <td>${esc(m.name)}</td>
          <td>${m.role ? esc(role.label) : '—'}</td>
          <td>${att ? '参加' : '不参加'}</td>
          <td class="num">${showMoney ? fmt(m.amount) : '—'}</td>
          <td>${showMoney ? (m.paid ? '✓ 済' : '未払') : '—'}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="5" class="muted">参加者はいません</td></tr>';

  return `
    <div class="pr-head">
      <div class="pr-title">${esc(ev.name)}${ev.completed ? ' <span class="pr-done">✓ 精算完了</span>' : ''}</div>
      <div class="pr-sub">${esc(dateLabel(ev.date))}${ev.note ? ' ・ ' + esc(ev.note) : ''}</div>
    </div>

    <table class="pr-summary"><tr>
      <td><span>前回繰越</span><b>${fmt(carryover)}</b></td>
      <td><span>集金合計</span><b>${fmt(collected)}</b></td>
      <td><span>支出合計</span><b>${fmt(spent)}</b></td>
      <td><span>残高</span><b>${fmt(balance)}</b></td>
    </tr></table>

    <div class="pr-note">
      参加 ${n}名 ／ 一人当たり予算 ${n > 0 ? fmt(perPerson) : '—'}
      ${settle ? '<br>' + settle : ''}
      ${unpaid.length ? `<br>未払い ${unpaid.length}名 ／ ${fmt(unpaidSum)}` : ''}
      <br>次回への繰越金（実収）: <b>${fmt(cashBalance)}</b>
    </div>

    <div class="pr-section">支出明細</div>
    <table class="pr-table">
      <thead><tr><th>内容</th><th class="num">金額</th></tr></thead>
      <tbody>${expRows}</tbody>
      <tfoot><tr><td>合計</td><td class="num">${fmt(spent)}</td></tr></tfoot>
    </table>

    <div class="pr-section">参加者・集金（${(ev.members || []).length}名）</div>
    <table class="pr-table">
      <thead><tr><th>名前</th><th>役職</th><th>出欠</th><th class="num">集金額</th><th>支払</th></tr></thead>
      <tbody>${memRows}</tbody>
    </table>

    <div class="pr-foot">出力日: ${dateLabel(todayISO())}　/　飲み会管理</div>
  `;
}

// 現在のイベント内容を印刷用レポートに反映する。内容があるときだけ
// body に .printing を付け、ブラウザ標準の印刷（Cmd/Ctrl+P）でも同じ
// レポートが出るようにする。内容が無ければ画面をそのまま印刷させる。
function preparePrintReport() {
  const el = document.getElementById('printReport');
  if (!el) return false;
  const ev = currentEvent();
  if (!ev) {
    el.innerHTML = '';
    document.body.classList.remove('printing');
    return false;
  }
  el.innerHTML = buildReportHTML(ev);
  document.body.classList.add('printing');
  return true;
}

function clearPrintReport() {
  document.body.classList.remove('printing');
  const el = document.getElementById('printReport');
  if (el) el.innerHTML = '';
}

function printReport() {
  // 印刷ダイアログの送信先で「PDFとして保存」を選べる
  if (preparePrintReport()) window.print();
}

// =============================================================
// DASHBOARD（全イベント俯瞰）
// =============================================================
function navigateToDashboard() {
  currentPage = 'dashboard';
  saveState();
  render();
  closeMobileSidebar();
}

function renderDashboard() {
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('eventDetail').classList.add('hidden');
  document.getElementById('membersPage').classList.add('hidden');
  document.getElementById('dashboardPage').classList.remove('hidden');

  const evs = state.events || [];
  let totalSpent = 0, totalPaid = 0, totalUnpaid = 0;
  evs.forEach(ev => {
    const s = calcSummary(ev);
    totalSpent += s.spent;
    totalPaid += s.paidCollected;
    totalUnpaid += s.unpaidAmount;
  });

  // 統計カード
  const stats = [
    { icon: '📅', label: 'イベント数', value: `${evs.length}件`, cls: '' },
    { icon: '💸', label: '総支出', value: fmt(totalSpent), cls: 'red' },
    { icon: '💰', label: '実収合計', value: fmt(totalPaid), cls: 'green' },
    { icon: '⏳', label: '未回収合計', value: fmt(totalUnpaid), cls: totalUnpaid > 0 ? 'red' : '' },
  ];
  document.getElementById('dashStats').innerHTML = stats.map(s => `
    <div class="summary-card">
      <div class="summary-icon">${s.icon}</div>
      <div class="summary-amount ${s.cls}">${s.value}</div>
      <div class="summary-label">${s.label}</div>
    </div>`).join('');

  // イベント一覧
  const listEl = document.getElementById('dashEventList');
  if (!evs.length) {
    listEl.innerHTML = '<div class="list-empty">イベントがありません</div>';
    return;
  }
  const rows = evs.slice().reverse().map(ev => {
    const s = calcSummary(ev);
    const attendCount = (ev.members || []).filter(m => m.attending !== false).length;
    const unpaidCount = (ev.members || []).filter(m => (Number(m.amount) || 0) > 0 && !m.paid).length;
    return `<tr class="dash-row" data-id="${ev.id}" role="button" tabindex="0">
      <td class="dash-name">${esc(ev.name)}</td>
      <td>${ev.date ? esc(dateLabel(ev.date)) : '—'}</td>
      <td class="num">${attendCount}名</td>
      <td class="num">${fmt(s.spent)}</td>
      <td class="num">${fmt(s.paidCollected)}</td>
      <td class="num" style="color:${s.balance < 0 ? 'var(--red)' : 'var(--green)'}">${fmt(s.balance)}</td>
      <td class="num">${unpaidCount ? `<span class="dash-unpaid">${unpaidCount}名</span>` : '—'}</td>
    </tr>`;
  }).join('');
  listEl.innerHTML = `
    <div class="dash-table-wrap">
      <table class="dash-table">
        <thead><tr>
          <th>イベント</th><th>日付</th><th class="num">参加</th>
          <th class="num">支出</th><th class="num">実収</th><th class="num">残高</th><th class="num">未払</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  const openEvent = id => {
    currentPage = 'events';
    currentEventId = id;
    saveState();
    render();
  };
  listEl.querySelectorAll('.dash-row').forEach(row => {
    row.addEventListener('click', () => openEvent(row.dataset.id));
    row.addEventListener('keydown', e => { if (e.key === 'Enter') openEvent(row.dataset.id); });
  });
}

// =============================================================
// MEMBERS PAGE
// =============================================================
function navigateToMembers() {
  currentPage = 'members';
  saveState();
  render();
  closeMobileSidebar();
}

function renderMembersPage() {
  const empty = document.getElementById('emptyState');
  const detail = document.getElementById('eventDetail');
  const page = document.getElementById('membersPage');

  empty.classList.add('hidden');
  detail.classList.add('hidden');
  document.getElementById('dashboardPage').classList.add('hidden');
  page.classList.remove('hidden');

  const el = document.getElementById('globalMemberList');
  const gToolbar = document.getElementById('globalMemberToolbar');
  const mode = getMemberSort();
  if (!state.members.length) {
    if (gToolbar) gToolbar.style.display = 'none';
    el.innerHTML = '<div class="list-empty">登録済みメンバーはいません。<br>上のフォームから追加してください。</div>';
    return;
  }
  if (gToolbar) {
    gToolbar.style.display = '';
    document.getElementById('globalMemberCount').textContent = `${state.members.length}名`;
    document.getElementById('globalSortSelect').value = mode;
  }
  const canDrag = mode === 'manual';

  el.innerHTML = sortMembersBy(state.members, mode).map(m => {
    const role = getRole(m.role);
    const handle = canDrag
      ? '<button class="drag-handle" data-drag-handle aria-label="ドラッグして並び替え" title="ドラッグして並び替え">⠿</button>'
      : '';
    return `
    <div class="member-item${canDrag ? ' draggable' : ''}" data-rid="${m.id}">
      ${handle}
      <div class="member-avatar" style="background:linear-gradient(135deg,${role.color}cc,${role.color}88)">${esc(m.name.slice(0, 2))}</div>
      <div style="flex:1;min-width:0">
        <div class="member-name">${esc(m.name)}</div>
        ${m.role ? `<div class="role-badge" style="color:${role.color};background:${role.bg}">${role.label}</div>` : ''}
      </div>
      <div class="member-controls">
        <select class="role-select" data-rid="${m.id}" title="役職を選択">
          ${roleOptionsHTML(m.role)}
        </select>
        <button class="expense-btn edit-global-member" data-rid="${m.id}" title="名前を編集">✏️ 編集</button>
        <button class="member-remove del-global-member" data-rid="${m.id}" title="削除">✕</button>
      </div>
    </div>`;
  }).join('');

  // 役職変更
  el.querySelectorAll('.role-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const m = state.members.find(m => m.id === sel.dataset.rid);
      if (!m) return;
      m.role = sel.value;
      // 全イベント内の同一メンバーの role も更新
      state.events.forEach(ev => {
        (ev.members || []).forEach(em => {
          if (em.registeredId === m.id) em.role = m.role;
        });
      });
      saveState(); render();
    });
  });

  el.querySelectorAll('.edit-global-member').forEach(btn => {
    btn.addEventListener('click', () => openEditMemberModal(btn.dataset.rid));
  });
  el.querySelectorAll('.del-global-member').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = state.members.find(m => m.id === btn.dataset.rid);
      if (!m) return;
      openConfirmModal(
        `「${m.name}」を削除しますか？`,
        'イベント内の参加者情報は残ります。',
        () => { state.members = state.members.filter(m2 => m2.id !== btn.dataset.rid); saveState(); render(); }
      );
    });
  });

  // 手動並び替え（ドラッグ）
  if (canDrag) {
    enableDragSort(el, 'rid', ids => {
      state.members = reorderByIds(state.members, ids);
      saveState(); render();
    });
  }
}

function addGlobalMember() {
  const input = document.getElementById('globalMemberName');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  if (state.members.find(m => m.name === name)) {
    if (!confirm(`「${name}」は既に登録されています。別人として追加しますか？`)) return;
  }
  state.members.push({ id: uid(), name });
  input.value = '';
  input.focus();
  saveState(); render();
}

function openEditMemberModal(rid) {
  editingMemberId = rid;
  const m = state.members.find(m => m.id === rid);
  if (!m) return;
  document.getElementById('editMemberName').value = m.name;
  document.getElementById('modalEditMember').classList.remove('hidden');
  setTimeout(() => document.getElementById('editMemberName').select(), 80);
}
function closeEditMemberModal() {
  document.getElementById('modalEditMember').classList.add('hidden');
  editingMemberId = null;
}
function saveEditMember() {
  const newName = document.getElementById('editMemberName').value.trim();
  if (!newName) return;
  const m = state.members.find(m => m.id === editingMemberId);
  if (!m) return;
  const oldName = m.name;
  m.name = newName;
  // 全イベント内の同一メンバー名も更新
  state.events.forEach(ev => {
    (ev.members || []).forEach(em => {
      if (em.registeredId === editingMemberId) em.name = newName;
    });
  });
  saveState(); closeEditMemberModal(); render();
}

// =============================================================
// MOBILE SIDEBAR
// =============================================================
function openMobileSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.remove('hidden');
}
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.add('hidden');
}

// =============================================================
// スプラッシュ（起動画面）
// =============================================================
function initSplash() {
  const splash = document.getElementById('splashScreen');
  if (!splash) return;
  let dismissed = false;
  const enter = () => {
    if (dismissed) return;
    dismissed = true;
    splash.classList.add('is-hiding');
    // フェード後にDOMから除去（印刷やフォーカスの邪魔をしない）
    setTimeout(() => splash.remove(), 600);
  };
  // クリック／タップで本体へ（自動では切り替えない）
  splash.addEventListener('click', enter);
  // キーボード操作用にボタンへフォーカス（Enter / Space で開始）
  const startBtn = document.getElementById('splashStart');
  if (startBtn) { try { startBtn.focus({ preventScroll: true }); } catch (e) {} }
}

// =============================================================
// INIT
// =============================================================
document.addEventListener('DOMContentLoaded', () => {
  initSplash();
  loadState();

  // サイドバー: 新規イベント
  document.getElementById('btnNewEvent').addEventListener('click', openNewEventModal);
  document.getElementById('btnNewEventEmpty').addEventListener('click', openNewEventModal);
  document.getElementById('btnLoadSample').addEventListener('click', () => { loadTutorialSample(); render(); });

  // サイドバー: ナビ
  document.getElementById('btnNavDashboard').addEventListener('click', navigateToDashboard);
  document.getElementById('btnNavMembers').addEventListener('click', navigateToMembers);

  // メンバー管理ページ
  document.getElementById('btnAddGlobalMember').addEventListener('click', addGlobalMember);
  onEnterSubmit(document.getElementById('globalMemberName'), addGlobalMember);

  // 名前編集モーダル
  document.getElementById('btnCancelEditMember').addEventListener('click', closeEditMemberModal);
  document.getElementById('btnSaveEditMember').addEventListener('click', saveEditMember);
  onEnterSubmit(document.getElementById('editMemberName'), saveEditMember);
  document.getElementById('modalEditMember').addEventListener('click', e => {
    if (e.target.id === 'modalEditMember') closeEditMemberModal();
  });

  // 新規イベントモーダル
  document.getElementById('btnCancelNewEvent').addEventListener('click', closeNewEventModal);
  document.getElementById('btnCreateEvent').addEventListener('click', createEvent);
  onEnterSubmit(document.getElementById('newEventName'), createEvent);

  // 支出モーダル
  document.getElementById('btnAddExpense').addEventListener('click', () => openExpenseModal(null));
  document.getElementById('btnCancelExpense').addEventListener('click', closeExpenseModal);
  document.getElementById('btnSaveExpense').addEventListener('click', saveExpense);
  onEnterSubmit(document.getElementById('expenseAmount'), saveExpense);

  // メンバーモーダル
  document.getElementById('btnAddMember').addEventListener('click', openMemberModal);
  document.getElementById('btnCancelMember').addEventListener('click', closeMemberModal);
  document.getElementById('btnRegisterMember').addEventListener('click', registerNewMember);
  onEnterSubmit(document.getElementById('newMemberName'), registerNewMember);

  // 割り勘・未払いフィルタ
  document.getElementById('btnSplitEqually').addEventListener('click', splitEqually);
  document.getElementById('filterUnpaid').addEventListener('change', e => {
    showUnpaidOnly = e.target.checked;
    renderDetail();
  });

  // メンバー並び替え（両セレクタは同じ state.memberSort を共有）
  const onSortChange = e => { state.memberSort = e.target.value; saveState(); render(); };
  document.getElementById('memberSortSelect').addEventListener('change', onSortChange);
  document.getElementById('globalSortSelect').addEventListener('change', onSortChange);

  // イベント設定
  document.getElementById('btnSaveEvent').addEventListener('click', saveEventSettings);
  document.getElementById('btnToggleComplete').addEventListener('click', toggleComplete);
  document.getElementById('btnDeleteEvent').addEventListener('click', deleteEvent);
  document.getElementById('btnPrintReport').addEventListener('click', printReport);
  // 標準の印刷（Cmd/Ctrl+P や共有→印刷）でも正しいレポートを出す
  window.addEventListener('beforeprint', preparePrintReport);
  window.addEventListener('afterprint', clearPrintReport);



  // バックアップ・復元
  document.getElementById('btnExport').addEventListener('click', exportBackup);
  document.getElementById('importFile').addEventListener('change', e => {
    if (e.target.files[0]) { importBackup(e.target.files[0]); e.target.value = ''; }
  });

  // モバイルメニュー
  document.getElementById('btnMenu').addEventListener('click', openMobileSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click', closeMobileSidebar);

  // 削除確認モーダル
  document.getElementById('btnConfirmCancel').addEventListener('click', closeConfirmModal);
  document.getElementById('btnConfirmOk').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
  });
  document.getElementById('modalConfirm').addEventListener('click', e => {
    if (e.target.id === 'modalConfirm') closeConfirmModal();
  });

  // モーダル外クリックで閉じる
  ['modalNewEvent', 'modalExpense', 'modalMember'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      if (e.target.id === id) {
        if (id === 'modalNewEvent') closeNewEventModal();
        else if (id === 'modalExpense') closeExpenseModal();
        else if (id === 'modalMember') closeMemberModal();
      }
    });
  });

  // Escape でモーダルを閉じる
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('modalConfirm').classList.contains('hidden')) closeConfirmModal();
    else if (!document.getElementById('modalEditMember').classList.contains('hidden')) closeEditMemberModal();
    else if (!document.getElementById('modalNewEvent').classList.contains('hidden')) closeNewEventModal();
    else if (!document.getElementById('modalExpense').classList.contains('hidden')) closeExpenseModal();
    else if (!document.getElementById('modalMember').classList.contains('hidden')) closeMemberModal();
  });

  render();
});
