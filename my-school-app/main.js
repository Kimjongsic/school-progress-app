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
  selectedItem: null,
  selectedMoveItem: null
};

let deferredPrompt;

const subPalette = ['#1E293B', '#1E40AF', '#065F46', '#991B1B', '#854D0E', '#5B21B6', '#9D174D', '#115E59'];
const gradePalette = { '1': '#10B981', '2': '#3B82F6', '3': '#F59E0B', 'default': '#64748B' };

// --- UI 헬퍼 ---
window.showAlert = (msg) => {
    const alertBox = document.getElementById('customAlert');
    const alertMsg = document.getElementById('alertMessage');
    if (alertBox && alertMsg) {
        alertMsg.innerText = msg;
        alertBox.classList.remove('hidden');
    }
};

window.closeAlert = () => {
    document.getElementById('customAlert')?.classList.add('hidden');
};

function showView(id) {
  document.querySelectorAll('section, main, #loadingView').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById(id);
  if (target) target.classList.remove('hidden');
}

function generateInternalId(name, pin) {
  const hexName = Array.from(new TextEncoder().encode(name))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `id_${hexName}_${pin}@internal.school`;
}

// --- 초기화 ---
window.onload = () => {
  initEvents();
  checkSession();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js?v=3').catch(err => console.error(err));
  }
};

async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    state.user = { id: session.user.id, name: session.user.user_metadata.full_name || '선생님' };
    initApp();
  } else {
    showView('loginView');
    checkInstallButtonVisibility();
  }
}

function checkInstallButtonVisibility() {
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    const installBtns = [document.getElementById('btnInstallPWA'), document.getElementById('btnLoginInstall')];
    if (isStandalone) {
        installBtns.forEach(btn => btn?.classList.add('hidden'));
    } else {
        installBtns.forEach(btn => btn?.classList.remove('hidden'));
    }
}

async function initApp() {
  state.isTagEditMode = false;
  showView('mainView');
  const userDisplay = document.getElementById('userNameDisplay');
  if (userDisplay) userDisplay.innerText = state.user.name;

  const { data: current } = await supabase.from('basic_timetable').select('*').eq('user_id', state.user.id);
  if (current && current.length > 0) {
    state.signUp.subs = [...new Set(current.map(i => i.subject))];
    state.signUp.gcs = [...new Set(current.map(i => i.grade_class))].sort();
    state.maxPeriods = Math.max(7, ...current.map(i => i.period));
  }
  updateDateUI(); 
  fetchTimetable(); 
  checkInstallButtonVisibility();
}

