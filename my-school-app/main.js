import { createClient } from '@supabase/supabase-js'

// 1. Supabase 연동 설정 (정보 입력 필수)
const supabaseUrl = 'https://gckplcpwrvabhqqohuib.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdja3BsY3B3cnZhYmhxcW9odWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDI3NTYsImV4cCI6MjA5NDQ3ODc1Nn0.rg9p24pmgeAIe6EcNZjIFEePXtpesnOnOZRlQKyUcuU'
const supabase = createClient(supabaseUrl, supabaseKey)

// --- 애플리케이션 상태 ---
let state = {
  user: JSON.parse(localStorage.getItem('cf_user')) || null,
  activeDate: new Date(),
  signUp: { step: 1, subs: [], gcs: [] },
  activeCell: null, // { day, period }
  isSheetOpen: false
};

// --- 초기 실행 ---
window.onload = () => {
  if (state.user) initApp();
  else showView('loginView');
  initEvents();
};

function initApp() {
  showView('mainView');
  const userDisplay = document.getElementById('userNameDisplay');
  if (userDisplay) userDisplay.innerText = state.user.name;
  updateDateUI();
  fetchTimetable();
}

function showView(id) {
  document.querySelectorAll('section, main, #loadingView').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById(id);
  if (target) target.classList.remove('hidden');
}

// --- 이벤트 리스너 ---
function initEvents() {
  document.getElementById('btnLogin')?.addEventListener('click', handleLogin);
  document.getElementById('btnOpenSignUp')?.addEventListener('click', () => {
    state.signUp = { step: 1, subs: [], gcs: [] };
    updateSignUpUI();
    showView('signUpContainer');
  });

  document.getElementById('btnSignUpBack')?.addEventListener('click', () => {
    if (state.signUp.step > 1) {
      state.signUp.step--;
      updateSignUpUI();
    }
  });

  document.getElementById('btnNextStep')?.addEventListener('click', () => {
    if (state.signUp.step < 4) {
      if (validateStep(state.signUp.step)) {
        state.signUp.step++;
        updateSignUpUI();
      }
    } else {
      handleFinalSignUpSubmit();
    }
  });

  // 태그 입력
  document.getElementById('subInput')?.addEventListener('keypress', (e) => { if(e.key === 'Enter') addTag('sub'); });
  document.getElementById('btnAddSub')?.addEventListener('click', () => addTag('sub'));
  document.getElementById('gcInput')?.addEventListener('keypress', (e) => { if(e.key === 'Enter') addTag('gc'); });
  document.getElementById('btnAddGc')?.addEventListener('click', () => addTag('gc'));

  // 기타 제어
  document.getElementById('datePicker')?.addEventListener('change', (e) => {
    state.activeDate = new Date(e.target.value);
    updateDateUI();
    fetchTimetable();
  });
  document.getElementById('btnSaveProgress')?.addEventListener('click', saveProgress);
  document.querySelectorAll('.btnCloseSheet').forEach(btn => btn.addEventListener('click', () => toggleSheet(false)));
  document.getElementById('btnLogout')?.addEventListener('click', () => { localStorage.clear(); location.reload(); });
}

// --- 가입 단계 UI 제어 ---
function updateSignUpUI() {
  document.querySelectorAll('.signUpStep').forEach(s => s.classList.add('hidden'));
  document.getElementById(`step${state.signUp.step}`)?.classList.remove('hidden');
  
  const progressEl = document.getElementById('signUpProgress');
  if (progressEl) progressEl.style.width = `${(state.signUp.step / 4) * 100}%`;
  
  const nextBtn = document.getElementById('btnNextStep');
  if (nextBtn) nextBtn.innerText = state.signUp.step === 4 ? '가입 완료' : '다음으로';

  // 4단계 진입 시 시간표 그리드 렌더링
  if (state.signUp.step === 4) renderSetupGrid();
}

function validateStep(step) {
  if (step === 1) {
    const name = document.getElementById('regName')?.value.trim();
    const pin = document.getElementById('regPin')?.value.trim();
    if (!name || pin?.length !== 4) { alert('성함과 4자리 비번을 입력해주세요.'); return false; }
  } else if (step === 2 && state.signUp.subs.length === 0) {
    alert('과목을 하나 이상 등록해주세요.'); return false;
  } else if (step === 3 && state.signUp.gcs.length === 0) {
    alert('반을 하나 이상 등록해주세요.'); return false;
  }
  return true;
}

// --- 태그 및 시간표 그리드 로직 ---
function addTag(type) {
  const input = document.getElementById(type === 'sub' ? 'subInput' : 'gcInput');
  const val = input.value.trim();
  if (!val) return;
  const targetArr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
  if (!targetArr.includes(val)) {
    targetArr.push(val);
    renderTags(type);
  }
  input.value = '';
}

function renderTags(type) {
  const container = document.getElementById(type === 'sub' ? 'subTagContainer' : 'gcTagContainer');
  const targetArr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
  if (container) {
    container.innerHTML = targetArr.map((tag, idx) => `
      <div class="tag-chip flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-bold">
        <span>${tag}</span>
        <button onclick="window.removeTag('${type}', ${idx})"><i class="fa-solid fa-xmark"></i></button>
      </div>`).join('');
  }
}

window.removeTag = (type, idx) => {
  const targetArr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
  targetArr.splice(idx, 1);
  renderTags(type);
};

