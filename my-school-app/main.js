import { createClient } from '@supabase/supabase-js'

// 1. Supabase 연동 설정 (본인 정보로 변경)
const supabaseUrl = 'https://gckplcpwrvabhqqohuib.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdja3BsY3B3cnZhYmhxcW9odWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDI3NTYsImV4cCI6MjA5NDQ3ODc1Nn0.rg9p24pmgeAIe6EcNZjIFEePXtpesnOnOZRlQKyUcuU'
const supabase = createClient(supabaseUrl, supabaseKey)

// --- 애플리케이션 상태 관리 ---
let state = {
  user: JSON.parse(localStorage.getItem('cf_user')) || null,
  activeDate: new Date(),
  timetable: [],
  selectedItem: null,
  isSheetOpen: false
};

// --- DOM 초기화 및 이벤트 ---
window.onload = () => {
  if (state.user) {
    initApp();
  } else {
    showView('loginView');
  }
  bindEvents();
};

function initApp() {
  showView('mainView');
  document.getElementById('userNameDisplay').innerText = state.user.name;
  updateDateUI();
  fetchDailyData();
}

function showView(id) {
  document.querySelectorAll('section, main').forEach(v => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function bindEvents() {
  // 로그인 & 가입
  document.getElementById('btnLogin').onclick = handleLogin;
  document.getElementById('btnOpenSignUp').onclick = () => showView('signUpView');
  document.querySelectorAll('.btnCloseSignUp').forEach(btn => btn.onclick = () => showView('loginView'));
  
  // 가입 단계 전환
  document.querySelectorAll('.btnNextStep').forEach(btn => {
    btn.onclick = () => {
      const nextId = btn.dataset.next;
      document.querySelectorAll('.signUpStep').forEach(s => s.classList.add('hidden'));
      document.getElementById(nextId).classList.remove('hidden');
      document.getElementById('signUpProgress').style.width = nextId === 'step2' ? '66%' : '100%';
    };
  });

  document.getElementById('btnFinalSignUp').onclick = handleSignUp;

  // 날짜 변경
  document.getElementById('datePicker').onchange = (e) => {
    state.activeDate = new Date(e.target.value);
    updateDateUI();
    fetchDailyData();
  };

  // 시트 제어
  document.querySelectorAll('.btnCloseSheet').forEach(btn => btn.onclick = toggleInputSheet);
  document.getElementById('btnSaveProgress').onclick = saveProgress;
  document.getElementById('btnLogout').onclick = () => {
    localStorage.removeItem('cf_user');
    location.reload();
  };

  // 설정 이동 (시간표)
  document.getElementById('btnOpenSetup').onclick = () => alert('시간표 관리 기능은 업데이트 예정입니다.');
}

// --- 로직: 데이터 가져오기 ---
async function fetchDailyData() {
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayNames[state.activeDate.getDay()];
  const dateStr = state.activeDate.toISOString().split('T')[0];

  const listContainer = document.getElementById('timetableList');
  listContainer.innerHTML = `<div class="py-20 text-center text-slate-300"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></div>`;

  // 1. 시간표 + 당일 진도 병합 조회
  const [basicRes, recordRes] = await Promise.all([
    supabase.from('basic_timetable').select('*').eq('user_name', state.user.name).eq('day', dayName),
    supabase.from('lesson_records').select('*').eq('user_name', state.user.name).eq('date', dateStr)
  ]);

  if (!basicRes.data?.length) {
    listContainer.innerHTML = `<div class="py-20 text-center text-slate-400 font-medium">오늘은 수업이 없습니다 🎉</div>`;
    return;
  }

  listContainer.innerHTML = '';
  
  for (const item of basicRes.data) {
    // 2. 각 반의 이전 진도 조회 (최신 1건)
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
    renderClassCard(item, prev?.content, todayRec);
  }
}

function renderClassCard(item, prevContent, todayRec) {
  const card = document.createElement('div');
  card.className = "bg-white p-5 rounded-[28px] shadow-sm border border-slate-100 flex justify-between items-center active:scale-95 transition-transform cursor-pointer";
  card.innerHTML = `
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-[10px] font-black bg-slate-900 text-white px-2 py-0.5 rounded-md uppercase tracking-tighter">${item.period}P</span>
        <span class="text-xs font-bold text-slate-400">${item.grade_class}</span>
      </div>
      <h4 class="text-lg font-bold text-slate-900 mb-1">${item.subject}</h4>
      <p class="text-xs font-medium text-slate-400">마지막 진도: <span class="text-slate-600">${prevContent || '기록 없음'}</span></p>
    </div>
    <div class="w-12 h-12 rounded-2xl ${todayRec ? 'bg-blue-50 text-[#005CC5]' : 'bg-slate-50 text-slate-300'} flex items-center justify-center text-xl">
      <i class="fa-solid ${todayRec ? 'fa-check-double' : 'fa-pen-to-square'}"></i>
    </div>
  `;
  card.onclick = () => openSheet(item, prevContent, todayRec);
  document.getElementById('timetableList').appendChild(card);
}

// --- 시트 제어 ---
function openSheet(item, prev, today) {
  state.selectedItem = item;
  document.getElementById('sheetBadge').innerText = `${item.period}교시 | ${item.grade_class}`;
  document.getElementById('sheetTitle').innerText = `${item.subject} 진도 기록`;
  document.getElementById('prevProgressText').innerText = prev || '기존 기록이 없습니다.';
  document.getElementById('progContent').value = today ? today.content : '';
  document.getElementById('progNote').value = today ? today.note : '';
  toggleInputSheet(true);
}

function toggleInputSheet(forceOpen = false) {
  const sheet = document.getElementById('inputSheet');
  state.isSheetOpen = typeof forceOpen === 'boolean' ? forceOpen : !state.isSheetOpen;
  sheet.style.transform = state.isSheetOpen ? 'translateY(0)' : 'translateY(100%)';
}

// --- 로직: 저장 및 인증 ---
async function saveProgress() {
  const content = document.getElementById('progContent').value.trim();
  const note = document.getElementById('progNote').value.trim();
  const dateStr = state.activeDate.toISOString().split('T')[0];

  if (!content) return alert('진도 내용을 입력해 주세요.');

  const { error } = await supabase.from('lesson_records').upsert({
    user_name: state.user.name,
    date: dateStr,
    period: state.selectedItem.period,
    grade_class: state.selectedItem.grade_class,
    subject: state.selectedItem.subject,
    content,
    note: note || '-'
  }, { onConflict: 'user_name, date, period, grade_class, subject' });

  if (!error) {
    toggleInputSheet(false);
    fetchDailyData();
  }
}

async function handleLogin() {
  const name = document.getElementById('loginName').value.trim();
  const pin = document.getElementById('loginPin').value.trim();
  const { data } = await supabase.from('profiles').select('*').eq('name', name).eq('pin', pin).maybeSingle();
  
  if (data) {
    state.user = data;
    localStorage.setItem('cf_user', JSON.stringify(data));
    initApp();
  } else alert('로그인 정보를 확인해주세요.');
}

async function handleSignUp() {
  const name = document.getElementById('regName').value.trim();
  const pin = document.getElementById('regPin').value.trim();
  const subs = document.getElementById('regSubs').value.split(',').map(s => s.trim()).filter(s => s);
  const gcs = document.getElementById('regGcs').value.split(',').map(g => g.trim()).filter(g => g);

  const { error } = await supabase.from('profiles').insert({ name, pin });
  if (error) return alert('이미 가입된 이름입니다.');

  alert('가입되었습니다! 로그인해 주세요.');
  location.reload();
}

function updateDateUI() {
  const options = { month: 'long', day: 'numeric', weekday: 'short' };
  document.getElementById('currentDateDisplay').innerText = state.activeDate.toLocaleDateString('ko-KR', options);
}