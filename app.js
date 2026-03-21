'use strict';

// =============================================================
// ROLES
// =============================================================
const ROLES = [
  { id: '',            label: '役職なし',       color: '#aeaeb2', bg: 'rgba(174,174,178,0.12)', rank: 99 },
  { id: 'president',   label: '社長',           color: '#bf5af2', bg: 'rgba(191,90,242,0.12)',  rank: 1  },
  { id: 'director',    label: '取締役',         color: '#0071e3', bg: 'rgba(0,113,227,0.1)',    rank: 2  },
  { id: 'head',        label: '室長',           color: '#0096c7', bg: 'rgba(0,150,199,0.1)',    rank: 3  },
  { id: 'manager',     label: 'マネージャー',   color: '#34c759', bg: 'rgba(52,199,89,0.1)',    rank: 4  },
  { id: 'chief',       label: 'チーフ',         color: '#ff9500', bg: 'rgba(255,149,0,0.12)',   rank: 5  },
  { id: 'leader',      label: 'リーダー',       color: '#ff6b35', bg: 'rgba(255,107,53,0.1)',   rank: 6  },
  { id: 'subleader',   label: 'サブリーダー',   color: '#ff9f0a', bg: 'rgba(255,159,10,0.1)',   rank: 7  },
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

// =============================================================
// STATE
// =============================================================
let state = {
  events: [],   // [{id, name, date, note, carryover, expenses:[], members:[]}]
  members: []   // 登録済みメンバー [{id, name, role}]
};
let currentEventId = null;
let editingExpenseId = null;
let currentPage = 'events'; // 'events' | 'members'
let editingMemberId = null;

// =============================================================
// STORAGE
// =============================================================
const STORAGE_KEY = 'nomikai_v2';

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, currentEventId }));
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
    }
  } catch (e) {
    console.warn('Failed to load state', e);
  }
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
  const collected = (ev.members || [])
    .filter(m => m.attending !== false)
    .reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const spent = (ev.expenses || [])
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return { carryover, collected, spent, balance: carryover + collected - spent };
}

// =============================================================
// RENDER
// =============================================================
function render() {
  renderSidebar();
  if (currentPage === 'members') {
    renderMembersPage();
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
      return `
        <div class="event-item ${active}" data-id="${ev.id}" role="button" tabindex="0">
          <div class="event-item-name">${esc(ev.name)}</div>
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

  // メンバー管理ナビ
  const navBtn = document.getElementById('btnNavMembers');
  navBtn.classList.toggle('active', currentPage === 'members');
  const badge = document.getElementById('memberCountBadge');
  badge.textContent = state.members.length > 0 ? String(state.members.length) : '';
}

/* ----- Detail ----- */
function renderDetail() {
  const ev = currentEvent();
  const empty = document.getElementById('emptyState');
  const detail = document.getElementById('eventDetail');
  const membersPage = document.getElementById('membersPage');

  // ァンバーページは非表示
  membersPage.classList.add('hidden');

  if (!ev) {
    empty.classList.remove('hidden');
    detail.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  detail.classList.remove('hidden');

  const { carryover, collected, spent, balance } = calcSummary(ev);

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

  // 一人当たり予算
  const attendingMembers = (ev.members || []).filter(m => m.attending !== false);
  const totalBudget = carryover + collected;
  const perPerson = attendingMembers.length > 0 ? Math.floor(totalBudget / attendingMembers.length) : 0;
  document.getElementById('perPersonAmount').textContent = attendingMembers.length > 0 ? fmt(perPerson) : '---';
  document.getElementById('perPersonSub').textContent =
    attendingMembers.length > 0
      ? `参加者 ${attendingMembers.length}人 ／ 総予算 ${fmt(totalBudget)}`
      : '参加者を追加してください';

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
      ev2.expenses = ev2.expenses.filter(e => e.id !== btn.dataset.eid);
      saveState(); render();
    });
  });
}

/* ----- Members ----- */
function renderMembers(ev) {
  const el = document.getElementById('memberList');
  if (!ev.members || !ev.members.length) {
    el.innerHTML = '<div class="list-empty">参加者はまだいません</div>';
    return;
  }
  el.innerHTML = sortMembers(ev.members).map(m => {
    const attending = m.attending !== false;
    const paid = !!m.paid;
    const initials = m.name.slice(0, 2);
    const role = getRole(m.role);
    return `
      <div class="member-item" data-mid="${m.id}">
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
          ${attending ? `
          <div class="amount-field">
            <span class="amount-prefix">¥</span>
            <input class="amount-input" type="number" min="0" placeholder="0"
              value="${m.amount || ''}" data-mid="${m.id}" aria-label="集金額">
          </div>
          <button class="paid-badge ${paid ? 'paid' : 'unpaid'}" data-mid="${m.id}" data-toggle-paid title="クリックで支払状況を切替">
            ${paid ? '✓ 済' : '未払'}
          </button>` : ''}
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
      if (!mem.attending) { mem.paid = false; mem.amount = 0; }
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
      const { carryover, collected, spent, balance } = calcSummary(ev2);
      document.getElementById('sumCollected').textContent = fmt(collected);
      document.getElementById('sumBalance').textContent = fmt(balance);
      document.getElementById('cardBalance').classList.toggle('negative', balance < 0);
      // 一人当たり予算も更新
      const attending = (ev2.members || []).filter(m => m.attending !== false);
      const totalBudget = carryover + collected;
      const perPerson = attending.length > 0 ? Math.floor(totalBudget / attending.length) : 0;
      document.getElementById('perPersonAmount').textContent = attending.length > 0 ? fmt(perPerson) : '---';
      document.getElementById('perPersonSub').textContent =
        attending.length > 0
          ? `参加者 ${attending.length}人 ／ 総予算 ${fmt(totalBudget)}`
          : '参加者を追加してください';
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
      ev2.members = ev2.members.filter(m => m.id !== btn.dataset.mid);
      saveState(); render();
    });
  });
}

