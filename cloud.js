'use strict';
// =============================================================
// クラウド同期（Firebase）
// -------------------------------------------------------------
// ・あらかじめ作成した1アカウントでログインして使う想定。
// ・データは localStorage に保存し続けつつ、ログイン中は
//   Firestore の app_state コレクション（1ユーザー=1ドキュメント・
//   JSON丸ごと文字列で保存）にも自動でバックアップする。
// ・未ログイン／未設定でも、アプリはこれまで通り使える。
//
// app.js とは同じグローバルスコープを共有しているため、
// state / currentEventId / normalizeState / render / STORAGE_KEY
// をそのまま参照・代入できる。saveState() からは
// window.__cloudPush() が呼ばれる。
// =============================================================
(function () {
  const cfg = window.FIREBASE_CONFIG || {};
  const SYNCED_KEY = 'nomikai_cloud_synced_at'; // 最後にクラウドと一致した updatedAt
  const PUSH_DELAY = 1200;                       // 保存→アップロードのまとめ待ち(ms)
  const LOGIN_DOMAIN = '@nomikai.local';         // ID にメール形式を付与（ユーザーには見せない）
  const LOGIN_PAD = '#nomikai';                  // パスワードに固定文字を付与（最低6文字対策）

  const configured = !!(cfg.apiKey && cfg.projectId &&
    !cfg.apiKey.includes('YOUR-') && !cfg.projectId.includes('YOUR-'));

  let auth = null;
  let db = null;
  let currentUser = null;
  let pushTimer = null;
  let paused = false; // クラウド→端末の取り込み中は push を止める
  let syncReady = false; // 初回読み込みに成功するまで自動・手動の上書きを防ぐ
  const syncedKey = user => `${SYNCED_KEY}:${user.uid}`;

  // ---- 小物 ---------------------------------------------------
  const $ = id => document.getElementById(id);
  function localHasData() {
    return (state.events && state.events.length) || (state.members && state.members.length);
  }
  function cloudHasData(data) {
    const s = data && data.state;
    return !!(s && ((s.events && s.events.length) || (s.members && s.members.length)));
  }
  function nowLabel() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function setCloudInfo(text, warn) {
    const el = $('cloudInfo');
    if (el) { el.textContent = text || ''; el.classList.toggle('warn', !!warn); }
    const st = $('cloudSyncState');
    if (st) st.textContent = text || '';
  }
  function setLoginError(msg) {
    const el = $('cloudError');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? '' : 'none';
  }

  // ---- Firestore 通信 -----------------------------------------
  async function fetchCloud() {
    if (!db || !currentUser) return null;
    const user = currentUser;
    try {
      const snap = await db.collection('app_state').doc(user.uid).get();
      if (currentUser !== user) throw new Error('Cloud session changed');
      if (!snap.exists) return null;
      const d = snap.data() || {};
      const payload = JSON.parse(d.json);
      if (!payload || !payload.state || !Array.isArray(payload.state.events) ||
          !Array.isArray(payload.state.members)) throw new Error('Invalid cloud data');
      return { data: payload, updated_at: d.updatedAt || null };
    } catch (error) {
      console.warn('[cloud] fetch error', error);
      throw error;
    }
  }

  async function pushToCloud() {
    if (!db || !currentUser || paused) return;
    const user = currentUser;
    setCloudInfo('同期中…');
    const payload = { state, currentEventId };
    const updatedAt = new Date().toISOString();
    try {
      await db.collection('app_state').doc(user.uid).set({
        json: JSON.stringify(payload),
        updatedAt,
      });
    } catch (error) {
      console.warn('[cloud] push error', error);
      setCloudInfo('⚠️ 同期エラー', true);
      return false;
    }
    if (currentUser !== user) return false;
    localStorage.setItem(syncedKey(user), updatedAt);
    setCloudInfo('🌥️ 同期済み ' + nowLabel());
    return true;
  }

  // クラウドの内容を端末（state/localStorage）へ取り込む
  function adoptCloud(row) {
    const d = (row && row.data) || {};
    paused = true;
    clearTimeout(pushTimer);
    try {
      const nextState = normalizeState(d.state || d);
      const nextEventId = (d.currentEventId && nextState.events.find(e => e.id === d.currentEventId))
        ? d.currentEventId
        : (nextState.events.length ? nextState.events[nextState.events.length - 1].id : null);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: nextState, currentEventId: nextEventId }));
      state = nextState;
      currentEventId = nextEventId;
      if (row && row.updated_at && currentUser) localStorage.setItem(syncedKey(currentUser), row.updated_at);
      if (typeof render === 'function') render();
      setCloudInfo('🌥️ クラウドから読み込みました ' + nowLabel());
    } finally { paused = false; }
  }

  // ---- ログイン直後の同期（吸い上げ／取り込みの判定） --------
  async function syncOnLogin() {
    const row = await fetchCloud();
    const cloudHas = row && cloudHasData(row.data);
    const localHas = localHasData();
    const lastSynced = localStorage.getItem(syncedKey(currentUser));

    if (cloudHas && localHas) {
      if (row.updated_at && lastSynced === row.updated_at) {
        // この端末はクラウドの続き。端末の内容を保存。
        await pushToCloud();
      } else {
        const useCloud = confirm(
          'クラウドに別の更新が見つかりました。\n\n' +
          '「OK」… クラウドの内容をこの端末に読み込む\n' +
          '「キャンセル」… この端末の内容をクラウドへ保存する'
        );
        if (useCloud) adoptCloud(row); else await pushToCloud();
      }
    } else if (cloudHas && !localHas) {
      adoptCloud(row);
    } else if (!cloudHas && localHas) {
      // 初回：この端末のデータをクラウドへ吸い上げ
      if (await pushToCloud()) setCloudInfo('🌥️ この端末のデータをクラウドに保存しました');
    } else {
      setCloudInfo('🌥️ ログイン中（データはまだありません）');
    }
    updateCloudUI();
  }

  // ---- 認証 ---------------------------------------------------
  async function doLogin() {
    if (!auth || $('btnCloudLogin').disabled) return;
    const idInput = ($('cloudEmail').value || '').trim();
    const password = $('cloudPassword').value || '';
    if (!idInput || !password) { setLoginError('IDとパスワードを入力してください。'); return; }
    // ID にメール形式を自動付与（既に @ を含む場合はそのまま）
    const email = idInput.includes('@') ? idInput : (idInput + LOGIN_DOMAIN);
    const fullPassword = password + LOGIN_PAD; // 内部で固定文字を付与
    setLoginError('');
    const btn = $('btnCloudLogin');
    if (btn) { btn.disabled = true; btn.textContent = 'ログイン中…'; }
    try {
      await auth.signInWithEmailAndPassword(email, fullPassword);
      // 以降は onAuthStateChanged が currentUser の設定と同期を行う
      $('cloudPassword').value = '';
    } catch (error) {
      console.warn('[cloud] login error', error);
      setLoginError('IDかパスワードが正しくありません。');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'ログイン'; }
    }
  }

  async function doLogout() {
    clearTimeout(pushTimer);
    syncReady = false;
    if (auth) await auth.signOut();
    currentUser = null;
    updateCloudUI();
    setCloudInfo('ログアウトしました（端末のデータは残っています）');
  }

  // ---- 手動操作 -----------------------------------------------
  async function manualPush() {
    if (!syncReady) { setCloudInfo('読み込み未完了です。再ログインして同期を確認してください。', true); return; }
    await pushToCloud();
  }

  async function manualPull() {
    if (!syncReady) { setCloudInfo('再ログインして同期を確認してください。', true); return; }
    try {
      const row = await fetchCloud();
      if (!row || !cloudHasData(row.data)) { setCloudInfo('クラウドにデータがありません'); return; }
      if (localHasData() &&
        !confirm('この端末の内容を、クラウドの内容で置き換えます。よろしいですか？')) return;
      adoptCloud(row);
    } catch {
      setCloudInfo('⚠️ 読み込みに失敗しました。端末のデータは変更していません。', true);
    }
  }

  // ---- 画面更新 -----------------------------------------------
  function updateCloudUI() {
    const notConf = $('cloudNotConfigured');
    const out = $('cloudLoggedOut');
    const inn = $('cloudLoggedIn');
    const btnLogin = $('btnCloudLogin');
    const btnLogout = $('btnCloudLogout');
    const btnCloud = $('btnCloud');

    const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };

    if (!configured) {
      show(notConf, true); show(out, false); show(inn, false);
      show(btnLogin, false); show(btnLogout, false);
      if (btnCloud) btnCloud.textContent = '🌥️ クラウド同期（未設定）';
      setCloudInfo('クラウド未設定');
      return;
    }
    if (currentUser) {
      show(notConf, false); show(out, false); show(inn, true);
      show(btnLogin, false); show(btnLogout, true);
      const em = $('cloudUserEmail');
      if (em) em.textContent = (currentUser.email || '').replace(LOGIN_DOMAIN, '');
      if (btnCloud) btnCloud.textContent = '🌥️ クラウド同期（ログイン中）';
    } else {
      show(notConf, false); show(out, true); show(inn, false);
      show(btnLogin, true); show(btnLogout, false);
      if (btnCloud) btnCloud.textContent = '🌥️ クラウド同期（ログイン）';
    }
  }

  // ---- モーダル開閉 -------------------------------------------
  function openCloudModal() {
    setLoginError('');
    updateCloudUI();
    const m = $('modalCloud');
    if (m) m.classList.remove('hidden');
    if (configured && !currentUser) { const e = $('cloudEmail'); if (e) e.focus(); }
  }
  function closeCloudModal() {
    $('cloudPassword').value = '';
    const m = $('modalCloud');
    if (m) m.classList.add('hidden');
  }

  // ---- saveState からのフック（自動アップロード） -------------
  window.__cloudPush = function () {
    if (paused || !syncReady || !db || !currentUser) return;
    clearTimeout(pushTimer);
    const user = currentUser;
    pushTimer = setTimeout(() => {
      if (syncReady && currentUser === user) pushToCloud();
    }, PUSH_DELAY);
  };

  // ---- 初期化 -------------------------------------------------
  function init() {
    if (configured && window.firebase && window.firebase.initializeApp) {
      firebase.initializeApp(cfg);
      auth = firebase.auth();
      db = firebase.firestore();
    }
    // ボタン・モーダル配線
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    on('btnCloud', 'click', openCloudModal);
    on('btnCloudClose', 'click', closeCloudModal);
    on('btnCloudLogin', 'click', doLogin);
    on('btnCloudLogout', 'click', () => { doLogout(); });
    on('btnCloudPush', 'click', manualPush);
    on('btnCloudPull', 'click', manualPull);
    const pw = $('cloudPassword');
    if (pw) pw.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    const overlay = $('modalCloud');
    if (overlay) overlay.addEventListener('click', e => { if (e.target.id === 'modalCloud') closeCloudModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) closeCloudModal();
    });

    updateCloudUI();

    // ログイン成功・前回セッションの復元をここで一括処理
    // （手動ログインも自動復元も、この listener 経由で同期が走る）
    if (auth) {
      auth.onAuthStateChanged(async user => {
        clearTimeout(pushTimer);
        if (user && (!currentUser || currentUser.uid !== user.uid)) {
          syncReady = false;
          currentUser = user;
          updateCloudUI();
          try {
            await syncOnLogin();
            if (currentUser === user) syncReady = true;
          } catch {
            if (currentUser === user) setCloudInfo('⚠️ 読み込みに失敗したため同期を停止しました。再ログインしてください。', true);
          }
        } else if (!user) {
          syncReady = false;
          currentUser = null;
          updateCloudUI();
        }
      });
    }
  }

  // app.js の DOMContentLoaded（loadState/render）より後に走らせる
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
