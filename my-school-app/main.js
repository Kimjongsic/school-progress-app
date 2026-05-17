import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gckplcpwrvabhqqohuib.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdja3BsY3B3cnZhYmhxcW9odWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDI3NTYsImV4cCI6MjA5NDQ3ODc1Nn0.rg9p24pmgeAIe6EcNZjIFEePXtpesnOnOZRlQKyUcuU';
const supabase = createClient(supabaseUrl, supabaseKey);

let state = {
  user: JSON.parse(localStorage.getItem('cf_user')) || null,
  activeDate: new Date(),
  signUp: { step: 1, subs: [], gcs: [] },
  activeCell: null, 
  maxPeriods: 7, 
  isSheetOpen: false,
  isEditMode: false
};

const subPalette = ['#1E293B', '#1E40AF', '#065F46', '#991B1B', '#854D0E', '#5B21B6', '#9D174D', '#115E59'];
const gradePalette = { '1': '#10B981', '2': '#3B82F6', '3': '#F59E0B', 'default': '#64748B' };

window.onload = () => {
  if (state.user) initApp();
  else showView('loginView');
  initEvents();
};

function showView(id) {
  document.querySelectorAll('section, main, #loadingView').forEach(v => v.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

function initApp() {
  state.isEditMode = false;
  showView('mainView');
  const userDisplay = document.getElementById('userNameDisplay');
  if (userDisplay) userDisplay.innerText = state.user.name;
  updateDateUI();
  fetchTimetable();
}

function initEvents() {
  document.getElementById('btnLogin')?.addEventListener('click', handleLogin);
  document.getElementById('btnOpenSignUp')?.addEventListener('click', () => {
    state.isEditMode = false; state.signUp = { step: 1, subs: [], gcs: [] };
    updateSignUpUI(); showView('signUpContainer');
  });

  // 태그 추가 엔터 이벤트
  document.getElementById('subInput')?.addEventListener('keypress', e => e.key === 'Enter' && addTag('sub'));
  document.getElementById('gcInput')?.addEventListener('keypress', e => e.key === 'Enter' && addTag('gc'));
  
  // 수정 창 내 즉석 추가 이벤트
  document.getElementById('editSubIn')?.addEventListener('keypress', e => e.key === 'Enter' && addTag('sub', true));
  document.getElementById('editGcIn')?.addEventListener('keypress', e => e.key === 'Enter' && addTag('gc', true));

  document.getElementById('btnSignUpBack')?.addEventListener('click', () => {
    if (state.signUp.step > 1) { state.signUp.step--; updateSignUpUI(); }
  });
  document.getElementById('btnSignUpClose')?.addEventListener('click', () => state.isEditMode ? initApp() : showView('loginView'));
  document.getElementById('btnNextStep')?.addEventListener('click', handleNextButton);
  document.getElementById('btnAddSub')?.addEventListener('click', () => addTag('sub'));
  document.getElementById('btnAddGc')?.addEventListener('click', () => addTag('gc'));

  // 교시 조절
  document.getElementById('btnAddPeriod')?.addEventListener('click', () => { if(state.maxPeriods < 15) { state.maxPeriods++; renderSetupGrid(); }});
  document.getElementById('btnRemovePeriod')?.addEventListener('click', () => { if(state.maxPeriods > 1) { state.maxPeriods--; renderSetupGrid(); }});

  // 시트/설정 제어
  document.getElementById('sheetOverlay')?.addEventListener('click', () => toggleSheet(false));
  document.getElementById('settingsOverlay')?.addEventListener('click', () => toggleSettings(false));
  document.getElementById('btnSettings')?.addEventListener('click', () => toggleSettings(true));
  document.getElementById('btnMenuEditTime')?.addEventListener('click', openEditTimetable);
  document.getElementById('btnMenuLogout')?.addEventListener('click', () => { localStorage.clear(); location.reload(); });
  
  document.getElementById('btnSaveProgress')?.addEventListener('click', saveProgress);
  document.querySelectorAll('.btnCloseSheet').forEach(btn => btn.addEventListener('click', () => toggleSheet(false)));

  document.getElementById('btnPrevDate')?.addEventListener('click', () => moveDate(-1));
  document.getElementById('btnNextDate')?.addEventListener('click', () => moveDate(1));
}

// 설정 메뉴 토글
function toggleSettings(open) {
    const sheet = document.getElementById('settingsSheet');
    const overlay = document.getElementById('settingsOverlay');
    if(sheet) sheet.style.transform = open ? 'translateY(0)' : 'translateY(100%)';
    if(overlay) open ? overlay.classList.add('overlay-show') : overlay.classList.remove('overlay-show');
}

// 시간표 수정 메뉴 실행
async function openEditTimetable() {
    toggleSettings(false);
    state.isEditMode = true;
    state.signUp.step = 4;
    showView('loadingView');
    
    const { data: current } = await supabase.from('basic_timetable').select('*').eq('user_name', state.user.name);
    state.signUp.subs = [...new Set(current?.map(i => i.subject) || [])];
    state.signUp.gcs = [...new Set(current?.map(i => i.grade_class) || [])];
    state.maxPeriods = Math.max(7, ... (current?.map(i => i.period) || [7]));

    showView('signUpContainer');
    updateSignUpUI();

    current?.forEach(item => {
        const subCell = document.querySelector(`.sub-cell[data-day="${item.day}"][data-p="${item.period}"]`);
        const gcCell = document.querySelector(`.gc-cell[data-day="${item.day}"][data-p="${item.period}"]`);
        if(subCell) {
            subCell.innerText = item.subject; subCell.classList.add('sub-filled');
            subCell.style.background = subPalette[state.signUp.subs.indexOf(item.subject) % subPalette.length];
        }
        if(gcCell) {
            gcCell.innerText = item.grade_class; gcCell.classList.add('gc-filled');
            gcCell.style.color = gradePalette[item.grade_class[0]] || gradePalette.default;
        }
    });
}

// 태그 추가 로직 (수정 모드 대응)
function addTag(type, isQuick = false) {
    const id = isQuick ? (type === 'sub' ? 'editSubIn' : 'editGcIn') : (type === 'sub' ? 'subInput' : 'gcInput');
    const input = document.getElementById(id);
    const val = input?.value.trim();
    if (!val) return;
    const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
    if (!arr.includes(val)) { 
        arr.push(val); 
        isQuick ? renderSetupGrid(true) : renderTags(type); 
    }
    if (input) input.value = '';
}

function renderTags(type) {
  const container = document.getElementById(type === 'sub' ? 'subTagContainer' : 'gcTagContainer');
  const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
  if (container) {
    container.innerHTML = arr.map((tag, i) => `<div class="tag-chip flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-lg"><span>${tag}</span><button onclick="window.removeTag('${type}', ${i})"><i class="fa-solid fa-xmark"></i></button></div>`).join('');
  }
}

window.removeTag = (type, i) => {
  const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
  arr.splice(i, 1); renderTags(type);
};

function renderSetupGrid(keepValues = false) {
  const body = document.getElementById('setupTableBody');
  if (!body) return;

  // 기존 입력값 임시 보관
  const saved = [];
  if(keepValues) {
    document.querySelectorAll('.setup-in').forEach(btn => {
        if(btn.innerText !== '과목' && btn.innerText !== '반') {
            saved.push({ d: btn.dataset.day, p: btn.dataset.p, val: btn.innerText, type: btn.classList.contains('sub-cell') ? 'sub' : 'gc', color: btn.style.background || btn.style.color });
        }
    });
  }

  body.innerHTML = '';
  for (let p = 1; p <= state.maxPeriods; p++) {
    const row = document.createElement('tr');
    row.innerHTML = `<td class="header-cell text-center font-bold text-slate-400 text-[11px]">${p}</td>` + 
      ['월','화','수','목','금'].map(d => `
      <td class="p-1">
        <button class="setup-in sub-cell" data-day="${d}" data-p="${p}">과목</button>
        <button class="setup-in gc-cell mt-1" data-day="${d}" data-p="${p}">반</button>
      </td>`).join('');
    body.appendChild(row);
  }

  // 보관된 값 복구
  saved.forEach(s => {
    const target = document.querySelector(`.${s.type}-cell[data-day="${s.d}"][data-p="${s.p}"]`);
    if(target) {
        target.innerText = s.val;
        if(s.type === 'sub') { target.style.background = s.color; target.classList.add('sub-filled'); }
        else { target.style.color = s.color; target.classList.add('gc-filled'); }
    }
  });

  const subSec = document.getElementById('quickSubSection');
  const gcSec = document.getElementById('quickGcSection');
  if (subSec) subSec.innerHTML = state.signUp.subs.map((s, i) => `<button class="px-3 py-1.5 rounded-full text-[10px] font-black text-white shadow-sm" style="background:${subPalette[i % subPalette.length]}" onclick="window.fillCell('sub', '${s}', '${subPalette[i % subPalette.length]}')">${s}</button>`).join('');
  if (gcSec) gcSec.innerHTML = state.signUp.gcs.map(g => `<button class="px-3 py-1.5 rounded-full text-[10px] font-black bg-white border-2" style="color:${gradePalette[g[0]] || gradePalette.default}; border-color:${gradePalette[g[0]] || gradePalette.default}" onclick="window.fillCell('gc', '${g}', '${gradePalette[g[0]] || gradePalette.default}')">${g}</button>`).join('');

  document.querySelectorAll('.setup-in').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.setup-in').forEach(b => b.classList.remove('active-cell'));
      btn.classList.add('active-cell');
      state.activeCell = { type: btn.classList.contains('sub-cell') ? 'sub' : 'gc', day: btn.dataset.day, p: btn.dataset.p };
    });
  });
}

