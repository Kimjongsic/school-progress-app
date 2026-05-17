import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://내_프로젝트_주소.supabase.co'
const supabaseKey = '내_익명_Anon_KEY'
const supabase = createClient(supabaseUrl, supabaseKey)

let state = {
  user: JSON.parse(localStorage.getItem('cf_user')) || null,
  activeDate: new Date(),
  signUp: { step: 1, subs: [], gcs: [] },
  activeCell: null, 
  isSheetOpen: false
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
  showView('mainView');
  const userDisplay = document.getElementById('userNameDisplay');
  if (userDisplay) userDisplay.innerText = state.user.name;
  updateDateUI();
  fetchTimetable();
}

function initEvents() {
  document.getElementById('btnLogin')?.addEventListener('click', handleLogin);
  document.getElementById('btnOpenSignUp')?.addEventListener('click', () => {
    state.signUp = { step: 1, subs: [], gcs: [] };
    updateSignUpUI();
    showView('signUpContainer');
  });

  // 엔터 키 이벤트 확실하게 바인딩
  document.getElementById('subInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag('sub'); }});
  document.getElementById('gcInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag('gc'); }});

  document.getElementById('btnSignUpBack')?.addEventListener('click', () => {
    if (state.signUp.step > 1) { state.signUp.step--; updateSignUpUI(); }
  });

  // 다음 버튼 클릭 시 단계별 로직 (1단계 중복체크 포함)
  document.getElementById('btnNextStep')?.addEventListener('click', handleNextButton);

  document.getElementById('btnAddSub')?.addEventListener('click', () => addTag('sub'));
  document.getElementById('btnAddGc')?.addEventListener('click', () => addTag('gc'));
  document.getElementById('btnSaveProgress')?.addEventListener('click', saveProgress);
  document.querySelectorAll('.btnCloseSheet').forEach(btn => btn.addEventListener('click', () => toggleSheet(false)));
  document.getElementById('btnLogout')?.addEventListener('click', () => { localStorage.clear(); location.reload(); });
}

// 다음 버튼 통합 제어 로직
async function handleNextButton() {
  const currentStep = state.signUp.step;

  if (currentStep === 1) {
    const name = document.getElementById('regName')?.value.trim();
    const pin = document.getElementById('regPin')?.value.trim();
    if (!name || pin?.length !== 4) return alert('성함과 비밀번호 4자리를 확인해주세요.');

    // 1단계에서 즉시 중복 체크 수행
    showView('loadingView');
    const { data, error } = await supabase.from('profiles').select('name').eq('name', name).maybeSingle();
    showView('signUpContainer');

    if (error) return alert('데이터 조회 중 오류가 발생했습니다: ' + error.message);
    if (data) return alert('이미 사용 중인 이름입니다. 다른 이름을 입력해주세요.');

    // 중복 없으면 다음 단계로
    state.signUp.step++;
    updateSignUpUI();
  } 
  else if (currentStep < 4) {
    if (validateStep(currentStep)) { 
      state.signUp.step++; 
      updateSignUpUI(); 
    }
  } 
  else {
    handleFinalSignUpSubmit();
  }
}

function addTag(type) {
  const input = document.getElementById(type === 'sub' ? 'subInput' : 'gcInput');
  const val = input.value.trim();
  if (!val) return;
  const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
  if (!arr.includes(val)) { arr.push(val); renderTags(type); }
  input.value = '';
  input.focus();
}

function renderTags(type) {
  const container = document.getElementById(type === 'sub' ? 'subTagContainer' : 'gcTagContainer');
  const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
  if (container) {
    container.innerHTML = arr.map((tag, i) => `
      <div class="tag-chip flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-lg">
        <span>${tag}</span>
        <button onclick="window.removeTag('${type}', ${i})"><i class="fa-solid fa-xmark"></i></button>
      </div>`).join('');
  }
}

window.removeTag = (type, i) => {
  const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
  arr.splice(i, 1);
  renderTags(type);
};

function renderSetupGrid() {
  const body = document.getElementById('setupTableBody');
  if (!body) return;
  body.innerHTML = '';

  for (let p = 1; p <= 7; p++) {
    const row = document.createElement('tr');
    row.innerHTML = `<td class="header-cell text-center">${p}</td>` + 
      ['월','화','수','목','금'].map(d => `
      <td class="p-0">
        <button class="setup-in sub-cell border-b border-slate-100" data-day="${d}" data-p="${p}">과목</button>
        <button class="setup-in gc-cell" data-day="${d}" data-p="${p}">반</button>
      </td>`).join('');
    body.appendChild(row);
  }

  const subSec = document.getElementById('quickSubSection');
  const gcSec = document.getElementById('quickGcSection');
  
  if (subSec) subSec.innerHTML = state.signUp.subs.map((s, i) => `
    <button class="px-3 py-1.5 rounded-xl text-[11px] font-black text-white shadow-sm" style="background:${subPalette[i % subPalette.length]}" onclick="window.fillCell('sub', '${s}', '${subPalette[i % subPalette.length]}')">${s}</button>`).join('');
  
  if (gcSec) gcSec.innerHTML = state.signUp.gcs.map(g => {
    const color = gradePalette[g[0]] || gradePalette.default;
    return `<button class="px-3 py-1.5 rounded-xl text-[11px] font-black bg-white border-2" style="color:${color}; border-color:${color}" onclick="window.fillCell('gc', '${g}', '${color}')">${g}</button>`;
  }).join('');

  document.querySelectorAll('.setup-in').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.setup-in').forEach(b => b.classList.remove('active-cell'));
      btn.classList.add('active-cell');
      state.activeCell = { type: btn.classList.contains('sub-cell') ? 'sub' : 'gc', day: btn.dataset.day, p: btn.dataset.p };
    });
  });
}

