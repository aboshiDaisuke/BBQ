const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const appSource = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const cloudSource = fs.readFileSync(path.join(__dirname, '../cloud.js'), 'utf8');

function appContext() {
  const context = vm.createContext({
    document: { addEventListener() {} }, window: {}, console,
    localStorage: { setItem() {}, getItem() { return null; } },
  });
  vm.runInContext(appSource, context);
  return context;
}

test('restored data is normalized and HTML attributes escape hostile input', () => {
  const ctx = appContext();
  const result = vm.runInContext(`(() => {
    const hostile = '\"/><img src=x onerror=alert(1)>';
    const value = normalizeState({events: [{id: hostile, date: hostile, carryover: 'Infinity',
      expenses: [{id: hostile, amount: 'Infinity'}], members: [{id: hostile, name: 'テスト', amount: hostile}]}]});
    return {id: esc(value.events[0].id), date: esc(dateLabel(value.events[0].date)),
      carry: value.events[0].carryover, amount: value.events[0].expenses[0].amount,
      memberAmount: value.events[0].members[0].amount};
  })()`, ctx);
  assert.ok(!result.id.includes('<'));
  assert.ok(!result.id.includes('"'));
  assert.ok(!result.date.includes('<'));
  assert.equal(result.carry, 0);
  assert.equal(result.amount, 0);
  assert.equal(result.memberAmount, 0);
});

test('normalization preserves ordinary data and budget calculations', () => {
  const ctx = appContext();
  const result = vm.runInContext(`(() => {
    const event = {id:'event-1', name:'BBQ', date:'2026-10-11', carryover:3000,
      expenses:[{id:'expense-1', desc:'お店', amount:16000}],
      members:[{id:'member-1', name:'A', amount:18000, paid:true}, {id:'member-2', name:'B', amount:6000, paid:false}]};
    const normalized = normalizeState({events:[event], members:[], memberSort:'manual'});
    return {before:calcSummary(event), after:calcSummary(normalized.events[0]), sort:normalized.memberSort};
  })()`, ctx);
  assert.deepEqual(result.before, result.after);
  assert.equal(result.after.balance, 11000);
  assert.equal(result.after.cashBalance, 5000);
  assert.equal(result.sort, 'manual');
});

function cloudContext(get) {
  const elements = new Map();
  const storage = new Map();
  const timers = new Map();
  const writes = [];
  let authCallback;
  let timerId = 0;
  const element = id => {
    if (!elements.has(id)) elements.set(id, {value:'', textContent:'', style:{}, classList:{toggle(){},add(){},remove(){},contains(){return true;}}, addEventListener(){}});
    return elements.get(id);
  };
  const auth = { onAuthStateChanged(fn) { authCallback = fn; } };
  const firebase = {initializeApp(){},auth(){return auth;},firestore(){return {collection(){return {doc(uid){return {get,async set(data){writes.push({uid,data});}};}};}};}};
  const context = vm.createContext({
    window:{FIREBASE_CONFIG:{apiKey:'test-key',projectId:'test-project'},firebase}, firebase,
    document:{readyState:'complete',getElementById:element,addEventListener(){}},
    console:{warn(){}}, state:{events:[{id:'local-event'}],members:[]}, currentEventId:'local-event',
    STORAGE_KEY:'nomikai_v2', normalizeState: x=>x, render(){}, confirm(){return true;},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},
  });
  vm.runInContext(cloudSource, context);
  return {context, elements, writes, timers, storage, login: user=>authCallback(user)};
}

test('cloud read failure never uploads local data or schedules an overwrite', async () => {
  const env = cloudContext(async () => { throw new Error('permission-denied'); });
  await env.login({uid:'user-a'});
  env.context.window.__cloudPush();
  assert.equal(env.writes.length, 0);
  assert.equal(env.timers.size, 0);
  assert.match(env.elements.get('cloudInfo').textContent, /同期を停止/);
});

test('malformed existing cloud data is not treated as a missing document', async () => {
  const env = cloudContext(async () => ({exists:true,data:()=>({json:'{"state":null}'})}));
  await env.login({uid:'user-a'});
  assert.equal(env.writes.length, 0);
  assert.match(env.elements.get('cloudInfo').textContent, /同期を停止/);
});