window.fillCell = (type, val, color) => {
  if (!state.activeCell || state.activeCell.type !== type) return;
  const current = document.querySelector(`.${type}-cell[data-day="${state.activeCell.day}"][data-p="${state.activeCell.p}"]`);
  if (current) {
    current.innerText = val;
    if (type === 'sub') {
      current.style.background = color; current.classList.add('sub-filled');
      const nextGc = document.querySelector(`.gc-cell[data-day="${state.activeCell.day}"][data-p="${state.activeCell.p}"]`);
      if (nextGc) nextGc.click();
    } else {
      current.style.color = color; current.classList.add('gc-filled');
    }
  }
};

async function handleNextButton() {
  const currentStep = state.signUp.step;
  if (currentStep === 1) {
    const name = document.getElementById('regName')?.value.trim();
    const pin = document.getElementById('regPin')?.value.trim();
    if (!name || pin?.length !== 4) return alert('확인 필요');
    showView('loadingView');
    const { data } = await supabase.from('profiles').select('name').eq('name', name).maybeSingle();
    showView('signUpContainer');
    if (data) return alert('중복된 이름');
    state.signUp.step++; updateSignUpUI();
  } 
  else if (currentStep < 4) { if (validateStep(currentStep)) { state.signUp.step++; updateSignUpUI(); }} 
  else handleFinalSignUpSubmit();
}

