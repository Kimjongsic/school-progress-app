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
  isEditMode: false,
  isTagEditMode: false,
  selectedMoveItem: null
};

let deferredPrompt; 

const subPalette = ['#1E293B', '#1E40AF', '#065F46', '#991B1B', '#854D0E', '#5B21B6', '#9D174D', '#115E59'];
const gradePalette = { '1': '#10B981', '2': '#3B82F6', '3': '#F59E0B', 'default': '#64748B' };

function generateInternalId(name, pin) {
  const hexName = Array.from(new TextEncoder().encode(name))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `id_${hexName}_${pin}@internal.school`;
}

window.onload = async () => {
  await checkSession();
  initEvents();
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

function showView(id) {
  document.querySelectorAll('section, main, #loadingView').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById(id);
  if (target) target.classList.remove('hidden');
}

function checkInstallButtonVisibility() {
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    const installBtns = [document.getElementById('btnInstallPWA'), document.getElementById('btnLoginInstall')];
    if (isIOS && !isStandalone) installBtns.forEach(btn => btn?.classList.remove('hidden'));
    else if (deferredPrompt) installBtns.forEach(btn => btn?.classList.remove('hidden'));
}

async function initApp() {
  state.isEditMode = false;
  state.isTagEditMode = false;
  showView('mainView');
  const userDisplay = document.getElementById('userNameDisplay');
  if (userDisplay) userDisplay.innerText = state.user.name;
  const { data: current } = await supabase.from('basic_timetable').select('*');
  if (current && current.length > 0) {
    state.signUp.subs = [...new Set(current.map(i => i.subject))];
    state.signUp.gcs = [...new Set(current.map(i => i.grade_class))].sort();
    state.maxPeriods = Math.max(7, ...current.map(i => i.period));
  }
  updateDateUI(); fetchTimetable();
  checkInstallButtonVisibility();
}

function initEvents() {
  document.getElementById('btnLogin')?.addEventListener('click', handleLogin);
  document.getElementById('btnOpenSignUp')?.addEventListener('click', () => {
    state.isEditMode = false; state.signUp = { step: 1, subs: [], gcs: [] };
    updateSignUpUI(); showView('signUpContainer');
  });
  document.getElementById('btnSignUpBack')?.addEventListener('click', () => { if (state.signUp.step > 1) { state.signUp.step--; updateSignUpUI(); }});
  document.getElementById('btnSignUpClose')?.addEventListener('click', () => {
    if (state.isEditMode) { if(confirm('수정 중인 내용이 취소됩니다.')) initApp(); } 
    else showView('loginView');
  });
  document.getElementById('btnNextStep')?.addEventListener('click', handleNextButton);
  document.getElementById('btnAddPeriod')?.addEventListener('click', () => { if(state.maxPeriods < 15) { state.maxPeriods++; renderSetupGrid(true); }});
  document.getElementById('btnRemovePeriod')?.addEventListener('click', () => { if(state.maxPeriods > 1) { state.maxPeriods--; renderSetupGrid(true); }});
  document.getElementById('sheetOverlay')?.addEventListener('click', () => { toggleSheet(false); toggleMoveSheet(false); toggleSettings(false); });
  document.getElementById('settingsOverlay')?.addEventListener('click', () => toggleSettings(false));
  document.getElementById('btnSettings')?.addEventListener('click', () => toggleSettings(true));
  document.getElementById('btnMenuEditTime')?.addEventListener('click', openEditTimetable);
  document.getElementById('btnMenuLogout')?.addEventListener('click', async () => { await supabase.auth.signOut(); location.reload(); });
  document.getElementById('btnMenuInquiry')?.addEventListener('click', () => { toggleSettings(false); document.getElementById('inquiryPopup').classList.remove('hidden'); });

  const handleInstallClick = async () => {
    toggleSettings(false);
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') [document.getElementById('btnInstallPWA'), document.getElementById('btnLoginInstall')].forEach(b => b?.classList.add('hidden'));
      deferredPrompt = null;
    } else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) document.getElementById('iosInstallGuide')?.classList.remove('hidden');
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
}

