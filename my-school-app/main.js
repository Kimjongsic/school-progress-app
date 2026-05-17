import { createClient } from '@supabase/supabase-js'

// 1. Supabase 설정 (본인 프로젝트 정보 입력)
const supabaseUrl = 'https://gckplcpwrvabhqqohuib.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdja3BsY3B3cnZhYmhxcW9odWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDI3NTYsImV4cCI6MjA5NDQ3ODc1Nn0.rg9p24pmgeAIe6EcNZjIFEePXtpesnOnOZRlQKyUcuU'
const supabase = createClient(supabaseUrl, supabaseKey)

// --- 앱 상태 관리 ---
let state = {
  user: JSON.parse(localStorage.getItem('cf_user')) || null,
  activeDate: new Date(),
  currentSignUpStep: 1,
  isSheetOpen: false,
  selectedItem: null
};

// --- 초기화 ---
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
  document.getElementById(id).classList.remove('hidden');
}

function initEvents() {
  // 로그인 및 회원가입 오픈
  document.getElementById('btnLogin')?.addEventListener('click', handleLogin);
  document.getElementById('btnOpenSignUp')?.addEventListener('click', () => {
    state.currentSignUpStep = 1;
    updateSignUpUI();
    showView('signUpContainer');
  });

  // 회원가입 프로세스 제어 (이전/다음/닫기)
  document.getElementById('btnSignUpBack')?.addEventListener('click', () => {
    if (state.currentSignUpStep > 1) {
      state.currentSignUpStep--;
      updateSignUpUI();
    }
  });

  document.getElementById('btnSignUpClose')?.addEventListener('click', () => showView('loginView'));

  document.getElementById('btnNextStep')?.addEventListener('click', () => {
    if (state.currentSignUpStep < 3) {
      if (validateSignUpStep(state.currentSignUpStep)) {
        state.currentSignUpStep++;
        updateSignUpUI();
      }
    } else {
      handleSignUpSubmit();
    }
  });

  // 날짜 제어
  document.getElementById('datePicker')?.addEventListener('change', (e) => {
    state.activeDate = new Date(e.target.value);
    updateDateUI();
    fetchTimetable();
  });

  // 시트 및 로그아웃
  document.querySelectorAll('.btnCloseSheet').forEach(btn => {
    btn.addEventListener('click', () => toggleSheet(false));
  });

  document.getElementById('btnSaveProgress')?.addEventListener('click', saveProgress);
  
  document.getElementById('btnLogout')?.addEventListener('click', () => {
    localStorage.removeItem('cf_user');
    location.reload();
  });
}

// --- 회원가입 UI 업데이트 로직 ---
function updateSignUpUI() {
  document.querySelectorAll('.signUpStep').forEach(s => s.classList.add('hidden'));
  document.getElementById(`step${state.currentSignUpStep}`).classList.remove('hidden');
  
  // 프로그레스 바 & 버튼 텍스트
  const progress = (state.currentSignUpStep / 3) * 100;
  document.getElementById('signUpProgress').style.width = `${progress}%`;
  document.getElementById('btnNextStep').innerText = state.currentSignUpStep === 3 ? '가입 완료' : '다음으로';
  
  // 1단계에서는 '뒤로 가기' 아이콘 숨김
  document.getElementById('btnSignUpBack').style.visibility = state.currentSignUpStep === 1 ? 'hidden' : 'visible';
}

function validateSignUpStep(step) {
  if (step === 1) {
    const name = document.getElementById('regName').value.trim();
    const pin = document.getElementById('regPin').value.trim();
    if (!name || pin.length !== 4) {
      alert('이름과 4자리 비밀번호를 입력해주세요.');
      return false;
    }
  } else if (step === 2) {
    const subs = document.getElementById('regSubs').value.trim();
    if (!subs) {
      alert('최소 하나의 과목을 입력해주세요.');
      return false;
    }
  }
  return true;
}