function initEvents() {
  document.getElementById('btnLogin')?.addEventListener('click', handleLogin);
  document.getElementById('btnOpenSignUp')?.addEventListener('click', () => {
    state.signUp = { step: 1, subs: [], gcs: [] };
    updateSignUpUI(); showView('signUpContainer');
  });
  document.getElementById('btnSignUpBack')?.addEventListener('click', () => { if (state.signUp.step > 1) { state.signUp.step--; updateSignUpUI(); }});
  document.getElementById('btnSignUpClose')?.addEventListener('click', () => showView('loginView'));
  document.getElementById('btnNextStep')?.addEventListener('click', handleNextButton);
  
  document.getElementById('btnSettings')?.addEventListener('click', (e) => { e.stopPropagation(); toggleSettings(true); });
  document.getElementById('settingsOverlay')?.addEventListener('click', () => { toggleSettings(false); toggleMoveSheet(false); toggleSheet(false); });
  document.getElementById('sheetOverlay')?.addEventListener('click', () => { toggleSheet(false); toggleSettings(false); toggleMoveSheet(false); });

  document.getElementById('btnMenuEditTime')?.addEventListener('click', openEditTimetable);
  document.getElementById('btnMenuInquiry')?.addEventListener('click', () => { toggleSettings(false); document.getElementById('inquiryPopup').classList.remove('hidden'); });
  document.getElementById('btnMenuLogout')?.addEventListener('click', async () => { await supabase.auth.signOut(); location.reload(); });

  const handleInstallClick = async () => {
    toggleSettings(false);
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt = null;
    } else { document.getElementById('iosInstallGuide')?.classList.remove('hidden'); }
  };
  document.getElementById('btnInstallPWA')?.addEventListener('click', handleInstallClick);
  document.getElementById('btnLoginInstall')?.addEventListener('click', handleInstallClick);

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; checkInstallButtonVisibility(); });

  document.getElementById('btnSaveProgress')?.addEventListener('click', saveProgress);
  document.getElementById('btnConfirmMove')?.addEventListener('click', handleConfirmMove);
  document.getElementById('btnPrevDate')?.addEventListener('click', () => moveDate(-1));
  document.getElementById('btnNextDate')?.addEventListener('click', () => moveDate(1));
  document.getElementById('dateTextGroup')?.addEventListener('click', () => document.getElementById('datePicker')?.showPicker());
  document.getElementById('datePicker')?.addEventListener('change', (e) => { state.activeDate = new Date(e.target.value); updateDateUI(); fetchTimetable(); });

  document.getElementById('btnEditViewClose')?.addEventListener('click', () => { if(confirm('수정 내용을 취소할까요?')) initApp(); });
  document.getElementById('btnSaveEditedTimetable')?.addEventListener('click', handleUpdateTimetable);
  document.getElementById('btnAddPeriodEdit')?.addEventListener('click', () => { if(state.maxPeriods < 15) { state.maxPeriods++; renderSetupGrid(true, 'Edit'); }});
  document.getElementById('btnRemovePeriodEdit')?.addEventListener('click', () => { if(state.maxPeriods > 1) { state.maxPeriods--; renderSetupGrid(true, 'Edit'); }});
}

// --- 수업 이동 로직 ---
window.openMoveSheet = (item) => {
    state.selectedMoveItem = item;
    const dateInput = document.getElementById('moveTargetDate');
    const periodSelect = document.getElementById('moveTargetPeriod');
    dateInput.value = state.activeDate.toISOString().split('T')[0];
    let periodHtml = '';
    for(let i=1; i<=state.maxPeriods; i++) periodHtml += `<option value="${i}">${i}교시</option>`;
    periodSelect.innerHTML = periodHtml;
    periodSelect.value = item.period;
    toggleMoveSheet(true);
};

async function handleConfirmMove() {
    const targetDate = document.getElementById('moveTargetDate').value;
    const targetPeriod = parseInt(document.getElementById('moveTargetPeriod').value);
    const originalDate = state.activeDate.toISOString().split('T')[0];
    const item = state.selectedMoveItem;
    if (!targetDate) return showAlert('날짜를 선택하세요.');
    showView('loadingView');
    try {
        const targetDayName = ['일','월','화','수','목','금','토'][new Date(targetDate).getDay()];
        const { data: bExist } = await supabase.from('basic_timetable').select('*').eq('user_id', state.user.id).eq('day', targetDayName).eq('period', targetPeriod).maybeSingle();
        const { data: aExist } = await supabase.from('lesson_changes').select('*').eq('user_id', state.user.id).eq('date', targetDate).eq('period', targetPeriod).eq('change_type', 'added').maybeSingle();
        const { data: cExist } = await supabase.from('lesson_changes').select('*').eq('user_id', state.user.id).eq('date', targetDate).eq('period', targetPeriod).eq('change_type', 'cancelled').maybeSingle();
        if ((bExist && !cExist) || aExist) {
            showView('mainView');
            return showAlert('해당 시간에는 이미 수업이 있습니다.');
        }
        await supabase.from('lesson_changes').insert([
            { user_id: state.user.id, user_name: state.user.name, date: originalDate, period: item.period, subject: item.subject, grade_class: item.grade_class, change_type: 'cancelled' },
            { user_id: state.user.id, user_name: state.user.name, date: targetDate, period: targetPeriod, subject: item.subject, grade_class: item.grade_class, change_type: 'added' }
        ]);
        showAlert('수업이 이동되었습니다.');
        toggleMoveSheet(false); fetchTimetable();
    } catch (e) { showAlert('이동 중 오류 발생'); } finally { showView('mainView'); }
}