async function handleLogin() {
  const name = document.getElementById('loginName').value.trim();
  const pin = document.getElementById('loginPin').value.trim();
  if(!name || !pin) return alert('정보를 입력하세요.');
  const internalId = generateInternalId(name, pin);
  const password = `${pin}0000`;
  showView('loadingView');
  const { data, error } = await supabase.auth.signInWithPassword({ email: internalId, password: password });
  if (error) { alert('로그인 실패: 정보를 확인하세요.'); showView('loginView'); }
  else { state.user = { id: data.user.id, name: data.user.user_metadata.full_name }; initApp(); }
}

async function handleFinalSignUpSubmit() {
  const btn = document.getElementById('btnNextStep');
  if (btn.disabled) return;

  const name = document.getElementById('regName').value.trim();
  const pin = document.getElementById('regPin').value.trim();
  const internalId = generateInternalId(name, pin);
  const password = `${pin}0000`;

  btn.disabled = true;
  btn.innerText = "처리 중...";
  showView('loadingView');

  // 1. Auth 계정 생성
  const { data, error: authError } = await supabase.auth.signUp({ 
    email: internalId, 
    password: password, 
    options: { data: { full_name: name } } 
  });

  if (authError) { 
    alert('가입 실패: ' + authError.message); 
    btn.disabled = false;
    btn.innerText = "가입 완료";
    showView('signUpContainer'); 
    return; 
  }

  const userId = data.user.id;

  try {
    // 2. profiles 테이블 기록 시도
    const { error: profileError } = await supabase.from('profiles').insert({ 
      user_id: userId, 
      name: name, 
      pin_code: pin 
    });

    if (profileError) {
      console.error("DB 프로필 저장 에러:", profileError);
      throw new Error("프로필 저장 실패 (RLS 권한 확인 필요)");
    }

    const timetableData = [];
    ['월','화','수','목','금'].forEach(d => {
      for (let p = 1; p <= state.maxPeriods; p++) {
        const subBtn = document.querySelector(`.sub-cell[data-day="${d}"][data-p="${p}"]`);
        const gcBtn = document.querySelector(`.gc-cell[data-day="${d}"][data-p="${p}"]`);
        const sub = subBtn?.dataset.fullName || subBtn?.innerText;
        const gc = gcBtn?.innerText;
        if (sub && sub !== '과목' && gc && gc !== '반') {
            timetableData.push({ user_id: userId, user_name: name, day: d, period: p, subject: sub, grade_class: gc });
        }
      }
    });

    if (timetableData.length) {
      const { error: timeError } = await supabase.from('basic_timetable').insert(timetableData);
      if (timeError) throw timeError;
    }
    
    alert('환영합니다! 가입이 완료되었습니다.'); 
    location.reload();
  } catch (err) { 
    console.error("최종 저장 에러:", err);
    alert('계정은 생성되었으나 DB 저장에 실패했습니다: ' + err.message); 
    btn.disabled = false;
    btn.innerText = "가입 완료";
  }
}

async function handleNextButton() {
  const step = state.signUp.step;
  if (step === 1) {
    const name = document.getElementById('regName')?.value.trim();
    const pin = document.getElementById('regPin')?.value.trim();
    if (!name || pin.length < 4) return alert('정보를 올바르게 입력하세요.');
    state.signUp.step++; updateSignUpUI();
  } else if (step < 4) { state.signUp.step++; updateSignUpUI(); } 
  else handleFinalSignUpSubmit();
}