// --- 데이터 로직 ---
async function fetchTimetable() {
  const dateStr = state.activeDate.toISOString().split('T')[0];
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayNames[state.activeDate.getDay()];

  const listContainer = document.getElementById('timetableList');
  listContainer.innerHTML = `<div class="py-20 text-center text-slate-300"><i class="fa-solid fa-circle-notch fa-spin text-2xl"></i></div>`;

  const [basicRes, recordRes] = await Promise.all([
    supabase.from('basic_timetable').select('*').eq('user_name', state.user.name).eq('day', dayName),
    supabase.from('lesson_records').select('*').eq('user_name', state.user.name).eq('date', dateStr)
  ]);

  if (!basicRes.data?.length) {
    listContainer.innerHTML = `<div class="py-20 text-center text-slate-400 font-bold">수업이 없는 날입니다 ☕️</div>`;
    return;
  }

  listContainer.innerHTML = '';
  
  for (const item of basicRes.data) {
    const { data: prev } = await supabase
      .from('lesson_records')
      .select('content')
      .eq('user_name', state.user.name)
      .eq('grade_class', item.grade_class)
      .eq('subject', item.subject)
      .lt('date', dateStr)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const todayRec = recordRes.data?.find(r => r.period == item.period);
    createCard(item, prev?.content, todayRec);
  }
}

function createCard(item, prev, today) {
  const card = document.createElement('div');
  card.className = "bg-white p-5 rounded-[28px] shadow-sm border border-slate-50 flex justify-between items-center active:scale-95 transition-transform cursor-pointer";
  card.innerHTML = `
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-[9px] font-black bg-slate-900 text-white px-1.5 py-0.5 rounded uppercase">${item.period}P</span>
        <span class="text-xs font-bold text-slate-300">${item.grade_class}</span>
      </div>
      <h4 class="text-lg font-black text-slate-800">${item.subject}</h4>
      <p class="text-[11px] font-bold text-slate-400 mt-1">이전: <span class="text-slate-600">${prev || '-'}</span></p>
    </div>
    <div class="w-12 h-12 rounded-2xl ${today ? 'bg-blue-50 text-[#005CC5]' : 'bg-slate-50 text-slate-200'} flex items-center justify-center text-xl">
      <i class="fa-solid ${today ? 'fa-check-double' : 'fa-feather-pointed'}"></i>
    </div>
  `;
  card.onclick = () => {
    state.selectedItem = item;
    document.getElementById('sheetBadge').innerText = `${item.period}교시 | ${item.grade_class}`;
    document.getElementById('sheetTitle').innerText = `${item.subject} 진도 기록`;
    document.getElementById('prevProgressText').innerText = prev || '첫 수업 기록입니다.';
    document.getElementById('progContent').value = today ? today.content : '';
    document.getElementById('progNote').value = today ? today.note : '';
    toggleSheet(true);
  };
  document.getElementById('timetableList').appendChild(card);
}

function toggleSheet(open) {
  state.isSheetOpen = open;
  document.getElementById('inputSheet').style.transform = open ? 'translateY(0)' : 'translateY(100%)';
}

// --- 인증 및 저장 로직 ---
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

async function handleSignUpSubmit() {
  const name = document.getElementById('regName').value.trim();
  const pin = document.getElementById('regPin').value.trim();
  showView('loadingView');

  const { error } = await supabase.from('profiles').insert({ name, pin });
  if (error) {
    alert('이미 사용 중인 이름입니다.');
    showView('signUpContainer');
    return;
  }
  
  alert('가입되었습니다! 로그인해주세요.');
  location.reload();
}

async function saveProgress() {
  const content = document.getElementById('progContent').value.trim();
  const note = document.getElementById('progNote').value.trim();
  const dateStr = state.activeDate.toISOString().split('T')[0];

  if (!content) return alert('진도를 입력해주세요.');

  await supabase.from('lesson_records').upsert({
    user_name: state.user.name,
    date: dateStr,
    period: state.selectedItem.period,
    grade_class: state.selectedItem.grade_class,
    subject: state.selectedItem.subject,
    content,
    note: note || '-'
  }, { onConflict: 'user_name, date, period, grade_class, subject' });

  toggleSheet(false);
  fetchTimetable();
}

function updateDateUI() {
  const options = { month: 'long', day: 'numeric', weekday: 'short' };
  document.getElementById('currentDateDisplay').innerText = state.activeDate.toLocaleDateString('ko-KR', options);
}