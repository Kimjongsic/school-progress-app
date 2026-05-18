import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gckplcpwrvabhqqohuib.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdja3BsY3B3cnZhYmhxcW9odWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDI3NTYsImV4cCI6MjA5NDQ3ODc1Nn0.rg9p24pmgeAIe6EcNZjIFEePXtpesnOnOZRlQKyUcuU';
const supabase = createClient(supabaseUrl, supabaseKey);

let state = {
  user: null,
  activeDate: new Date(),
  signUp: { step: 1, subs: [], gcs: [] },
  activeCell: null, 
  maxPeriods: 7, 
  isTagEditMode: false,
  selectedMoveItem: null
};

let deferredPrompt; 
const subPalette = ['#1E293B', '#1E40AF', '#065F46', '#991B1B', '#854D0E', '#5B21B6', '#9D174D', '#115E59'];
const gradePalette = { '1': '#10B981', '2': '#3B82F6', '3': '#F59E0B', 'default': '#64748B' };

window.onload = async () => {
  await checkSession();
  initEvents();
};

async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    // 세션이 있는 경우 프로필에서 이름 가져오기
    const { data: prof } = await supabase.from('profiles').select('name').eq('user_id', session.user.id).maybeSingle();
    state.user = { id: session.user.id, name: prof?.name || '선생님' };
    initApp();
  } else {
    showView('loginView');
  }
}