window.renderTags = (type, containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const isSignupStep = (state.signUp.step === 2 || state.signUp.step === 3);
    const showControls = isSignupStep || state.isTagEditMode;
    const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
    let html = arr.map((tag, i) => {
        const color = type === 'sub' ? subPalette[state.signUp.subs.indexOf(tag) % subPalette.length] : (gradePalette[tag[0]] || gradePalette.default);
        const style = type === 'sub' ? `background:${color}; color:white; border:none;` : `color:${color}; border:2px solid ${color}; background:white;`;
        return `<div class="tag-chip">${showControls ? `<button onclick="window.removeTag('${type}', ${i}, '${containerId}')" class="absolute -top-2 -left-2 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] z-10 shadow-sm"><i class="fa-solid fa-minus"></i></button>` : ''}<button onclick="window.fillCell('${type}', '${tag}', '${color}')" class="px-4 py-2 rounded-2xl text-xs font-black shadow-sm active:scale-95 transition-all" style="${style}">${tag}</button></div>`;
    }).join('');
    if (showControls) {
        html += `<button onclick="window.showInlineInput('${type}', '${containerId}')" id="btnShow${type}Input" class="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center active:scale-90 border-2 border-dashed border-slate-200 transition-all"><i class="fa-solid fa-plus text-xs"></i></button><div id="${type}InputWrap" class="hidden flex items-center gap-1"><input type="text" id="${type}MiniInput" class="mini-input-chip"><button onclick="window.submitInlineInput('${type}', '${containerId}')" class="w-10 h-8 rounded-lg bg-[#005CC5] text-white text-[11px] font-black">확인</button></div>`;
    }
    container.innerHTML = html;
}

window.showInlineInput = (type, containerId) => {
    const btn = document.getElementById(`btnShow${type}Input`);
    const wrap = document.getElementById(`${type}InputWrap`);
    if(btn) btn.classList.add('hidden'); if(wrap) wrap.classList.remove('hidden');
    const input = document.getElementById(`${type}MiniInput`);
    if(input) { input.focus(); input.onkeypress = (e) => { if(e.key === 'Enter') window.submitInlineInput(type, containerId); }; }
};

window.submitInlineInput = (type, containerId) => {
    const input = document.getElementById(`${type}MiniInput`);
    const val = input?.value.trim();
    if (val) {
        const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
        if(!arr.includes(val)) { arr.push(val); if (type === 'gc') arr.sort(); }
    }
    window.renderTags(type, containerId);
    if(state.signUp.step === 4) renderSetupGrid(true);
};

window.removeTag = (type, i, containerId) => {
    (type === 'sub' ? state.signUp.subs : state.signUp.gcs).splice(i, 1);
    window.renderTags(type, containerId);
    if(state.signUp.step === 4) renderSetupGrid(true);
};

function renderSetupGrid(keepValues = false) {
  const body = document.getElementById('setupTableBody');
  if (!body) return;
  const saved = [];
  if(keepValues) {
    document.querySelectorAll('.setup-in').forEach(btn => {
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
    const target = document.querySelector(`.${s.type}-cell[data-day="${s.d}"][data-p="${s.p}"]`);
    if(target) {
        target.innerText = s.type === 'sub' ? s.val.substring(0, 4) : s.val;
        target.dataset.fullName = s.val;
        if(s.type === 'sub') { target.style.background = s.color; target.classList.add('sub-filled'); }
        else { target.style.color = s.color; target.classList.add('gc-filled'); }
    }
  });
  window.renderTags('sub', 'quickSubSection'); window.renderTags('gc', 'quickGcSection');
  document.querySelectorAll('.setup-in').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.setup-in').forEach(b => b.classList.remove('active-cell'));
    btn.classList.add('active-cell');
    state.activeCell = { type: btn.classList.contains('sub-cell') ? 'sub' : 'gc', day: btn.dataset.day, p: btn.dataset.p };
  }));
}

window.fillCell = (type, val, color) => {
  if (state.signUp.step === 4 && state.isTagEditMode) return;
  if (!state.activeCell || state.activeCell.type !== type) return;
  const current = document.querySelector(`.${type}-cell[data-day="${state.activeCell.day}"][data-p="${state.activeCell.p}"]`);
  if (current) {
    current.innerText = type === 'sub' ? val.substring(0, 4) : val;
    current.dataset.fullName = val; 
    if (type === 'sub') {
      current.style.background = color; current.classList.add('sub-filled');
      const nextGc = document.querySelector(`.gc-cell[data-day="${state.activeCell.day}"][data-p="${state.activeCell.p}"]`);
      if (nextGc) nextGc.click();
    } else { current.style.color = color; current.classList.add('gc-filled'); }
  }
};

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
}

