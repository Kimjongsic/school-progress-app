import { createClient } from '@supabase/supabase-js'

// 1. Supabase 설정 (정보 입력 필수)
const supabaseUrl = 'https://gckplcpwrvabhqqohuib.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdja3BsY3B3cnZhYmhxcW9odWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDI3NTYsImV4cCI6MjA5NDQ3ODc1Nn0.rg9p24pmgeAIe6EcNZjIFEePXtpesnOnOZRlQKyUcuU'
const supabase = createClient(supabaseUrl, supabaseKey)

// --- 애플리케이션 상태 ---
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
  document.getElementById('userNameDisplay').innerText = state.user.name;
  updateDateUI();
  fetchTimetable();
}

function showView(id) {
  document.querySelectorAll('section, main, #loadingView').forEach(v => v.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

function initEvents() {
  // 로그인 & 가입 전환
  document.getElementById('btnLogin')?.addEventListener('click', handleLogin);
  document.getElementById('btnOpenSignUp')?.addEventListener('click', () => {
    state.signUp = { step: 1, subs: [], gcs: [] };
    updateSignUpUI();
    showView('signUpContainer');
  });

  // 회원가입 단계 이동
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

  // 과목 태그 입력 (엔터 & 플러스 버튼)
  const subIn = document.getElementById('subInput');
  subIn?.addEventListener('keypress', (e) => { if(e.key === 'Enter') addTag('sub'); });
  document.getElementById('btnAddSub')?.addEventListener('click', () => addTag('sub'));

  // 학급 태그 입력 (엔터 & 플러스 버튼)
  const gcIn = document.getElementById('gcInput');
  gcIn?.addEventListener('keypress', (e) => { if(e.key === 'Enter') addTag('gc'); });
  document.getElementById('btnAddGc')?.addEventListener('click', () => addTag('gc'));

  // 날짜 & 기타 제어
  document.getElementById('datePicker')?.addEventListener('change', (e) => {
    state.activeDate = new Date(e.target.value);
    updateDateUI();
    fetchTimetable();
  });

  document.getElementById('btnSaveProgress')?.addEventListener('click', saveProgress);
  document.querySelectorAll('.btnCloseSheet').forEach(btn => btn.onclick = () => toggleSheet(false));
  document.getElementById('btnLogout')?.onclick = () => { localStorage.clear(); location.reload(); };
}

// --- 태그 시스템 로직 ---
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
  input.focus();
}

function renderTags(type) {
  const container = document.getElementById(type === 'sub' ? 'subTagContainer' : 'gcTagContainer');
  const targetArr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
  
  container.innerHTML = targetArr.map((tag, idx) => `
    <div class="tag-chip flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-slate-100">
      <span>${tag}</span>
      <button onclick="removeTag('${type}', ${idx})" class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `).join('');
}

window.removeTag = (type, idx) => {
  const targetArr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
  targetArr.splice(idx, 1);
  renderTags(type);
};

// --- 회원가입 UI 및 검증 ---
function updateSignUpUI() {
  document.querySelectorAll('.signUpStep').forEach(s => s.classList.add('hidden'));
  document.getElementById(`step${state.signUp.step}`).classList.remove('hidden');
  
  const progress = (state.signUp.step / 3) * 100;
  document.getElementById('signUpProgress').style.width = `${progress}%`;
  document.getElementById('btnNextStep').innerText = state.signUp.step === 3 ? '가입 완료' : '다음으로';
  document.getElementById('btnSignUpBack').style.visibility = state.signUp.step === 1 ? 'hidden' : 'visible';
}

function validateStep(step) {
  if (step === 1) {
    const name = document.getElementById('regName').value.trim();
    const pin = document.getElementById('regPin').value.trim();
    if (!name || pin.length !== 4) { alert('이름과 4자리 비밀번호를 입력해주세요.'); return false; }
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
        <p class="text-[11px] font-bold text-slate-400 mt-2 line-clamp-1">마지막: <span class="text-slate-600">${prev?.content || '-'}</span></p>
      </div>
      <div class="w-14 h-14 rounded-[22px] ${today ? 'bg-blue-50 text-[#005CC5]' : 'bg-slate-50 text-slate-200'} flex items-center justify-center text-2xl">
        <i class="fa-solid ${today ? 'fa-check-circle' : 'fa-plus-circle'}"></i>
      </div>
    `;
    card.onclick = () => {
      state.selectedItem = item;
      document.getElementById('sheetBadge').innerText = item.grade_class;
      document.getElementById('sheetTitle').innerText = `${item.subject} 진도 기록`;
      document.getElementById('prevProgressText').innerText = prev?.content || '첫 번째 수업 기록입니다.';
      document.getElementById('progContent').value = today ? today.content : '';
      document.getElementById('progNote').value = today ? today.note : '';
      toggleSheet(true);
    };
    list.appendChild(card);
  }
}

function toggleSheet(open) {
  state.isSheetOpen = open;
  document.getElementById('inputSheet').style.transform = open ? 'translateY(0)' : 'translateY(100%)';
}

async function handleLogin() {
  const name = document.getElementById('loginName').value.trim();
  const pin = document.getElementById('loginPin').value.trim();
  const { data } = await supabase.from('profiles').select('*').eq('name', name).eq('pin', pin).maybeSingle();
  if (data) {
    state.user = data;
    localStorage.setItem('cf_user', JSON.stringify(data));
    initApp();
  } else alert('정보를 다시 확인해주세요.');
}

async function handleFinalSignUp() {
  const name = document.getElementById('regName').value.trim();
  const pin = document.getElementById('regPin').value.trim();
  showView('loadingView');
  
  const { error } = await supabase.from('profiles').insert({ name, pin });
  if (error) { alert('이미 가입된 이름입니다.'); showView('signUpContainer'); return; }
  
  alert('환영합니다! 로그인해 주세요.');
  location.reload();
}

async function saveProgress() {
  const content = document.getElementById('progContent').value.trim();
  const note = document.getElementById('progNote').value.trim();
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
  const options = { month: 'long', day: 'numeric', weekday: 'long' };
  document.getElementById('currentDateDisplay').innerText = state.activeDate.toLocaleDateString('ko-KR', options);
}