// --- 가입/로그인 로직 ---
async function handleNextButton() {
  const step = state.signUp.step;
  if (step === 1) {
    const name = document.getElementById('regName')?.value.trim();
    const pin = document.getElementById('regPin')?.value.trim();
    if (!name || pin.length < 4) return showAlert('정보를 올바르게 입력하세요.');
    showView('loadingView');
    try {
        const { data, error } = await supabase.from('profiles').select('name').eq('name', name);
        if (error) throw error;
        if (data && data.length > 0) {
            showView('signUpContainer');
            return showAlert('이미 가입된 이름입니다.');
        }
    } catch (e) {
        showView('signUpContainer');
        return showAlert('서버 확인 중 오류가 발생했습니다.');
    }
    showView('signUpContainer'); state.signUp.step = 2; updateSignUpUI(); return;
  } 
  if (step < 4) { state.signUp.step++; updateSignUpUI(); } 
  else { handleFinalSignUpSubmit(); }
}

async function handleLogin() {
  const name = document.getElementById('loginName').value.trim();
  const pin = document.getElementById('loginPin').value.trim();
  if(!name || !pin) return showAlert('정보를 입력하세요.');
  const internalId = generateInternalId(name, pin);
  showView('loadingView');
  const { data, error } = await supabase.auth.signInWithPassword({ email: internalId, password: `${pin}0000` });
  if (error) { showAlert('로그인 실패: 정보를 확인하세요.'); showView('loginView'); }
  else { state.user = { id: data.user.id, name: data.user.user_metadata.full_name }; initApp(); }
}

async function handleFinalSignUpSubmit() {
  const btn = document.getElementById('btnNextStep');
  const name = document.getElementById('regName').value.trim();
  const pin = document.getElementById('regPin').value.trim();
  const internalId = generateInternalId(name, pin);
  btn.disabled = true; showView('loadingView');
  const { data, error } = await supabase.auth.signUp({ email: internalId, password: `${pin}0000`, options: { data: { full_name: name } } });
  if (error) { showAlert('가입 처리 중 오류: ' + error.message); btn.disabled = false; showView('signUpContainer'); return; }
  try {
    await supabase.from('profiles').insert({ user_id: data.user.id, name: name, pin_code: pin });
    const timetableData = gatherTimetableData(data.user.id, name, 'Signup');
    if (timetableData.length) await supabase.from('basic_timetable').insert(timetableData);
    showAlert('가입이 완료되었습니다!'); location.reload();
  } catch (err) { showAlert('데이터 저장 실패'); btn.disabled = false; }
}

async function handleUpdateTimetable() {
  const btn = document.getElementById('btnSaveEditedTimetable');
  btn.disabled = true; showView('loadingView');
  try {
    await supabase.from('basic_timetable').delete().eq('user_id', state.user.id);
    const timetableData = gatherTimetableData(state.user.id, state.user.name, 'Edit');
    if (timetableData.length) await supabase.from('basic_timetable').insert(timetableData);
    showAlert('시간표가 수정되었습니다.'); initApp();
  } catch (err) { showAlert('수정 실패'); } finally { btn.disabled = false; }
}

// --- 렌더링/태그 관리 ---
function gatherTimetableData(userId, userName, suffix) {
    const data = [];
    ['월','화','수','목','금'].forEach(d => {
      for (let p = 1; p <= state.maxPeriods; p++) {
        const subBtn = document.querySelector(`#setupTableBody${suffix} .sub-cell[data-day="${d}"][data-p="${p}"]`);
        const gcBtn = document.querySelector(`#setupTableBody${suffix} .gc-cell[data-day="${d}"][data-p="${p}"]`);
        const sub = subBtn?.dataset.fullName || subBtn?.innerText;
        const gc = gcBtn?.innerText;
        if (sub && sub !== '과목' && gc && gc !== '반') {
            data.push({ user_id: userId, user_name: userName, day: d, period: p, subject: sub, grade_class: gc });
        }
      }
    });
    return data;
}