// 시간표 그리드 생성
function renderSetupGrid() {
  const body = document.getElementById('setupTableBody');
  if (!body) return;
  body.innerHTML = '';

  for (let p = 1; p <= 7; p++) {
    const row = document.createElement('tr');
    row.innerHTML = `<td class="text-[10px] font-black text-slate-300 text-center">${p}</td>` + 
      ['월','화','수','목','금'].map(d => `
      <td>
        <div class="setup-cell flex flex-col gap-1">
          <button class="setup-in sub-cell" data-day="${d}" data-p="${p}">과목</button>
          <button class="setup-in gc-cell" data-day="${d}" data-p="${p}">반</button>
        </div>
      </td>`).join('');
    body.appendChild(row);
  }

  // 퀵 셀렉트 버튼 렌더링
  const subSec = document.getElementById('quickSubSection');
  const gcSec = document.getElementById('quickGcSection');
  if (subSec) subSec.innerHTML = state.signUp.subs.map(s => `<button class="quick-chip bg-white px-3 py-1.5 rounded-lg text-[11px] font-bold border border-blue-100" onclick="window.fillCell('sub', '${s}')">${s}</button>`).join('');
  if (gcSec) gcSec.innerHTML = state.signUp.gcs.map(g => `<button class="quick-chip bg-white px-3 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200" onclick="window.fillCell('gc', '${g}')">${g}</button>`).join('');

  // 셀 클릭 이벤트
  document.querySelectorAll('.setup-in').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.setup-in').forEach(b => b.classList.remove('active-cell'));
      btn.classList.add('active-cell');
      state.activeCell = { type: btn.classList.contains('sub-cell') ? 'sub' : 'gc', day: btn.dataset.day, p: btn.dataset.p };
    });
  });
}

window.fillCell = (type, val) => {
  if (!state.activeCell || state.activeCell.type !== type) return;
  const target = document.querySelector(`.${type}-cell[data-day="${state.activeCell.day}"][data-p="${state.activeCell.p}"]`);
  if (target) {
    target.innerText = val;
    target.style.color = '#005CC5';
  }
};

// --- 최종 가입 및 데이터 저장 ---
async function handleFinalSignUpSubmit() {
  const name = document.getElementById('regName')?.value.trim();
  const pin = document.getElementById('regPin')?.value.trim();
  showView('loadingView');

  // 1. 프로필 생성
  const { error: profError } = await supabase.from('profiles').insert({ name, pin });
  if (profError) { alert('이미 가입된 이름입니다.'); showView('signUpContainer'); return; }

  // 2. 시간표 데이터 수집
  const timetableData = [];
  ['월','화','수','목','금'].forEach(d => {
    for (let p = 1; p <= 7; p++) {
      const sub = document.querySelector(`.sub-cell[data-day="${d}"][data-p="${p}"]`)?.innerText;
      const gc = document.querySelector(`.gc-cell[data-day="${d}"][data-p="${p}"]`)?.innerText;
      if (sub !== '과목' && gc !== '반') {
        timetableData.push({ user_name: name, day: d, period: p, subject: sub, grade_class: gc });
      }
    }
  });

  // 3. 시간표 저장
  if (timetableData.length > 0) {
    await supabase.from('basic_timetable').insert(timetableData);
  }

  alert('가입이 완료되었습니다! 로그인해주세요.');
  location.reload();
}

// --- 로그인 및 대시보드 로직 ---
async function handleLogin() {
  const name = document.getElementById('loginName')?.value.trim();
  const pin = document.getElementById('loginPin')?.value.trim();
  const { data } = await supabase.from('profiles').select('*').eq('name', name).eq('pin', pin).maybeSingle();
  if (data) {
    state.user = data;
    localStorage.setItem('cf_user', JSON.stringify(data));
    initApp();
  } else alert('정보를 다시 확인해주세요.');
}

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
    card.innerHTML = `
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[9px] font-black bg-[#005CC5] text-white px-2 py-0.5 rounded-md uppercase tracking-tighter">${item.period}P</span>
          <span class="text-[10px] font-black text-slate-300 uppercase">${item.grade_class}</span>
        </div>
        <h4 class="text-xl font-black text-slate-900">${item.subject}</h4>
        <p class="text-[11px] font-bold text-slate-400 mt-2">이전: <span class="text-slate-600">${prev?.content || '-'}</span></p>
      </div>
      <div class="w-14 h-14 rounded-[22px] ${today ? 'bg-blue-50 text-[#005CC5]' : 'bg-slate-50 text-slate-200'} flex items-center justify-center text-2xl">
        <i class="fa-solid ${today ? 'fa-check-circle' : 'fa-plus-circle'}"></i>
      </div>`;
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
  const sheet = document.getElementById('inputSheet');
  if (sheet) sheet.style.transform = open ? 'translateY(0)' : 'translateY(100%)';
}

async function saveProgress() {
  const content = document.getElementById('progContent')?.value.trim();
  const note = document.getElementById('progNote')?.value.trim();
  const dateStr = state.activeDate.toISOString().split('T')[0];
  if (!content) return alert('진도를 입력해주세요.');

  await supabase.from('lesson_records').upsert({
    user_name: state.user.name, date: dateStr, period: state.selectedItem.period,
    grade_class: state.selectedItem.grade_class, subject: state.selectedItem.subject,
    content, note: note || '-'
  }, { onConflict: 'user_name, date, period, grade_class, subject' });

  toggleSheet(false);
  fetchTimetable();
}

function updateDateUI() {
  const display = document.getElementById('currentDateDisplay');
  if (display) display.innerText = state.activeDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
}