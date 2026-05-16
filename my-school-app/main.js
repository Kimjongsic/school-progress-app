import { createClient } from '@supabase/supabase-js'

// 1. Supabase 연동 설정 (★본인의 Supabase 정보로 변경 필수★)
const supabaseUrl = 'https://gckplcpwrvabhqqohuib.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdja3BsY3B3cnZhYmhxcW9odWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDI3NTYsImV4cCI6MjA5NDQ3ODc1Nn0.rg9p24pmgeAIe6EcNZjIFEePXtpesnOnOZRlQKyUcuU'
const supabase = createClient(supabaseUrl, supabaseKey)

// 전역 상태 관리 변수
let currentUser = null;
let selectedTimetableItem = null;

// DOM 엘리먼트 캐싱 (화면 및 모달)
const views = {
  login: document.getElementById('login-view'),
  signup: document.getElementById('signup-view'),
  dashboard: document.getElementById('dashboard-view'),
  modal: document.getElementById('progress-modal')
};

// 2. 앱 시작 시 초기화 로직
window.addEventListener('DOMContentLoaded', () => {
  // 브라우저에 로그인 기록이 남아있는지 확인
  const savedUser = localStorage.getItem('user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    initDashboard();
  } else {
    switchView('login');
  }
  initEvents();
});

// 화면 전환 함수
function switchView(viewName) {
  Object.keys(views).forEach(key => views[key].classList.add('hidden'));
  if (views[viewName]) views[viewName].classList.remove('hidden');
}

// 이벤트 리스너 한 번에 등록
function initEvents() {
  // 로그인 및 로그아웃
  document.getElementById('btn-login').addEventListener('click', handleLogin);
  document.getElementById('btn-logout').addEventListener('click', handleLogout);
  
  // 회원가입 화면 전환 및 제출
  document.getElementById('btn-go-signup').addEventListener('click', () => switchView('signup'));
  document.getElementById('btn-go-login').addEventListener('click', () => switchView('login'));
  document.getElementById('btn-signup-submit').addEventListener('click', handleSignUp);
  
  // 진도 입력 모달 닫기 및 저장
  document.getElementById('btn-close-modal').addEventListener('click', () => views.modal.classList.add('hidden'));
  document.getElementById('btn-save-progress').addEventListener('click', handleSaveProgress);
}

// 3. 회원가입 처리 (비밀번호 문자열 보존)
async function handleSignUp() {
  const name = document.getElementById('signup-name').value.trim();
  const pin = document.getElementById('signup-pin').value.trim(); // 문자열 형태로 추출 (앞자리 0 잘림 방지)

  if (!name) {
    alert('교사 이름을 입력해 주세요.');
    return;
  }
  if (pin.length !== 4 || isNaN(pin)) {
    alert('비밀번호는 숫자 4자리로 입력해 주세요.');
    return;
  }

  // 동명이인 가입으로 데이터 꼬이는 것 방지
  const { data: userCheck, error: checkError } = await supabase
    .from('profiles')
    .select('name')
    .eq('name', name)
    .maybeSingle();

  if (checkError) {
    alert('서버 통신 중 오류가 발생했습니다.');
    console.error(checkError);
    return;
  }

  if (userCheck) {
    alert('이미 등록된 교사 이름입니다. 동일한 이름이 있다면 다르게 입력해 주세요.');
    return;
  }

  // Supabase 'profiles' 테이블에 유저 추가 (id는 자동 생성)
  const { error: insertError } = await supabase
    .from('profiles')
    .insert([{ name: name, pin: pin }]);

  if (insertError) {
    alert('회원가입에 실패했습니다. 다시 시도해 주세요.');
    console.error(insertError);
  } else {
    alert('회원가입이 성공적으로 완료되었습니다! 가입하신 정보로 로그인해 주세요.');
    document.getElementById('signup-name').value = '';
    document.getElementById('signup-pin').value = '';
    switchView('login');
  }
}