window.renderTags = (type, suffix) => {
    let targetId = (type === 'sub' ? 'subTagContainerSignup' : 'gcTagContainerSignup');
    if(state.signUp.step === 4) targetId = (type === 'sub' ? 'quickSubSectionSignup' : 'quickGcSectionSignup');
    if(suffix === 'Edit') targetId = (type === 'sub' ? 'quickSubSectionEdit' : 'quickGcSectionEdit');
    const container = document.getElementById(targetId);
    if (!container) return;
    const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
    const showControls = (suffix === 'Edit' ? state.isTagEditMode : (state.signUp.step < 4 || state.isTagEditMode));
    let html = arr.map((tag, i) => {
        const color = type === 'sub' ? subPalette[state.signUp.subs.indexOf(tag) % subPalette.length] : (gradePalette[tag[0]] || gradePalette.default);
        const style = type === 'sub' ? `background:${color}; color:white; border:none;` : `color:${color}; border:2px solid ${color}; background:white;`;
        return `<div class="tag-chip">${showControls ? `<button onclick="window.removeTag('${type}', ${i}, '${suffix}')" class="absolute -top-2 -left-2 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] z-10 shadow-sm"><i class="fa-solid fa-minus"></i></button>` : ''}<button onclick="window.fillCell('${type}', '${tag}', '${color}', '${suffix}')" class="px-4 py-2 rounded-2xl text-xs font-black shadow-sm active:scale-95 transition-all" style="${style}">${tag}</button></div>`;
    }).join('');
    if (showControls) {
        html += `<button onclick="window.showInlineInput('${type}', '${suffix}')" id="btnShow${type}Input${suffix}" class="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center active:scale-90 border-2 border-dashed border-slate-200 transition-all"><i class="fa-solid fa-plus text-xs"></i></button><div id="${type}InputWrap${suffix}" class="hidden flex items-center gap-1"><input type="text" id="${type}MiniInput${suffix}" class="mini-input-chip"><button onclick="window.submitInlineInput('${type}', '${suffix}')" class="w-10 h-8 rounded-lg bg-[#005CC5] text-white text-[11px] font-black">확인</button></div>`;
    }
    container.innerHTML = html;
}

window.showInlineInput = (type, suffix) => {
    const btn = document.getElementById(`btnShow${type}Input${suffix}`);
    const wrap = document.getElementById(`${type}InputWrap${suffix}`);
    if (btn) btn.classList.add('hidden');
    if (wrap) wrap.classList.remove('hidden');
    const input = document.getElementById(`${type}MiniInput${suffix}`);
    input?.focus();
    input.onkeypress = (e) => { if(e.key === 'Enter') window.submitInlineInput(type, suffix); };
};

window.submitInlineInput = (type, suffix) => {
    const input = document.getElementById(`${type}MiniInput${suffix}`);
    const val = input?.value.trim();
    if (val) {
        const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
        if(!arr.includes(val)) { arr.push(val); if (type === 'gc') arr.sort(); }
    }
    window.renderTags(type, suffix); renderSetupGrid(true, suffix);
};

window.removeTag = (type, i, suffix) => {
    (type === 'sub' ? state.signUp.subs : state.signUp.gcs).splice(i, 1);
    window.renderTags(type, suffix); renderSetupGrid(true, suffix);
};