function showView(id) {
  document.querySelectorAll('section, main, #loadingView').forEach(v => v.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

async function initApp() {
  state.isTagEditMode = false;
  showView('mainView');
  document.getElementById('userNameDisplay').innerText = state.user.name;

  const { data: current } = await supabase.from('basic_timetable').select('*');
  if (current && current.length > 0) {
    state.signUp.subs = [...new Set(current.map(i => i.subject))];
    state.signUp.gcs = [...new Set(current.map(i => i.grade_class))].sort();
    state.maxPeriods = Math.max(7, ...current.map(i => i.period));
  }
  updateDateUI(); fetchTimetable();
}

function initEvents() {
  document.getElementById('btnLogin').onclick = handleLogin;
  document.getElementById('btnOpenSignUp').onclick = () => {
    state.signUp = { step: 1, subs: [], gcs: [] };
    updateSignUpUI(); showView('signUpContainer');
  };
  
  document.getElementById('btnNextStep').onclick = handleNextButton;
  
  // 수정 페이지 전용 이벤트
  document.getElementById('btnMenuEditTime').onclick = openEditTimetable;
  document.getElementById('btnAddPeriodEdit').onclick = () => { if(state.maxPeriods < 15) { state.maxPeriods++; renderSetupGrid('edit', true); }};
  document.getElementById('btnRemovePeriodEdit').onclick = () => { if(state.maxPeriods > 1) { state.maxPeriods--; renderSetupGrid('edit', true); }};
  document.getElementById('btnSaveEditedTimetable').onclick = saveEditedTimetable;

  // 공통 이벤트
  document.getElementById('btnMenuLogout').onclick = async () => { await supabase.auth.signOut(); location.reload(); };
  document.getElementById('btnSaveProgress').onclick = saveProgress;
  document.getElementById('btnConfirmMove').onclick = handleConfirmMove;
  document.getElementById('btnPrevDate').onclick = () => moveDate(-1);
  document.getElementById('btnNextDate').onclick = () => moveDate(1);
  document.getElementById('btnSettings').onclick = () => toggleSettings(true);
  document.querySelectorAll('.overlay-target').forEach(o => o.onclick = () => { toggleSheet(false); toggleMoveSheet(false); toggleSettings(false); });
}

// [Auth] 로그인 - 이름과 PIN으로 profiles 조회
async function handleLogin() {
  const name = document.getElementById('loginName').value.trim();
  const pin = document.getElementById('loginPin').value.trim();
  if(!name || !pin) return alert('정보를 입력하세요.');

  showView('loadingView');
  const { data: prof, error } = await supabase.from('profiles').select('*').eq('name', name).eq('pin_code', pin).maybeSingle();

  if (prof) {
    // 기존 유저인 경우 익명 세션 생성 (또는 기존 세션 사용)
    const { data: auth } = await supabase.auth.signInAnonymously();
    state.user = { id: prof.user_id, name: name };
    initApp();
  } else {
    alert('정보가 일치하지 않습니다.');
    showView('loginView');
  }
}

// [Auth] 회원가입 - 익명 인증 후 프로필 생성
async function handleFinalSignUpSubmit() {
  const btn = document.getElementById('btnNextStep');
  if (btn.disabled) return;
  btn.disabled = true; btn.innerText = "처리 중...";
  showView('loadingView');

  const name = document.getElementById('regName').value.trim();
  const pin = document.getElementById('regPin').value.trim();

  // 1. 익명 로그인 (이메일 제한 에러 없음)
  const { data: auth, error: authErr } = await supabase.auth.signInAnonymously();
  if (authErr) { alert('인증 실패'); btn.disabled = false; return; }

  const userId = auth.user.id;
  try {
    // 2. 프로필 및 시간표 저장
    await supabase.from('profiles').insert({ user_id: userId, name: name, pin_code: pin });
    const timetableData = getGridData(userId, name, 'setupTableBody');
    if (timetableData.length) await supabase.from('basic_timetable').insert(timetableData);
    
    alert('가입 완료!');
    location.reload();
  } catch (err) { alert('저장 오류'); btn.disabled = false; }
}

// [전용 페이지] 시간표 수정 열기
async function openEditTimetable() {
  toggleSettings(false);
  showView('loadingView');
  
  const { data: current } = await supabase.from('basic_timetable').select('*');
  state.signUp.subs = [...new Set(current?.map(i => i.subject) || [])];
  state.signUp.gcs = [...new Set(current?.map(i => i.grade_class) || [])].sort();
  state.maxPeriods = Math.max(7, ... (current?.map(i => i.period) || [7]));
  
  showView('editTimetableView');
  document.getElementById('editViewTeacherName').innerText = state.user.name;
  renderSetupGrid('edit', true);

  current?.forEach(item => {
    const subCell = document.querySelector(`#editTableBody .sub-cell[data-day="${item.day}"][data-p="${item.period}"]`);
    const gcCell = document.querySelector(`#editTableBody .gc-cell[data-day="${item.day}"][data-p="${item.period}"]`);
    if(subCell) fillCellManual(subCell, item.subject, 'sub');
    if(gcCell) fillCellManual(gcCell, item.grade_class, 'gc');
  });
  showView('editTimetableView');
}

// [전용 페이지] 시간표 수정 저장
async function saveEditedTimetable() {
  const btn = document.getElementById('btnSaveEditedTimetable');
  btn.disabled = true; btn.innerText = "저장 중...";
  
  try {
    const newData = getGridData(state.user.id, state.user.name, 'editTableBody');
    // 기존 시간표 삭제 후 새 시간표 등록
    await supabase.from('basic_timetable').delete().eq('user_id', state.user.id);
    if (newData.length) await supabase.from('basic_timetable').insert(newData);
    
    alert('시간표가 수정되었습니다.');
    initApp();
  } catch (err) { alert('저장 실패'); btn.disabled = false; btn.innerText = "변경 내용 저장"; }
}

// 그리드 데이터 수집 헬퍼
function getGridData(uid, uname, bodyId) {
  const data = [];
  ['월','화','수','목','금'].forEach(d => {
    for (let p = 1; p <= state.maxPeriods; p++) {
      const subCell = document.querySelector(`#${bodyId} .sub-cell[data-day="${d}"][data-p="${p}"]`);
      const gcCell = document.querySelector(`#${bodyId} .gc-cell[data-day="${d}"][data-p="${p}"]`);
      const sub = subCell?.dataset.fullName || subCell?.innerText;
      const gc = gcCell?.innerText;
      if (sub && sub !== '과목' && gc && gc !== '반') {
        data.push({ user_id: uid, user_name: uname, day: d, period: p, subject: sub, grade_class: gc });
      }
    }
  });
  return data;
}

// 수동 셀 채우기 (데이터 로드용)
function fillCellManual(el, val, type) {
  el.innerText = type === 'sub' ? val.substring(0, 4) : val;
  el.dataset.fullName = val;
  if (type === 'sub') {
    el.style.background = subPalette[state.signUp.subs.indexOf(val) % subPalette.length] || '#1E293B';
    el.classList.add('sub-filled');
  } else {
    el.style.color = gradePalette[val[0]] || gradePalette.default;
    el.classList.add('gc-filled');
  }
}

// [공통] 그리드 렌더링
function renderSetupGrid(viewType, keepValues = false) {
  const bodyId = viewType === 'edit' ? 'editTableBody' : 'setupTableBody';
  const subContainerId = viewType === 'edit' ? 'editQuickSub' : 'quickSubSection';
  const gcContainerId = viewType === 'edit' ? 'editQuickGc' : 'quickGcSection';
  const body = document.getElementById(bodyId);
  if (!body) return;

  const saved = [];
  if(keepValues) {
    body.querySelectorAll('.setup-in').forEach(btn => {
      if(btn.innerText !== '과목' && btn.innerText !== '반') {
        saved.push({ d: btn.dataset.day, p: btn.dataset.p, val: btn.dataset.fullName || btn.innerText, type: btn.classList.contains('sub-cell') ? 'sub' : 'gc', color: btn.style.background || btn.style.color });
      }
    });
  }

  body.innerHTML = '';
  for (let p = 1; p <= state.maxPeriods; p++) {
    const row = document.createElement('tr');
    row.innerHTML = `<td class="header-cell text-center font-bold text-slate-400 text-[11px]">${p}</td>` + 
      ['월','화','수','목','금'].map(d => `<td><button class="setup-in sub-cell" data-day="${d}" data-p="${p}">과목</button><button class="setup-in gc-cell mt-1" data-day="${d}" data-p="${p}">반</button></td>`).join('');
    body.appendChild(row);
  }

  saved.forEach(s => {
    const target = body.querySelector(`.${s.type}-cell[data-day="${s.d}"][data-p="${s.p}"]`);
    if(target) fillCellManual(target, s.val, s.type);
  });

  window.renderTags('sub', subContainerId); window.renderTags('gc', gcContainerId);
  body.querySelectorAll('.setup-in').forEach(btn => btn.onclick = () => {
    body.querySelectorAll('.setup-in').forEach(b => b.classList.remove('active-cell'));
    btn.classList.add('active-cell');
    state.activeCell = { type: btn.classList.contains('sub-cell') ? 'sub' : 'gc', day: btn.dataset.day, p: btn.dataset.p, bodyId: bodyId };
  });
}

// [공통] 태그 렌더링
window.renderTags = (type, containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const isSignup = (state.signUp.step === 2 || state.signUp.step === 3);
    const isEditView = containerId.includes('edit') || containerId.includes('Edit');
    const showControls = isSignup || state.isTagEditMode;

    const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
    let html = arr.map((tag, i) => {
        const color = type === 'sub' ? subPalette[state.signUp.subs.indexOf(tag) % subPalette.length] : (gradePalette[tag[0]] || gradePalette.default);
        const style = type === 'sub' ? `background:${color}; color:white; border:none;` : `color:${color}; border:2px solid ${color}; background:white;`;
        return `<div class="tag-chip">${showControls ? `<button onclick="window.removeTag('${type}', ${i}, '${containerId}')" class="absolute -top-2 -left-2 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] z-10 shadow-sm"><i class="fa-solid fa-minus"></i></button>` : ''}<button onclick="window.fillCell('${type}', '${tag}', '${color}', '${containerId}')" class="px-4 py-2 rounded-2xl text-xs font-black shadow-sm active:scale-95 transition-all" style="${style}">${tag}</button></div>`;
    }).join('');
    
    if (showControls) {
        html += `<button onclick="window.showInlineInput('${type}', '${containerId}')" id="btnShow${type}Input${containerId}" class="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center active:scale-90 border-2 border-dashed border-slate-200 transition-all"><i class="fa-solid fa-plus text-xs"></i></button><div id="${type}InputWrap${containerId}" class="hidden flex items-center gap-1"><input type="text" id="${type}MiniInput${containerId}" class="mini-input-chip"><button onclick="window.submitInlineInput('${type}', '${containerId}')" class="w-10 h-8 rounded-lg bg-[#005CC5] text-white text-[11px] font-black">확인</button></div>`;
    }
    container.innerHTML = html;
}

window.fillCell = (type, val, color, containerId) => {
  const isEditView = containerId.includes('edit') || containerId.includes('Edit');
  if (!isEditView && state.signUp.step === 4 && state.isTagEditMode) return;
  if (isEditView && state.isTagEditMode) return;
  
  if (!state.activeCell || state.activeCell.type !== type) return;
  const current = document.querySelector(`#${state.activeCell.bodyId} .${type}-cell[data-day="${state.activeCell.day}"][data-p="${state.activeCell.p}"]`);
  if (current) {
    fillCellManual(current, val, type);
    if (type === 'sub') {
      const nextGc = document.querySelector(`#${state.activeCell.bodyId} .gc-cell[data-day="${state.activeCell.day}"][data-p="${state.activeCell.p}"]`);
      if (nextGc) nextGc.click();
    }
  }
};

window.toggleTagEditMode = (mode) => {
    state.isTagEditMode = !state.isTagEditMode;
    const btnId = mode === 'edit' ? 'btnEditTagsEditView' : 'btnEditTagsStep4';
    const btn = document.getElementById(btnId);
    if(btn) btn.innerText = state.isTagEditMode ? "완료" : "편집";
    if(mode === 'edit') renderSetupGrid('edit', true);
    else renderSetupGrid('setup', true);
};

// ... [이하 fetchTimetable, saveProgress 등 기존 대시보드 로직 동일] ...
async function fetchTimetable() {
  const dateStr = state.activeDate.toISOString().split('T')[0];
  const dayName = ['일','월','화','수','목','금','토'][state.activeDate.getDay()];
  const list = document.getElementById('timetableList');
  if (!list) return;
  list.innerHTML = `<div class="py-20 text-center"><i class="fa-solid fa-spinner fa-spin text-2xl text-slate-200"></i></div>`;
  const [basic, records, changes] = await Promise.all([
    supabase.from('basic_timetable').select('*').eq('day', dayName),
    supabase.from('lesson_records').select('*').eq('date', dateStr),
    supabase.from('lesson_changes').select('*').eq('date', dateStr)
  ]);
  let finalSchedule = [];
  if (basic.data) {
    const cancelledPeriods = changes.data?.filter(c => c.change_type === 'cancelled').map(c => c.period) || [];
    finalSchedule = basic.data.filter(b => !cancelledPeriods.includes(b.period));
  }
  if (changes.data) {
    const addedLessons = changes.data.filter(c => c.change_type === 'added');
    finalSchedule = [...finalSchedule, ...addedLessons].sort((a, b) => a.period - b.period);
  }
  if (finalSchedule.length === 0) { list.innerHTML = `<div class="py-20 text-center text-slate-400 font-bold text-sm">수업이 없는 날입니다 ☕️</div>`; return; }
  const dashboardHTML = await Promise.all(finalSchedule.map(async (item) => {
    const { data: prev } = await supabase.from('lesson_records').select('content').eq('grade_class', item.grade_class).eq('subject', item.subject).lt('date', dateStr).order('date', { ascending: false }).limit(1).maybeSingle();
    const today = records.data?.find(r => r.period == item.period);
    const subColor = subPalette[state.signUp.subs.indexOf(item.subject) % subPalette.length] || '#1E293B';
    const gcColor = gradePalette[item.grade_class[0]] || gradePalette.default;
    return `<div class="class-card bg-white p-6 rounded-[32px] border border-slate-50 shadow-sm active:scale-95 transition-all cursor-pointer text-left"><div class="flex items-center justify-between mb-5"><div class="flex items-center gap-3" onclick='window.openInputSheet(${JSON.stringify(item)}, "${prev?.content || '첫 기록'}", ${JSON.stringify(today)})'><span class="text-[14px] font-black bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg uppercase tracking-tight">${item.period}교시</span><span class="px-3 py-1 rounded-full text-[12px] font-black text-white shadow-sm" style="background:${subColor}">${item.subject}</span><span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-white border-2" style="color:${gcColor}; border-color:${gcColor}">${item.grade_class}</span></div><button onclick='event.stopPropagation(); window.openMoveSheet(${JSON.stringify(item)})' class="w-10 h-10 bg-slate-50 text-slate-300 rounded-xl flex items-center justify-center active:bg-blue-50 active:text-[#005CC5] transition-all"><i class="fa-solid fa-arrow-right-arrow-left text-sm"></i></button></div><div class="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50" onclick='window.openInputSheet(${JSON.stringify(item)}, "${prev?.content || '첫 기록'}", ${JSON.stringify(today)})'><div class="flex items-center gap-3"><span class="text-[9px] font-black text-amber-500 w-10 shrink-0 tracking-widest leading-none">LAST</span><p class="text-[13px] font-black text-slate-700 line-clamp-1 flex-1 leading-none">${prev?.content || '-'}</p></div><div class="flex items-center gap-3"><span class="text-[9px] font-black text-[#005CC5] w-10 shrink-0 tracking-widest uppercase leading-none">Today</span><p class="text-[13px] font-black text-slate-700 line-clamp-1 flex-1 leading-none">${today ? today.content : '<span class="text-slate-200 font-medium italic text-[11px]">입력 전입니다</span>'}</p></div></div></div>`;
  }));
  list.innerHTML = dashboardHTML.join('');
}

async function handleConfirmMove() {
  const targetDate = document.getElementById('moveTargetDate').value;
  const targetPeriod = parseInt(document.getElementById('moveTargetPeriod').value);
  const originalDate = state.activeDate.toISOString().split('T')[0];
  if (!targetDate) return alert('날짜를 선택하세요.');
  showView('loadingView');
  await supabase.from('lesson_changes').insert([
    { user_id: state.user.id, user_name: state.user.name, date: originalDate, period: state.selectedMoveItem.period, subject: state.selectedMoveItem.subject, grade_class: state.selectedMoveItem.grade_class, change_type: 'cancelled' },
    { user_id: state.user.id, user_name: state.user.name, date: targetDate, period: targetPeriod, subject: state.selectedMoveItem.subject, grade_class: state.selectedMoveItem.grade_class, change_type: 'added' }
  ]);
  toggleMoveSheet(false); fetchTimetable(); showView('mainView');
}

function handleNextButton() {
  const step = state.signUp.step;
  if (step === 1) {
    const name = document.getElementById('regName').value.trim();
    if (!name) return alert('이름을 입력하세요.');
    state.signUp.step++; updateSignUpUI();
  } else if (step < 4) { state.signUp.step++; updateSignUpUI(); } 
  else handleFinalSignUpSubmit();
}

function updateSignUpUI() {
  document.querySelectorAll('.signUpStep').forEach(s => s.classList.add('hidden'));
  document.getElementById(`step${state.signUp.step}`)?.classList.remove('hidden');
  document.getElementById('signUpProgress').style.width = `${(state.signUp.step / 4) * 100}%`;
  document.getElementById('btnNextStep').innerText = state.signUp.step === 4 ? "가입 완료" : "다음 단계";
  if (state.signUp.step === 2) window.renderTags('sub', 'subTagContainer');
  else if (state.signUp.step === 3) window.renderTags('gc', 'gcTagContainer');
  else if (state.signUp.step === 4) renderSetupGrid('setup', true);
}

function toggleSheet(o) { document.getElementById('inputSheet').style.transform = o ? 'translateY(0)' : 'translateY(100%)'; document.getElementById('sheetOverlay').className = o ? 'overlay-target overlay-show' : 'overlay-target'; }
function toggleMoveSheet(o) { document.getElementById('moveSheet').style.transform = o ? 'translateY(0)' : 'translateY(100%)'; document.getElementById('sheetOverlay').className = o ? 'overlay-target overlay-show' : 'overlay-target'; }
function toggleSettings(o) { document.getElementById('settingsSheet').style.transform = o ? 'translateY(0)' : 'translateY(100%)'; document.getElementById('settingsOverlay').className = o ? 'overlay-target overlay-show' : 'overlay-target'; }
function updateDateUI() { document.getElementById('currentDateDisplay').innerText = state.activeDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }); }
function moveDate(o) { state.activeDate.setDate(state.activeDate.getDate() + o); updateDateUI(); fetchTimetable(); }

// 태그 관리 헬퍼
window.showInlineInput = (type, cid) => { document.getElementById(`btnShow${type}Input${cid}`).classList.add('hidden'); document.getElementById(`${type}InputWrap${cid}`).classList.remove('hidden'); const i = document.getElementById(`${type}MiniInput${cid}`); i.focus(); i.onkeypress = (e) => { if(e.key === 'Enter') window.submitInlineInput(type, cid); }; };
window.submitInlineInput = (type, cid) => { const i = document.getElementById(`${type}MiniInput${cid}`); const v = i.value.trim(); if(v) { const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs; if(!arr.includes(v)) arr.push(v); if(type === 'gc') arr.sort(); } window.renderTags(type, cid); };
window.removeTag = (type, i, cid) => { (type === 'sub' ? state.signUp.subs : state.signUp.gcs).splice(i, 1); window.renderTags(type, cid); };