// 4. 로그인 처리
async function handleLogin() {
  const name = document.getElementById('login-name').value.trim();
  const pin = document.getElementById('login-pin').value.trim();

  if (!name || pin.length !== 4) {
    alert('이름과 숫자 4자리 비밀번호를 올바르게 입력해 주세요.');
    return;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('name', name)
    .eq('pin', pin) // 문자열 대 문자열로 정확히 비교
    .maybeSingle();

  if (error) {
    alert('로그인 중 오류가 발생했습니다.');
    console.error(error);
    return;
  }

  if (data) {
    currentUser = data;
    localStorage.setItem('user', JSON.stringify(data)); // 자동 로그인 유지
    initDashboard();
  } else {
    alert('교사 정보 또는 비밀번호가 일치하지 않습니다.');
  }
}

// 로그아웃 처리
function handleLogout() {
  localStorage.removeItem('user');
  currentUser = null;
  switchView('login');
}

// 5. 메인 대시보드 구동
function initDashboard() {
  switchView('dashboard');
  document.getElementById('user-name').innerText = currentUser.name;

  // 오늘 날짜 및 요일 계산
  const now = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const formattedDate = `${now.getMonth() + 1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
  document.getElementById('today-date').innerText = formattedDate;

  // 오늘 요일에 맞는 시간표 로드
  loadTodayTimetable(days[now.getDay()]);
}

// 6. 오늘 시간표 불러오기 및 카드 UI 구성
async function loadTodayTimetable(dayName) {
  const listContainer = document.getElementById('timetable-list');
  listContainer.innerHTML = '<p class="text-slate-400 text-center py-8">시간표를 불러오는 중입니다...</p>';

  // timetable 테이블과 classes 테이블을 Join하여 데이터 가져오기
  const { data: timetable, error } = await supabase
    .from('timetable')
    .select('id, period, day, classes(id, subject, grade_class)')
    .eq('user_id', currentUser.id)
    .eq('day', dayName)
    .order('period', { ascending: true });

  if (error || !timetable || timetable.length === 0) {
    listContainer.innerHTML = `<p class="text-slate-400 text-center py-8">오늘(${dayName}요일)은 배정된 수업이 없습니다.</p>`;
    return;
  }

  listContainer.innerHTML = ''; // 로딩 문구 제거

  // 각 교시별 수업 카드를 그리고, 직전 진도를 찾아 매칭
  for (const item of timetable) {
    const targetClass = item.classes;
    
    // 해당 학급(class_id)의 가장 최근 진도 기록 1개 조회
    const { data: recentProgress } = await supabase
      .from('progress')
      .select('content')
      .eq('class_id', targetClass.id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastContent = recentProgress ? recentProgress.content : '기록된 이전 진도가 없습니다.';

    // 동적 카드 생성
    const card = document.createElement('div');
    card.className = 'bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center hover:border-blue-300 transition-all';
    card.innerHTML = `
      <div>
        <div class="text-xs font-semibold text-slate-400 mb-1">${item.period}교시 | ${targetClass.grade_class}</div>
        <div class="text-lg font-bold text-slate-800 mb-1">${targetClass.subject}</div>
        <div class="text-sm text-slate-500"><span class="text-xs font-medium text-slate-400">이전 진도:</span> ${lastContent}</div>
      </div>
      <button class="bg-slate-50 hover:bg-[#005CC5] hover:text-white text-slate-600 font-medium px-4 py-2 rounded-xl text-sm transition-colors border border-slate-100 btn-enter-progress">
        진도 입력
      </button>
    `;

    // 진도 입력 버튼 클릭 시 모달 팝업 오픈
    card.querySelector('.btn-enter-progress').addEventListener('click', () => {
      openProgressModal(item, lastContent);
    });

    listContainer.appendChild(card);
  }
}

// 7. 진도 입력 모달창 세팅
function openProgressModal(timetableItem, lastContent) {
  selectedTimetableItem = timetableItem;
  
  document.getElementById('modal-badge').innerText = `${timetableItem.period}교시 | ${timetableItem.classes.grade_class}`;
  document.getElementById('modal-title').innerText = `${timetableItem.classes.subject} 진도 기록`;
  document.getElementById('modal-prev-content').innerText = lastContent;
  
  // 입력 필드 비우기
  document.getElementById('input-content').value = '';
  document.getElementById('input-memo').value = '';
  
  views.modal.classList.remove('hidden');
}

// 8. 오늘 나간 진도 데이터베이스에 저장
async function handleSaveProgress() {
  const content = document.getElementById('input-content').value.trim();
  const memo = document.getElementById('input-memo').value.trim();
  
  if (!content) {
    alert('오늘 나간 진도 내용을 입력해 주세요.');
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식 문자열 생성

  const { error } = await supabase
    .from('progress')
    .insert([
      {
        class_id: selectedTimetableItem.classes.id,
        date: todayStr,
        content: content,
        memo: memo
      }
    ]);

  if (error) {
    alert('진도 저장 중 에러가 발생했습니다.');
    console.error(error);
  } else {
    alert('진도가 안전하게 기록되었습니다.');
    views.modal.classList.add('hidden'); // 모달 닫기
    initDashboard(); // 대시보드를 새로고침하여 방금 입력한 진도를 '이전 진도' 칸에 즉시 반영
  }
}