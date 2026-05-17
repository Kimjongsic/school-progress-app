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
  isEditMode: false // 시간표 수정 모드 여부
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
  const target = document.getElementById(id);
  if (target) target.classList.remove('hidden');
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
    state.isEditMode = false;
    state.signUp = { step: 1, subs: [], gcs: [] };
    updateSignUpUI();
    showView('signUpContainer');
  });

  document.getElementById('subInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag('sub'); }});
  document.getElementById('gcInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag('gc'); }});

  document.getElementById('btnSignUpBack')?.addEventListener('click', () => {
    if (state.signUp.step > 1) { state.signUp.step--; updateSignUpUI(); }
  });

  document.getElementById('btnSignUpClose')?.addEventListener('click', () => {
    if (state.isEditMode) initApp();
    else showView('loginView');
  });

  document.getElementById('btnNextStep')?.addEventListener('click', handleNextButton);
  document.getElementById('btnAddSub')?.addEventListener('click', () => addTag('sub'));
  document.getElementById('btnAddGc')?.addEventListener('click', () => addTag('gc'));
  
  document.getElementById('btnAddPeriod')?.addEventListener('click', () => { if (state.maxPeriods < 15) { state.maxPeriods++; renderSetupGrid(); }});
  document.getElementById('btnRemovePeriod')?.addEventListener('click', () => { if (state.maxPeriods > 1) { state.maxPeriods--; renderSetupGrid(); }});

  document.getElementById('btnSaveProgress')?.addEventListener('click', saveProgress);
  
  // [수정사항 3] 바탕 클릭 시 닫기 (오버레이 클릭 시)
  document.getElementById('sheetOverlay')?.addEventListener('click', () => toggleSheet(false));
  document.querySelectorAll('.btnCloseSheet').forEach(btn => btn.addEventListener('click', () => toggleSheet(false)));

  document.getElementById('btnLogout')?.addEventListener('click', () => { localStorage.clear(); location.reload(); });
  
  // [수정사항 2] 날짜 버튼 클릭 제어
  document.getElementById('btnPrevDate')?.addEventListener('click', () => moveDate(-1));
  document.getElementById('btnNextDate')?.addEventListener('click', () => moveDate(1));
  document.getElementById('datePicker')?.addEventListener('change', (e) => {
    state.activeDate = new Date(e.target.value);
    updateDateUI();
    fetchTimetable();
  });

  // [수정사항 1] 네비게이션 메뉴
  document.getElementById('navHome')?.addEventListener('click', initApp);
  document.getElementById('navTimetable')?.addEventListener('click', openEditTimetable);
}

// 시간표 수정 메뉴 열기
async function openEditTimetable() {
  state.isEditMode = true;
  state.signUp.step = 4;
  showView('loadingView');
  
  // 현재 가르치는 과목/학급 데이터 추출 (기존 시간표 기반)
  const { data: current } = await supabase.from('basic_timetable').select('*').eq('user_name', state.user.name);
  
  state.signUp.subs = [...new Set(current?.map(i => i.subject) || [])];
  state.signUp.gcs = [...new Set(current?.map(i => i.grade_class) || [])];
  state.maxPeriods = Math.max(7, ... (current?.map(i => i.period) || [7]));

  showView('signUpContainer');
  updateSignUpUI();

  // 기존 데이터 그리드에 채우기
  current?.forEach(item => {
    const subCell = document.querySelector(`.sub-cell[data-day="${item.day}"][data-p="${item.period}"]`);
    const gcCell = document.querySelector(`.gc-cell[data-day="${item.day}"][data-p="${item.period}"]`);
    if(subCell) {
        subCell.innerText = item.subject;
        subCell.classList.add('sub-filled');
        subCell.style.background = subPalette[state.signUp.subs.indexOf(item.subject) % subPalette.length];
    }
    if(gcCell) {
        gcCell.innerText = item.grade_class;
        gcCell.classList.add('gc-filled');
        gcCell.style.color = gradePalette[item.grade_class[0]] || gradePalette.default;
    }
  });
}

// --- 공통 로직 ---
async function handleNextButton() {
  const currentStep = state.signUp.step;
  if (currentStep === 1) {
    const name = document.getElementById('regName')?.value.trim();
    const pin = document.getElementById('regPin')?.value.trim();
    if (!name || pin?.length !== 4) return alert('성함과 비번 4자리를 확인해주세요.');
    showView('loadingView');
    const { data } = await supabase.from('profiles').select('name').eq('name', name).maybeSingle();
    showView('signUpContainer');
    if (data) return alert('이미 사용 중인 이름입니다.');
    state.signUp.step++; updateSignUpUI();
  } 
  else if (currentStep < 4) {
    if (validateStep(currentStep)) { state.signUp.step++; updateSignUpUI(); }
  } 
  else handleFinalSignUpSubmit();
}

async function handleFinalSignUpSubmit() {
  const name = state.isEditMode ? state.user.name : document.getElementById('regName')?.value.trim();
  const pin = document.getElementById('regPin')?.value.trim();
  showView('loadingView');

  try {
    if (!state.isEditMode) {
        const { error } = await supabase.from('profiles').insert({ name, pin });
        if (error) throw error;
    }

    const timetableData = [];
    ['월','화','수','목','금'].forEach(d => {
      for (let p = 1; p <= state.maxPeriods; p++) {
        const sub = document.querySelector(`.sub-cell[data-day="${d}"][data-p="${p}"]`)?.innerText;
        const gc = document.querySelector(`.gc-cell[data-day="${d}"][data-p="${p}"]`)?.innerText;
        if (sub && sub !== '과목' && gc && gc !== '반') {
          timetableData.push({ user_name: name, day: d, period: p, subject: sub, grade_class: gc });
        }
      }
    });

    // 기존 시간표 삭제 후 재삽입 (Update 방식)
    await supabase.from('basic_timetable').delete().eq('user_name', name);
    if (timetableData.length > 0) {
      const { error: timeError } = await supabase.from('basic_timetable').insert(timetableData);
      if (timeError) throw timeError;
    }

    if (state.isEditMode) {
        alert('시간표가 성공적으로 수정되었습니다.');
        initApp();
    } else {
        alert('가입 완료! 로그인 해주세요.');
        location.reload();
    }
  } catch (err) {
    alert('오류가 발생했습니다: ' + err.message);
    showView('signUpContainer');
  }
}

function updateSignUpUI() {
  document.querySelectorAll('.signUpStep').forEach(s => s.classList.add('hidden'));
  document.getElementById(`step${state.signUp.step}`)?.classList.remove('hidden');
  
  // 수정 모드일 때 UI 조정
  if(state.isEditMode) {
      document.getElementById('progressWrapper').classList.add('hidden');
      document.getElementById('setupTitle').innerText = "전체 시간표 수정";
      document.getElementById('btnNextStep').innerText = "수정 완료";
  } else {
      document.getElementById('progressWrapper').classList.remove('hidden');
      document.getElementById('signUpProgress').style.width = `${(state.signUp.step / 4) * 100}%`;
      document.getElementById('btnNextStep').innerText = state.signUp.step === 4 ? '가입 완료' : '다음으로';
  }

  if (state.signUp.step === 4) renderSetupGrid();
}

function renderSetupGrid() {
  const body = document.getElementById('setupTableBody');
  if (!body) return;
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
  const subSec = document.getElementById('quickSubSection');
  const gcSec = document.getElementById('quickGcSection');
  if (subSec) subSec.innerHTML = state.signUp.subs.map((s, i) => `<button class="px-3 py-1.5 rounded-full text-[11px] font-black text-white" style="background:${subPalette[i % subPalette.length]}" onclick="window.fillCell('sub', '${s}', '${subPalette[i % subPalette.length]}')">${s}</button>`).join('');
  if (gcSec) gcSec.innerHTML = state.signUp.gcs.map(g => `<button class="px-3 py-1.5 rounded-full text-[11px] font-black bg-white border-2" style="color:${gradePalette[g[0]] || gradePalette.default}; border-color:${gradePalette[g[0]] || gradePalette.default}" onclick="window.fillCell('gc', '${g}', '${gradePalette[g[0]] || gradePalette.default}')">${g}</button>`).join('');
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

async function fetchTimetable() {
  const dateStr = state.activeDate.toISOString().split('T')[0];
  const dayName = ['일', '월', '화', '수', '목', '금', '토'][state.activeDate.getDay()];
  const list = document.getElementById('timetableList');
  if (!list) return;
  list.innerHTML = `<div class="py-20 text-center"><i class="fa-solid fa-spinner fa-spin text-2xl text-slate-200"></i></div>`;
  const [basic, records] = await Promise.all([
    supabase.from('basic_timetable').select('*').eq('user_name', state.user.name).eq('day', dayName),
    supabase.from('lesson_records').select('*').eq('user_name', state.user.name).eq('date', dateStr)
  ]);
  list.innerHTML = basic.data?.length ? '' : `<div class="py-20 text-center text-slate-400 font-bold">오늘은 수업이 없습니다 ☕️</div>`;
  for (const item of basic.data || []) {
    const { data: prev } = await supabase.from('lesson_records').select('content').eq('user_name', state.user.name).eq('grade_class', item.grade_class).eq('subject', item.subject).lt('date', dateStr).order('date', { ascending: false }).limit(1).maybeSingle();
    const today = records.data?.find(r => r.period == item.period);
    const card = document.createElement('div');
    card.className = "bg-white p-6 rounded-[32px] border border-slate-50 shadow-sm flex justify-between items-center active:scale-95 transition-transform cursor-pointer";
    card.innerHTML = `<div class="flex-1"><div class="flex items-center gap-2 mb-2"><span class="text-[9px] font-black bg-[#005CC5] text-white px-2 py-0.5 rounded-md uppercase">${item.period}교시</span><span class="text-[10px] font-black text-slate-300 uppercase">${item.grade_class}</span></div><h4 class="text-xl font-black text-slate-900">${item.subject}</h4><p class="text-[11px] font-bold text-slate-400 mt-2">이전: <span class="text-slate-600">${prev?.content || '-'}</span></p></div><div class="w-14 h-14 rounded-[22px] ${today ? 'bg-blue-50 text-[#005CC5]' : 'bg-slate-50 text-slate-200'} flex items-center justify-center text-2xl"><i class="fa-solid ${today ? 'fa-check-circle' : 'fa-plus-circle'}"></i></div>`;
    card.addEventListener('click', () => {
      state.selectedItem = item;
      document.getElementById('sheetBadge').innerText = item.grade_class;
      document.getElementById('sheetTitle').innerText = `${item.subject} 진도 기록`;
      document.getElementById('prevProgressText').innerText = prev?.content || '첫 기록입니다.';
      document.getElementById('progContent').value = today ? today.content : '';
      document.getElementById('progNote').value = today ? today.note : '';
      toggleSheet(true);
    });
    list.appendChild(card);
  }
}

function toggleSheet(open) {
  const s = document.getElementById('inputSheet');
  const o = document.getElementById('sheetOverlay');
  state.isSheetOpen = open;
  if (s) s.style.transform = open ? 'translateY(0)' : 'translateY(100%)';
  if (o) open ? o.classList.add('show') : o.classList.remove('show');
}

async function saveProgress() {
  const c = document.getElementById('progContent')?.value.trim();
  const n = document.getElementById('progNote')?.value.trim();
  const d = state.activeDate.toISOString().split('T')[0];
  if (!c) return alert('진도를 입력해 주세요.');
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

function validateStep(step) {
  if (step === 2 && !state.signUp.subs.length) { alert('과목을 등록해주세요.'); return false; }
  else if (step === 3 && !state.signUp.gcs.length) { alert('학급을 등록해주세요.'); return false; }
  return true;
}

function addTag(type) {
  const input = document.getElementById(type === 'sub' ? 'subInput' : 'gcInput');
  const val = input?.value.trim();
  if (!val) return;
  const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
  if (!arr.includes(val)) { arr.push(val); renderTags(type); }
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

async function handleLogin() {
  const n = document.getElementById('loginName')?.value.trim();
  const p = document.getElementById('loginPin')?.value.trim();
  const { data } = await supabase.from('profiles').select('*').eq('name', n).eq('pin', p).maybeSingle();
  if (data) { state.user = data; localStorage.setItem('cf_user', JSON.stringify(data)); initApp(); }
  else alert('정보를 확인해주세요.');
}