async function handleFinalSignUpSubmit() {
  const name = state.isEditMode ? state.user.name : document.getElementById('regName')?.value.trim();
  const pin = document.getElementById('regPin')?.value.trim();
  showView('loadingView');
  try {
    if (!state.isEditMode) { await supabase.from('profiles').insert({ name, pin }); }
    const timetableData = [];
    ['월','화','수','목','금'].forEach(d => {
      for (let p = 1; p <= state.maxPeriods; p++) {
        const sub = document.querySelector(`.sub-cell[data-day="${d}"][data-p="${p}"]`)?.innerText;
        const gc = document.querySelector(`.gc-cell[data-day="${d}"][data-p="${p}"]`)?.innerText;
        if (sub && sub !== '과목' && gc && gc !== '반') timetableData.push({ user_name: name, day: d, period: p, subject: sub, grade_class: gc });
      }
    });
    await supabase.from('basic_timetable').delete().eq('user_name', name);
    if (timetableData.length) await supabase.from('basic_timetable').insert(timetableData);
    state.isEditMode ? initApp() : location.reload();
  } catch (err) { alert(err.message); showView('signUpContainer'); }
}

function updateSignUpUI() {
  document.querySelectorAll('.signUpStep').forEach(s => s.classList.add('hidden'));
  document.getElementById(`step${state.signUp.step}`)?.classList.remove('hidden');
  const progW = document.getElementById('progressWrapper');
  const setupT = document.getElementById('setupTitle');
  const nextB = document.getElementById('btnNextStep');
  if(state.isEditMode) { progW.classList.add('hidden'); setupT.innerText = "전체 시간표 수정"; nextB.innerText = "수정 완료"; }
  else { progW.classList.remove('hidden'); document.getElementById('signUpProgress').style.width = `${(state.signUp.step / 4) * 100}%`; nextB.innerText = state.signUp.step === 4 ? '가입 완료' : '다음으로'; }
  if (state.signUp.step === 4) renderSetupGrid(state.isEditMode);
}

function validateStep(step) {
  if (step === 2 && !state.signUp.subs.length) return false;
  if (step === 3 && !state.signUp.gcs.length) return false;
  return true;
}