async function saveProgress() {
  const content = document.getElementById('progContent')?.value.trim();
  const note = document.getElementById('progNote')?.value.trim();
  const dateStr = state.activeDate.toISOString().split('T')[0];
  if (!content) return alert('내용을 입력하세요.');
  showView('loadingView');
  try {
    const { error } = await supabase.from('lesson_records').upsert({ user_id: state.user.id, user_name: state.user.name, date: dateStr, period: state.selectedItem.period, grade_class: state.selectedItem.grade_class, subject: state.selectedItem.subject, content: content, note: note || '-' }, { onConflict: 'user_id, date, period, grade_class, subject' });
    if (error) throw error;
    toggleSheet(false); fetchTimetable();
  } catch (err) { alert('저장 실패'); } 
  finally { showView('mainView'); }
}

async function handleConfirmMove() {
    const targetDate = document.getElementById('moveTargetDate').value;
    const targetPeriod = parseInt(document.getElementById('moveTargetPeriod').value);
    const originalDate = state.activeDate.toISOString().split('T')[0];
    if (!targetDate) return alert('이동할 날짜를 선택하세요.');
    showView('loadingView');
    try {
        const targetDayName = ['일','월','화','수','목','금','토'][new Date(targetDate).getDay()];
        const [targetBasic, targetChanges] = await Promise.all([
            supabase.from('basic_timetable').select('*').eq('day', targetDayName).eq('period', targetPeriod).maybeSingle(),
            supabase.from('lesson_changes').select('*').eq('date', targetDate).eq('period', targetPeriod)
        ]);
        let isOccupied = false;
        if (targetBasic.data) { if (!targetChanges.data?.some(c => c.change_type === 'cancelled')) isOccupied = true; }
        if (targetChanges.data?.some(c => c.change_type === 'added')) isOccupied = true;
        if (isOccupied) { alert('해당 시간대에 이미 수업이 배정되어 있습니다.'); showView('mainView'); return; }
        await supabase.from('lesson_changes').insert([
            { user_id: state.user.id, user_name: state.user.name, date: originalDate, period: state.selectedMoveItem.period, subject: state.selectedMoveItem.subject, grade_class: state.selectedMoveItem.grade_class, change_type: 'cancelled' },
            { user_id: state.user.id, user_name: state.user.name, date: targetDate, period: targetPeriod, subject: state.selectedMoveItem.subject, grade_class: state.selectedMoveItem.grade_class, change_type: 'added' }
        ]);
        alert('수업 이동 완료'); toggleMoveSheet(false); fetchTimetable();
    } catch (err) { alert('오류 발생'); }
    finally { showView('mainView'); }
}

function toggleSettings(open) {
  const s = document.getElementById('settingsSheet');
  const o = document.getElementById('settingsOverlay');
  if(s) s.style.transform = open ? 'translateY(0)' : 'translateY(100%)';
  if(o) open ? o.classList.add('overlay-show') : o.classList.remove('overlay-show');
}

function toggleSheet(open) {
  const s = document.getElementById('inputSheet');
  const o = document.getElementById('sheetOverlay');
  if(s) s.style.transform = open ? 'translateY(0)' : 'translateY(100%)';
  if(o) open ? o.classList.add('overlay-show') : o.classList.remove('overlay-show');
}

function toggleMoveSheet(open) {
    const s = document.getElementById('moveSheet');
    const o = document.getElementById('sheetOverlay');
    if (s) s.style.transform = open ? 'translateY(0)' : 'translateY(100%)';
    if (o) open ? o.classList.add('overlay-show') : o.classList.remove('overlay-show');
}

function updateDateUI() {
  const d = document.getElementById('currentDateDisplay');
  if (d) d.innerText = state.activeDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
}

function moveDate(offset) { state.activeDate.setDate(state.activeDate.getDate() + offset); updateDateUI(); fetchTimetable(); }

