import { createClient } from '@supabase/supabase-js'

// 1. Supabase 연동 설정 (본인의 정보로 변경 필수)
const supabaseUrl = 'https://내_프로젝트_주소.supabase.co'
const supabaseKey = '내_익명_Anon_KEY'
const supabase = createClient(supabaseUrl, supabaseKey)

// 상태 관리 변수
let currentUser = null;
let selectedTimetableItem = null;

// DOM 엘리먼트 캐싱
const views = {
  login: document.getElementById('login-view'),
  dashboard: document.getElementById('dashboard-view'),
  modal: document.getElementById('progress-modal')
};

// 2. 초기 구동 및 로그인 유지 체크
window.addEventListener('DOMContentLoaded', () => {
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
  if (viewName === 'login') views.login.classList.remove('hidden');
  if (viewName === 'dashboard') views.dashboard.classList.remove('hidden');
}

// 이벤트 리스너 등록
function initEvents() {
  document.getElementById('btn-login').addEventListener('click', handleLogin);
  document.getElementById('btn-logout').addEventListener('click', handleLogout);
  document.getElementById('btn-close-modal').addEventListener('click', () => views.modal.classList.add('hidden'));
  document.getElementById('btn-save-progress').addEventListener('click', handleSaveProgress);
}

// 3. 로그인 처리 (문자열로 비밀번호를 비교하여 앞자리 0 유지)
async function handleLogin() {
  const name = document.getElementById('login-name').value.trim();
  const pin = document.getElementById('login-pin').value.trim(); // 문자열 그대로 추출

  if (!name || pin.length !== 4) {
    alert('이름과 숫자 4자리 비밀번호를 올바르게 입력해 주세요.');
    return;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('name', name)
    .eq('pin', pin) // 데이터베이스의 text 타입 컬럼과 매칭
    .maybeSingle();

  if (error) {
    alert('로그인 중 오류가 발생했습니다.');
    console.error(error);
    return;
  }

  if (data) {
    currentUser = data;
    localStorage.setItem('user', JSON.stringify(data));
    initDashboard();
  } else {
    alert('교사 정보 또는 비밀번호가 일치하지 않습니다.');
  }
}

function handleLogout() {
  localStorage.removeItem('user');
  currentUser = null;
  switchView('login');
}

// 4. 대시보드 초기화 및 오늘 날짜 계산
function initDashboard() {
  switchView('dashboard');
  document.getElementById('user-name').innerText = currentUser.name;

  const now = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const formattedDate = `${now.getMonth() + 1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
  document.getElementById('today-date').innerText = formattedDate;

  loadTodayTimetable(days[now.getDay()]);
}

// 5. 오늘의 시간표 및 직전 진도 가져오기 (고속 Join 쿼리)
async function loadTodayTimetable(dayName) {
  const listContainer = document.getElementById('timetable-list');
  listContainer.innerHTML = '<p class="text-slate-400 text-center py-8">시간표를 불러오는 중입니다...</p>';

  // 내 시간표와 연결된 수업 정보(classes)를 한 번에 조인해서 가져옵니다.
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

  listContainer.innerHTML = ''; // 초기화

  // 각 교시별로 가장 최근에 저장된 진도를 찾아서 카드로 뿌려줍니다.
  for (const item of timetable) {
    const targetClass = item.classes;
    
    // 이 학급(class_id)의 가장 최근 진도 레코드 1개 조회
    const { data: recentProgress } = await supabase
      .from('progress')
      .select('content')
      .eq('class_id', targetClass.id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastContent = recentProgress ? recentProgress.content : '기록된 이전 진도가 없습니다.';

    // 동적 카드 UI 생성
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

    // 버튼 클릭 시 입력 모달창 열기
    card.querySelector('.btn-enter-progress').addEventListener('click', () => {
      openProgressModal(item, lastContent);
    });

    listContainer.appendChild(card);
  }
}

// 6. 진도 입력창(모달) 열기
function openProgressModal(timetableItem, lastContent) {
  selectedTimetableItem = timetableItem;
  
  document.getElementById('modal-badge').innerText = `${timetableItem.period}교시 | ${timetableItem.classes.grade_class}`;
  document.getElementById('modal-title').innerText = `${timetableItem.classes.subject} 진도 기록`;
  document.getElementById('modal-prev-content').innerText = lastContent;
  
  // 입력 폼 초기화
  document.getElementById('input-content').value = '';
  document.getElementById('input-memo').value = '';
  
  views.modal.classList.remove('hidden');
}

// 7. 오늘 진도 DB에 저장하기
async function handleSaveProgress() {
  const content = document.getElementById('input-content').value.trim();
  const memo = document.getElementById('input-memo').value.trim();
  
  if (!content) {
    alert('오늘 나간 진도 내용을 입력해 주세요.');
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식

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
    views.modal.classList.add('hidden');
    initDashboard(); // 대시보드 갱신하여 방금 입력한 내용 반영
  }
}