import { createClient } from '@supabase/supabase-js'

// 1. Supabase 연동 설정 (본인의 정보로 변경 필수)
const supabaseUrl = 'https://gckplcpwrvabhqqohuib.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdja3BsY3B3cnZhYmhxcW9odWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDI3NTYsImV4cCI6MjA5NDQ3ODc1Nn0.rg9p24pmgeAIe6EcNZjIFEePXtpesnOnOZRlQKyUcuU'
const supabase = createClient(supabaseUrl, supabaseKey)

// --- 애플리케이션 상태 관리 ---
let state = {
  user: JSON.parse(localStorage.getItem('cf_user')) || null,
  activeDate: new Date(),
  signUp: { step: 1, subs: [], gcs: [] },
  selectedItem: null,
  isSheetOpen: false
};

// --- 초기 실행 ---
window.onload = () => {
  if (state.user) {
    initApp();
  } else {
    showView('loginView');
  }
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

// --- 이벤트 리스너 (빌드 오류 해결 포인트) ---
function initEvents() {
  // 로그인 및 가입 전환
  document.getElementById('btnLogin')?.addEventListener('click', handleLogin);
  document.getElementById('btnOpenSignUp')?.addEventListener('click', () => {
    state.signUp = { step: 1, subs: [], gcs: [] };
    updateSignUpUI();
    showView('signUpContainer');
  });

  // 회원가입 단계 이동 및 뒤로 가기
  document.getElementById('btnSignUpBack')?.addEventListener('click', () => {
    if (state.signUp.step > 1) {
      state.signUp.step--;
      updateSignUpUI();
    }
  });
  document.getElementById('btnSignUpClose')?.addEventListener('click', () => showView('loginView'));
  
  document.getElementById('btnNextStep')?.addEventListener('click', () => {
    if (state.signUp.step < 3) {
      if (validateStep(state.signUp.step)) {
        state.signUp.step++;
        updateSignUpUI();
      }
    } else {
      handleFinalSignUp();
    }
  });

  // 태그 입력 제어
  document.getElementById('subInput')?.addEventListener('keypress', (e) => { if(e.key === 'Enter') addTag('sub'); });
  document.getElementById('btnAddSub')?.addEventListener('click', () => addTag('sub'));
  document.getElementById('gcInput')?.addEventListener('keypress', (e) => { if(e.key === 'Enter') addTag('gc'); });
  document.getElementById('btnAddGc')?.addEventListener('click', () => addTag('gc'));

  // 날짜 및 시트 제어
  document.getElementById('datePicker')?.addEventListener('change', (e) => {
    state.activeDate = new Date(e.target.value);
    updateDateUI();
    fetchTimetable();
  });
  document.getElementById('btnPrevDate')?.addEventListener('click', () => moveDate(-1));
  document.getElementById('btnNextDate')?.addEventListener('click', () => moveDate(1));
  
  document.getElementById('btnSaveProgress')?.addEventListener('click', saveProgress);
  document.querySelectorAll('.btnCloseSheet').forEach(btn => {
    btn.addEventListener('click', () => toggleSheet(false));
  });

  // 로그아웃 (에러 발생했던 라인 수정 완료)
  document.getElementById('btnLogout')?.addEventListener('click', () => {
    localStorage.clear();
    location.reload();
  });
}

// --- 태그 시스템 로직 ---
function addTag(type) {
  const inputId = type === 'sub' ? 'subInput' : 'gcInput';
  const input = document.getElementById(inputId);
  if (!input) return;
  
  const val = input.value.trim();
  if (!val) return;

  const targetArr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
  if (!targetArr.includes(val)) {
    targetArr.push(val);
    renderTags(type);
  }
  input.value = '';
  input.focus();
}

function renderTags(type) {
  const containerId = type === 'sub' ? 'subTagContainer' : 'gcTagContainer';
  const container = document.getElementById(containerId);
  const targetArr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
  
  if (!container) return;

  container.innerHTML = targetArr.map((tag, idx) => `
    <div class="tag-chip flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg">
      <span>${tag}</span>
      <button onclick="window.removeTag('${type}', ${idx})" class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `).join('');
}

// 태그 삭제를 전역 함수로 노출
window.removeTag = (type, idx) => {
  const targetArr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
  targetArr.splice(idx, 1);
  renderTags(type);
};

// --- 회원가입 UI 및 검증 ---
function updateSignUpUI() {
  document.querySelectorAll('.signUpStep').forEach(s => s.classList.add('hidden'));
  const currentStepEl = document.getElementById(`step${state.signUp.step}`);
  if (currentStepEl) currentStepEl.classList.remove('hidden');
  
  const progressEl = document.getElementById('signUpProgress');
  if (progressEl) progressEl.style.width = `${(state.signUp.step / 3) * 100}%`;
  
  const nextBtn = document.getElementById('btnNextStep');
  if (nextBtn) nextBtn.innerText = state.signUp.step === 3 ? '가입 완료' : '다음으로';
  
  const backBtn = document.getElementById('btnSignUpBack');
  if (backBtn) backBtn.style.visibility = state.signUp.step === 1 ? 'hidden' : 'visible';
}

function validateStep(step) {
  if (step === 1) {
    const name = document.getElementById('regName')?.value.trim();
    const pin = document.getElementById('regPin')?.value.trim();
    if (!name || pin?.length !== 4) { alert('이름과 4자리 비밀번호를 입력해주세요.'); return false; }
  } else if (step === 2 && state.signUp.subs.length === 0) {
    alert('최소 하나의 과목을 등록해주세요.'); return false;
  }
  return true;
}

// --- 데이터 로직 ---
async function fetchTimetable() {
  const dateStr = state.activeDate.toISOString().split('T')[0];
  const dayName = ['일', '월', '화', '수', '목', '금', '토'][state.activeDate.getDay()];
  const list = document.getElementById('timetableList');
  if (!list) return;

  list.innerHTML = `<div class="py-20 text-center"><i class="fa-solid fa-circle-notch fa-spin text-2xl text-slate-200"></i></div>`;

  const [basic, records] = await Promise.all([
    supabase.from('basic_timetable').select('*').eq('user_name', state.user.name).eq('day', dayName),
    supabase.from('lesson_records').select('*').eq('user_name', state.user.name).eq('date', dateStr)
  ]);

  if (!basic.data?.length) {
    list.innerHTML = `<div class="py-20 text-center text-slate-400 font-bold">수업이 없는 날입니다 ☕️</div>`;
    return;
  }

  list.innerHTML = '';
  for (const item of basic.data) {
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
      </div>
    `;
    card.addEventListener('click', () => {
      state.selectedItem = item;
      const sheetBadge = document.getElementById('sheetBadge');
      const sheetTitle = document.getElementById('sheetTitle');
      const prevText = document.getElementById('prevProgressText');
      const progIn = document.getElementById('progContent');
      const noteIn = document.getElementById('progNote');
      
      if(sheetBadge) sheetBadge.innerText = item.grade_class;
      if(sheetTitle) sheetTitle.innerText = `${item.subject} 진도 기록`;
      if(prevText) prevText.innerText = prev?.content || '첫 번째 수업 기록입니다.';
      if(progIn) progIn.value = today ? today.content : '';
      if(noteIn) noteIn.value = today ? today.note : '';
      toggleSheet(true);
    });
    list.appendChild(card);
  }
}

function toggleSheet(open) {
  const sheet = document.getElementById('inputSheet');
  if (!sheet) return;
  state.isSheetOpen = open;
  sheet.style.transform = open ? 'translateY(0)' : 'translateY(100%)';
}

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

async function handleFinalSignUp() {
  const name = document.getElementById('regName')?.value.trim();
  const pin = document.getElementById('regPin')?.value.trim();
  showView('loadingView');
  
  const { error } = await supabase.from('profiles').insert({ name, pin });
  if (error) { alert('이미 가입된 이름입니다.'); showView('signUpContainer'); return; }
  
  alert('환영합니다! 로그인해 주세요.');
  location.reload();
}

async function saveProgress() {
  const content = document.getElementById('progContent')?.value.trim();
  const note = document.getElementById('progNote')?.value.trim();
  const dateStr = state.activeDate.toISOString().split('T')[0];
  if (!content) return alert('진도 내용을 입력해 주세요.');

  await supabase.from('lesson_records').upsert({
    user_name: state.user.name, date: dateStr, period: state.selectedItem.period,
    grade_class: state.selectedItem.grade_class, subject: state.selectedItem.subject,
    content, note: note || '-'
  }, { onConflict: 'user_name, date, period, grade_class, subject' });

  toggleSheet(false);
  fetchTimetable();
}

function updateDateUI() {
  const dateDisplay = document.getElementById('currentDateDisplay');
  if (dateDisplay) {
    const options = { month: 'long', day: 'numeric', weekday: 'long' };
    dateDisplay.innerText = state.activeDate.toLocaleDateString('ko-KR', options);
  }
}

function moveDate(offset) {
  state.activeDate.setDate(state.activeDate.getDate() + offset);
  updateDateUI();
  fetchTimetable();
}