window.openInputSheet = (item, prevContent, todayRec) => {
  state.selectedItem = item;
  const subColor = subPalette[state.signUp.subs.indexOf(item.subject) % subPalette.length] || '#1E293B';
  const gcColor = gradePalette[item.grade_class[0]] || gradePalette.default;
  const tagHtml = `<span class="text-[14px] font-black bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg uppercase">${item.period}교시</span><span class="px-4 py-1.5 rounded-full text-[13px] font-black text-white shadow-sm" style="background:${subColor}">${item.subject}</span><span class="px-3 py-1 rounded-full text-[12px] font-black bg-white border-2" style="color:${gcColor}; border-color:${gcColor}">${item.grade_class}</span>`;
  document.getElementById('sheetTagContainer').innerHTML = tagHtml;
  document.getElementById('prevProgressText').innerText = prevContent;
  document.getElementById('progContent').value = todayRec ? todayRec.content : '';
  document.getElementById('progNote').value = todayRec ? todayRec.note : '';
  toggleSheet(true);
};

window.toggleTagEditMode = () => {
    state.isTagEditMode = !state.isTagEditMode;
    const btn = document.getElementById('btnEditTagsStep4');
    if(btn) btn.innerText = state.isTagEditMode ? "완료" : "편집";
    renderSetupGrid(true);
};

function updateSignUpUI() {
  document.querySelectorAll('.signUpStep').forEach(s => s.classList.add('hidden'));
  document.getElementById(`step${state.signUp.step}`)?.classList.remove('hidden');
  const backB = document.getElementById('btnSignUpBack');
  const nextB = document.getElementById('btnNextStep');
  const signupH = document.getElementById('signupHeaderContent');
  const editH = document.getElementById('editHeaderContent');
  if(state.isEditMode) {
      if(backB) backB.style.display = 'none'; if(signupH) signupH.classList.add('hidden'); if(editH) editH.classList.remove('hidden');
      nextB.innerText = "수정 완료";
  } else {
      if(backB) backB.style.display = 'flex'; if(signupH) signupH.classList.remove('hidden'); if(editH) editH.classList.add('hidden');
      document.getElementById('signUpProgress').style.width = `${(state.signUp.step / 4) * 100}%`;
      nextB.innerText = state.signUp.step === 4 ? "가입 완료" : "다음 단계";
  }
  if (state.signUp.step === 2) window.renderTags('sub', 'subTagContainer');
  else if (state.signUp.step === 3) window.renderTags('gc', 'gcTagContainer');
  else if (state.signUp.step === 4) renderSetupGrid(state.isEditMode);
}

async function openEditTimetable() {
    toggleSettings(false); state.isEditMode = true; state.signUp.step = 4;
    showView('loadingView');
    const { data: current } = await supabase.from('basic_timetable').select('*');
    state.signUp.subs = [...new Set(current?.map(i => i.subject) || [])];
    state.signUp.gcs = [...new Set(current?.map(i => i.grade_class) || [])].sort();
    state.maxPeriods = Math.max(7, ... (current?.map(i => i.period) || [7]));
    showView('signUpContainer'); updateSignUpUI();
    const editTeacher = document.getElementById('editTeacherName');
    if(editTeacher) editTeacher.innerText = state.user.name;
    current?.forEach(item => {
        const subCell = document.querySelector(`.sub-cell[data-day="${item.day}"][data-p="${item.period}"]`);
        const gcCell = document.querySelector(`.gc-cell[data-day="${item.day}"][data-p="${item.period}"]`);
        if(subCell) { subCell.innerText = item.subject.substring(0,4); subCell.dataset.fullName = item.subject; subCell.classList.add('sub-filled'); subCell.style.background = subPalette[state.signUp.subs.indexOf(item.subject) % subPalette.length]; }
        if(gcCell) { gcCell.innerText = item.grade_class; gcCell.classList.add('gc-filled'); gcCell.style.color = gradePalette[item.grade_class[0]] || gradePalette.default; }
    });
}