async function handleLogin() {
  const n = document.getElementById('loginName')?.value.trim();
  const p = document.getElementById('loginPin')?.value.trim();
  const { data } = await supabase.from('profiles').select('*').eq('name', n).eq('pin', p).maybeSingle();
  if (data) { state.user = data; localStorage.setItem('cf_user', JSON.stringify(data)); initApp(); }
}

async function fetchTimetable() {
  const dateStr = state.activeDate.toISOString().split('T')[0];
  const dayName = ['일', '월', '화', '수', '목', '금', '토'][state.activeDate.getDay()];
  const list = document.getElementById('timetableList');
  if (!list) return;
  list.innerHTML = `<div class="py-20 text-center"><i class="fa-solid fa-spinner fa-spin text-2xl text-slate-200"></i></div>`;
  const [basic, records] = await Promise.all([
    supabase.from('basic_timetable').select('*').eq('user_name', state.user.name).eq('day', dayName).order('period'),
    supabase.from('lesson_records').select('*').eq('user_name', state.user.name).eq('date', dateStr)
  ]);
  list.innerHTML = basic.data?.length ? '' : `<div class="py-20 text-center text-slate-400 font-bold">수업이 없습니다.</div>`;
  for (const item of basic.data || []) {
    const { data: prev } = await supabase.from('lesson_records').select('content').eq('user_name', state.user.name).eq('grade_class', item.grade_class).eq('subject', item.subject).lt('date', dateStr).order('date', { ascending: false }).limit(1).maybeSingle();
    const today = records.data?.find(r => r.period == item.period);
    const card = document.createElement('div');
    card.className = "bg-white p-6 rounded-[32px] border border-slate-50 shadow-sm flex justify-between items-center active:scale-95 transition-all cursor-pointer";
    card.innerHTML = `<div class="flex-1"><div class="flex items-center gap-2 mb-2"><span class="text-[9px] font-black bg-[#005CC5] text-white px-2 py-0.5 rounded-md uppercase">${item.period}교시</span><span class="text-[10px] font-black text-slate-300 uppercase">${item.grade_class}</span></div><h4 class="text-xl font-black text-slate-900">${item.subject}</h4><p class="text-[11px] font-bold text-slate-400 mt-2 line-clamp-1">이전: <span class="text-slate-600">${prev?.content || '-'}</span></p></div><div class="w-14 h-14 rounded-[22px] ${today ? 'bg-blue-50 text-[#005CC5]' : 'bg-slate-50 text-slate-200'} flex items-center justify-center text-2xl"><i class="fa-solid ${today ? 'fa-check-circle' : 'fa-feather-pointed'}"></i></div>`;
    card.addEventListener('click', () => {
      state.selectedItem = item;
      document.getElementById('sheetBadge').innerText = item.grade_class;
      document.getElementById('sheetTitle').innerText = `${item.subject} 진도 기록`;
      document.getElementById('prevProgressText').innerText = prev?.content || '첫 기록';
      document.getElementById('progContent').value = today ? today.content : '';
      document.getElementById('progNote').value = today ? today.note : '';
      toggleSheet(true);
    });
    list.appendChild(card);
  }
}

function toggleSheet(o) {
  const s = document.getElementById('inputSheet');
  const ov = document.getElementById('sheetOverlay');
  if (s) s.style.transform = o ? 'translateY(0)' : 'translateY(100%)';
  if (ov) o ? ov.classList.add('overlay-show') : ov.classList.remove('overlay-show');
}

async function saveProgress() {
  const c = document.getElementById('progContent')?.value.trim();
  const n = document.getElementById('progNote')?.value.trim();
  const d = state.activeDate.toISOString().split('T')[0];
  if (!c) return alert('진도 입력');
  await supabase.from('lesson_records').upsert({
    user_name: state.user.name, date: d, period: state.selectedItem.period,
    grade_class: state.selectedItem.grade_class, subject: state.selectedItem.subject, content: c, note: n || '-'
  }, { onConflict: 'user_name, date, period, grade_class, subject' });
  toggleSheet(false); fetchTimetable();
}

function updateDateUI() {
  const d = document.getElementById('currentDateDisplay');
  if (d) d.innerText = state.activeDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
}

function moveDate(offset) {
  state.activeDate.setDate(state.activeDate.getDate() + offset);
  updateDateUI(); fetchTimetable();
}