// 자동 포커스 이동 기능 강화
window.fillCell = (type, val, color) => {
  if (!state.activeCell || state.activeCell.type !== type) return;
  
  const current = document.querySelector(`.${type}-cell[data-day="${state.activeCell.day}"][data-p="${state.activeCell.p}"]`);
  if (current) {
    current.innerText = val;
    if (type === 'sub') {
      current.style.background = color;
      current.classList.add('sub-filled');
      // 과목 입력 후 바로 아래 '반' 셀 자동 선택
      const nextGc = document.querySelector(`.gc-cell[data-day="${state.activeCell.day}"][data-p="${state.activeCell.p}"]`);
      if (nextGc) nextGc.click();
    } else {
      current.style.color = color;
      current.classList.add('gc-filled');
    }
  }
};

async function handleFinalSignUpSubmit() {
  const name = document.getElementById('regName')?.value.trim();
  const pin = document.getElementById('regPin')?.value.trim();
  showView('loadingView');

  // 최종 가입 처리 (1단계에서 중복체크를 이미 했으므로 여기서는 삽입만 수행)
  const { error } = await supabase.from('profiles').insert({ name, pin });
  if (error) {
    alert(`가입 중 오류가 발생했습니다: ${error.message}`);
    showView('signUpContainer');
    return;
  }

  const timetable = [];
  ['월','화','수','목','금'].forEach(d => {
    for (let p = 1; p <= 7; p++) {
      const sub = document.querySelector(`.sub-cell[data-day="${d}"][data-p="${p}"]`)?.innerText;
      const gc = document.querySelector(`.gc-cell[data-day="${d}"][data-p="${p}"]`)?.innerText;
      if (sub !== '과목' && gc !== '반') timetable.push({ user_name: name, day: d, period: p, subject: sub, grade_class: gc });
    }
  });
  if (timetable.length) await supabase.from('basic_timetable').insert(timetable);
  alert('가입이 성공적으로 완료되었습니다!'); location.reload();
}

function updateSignUpUI() {
  document.querySelectorAll('.signUpStep').forEach(s => s.classList.add('hidden'));
  document.getElementById(`step${state.signUp.step}`)?.classList.remove('hidden');
  document.getElementById('signUpProgress').style.width = `${(state.signUp.step / 4) * 100}%`;
  document.getElementById('btnNextStep').innerText = state.signUp.step === 4 ? '가입 완료' : '다음으로';
  if (state.signUp.step === 4) renderSetupGrid();
}

function validateStep(step) {
  if (step === 2 && !state.signUp.subs.length) { alert('과목을 하나 이상 등록해주세요.'); return false; }
  else if (step === 3 && !state.signUp.gcs.length) { alert('학급을 하나 이상 등록해주세요.'); return false; }
  return true;
}

async function handleLogin() {
  const n = document.getElementById('loginName')?.value.trim();
  const p = document.getElementById('loginPin')?.value.trim();
  const { data } = await supabase.from('profiles').select('*').eq('name', n).eq('pin', p).maybeSingle();
  if (data) { state.user = data; localStorage.setItem('cf_user', JSON.stringify(data)); initApp(); }
  else { alert('성함 혹은 비밀번호를 다시 확인해주세요.'); }
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
  list.innerHTML = basic.data?.length ? '' : `<div class="py-20 text-center text-slate-400 font-bold">수업이 없습니다.</div>`;
  for (const item of basic.data || []) {
    const { data: prev } = await supabase.from('lesson_records').select('content').eq('user_name', state.user.name).eq('grade_class', item.grade_class).eq('subject', item.subject).lt('date', dateStr).order('date', { ascending: false }).limit(1).maybeSingle();
    const today = records.data?.find(r => r.period == item.period);
    const card = document.createElement('div');
    card.className = "bg-white p-6 rounded-[32px] border border-slate-50 shadow-sm flex justify-between items-center active:scale-95 transition-transform cursor-pointer";
    card.innerHTML = `
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[9px] font-black bg-[#005CC5] text-white px-2 py-0.5 rounded-md uppercase tracking-tighter">${item.period}교시</span>
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

function toggleSheet(o) {
  const s = document.getElementById('inputSheet');
  if (s) s.style.transform = o ? 'translateY(0)' : 'translateY(100%)';
}

async function saveProgress() {
  const c = document.getElementById('progContent')?.value.trim();
  const n = document.getElementById('progNote')?.value.trim();
  const d = state.activeDate.toISOString().split('T')[0];
  if (!c) return;
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