// =============================================================
// NEW EVENT MODAL
// =============================================================
function openNewEventModal() {
  document.getElementById('newEventName').value = '';
  document.getElementById('newEventDate').value = todayISO();
  document.getElementById('newEventCarry').value = '';
  document.getElementById('newEventAutoAdd').checked = true;

  // 前回残高の自動繰越
  const prevEvents = state.events;
  const carryField = document.getElementById('carryFromPrevField');
  const carryCheck = document.getElementById('carryFromPrev');
  const carryHint = document.getElementById('carryFromPrevHint');
  if (prevEvents.length > 0) {
    const last = prevEvents[prevEvents.length - 1];
    const { balance } = calcSummary(last);
    carryField.style.display = '';
    carryHint.textContent = `前回「${last.name}」の残高: ${fmt(balance)}`;
    carryCheck.checked = true;
    // チェック時に繰越額フィールドを連動
    const syncCarry = () => {
      if (carryCheck.checked) {
        document.getElementById('newEventCarry').value = balance;
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

  const ev = { id: uid(), name, date, note: '', carryover, expenses: [], members };
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
    alert(`「${name}」はすでに登録されています。`);
    return;
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

function openConfirmModal(title, message, onConfirm) {
  confirmCallback = onConfirm;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('modalConfirm').classList.remove('hidden');
}
function closeConfirmModal() {
  document.getElementById('modalConfirm').classList.add('hidden');
  confirmCallback = null;
}

// =============================================================
// BACKUP
// =============================================================
function exportBackup() {
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
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      const imported = parsed.state || parsed;
      if (!imported.events || !Array.isArray(imported.events)) throw new Error('Invalid format');
      if (!confirm('バックアップを復元しますか？現在のデータはすべて置き換えられます。')) return;
      state = imported;
      currentEventId = parsed.currentEventId || (state.events.length ? state.events[state.events.length - 1].id : null);
      saveState(); render();
    } catch {
      alert('ファイルの形式が正しくありません。');
    }
  };
  reader.readAsText(file);
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
  page.classList.remove('hidden');

  const el = document.getElementById('globalMemberList');
  if (!state.members.length) {
    el.innerHTML = '<div class="list-empty">登録済みメンバーはいません。<br>上のフォームから追加してください。</div>';
    return;
  }

  el.innerHTML = sortMembers(state.members).map(m => {
    const role = getRole(m.role);
    return `
    <div class="member-item" data-rid="${m.id}">
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
}

function addGlobalMember() {
  const input = document.getElementById('globalMemberName');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  if (state.members.find(m => m.name === name)) {
    alert(`「${name}」はすでに登録されています。`);
    return;
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
// INIT
// =============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadState();

  // サイドバー: 新規イベント
  document.getElementById('btnNewEvent').addEventListener('click', openNewEventModal);
  document.getElementById('btnNewEventEmpty').addEventListener('click', openNewEventModal);

  // サイドバー: メンバー管理ナビ
  document.getElementById('btnNavMembers').addEventListener('click', navigateToMembers);

  // メンバー管理ページ
  document.getElementById('btnAddGlobalMember').addEventListener('click', addGlobalMember);
  document.getElementById('globalMemberName').addEventListener('keydown', e => {
    if (e.key === 'Enter') addGlobalMember();
  });

  // 名前編集モーダル
  document.getElementById('btnCancelEditMember').addEventListener('click', closeEditMemberModal);
  document.getElementById('btnSaveEditMember').addEventListener('click', saveEditMember);
  document.getElementById('editMemberName').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveEditMember();
  });
  document.getElementById('modalEditMember').addEventListener('click', e => {
    if (e.target.id === 'modalEditMember') closeEditMemberModal();
  });

  // 新規イベントモーダル
  document.getElementById('btnCancelNewEvent').addEventListener('click', closeNewEventModal);
  document.getElementById('btnCreateEvent').addEventListener('click', createEvent);
  document.getElementById('newEventName').addEventListener('keydown', e => { if (e.key === 'Enter') createEvent(); });

  // 支出モーダル
  document.getElementById('btnAddExpense').addEventListener('click', () => openExpenseModal(null));
  document.getElementById('btnCancelExpense').addEventListener('click', closeExpenseModal);
  document.getElementById('btnSaveExpense').addEventListener('click', saveExpense);
  document.getElementById('expenseAmount').addEventListener('keydown', e => { if (e.key === 'Enter') saveExpense(); });

  // メンバーモーダル
  document.getElementById('btnAddMember').addEventListener('click', openMemberModal);
  document.getElementById('btnCancelMember').addEventListener('click', closeMemberModal);
  document.getElementById('btnRegisterMember').addEventListener('click', registerNewMember);
  document.getElementById('newMemberName').addEventListener('keydown', e => { if (e.key === 'Enter') registerNewMember(); });

  // イベント設定
  document.getElementById('btnSaveEvent').addEventListener('click', saveEventSettings);
  document.getElementById('btnDeleteEvent').addEventListener('click', deleteEvent);



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