test('missing cloud document still allows initial backup; logout cancels pending writes', async () => {
  const env = cloudContext(async () => ({exists:false}));
  await env.login({uid:'user-a'});
  assert.equal(env.writes.length, 1);
  assert.equal(env.writes[0].uid, 'user-a');
  assert.ok(env.storage.has('nomikai_cloud_synced_at:user-a'));
  env.context.window.__cloudPush();
  assert.equal(env.timers.size, 1);
  await env.login(null);
  assert.equal(env.timers.size, 0);
});

test('an old cloud response cannot replace data after logout', async () => {
  let resolve;
  const env = cloudContext(() => new Promise(r => { resolve = r; }));
  const pending = env.login({uid:'user-a'});
  await env.login(null);
  resolve({exists:true,data:()=>({json:JSON.stringify({state:{events:[{id:'remote-event'}],members:[]}})})});
  await pending;
  assert.equal(env.context.state.events[0].id, 'local-event');
  assert.equal(env.writes.length, 0);
});

test('event copy keeps amounts and registration links but resets attendance and payment', () => {
  const ctx = appContext();
  const result = vm.runInContext(`(() => {
    const source = {members:[{id:'old',registeredId:'reg',name:'A',role:'chief',kana:'えー',amount:5000,paid:true,attending:false}]};
    const members = copiedMembers(source);
    members[0].amount = 2000;
    return {original:source.members[0], copy:members[0]};
  })()`,ctx);
  assert.notEqual(result.copy.id, result.original.id);
  assert.equal(result.copy.registeredId, 'reg');
  assert.equal(result.copy.paid, false);
  assert.equal(result.copy.attending, true);
  assert.equal(result.original.amount, 5000);
  assert.equal(result.original.paid, true);
});

test('progress excludes zero amounts, includes absent collectors, and handles empty events', () => {
  const ctx = appContext();
  assert.equal(vm.runInContext('collectionProgress({members:[]}).complete',ctx),false);
  const result = vm.runInContext(`collectionProgress({members:[
    {amount:0,paid:false}, {amount:1000,paid:true}, {amount:6000,paid:false,attending:false}
  ]})`,ctx);
  assert.equal(result.total,2);
  assert.equal(result.paid,1);
  assert.equal(result.remaining,6000);
  assert.equal(result.percent,50);
  assert.equal(result.complete,false);
});

function undoContext() {
  const ctx = appContext();
  vm.runInContext(`renderUndo = () => {}; render = () => {}; saveState = () => {};`,ctx);
  return ctx;
}

test('undo restores only the deleted item, preserving later edits and insertion order', () => {
  const ctx = undoContext();
  const result = vm.runInContext(`(() => {
    state = {events:[],members:[{id:'a',name:'A'},{id:'b',name:'B'}]};
    deleteWithUndo({getList:()=>state.members,item:state.members[0],label:'メンバー'});
    state.members[0].name = 'B edited';
    state.members.push({id:'c',name:'C'});
    undoDelete();
    return state.members;
  })()`,ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),[{id:'a',name:'A'},{id:'b',name:'B edited'},{id:'c',name:'C'}]);
});

test('undo does not restore stale data after cloud adoption or backup restore', () => {
  const ctx = undoContext();
  const count = vm.runInContext(`(() => {
    state = {events:[],members:[{id:'a'}]};
    deleteWithUndo({getList:()=>state.members,item:state.members[0],label:'メンバー'});
    state = {events:[],members:[]};
    undoDelete();
    return state.members.length;
  })()`,ctx);
  assert.equal(count,0);
});

test('a second deletion replaces the previous undo entry', () => {
  const ctx = undoContext();
  const ids = vm.runInContext(`(() => {
    state = {events:[],members:[{id:'a'},{id:'b'}]};
    deleteWithUndo({getList:()=>state.members,item:state.members[0],label:'メンバー'});
    deleteWithUndo({getList:()=>state.members,item:state.members[0],label:'メンバー'});
    undoDelete();
    return state.members.map(m=>m.id).join(',');
  })()`,ctx);
  assert.equal(ids,'b');
});