function renderSetupGrid(keepValues = false, suffix = 'Signup') {
  const body = document.getElementById(`setupTableBody${suffix}`);
  if (!body) return;
  const saved = [];
  if(keepValues) {
    document.querySelectorAll(`#setupTableBody${suffix} .setup-in`).forEach(btn => {
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
    const target = document.querySelector(`#setupTableBody${suffix} .${s.type}-cell[data-day="${s.d}"][data-p="${s.p}"]`);
    if(target) {
        target.innerText = s.type === 'sub' ? s.val.substring(0, 4) : s.val;
        target.dataset.fullName = s.val;
        if(s.type === 'sub') { target.style.background = s.color; target.classList.add('sub-filled'); }
        else { target.style.color = s.color; target.classList.add('gc-filled'); }
    }
  });
  window.renderTags('sub', suffix); window.renderTags('gc', suffix);
  document.querySelectorAll(`#setupTableBody${suffix} .setup-in`).forEach(btn => btn.onclick = () => {
    document.querySelectorAll('.setup-in').forEach(b => b.classList.remove('active-cell'));
    btn.classList.add('active-cell');
    state.activeCell = { type: btn.classList.contains('sub-cell') ? 'sub' : 'gc', day: btn.dataset.day, p: btn.dataset.p };
  });
}

window.fillCell = (type, val, color, suffix) => {
  if (state.isTagEditMode) return;
  if (!state.activeCell || state.activeCell.type !== type) return;
  const current = document.querySelector(`#setupTableBody${suffix} .${type}-cell[data-day="${state.activeCell.day}"][data-p="${state.activeCell.p}"]`);
  if (current) {
    current.innerText = type === 'sub' ? val.substring(0, 4) : val;
    current.dataset.fullName = val; 
    if (type === 'sub') {
      current.style.background = color; current.classList.add('sub-filled');
      const nextGc = document.querySelector(`#setupTableBody${suffix} .gc-cell[data-day="${state.activeCell.day}"][data-p="${state.activeCell.p}"]`);
      if (nextGc) nextGc.click();
    } else { current.style.color = color; current.classList.add('gc-filled'); }
  }
};

async function openEditTimetable() {
    toggleSettings(false); showView('loadingView');
    const { data: current } = await supabase.from('basic_timetable').select('*').eq('user_id', state.user.id);
    state.signUp.subs = [...new Set(current?.map(i => i.subject) || [])];
    state.signUp.gcs = [...new Set(current?.map(i => i.grade_class) || [])].sort();
    state.maxPeriods = Math.max(7, ... (current?.map(i => i.period) || [7]));
    showView('editTimetableView');
    document.getElementById('editViewTeacherName').innerText = state.user.name;
    renderSetupGrid(false, 'Edit');
    current?.forEach(item => {
        const subCell = document.querySelector(`#setupTableBodyEdit .sub-cell[data-day="${item.day}"][data-p="${item.period}"]`);
        const gcCell = document.querySelector(`#setupTableBodyEdit .gc-cell[data-day="${item.day}"][data-p="${item.period}"]`);
        if(subCell) { subCell.innerText = item.subject.substring(0,4); subCell.dataset.fullName = item.subject; subCell.classList.add('sub-filled'); subCell.style.background = subPalette[state.signUp.subs.indexOf(item.subject) % subPalette.length]; }
        if(gcCell) { gcCell.innerText = item.grade_class; gcCell.classList.add('gc-filled'); gcCell.style.color = gradePalette[item.grade_class[0]] || gradePalette.default; }
    });
}

// --- 대시보드 로직 (데이터 매칭 수정 완료) ---
async function fetchTimetable() {
  const dateStr = state.activeDate.toISOString().split('T')[0];
  const dayName = ['일','월','화','수','목','금','토'][state.activeDate.getDay()];
  const list = document.getElementById('timetableList');
  if (!list) return;
  list.innerHTML = `<div class="py-20 text-center"><i class="fa-solid fa-spinner fa-spin text-2xl text-slate-200"></i></div>`;
  
  try {
    const [basic, records, changes] = await Promise.all([
      supabase.from('basic_timetable').select('*').eq('day', dayName).eq('user_id', state.user.id),
      supabase.from('lesson_records').select('*').eq('date', dateStr).eq('user_id', state.user.id),
      supabase.from('lesson_changes').select('*').eq('date', dateStr).eq('user_id', state.user.id)
    ]);
    
    let finalSchedule = [];
    if (basic.data) {
        const cancelledPeriods = changes.data?.filter(c => c.change_type === 'cancelled').map(c => c.period) || [];
        finalSchedule = basic.data.filter(b => !cancelledPeriods.includes(b.period));
    }
    if (changes.data) {
        const addedLessons = changes.data.filter(c => c.change_type === 'added');
        finalSchedule = [...finalSchedule, ...addedLessons];
    }
    finalSchedule.sort((a, b) => a.period - b.period);

    if (finalSchedule.length === 0) { 
      list.innerHTML = `<div class="py-20 text-center text-slate-400 font-bold text-sm">수업이 없는 날입니다 ☕️</div>`; 
      return; 
    }

    const dashboardHTML = await Promise.all(finalSchedule.map(async (item) => {
      const { data: prev } = await supabase.from('lesson_records').select('content').eq('grade_class', item.grade_class).eq('subject', item.subject).eq('user_id', state.user.id).lt('date', dateStr).order('date', { ascending: false }).limit(1).maybeSingle();
      
      // [수정] 매칭 기준 강화: 교시 + 학급 + 과목 일치 확인
      const today = records.data?.find(r => 
          r.period == item.period && 
          r.grade_class === item.grade_class && 
          r.subject === item.subject
      );

      const subColor = subPalette[state.signUp.subs.indexOf(item.subject) % subPalette.length] || '#1E293B';
      const gcColor = gradePalette[item.grade_class[0]] || gradePalette.default;
      return `
        <div class="class-card bg-white p-6 rounded-[32px] border border-slate-50 shadow-sm active:scale-95 transition-all cursor-pointer text-left">
          <div class="flex items-center justify-between mb-5">
            <div class="flex items-center gap-3" onclick='window.openInputSheet(${JSON.stringify(item)}, "${prev?.content || '첫 기록'}", ${JSON.stringify(today)})'>
              <span class="text-[14px] font-black bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg uppercase tracking-tight">${item.period}교시</span>
              <span class="px-3 py-1 rounded-full text-[12px] font-black text-white shadow-sm" style="background:${subColor}">${item.subject}</span>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-white border-2" style="color:${gcColor}; border-color:${gcColor}">${item.grade_class}</span>
            </div>
            <button onclick='event.stopPropagation(); window.openMoveSheet(${JSON.stringify(item)})' class="w-10 h-10 bg-slate-50 text-slate-300 rounded-xl flex items-center justify-center active:bg-blue-50 active:text-[#005CC5] transition-all"><i class="fa-solid fa-arrow-right-arrow-left text-sm"></i></button>
          </div>
          <div class="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50" onclick='window.openInputSheet(${JSON.stringify(item)}, "${prev?.content || '첫 기록'}", ${JSON.stringify(today)})'>
            <div class="flex items-center gap-3">
              <span class="text-[9px] font-black text-amber-500 w-10 shrink-0 tracking-widest leading-none">LAST</span>
              <p class="text-[13px] font-black text-slate-700 line-clamp-1 flex-1 leading-none">${prev?.content || '-'}</p>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-[9px] font-black text-[#005CC5] w-10 shrink-0 tracking-widest uppercase leading-none">Today</span>
              <p class="text-[13px] font-black text-slate-700 line-clamp-1 flex-1 leading-none">${today ? today.content : '<span class="text-slate-200 font-medium italic text-[11px]">입력 전입니다</span>'}</p>
            </div>
          </div>
        </div>`;
    }));
    list.innerHTML = dashboardHTML.join('');
  } catch (err) {
    list.innerHTML = `<div class="py-20 text-center text-rose-400 font-bold text-sm">데이터를 불러오지 못했습니다.</div>`;
  }
}

// --- UI 제어 ---
function toggleSettings(open) {
  const s = document.getElementById('settingsSheet');
  const o = document.getElementById('settingsOverlay');
  if(open) { s?.classList.add('sheet-open'); o?.classList.add('overlay-show'); }
  else { s?.classList.remove('sheet-open'); o?.classList.remove('overlay-show'); }
}
function toggleMoveSheet(open) {
    const s = document.getElementById('moveSheet');
    const o = document.getElementById('sheetOverlay');
    if(open) { s?.classList.add('sheet-open'); o?.classList.add('overlay-show'); }
    else { s?.classList.remove('sheet-open'); o?.classList.remove('overlay-show'); }
}
function updateDateUI() {
  const d = document.getElementById('currentDateDisplay');
  if (d) d.innerText = state.activeDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
}
function moveDate(offset) { state.activeDate.setDate(state.activeDate.getDate() + offset); updateDateUI(); fetchTimetable(); }

function updateSignUpUI() {
  document.querySelectorAll('.signUpStep').forEach(s => s.classList.add('hidden'));
  document.getElementById(`step${state.signUp.step}`)?.classList.remove('hidden');
  document.getElementById('signUpProgress').style.width = `${(state.signUp.step / 4) * 100}%`;
  document.getElementById('btnNextStep').innerText = state.signUp.step === 4 ? "가입 완료" : "다음 단계";
  if (state.signUp.step === 2) window.renderTags('sub', 'Signup');
  else if (state.signUp.step === 3) window.renderTags('gc', 'Signup');
  else if (state.signUp.step === 4) renderSetupGrid(false, 'Signup');
}

window.toggleTagEditMode = (isEditView) => {
    state.isTagEditMode = !state.isTagEditMode;
    const suffix = isEditView ? 'Edit' : 'Signup';
    const btn = document.getElementById(isEditView ? 'btnEditTagsEditView' : 'btnEditTagsSignup');
    if(btn) btn.innerText = state.isTagEditMode ? "완료" : "편집";
    renderSetupGrid(true, suffix);
};

window.openInputSheet = (item, prevContent, todayRec) => {
  state.selectedItem = item;
  const subColor = subPalette[state.signUp.subs.indexOf(item.subject) % subPalette.length] || '#1E293B';
  const gcColor = gradePalette[item.grade_class[0]] || gradePalette.default;
  const tagHtml = `<span class="text-[14px] font-black bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg uppercase">${item.period}교시</span><span class="px-4 py-1.5 rounded-full text-[13px] font-black text-white shadow-sm" style="background:${subColor}">${item.subject}</span><span class="px-3 py-1 rounded-full text-[12px] font-black bg-white border-2" style="color:${gcColor}; border-color:${gcColor}">${item.grade_class}</span>`;
  document.getElementById('sheetTagContainer').innerHTML = tagHtml;
  document.getElementById('prevProgressText').innerText = prevContent;
  document.getElementById('progContent').value = todayRec ? todayRec.content : '';
  toggleSheet(true);
};

function toggleSheet(open) {
  const s = document.getElementById('inputSheet');
  const o = document.getElementById('sheetOverlay');
  if(s) s.style.transform = open ? 'translateY(0)' : 'translateY(100%)';
  if(o) open ? o.classList.add('overlay-show') : o.classList.remove('overlay-show');
}

async function saveProgress() {
  const content = document.getElementById('progContent')?.value.trim();
  if (!content) return showAlert('내용을 입력하세요.');
  showView('loadingView');
  try {
    await supabase.from('lesson_records').upsert({ user_id: state.user.id, user_name: state.user.name, date: state.activeDate.toISOString().split('T')[0], period: state.selectedItem.period, grade_class: state.selectedItem.grade_class, subject: state.selectedItem.subject, content: content, note: '-' }, { onConflict: 'user_id, date, period, grade_class, subject' });
    toggleSheet(false); fetchTimetable();
  } catch (err) { showAlert('저장 실패'); } finally { showView('mainView'); }
}