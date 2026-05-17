import { createClient } from '@supabase/supabase-js'

// 1. Supabase 연동 설정 (★본인의 Supabase 정보로 변경 필수★)
const supabaseUrl = 'https://gckplcpwrvabhqqohuib.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdja3BsY3B3cnZhYmhxcW9odWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDI3NTYsImV4cCI6MjA5NDQ3ODc1Nn0.rg9p24pmgeAIe6EcNZjIFEePXtpesnOnOZRlQKyUcuU'
const supabase = createClient(supabaseUrl, supabaseKey)

// --- 전역 상태 및 상수 ---
let currentItem = {};
let cachedTimetable = []; 
let currentUser = localStorage.getItem('classFlow_userName'); 
let modalConfirmCallback = null;
const days = ['일','월','화','수','목','금','토']; [cite: 300]

let isSignUpMode = false;
let tempSignUpName = "";
let tempSignUpPwd = "";
let preSetupSubs = [];
let preSetupGcs = [];
let maxSetupPeriod = 7; [cite: 197]
let activeCellParams = null;

// 색상 팔레트 설정 [cite: 128]
const subPalette = [
  {bg: '#F4F0F7', text: '#492F64'}, {bg: '#F9EEF3', text: '#69314C'}, 
  {bg: '#FBF3DB', text: '#89632A'}, {bg: '#F4EEEE', text: '#603B2C'}, 
  {bg: '#E6FFFA', text: '#234E52'}, {bg: '#FFF5F5', text: '#742A2A'}, 
  {bg: '#FAF5FF', text: '#44337A'}, {bg: '#F1F1EF', text: '#323232'}  
];
const gcPalette = {
  '1': {bg: '#FBECDD', text: '#854C1D'}, 
  '2': {bg: '#EDF3EC', text: '#2B593F'}, 
  '3': {bg: '#E7F3F8', text: '#28456C'}, 
  'default': {bg: '#F1F1EF', text: '#323232'}
}; [cite: 128]
let subjectColors = {};

// --- 초기화 및 뷰 제어 ---
window.onload = function() {
  initSetupTable(); [cite: 138, 197]
  if (currentUser) {
    startApp(); [cite: 138, 173]
  } else {
    showView('loginView'); [cite: 139]
  }
  initEventListeners();
};

function showView(viewId) {
  ['loginView', 'signUpView', 'preSetupSubView', 'preSetupGcView', 'loadingView', 'dashView', 'inputView', 'manageView', 'setupView'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.classList.add('hidden');
  }); [cite: 176]
  const target = document.getElementById(viewId);
  if(target) target.classList.remove('hidden'); [cite: 177]
}

// --- 유틸리티 함수 (색상, 날짜) ---
function getSubColor(sub) {
  if(!subjectColors[sub]) {
    subjectColors[sub] = subPalette[Object.keys(subjectColors).length % subPalette.length];
  } [cite: 129]
  return subjectColors[sub];
}

function getGcColor(gc) {
  let grade = 'default';
  const match = String(gc).match(/\d+/); [cite: 131]
  if (match && gcPalette[match[0]]) grade = match[0]; [cite: 132]
  return gcPalette[grade];
}

function getLocalYYYYMMDD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0'); [cite: 136]
  return `${y}-${m}-${d}`;
}

// --- 이벤트 리스너 등록 ---
function initEventListeners() {
  // 로그인 & 가입 이동
  document.getElementById('loginBtn')?.addEventListener('click', doLogin);
  document.getElementById('btnGoSignUp')?.addEventListener('click', showSignUp);
  document.getElementById('btnCancelSignUp')?.addEventListener('click', cancelSignUp);
  
  // 가입 단계 이동
  document.getElementById('step1NextBtn')?.addEventListener('click', goToPreSetupSub);
  document.getElementById('btnAddSubInput')?.addEventListener('click', addPreSubInput);
  document.getElementById('btnGoToStep3')?.addEventListener('click', goToPreSetupGc);
  document.getElementById('btnAddGcInput')?.addEventListener('click', addPreGcInput);
  document.getElementById('btnGoToTimetable')?.addEventListener('click', goToTimetableSetup);
  
  // 대시보드 & 시간표 설정
  document.getElementById('btnOpenSettings')?.addEventListener('click', openSetupFromDash);
  document.getElementById('btnPrevDate')?.addEventListener('click', () => moveDate(-1));
  document.getElementById('btnNextDate')?.addEventListener('click', () => moveDate(1));
  document.getElementById('hiddenDate')?.addEventListener('change', syncDateFromInput);
  
  // 저장 & 삭제
  document.getElementById('saveBtn')?.addEventListener('click', submitProgress);
  document.getElementById('saveSetupBtn')?.addEventListener('click', saveFullSetup);
  document.getElementById('clearSetupBtn')?.addEventListener('click', clearAllSetup);
  document.getElementById('addPeriodBtn')?.addEventListener('click', addOnePeriod);
  document.getElementById('removePeriodBtn')?.addEventListener('click', removeOnePeriod);
  document.getElementById('setupLogoutBtn')?.addEventListener('click', logout);
  
  // 모달 제어
  document.getElementById('btnCloseInput')?.addEventListener('click', () => showView('dashView'));
  document.getElementById('btnToggleHistory')?.addEventListener('click', toggleHistory);
  document.querySelectorAll('.install-guide-trigger').forEach(el => {
    el.onclick = () => document.getElementById('installGuideModal').classList.remove('hidden');
  }); [cite: 139]
  document.getElementById('btnCloseInstallGuide')?.addEventListener('click', () => document.getElementById('installGuideModal').classList.add('hidden'));
  document.getElementById('btnCloseGuideFinal')?.addEventListener('click', () => document.getElementById('installGuideModal').classList.add('hidden'));
}

// --- 핵심 로직: 로그인 & 회원가입 ---
async function doLogin() {
  const name = document.getElementById('loginNameInput').value.trim();
  const pwd = document.getElementById('loginPasswordInput').value.trim(); [cite: 145]
  
  if (!name || !pwd) return showAlert("성함과 비밀번호를 입력해주세요.");

  const btn = document.getElementById('loginBtn');
  btn.innerText = "확인 중..."; btn.disabled = true;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('name', name)
    .eq('pin', pwd) [cite: 276]
    .maybeSingle();

  if (data) {
    currentUser = name;
    localStorage.setItem('classFlow_userName', currentUser);
    startApp();
  } else {
    showAlert("정보가 일치하지 않거나 가입되지 않은 이름입니다.");
    btn.innerText = "로그인"; btn.disabled = false;
  }
}

async function handleSignUpFinal(timetableData) {
  showView('loadingView');
  document.getElementById('loadingText').innerText = "계정을 생성하고 있습니다..."; [cite: 221]

  // 1. 프로필 생성
  const { error: profileErr } = await supabase
    .from('profiles')
    .insert([{ name: tempSignUpName, pin: tempSignUpPwd }]); [cite: 285]

  if (profileErr) return showAlert("가입 중 오류가 발생했습니다.");

  // 2. 기본 시간표 저장
  const rows = timetableData.map(r => ({
    user_name: tempSignUpName, day: r[0], period: r[1], subject: r[2], grade_class: r[3]
  }));
  await supabase.from('basic_timetable').insert(rows); [cite: 340]

  currentUser = tempSignUpName;
  localStorage.setItem('classFlow_userName', currentUser);
  isSignUpMode = false;
  showAlert("가입 및 설정이 완료되었습니다!", startApp);
}

// --- 핵심 로직: 대시보드 (데이터 병합) [cite: 298-333] ---
async function startApp() {
  showView('loadingView');
  const dateStr = document.getElementById('hiddenDate').value || getLocalYYYYMMDD(new Date());
  const dayName = days[new Date(dateStr).getDay()];

  // A. 데이터 병렬 로드
  const [basicRes, changeRes, recordRes] = await Promise.all([
    supabase.from('basic_timetable').select('*').eq('user_name', currentUser).eq('day', dayName), [cite: 301]
    supabase.from('changed_timetable').select('*').eq('user_name', currentUser).eq('date', dateStr), [cite: 305]
    supabase.from('lesson_records').select('*').eq('user_name', currentUser) [cite: 314]
  ]);

  if (!basicRes.data?.length && !changeRes.data?.length) {
    showView('setupView'); // 설정이 없으면 시간표 설정으로 이동 [cite: 175]
    return;
  }

  // B. 대시보드 데이터 조립 (Priority: Changed > Basic)
  let dashboard = {};
  
  basicRes.data.forEach(item => {
    dashboard[item.period] = { ...item, gradeClass: item.grade_class, prevProgress: '-', todayProgress: '-', todayNote: '-' };
  }); [cite: 303]

  changeRes.data.forEach(item => {
    if (item.subject === '[삭제]') delete dashboard[item.period]; [cite: 312]
    else dashboard[item.period] = { ...item, gradeClass: item.grade_class, prevProgress: '-', todayProgress: '-', todayNote: '-' };
  }); [cite: 313]

  // C. 진도 기록 매칭 (최신순 탐색) [cite: 318]
  const records = recordRes.data.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  Object.values(dashboard).forEach(item => {
    const classRecords = records.filter(r => r.grade_class === item.gradeClass && r.subject === item.subject);
    
    const todayRec = classRecords.find(r => r.date === dateStr && r.period === item.period);
    if (todayRec) {
      item.todayProgress = todayRec.content;
      item.todayNote = todayRec.note;
    } [cite: 325]

    const prevRec = classRecords.find(r => r.date < dateStr);
    if (prevRec) item.prevProgress = prevRec.content; [cite: 327]
  });

  renderDash(Object.values(dashboard).sort((a, b) => a.period - b.period));
  updateDateDisplay(new Date(dateStr));
  showView('dashView');
}

// --- UI 렌더링 함수 ---
function renderDash(list) {
  const container = document.getElementById('dashList');
  container.innerHTML = ""; [cite: 234]
  
  if(!list.length) {
    container.innerHTML = '<div style="text-align:center; padding:50px; color:var(--text-muted); border:2px dashed var(--border); border-radius:15px;">수업이 없습니다.</div>';
    return; [cite: 234]
  }

  list.forEach(item => {
    const subCol = getSubColor(item.subject);
    const gcCol = getGcColor(item.gradeClass);
    const card = document.createElement('div');
    card.className = "card";
    card.innerHTML = `
      <div class="card-header">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <div class="period-badge">${item.period}교시</div>
          <div style="background-color:${subCol.bg}; color:${subCol.text}; padding:4px 10px; border-radius:14px; font-weight:700;">${item.subject}</div>
          <div style="background-color:${gcCol.bg}; color:${gcCol.text}; padding:4px 10px; border-radius:14px; font-weight:700;">${item.gradeClass}</div>
        </div>
        <div class="manage-link" onclick="event.stopPropagation(); openManage('${JSON.stringify(item).replace(/"/g, '&quot;')}')">수업 변경</div>
      </div>
      <div class="prog-box">
        <div class="prog-row prev"><span class="label">이전 진도</span><span>${item.prevProgress==='-'?'기록 없음':item.prevProgress}</span></div>
        <div class="prog-row today"><span class="label">오늘 진도</span><span>${item.todayProgress==='-'?'기록하기 +':item.todayProgress}</span></div>
      </div>
    `; [cite: 236-237]
    card.onclick = () => openInput(item);
    container.appendChild(card);
  });
}

// --- 진도 기록 및 이력 조회 ---
async function openInput(item) {
  currentItem = item;
  const dateStr = document.getElementById('hiddenDate').value;
  const [y, m, d] = dateStr.split('-');
  
  document.getElementById('inputTitle').innerHTML = `
    <div style="font-size:14px; color:#718096; margin-bottom:10px; font-weight:600;"><i class="fa-solid fa-pen"></i> ${parseInt(m)}월 ${parseInt(d)}일 진도 기록</div>
    <div style="font-size:18px; font-weight:700;">${item.period}교시 ${item.subject} (${item.gradeClass})</div>
  `; [cite: 252]

  document.getElementById('progContent').value = item.todayProgress === '-' ? '' : item.todayProgress;
  document.getElementById('progNotes').value = item.todayNote === '-' ? '' : item.todayNote; [cite: 253]
  
  const historyBox = document.getElementById('historyContainer');
  historyBox.innerHTML = "기록을 불러오는 중...";
  showView('inputView');

  // 이력 조회 (getLessonHistory 변환) [cite: 363]
  const { data } = await supabase
    .from('lesson_records')
    .select('*')
    .eq('user_name', currentUser)
    .eq('grade_class', item.gradeClass)
    .eq('subject', item.subject)
    .lt('date', dateStr)
    .order('date', { ascending: false });

  if (data?.length) {
    historyBox.innerHTML = data.map(h => `
      <div class="history-card">
        <div class="history-date">${h.date}</div>
        <div class="history-content"><strong>진도:</strong> ${h.content}</div>
        ${h.note !== '-' ? `<div class="history-note"><strong>메모:</strong> ${h.note}</div>` : ''}
      </div>
    `).join(''); [cite: 246]
  } else {
    historyBox.innerHTML = "이전 기록이 없습니다.";
  }
}

async function submitProgress() {
  const content = document.getElementById('progContent').value.trim() || "-";
  const note = document.getElementById('progNotes').value.trim() || "-";
  const dateStr = document.getElementById('hiddenDate').value;

  const btn = document.getElementById('saveBtn');
  btn.innerText = "저장 중..."; btn.disabled = true; [cite: 266]

  const { error } = await supabase
    .from('lesson_records')
    .upsert({
      user_name: currentUser, date: dateStr, period: currentItem.period,
      grade_class: currentItem.gradeClass, subject: currentItem.subject,
      content, note, updated_at: new Date()
    }, { onConflict: 'user_name, date, period, grade_class, subject' }); [cite: 341, 351]

  if (!error) {
    alert("저장되었습니다.");
    startApp();
  } else {
    alert("저장 실패: " + error.message);
  }
  btn.innerText = "기록 저장"; btn.disabled = false;
}

// --- 시간표 설정 UI 로직 (기존 Index.txt의 복잡한 로직들) ---
function initSetupTable() {
  const body = document.getElementById('setupBody');
  body.innerHTML = Array.from({length: maxSetupPeriod}, (_, i) => createRowHTML(i+1)).join('');
  updateQuickButtons(); [cite: 199]
}

function createRowHTML(p) {
  return `<tr><td style="text-align:center; font-weight:700; color:var(--text-muted);">${p}</td>` + 
    ['월','화','수','목','금'].map(d => `
      <td><div class="cell-input-group">
        <input type="text" class="setup-in sub-in" data-day="${d}" data-p="${p}" placeholder="과목" onfocus="setActiveCell('${d}', ${p})" oninput="updateQuickButtons()">
        <input type="text" class="setup-in gc-in" data-day="${d}" data-p="${p}" placeholder="학년반" onfocus="setActiveCell('${d}', ${p})" oninput="updateQuickButtons()">
      </div></td>`).join('') + `</tr>`; [cite: 196]
}

function setActiveCell(day, p) { activeCellParams = { day, p }; }

function updateQuickButtons() {
  const subs = new Set(preSetupSubs);
  const gcs = new Set(preSetupGcs);
  document.querySelectorAll('.sub-in').forEach(el => el.value && subs.add(el.value));
  document.querySelectorAll('.gc-in').forEach(el => el.value && gcs.add(el.value)); [cite: 184-185]
  
  const section = document.getElementById('quickInputSection');
  if (!subs.size && !gcs.size) return section.style.display = 'none';
  section.style.display = 'block';
  
  document.getElementById('quickSubBtns').innerHTML = [...subs].map(v => `<button class="quick-btn" onclick="applyQuickValue('${v}', 'sub')">${v}</button>`).join('');
  document.getElementById('quickGcBtns').innerHTML = [...gcs].map(v => `<button class="quick-btn" onclick="applyQuickValue('${v}', 'gc')">${v}</button>`).join('');
}

function applyQuickValue(val, type) {
  if(!activeCellParams) return alert("칸을 먼저 선택하세요.");
  const input = document.querySelector(`.${type==='sub'?'sub-in':'gc-in'}[data-day="${activeCellParams.day}"][data-p="${activeCellParams.p}"]`);
  if(input) { input.value = val; updateQuickButtons(); }
}

async function saveFullSetup() {
  let data = [];
  ['월','화','수','목','금'].forEach(d => {
    for(let p=1; p<=maxSetupPeriod; p++) {
      const sub = document.querySelector(`.sub-in[data-day="${d}"][data-p="${p}"]`).value.trim();
      const gc = document.querySelector(`.gc-in[data-day="${d}"][data-p="${p}"]`).value.trim();
      if(sub) data.push([d, p, sub, gc]);
    }
  }); [cite: 219]

  if (isSignUpMode) handleSignUpFinal(data);
  else {
    await supabase.from('basic_timetable').delete().eq('user_name', currentUser);
    const rows = data.map(r => ({ user_name: currentUser, day: r[0], period: r[1], subject: r[2], grade_class: r[3] }));
    await supabase.from('basic_timetable').insert(rows);
    alert("시간표가 저장되었습니다.");
    startApp();
  }
}

// --- 공통 알림창 및 기타 기능 ---
function showAlert(msg, callback) {
  const modal = document.getElementById('customModal');
  document.getElementById('customModalMsg').innerHTML = msg.replace(/\n/g, '<br>');
  document.getElementById('customModalBtns').innerHTML = `<button class="modal-btn" style="background:var(--primary); color:white;" id="modalOkBtn">확인</button>`;
  document.getElementById('modalOkBtn').onclick = () => { modal.classList.add('hidden'); if(callback) callback(); };
  modal.classList.remove('hidden'); [cite: 140-141]
}

function moveDate(offset) {
  const dateInput = document.getElementById('hiddenDate');
  const d = new Date(dateInput.value || new Date());
  d.setDate(d.getDate() + offset);
  dateInput.value = getLocalYYYYMMDD(d);
  startApp(); [cite: 229]
}

function syncDateFromInput() { startApp(); }

function updateDateDisplay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  document.getElementById('dateText').innerText = `${y}. ${m}. ${d} (${days[date.getDay()]})`; [cite: 227]
}

// --- 가입 단계별 화면 제어 ---
function showSignUp() { isSignUpMode = true; resetPreSetupDOM(); showView('signUpView'); }
function cancelSignUp() { isSignUpMode = false; showView('loginView'); }
function resetPreSetupDOM() {
  document.getElementById('subInputContainer').innerHTML = `<div style="display:flex; gap:10px; margin-bottom:10px;"><input type="text" class="large-input sub-item-input" placeholder="과목 (예: 수학)" style="flex:1;"></div>`;
  document.getElementById('gcInputContainer').innerHTML = `<div class="gc-input-row" style="padding:15px; border-radius:12px; margin-bottom:15px; border:1px solid rgba(255,255,255,0.1);"><input type="number" class="gc-grade-input" placeholder="학년" style="width:70px;"> 학년 <input type="text" class="gc-class-input" placeholder="반 (예: 1, 2, 3)"></div>`;
}
function addPreSubInput() { document.getElementById('subInputContainer').insertAdjacentHTML('beforeend', `<div style="display:flex; gap:10px; margin-bottom:10px;"><input type="text" class="large-input sub-item-input" placeholder="과목 추가" style="flex:1;"></div>`); }
function addPreGcInput() { document.getElementById('gcInputContainer').insertAdjacentHTML('beforeend', `<div class="gc-input-row" style="padding:15px; border-radius:12px; margin-bottom:15px; border:1px solid rgba(255,255,255,0.1);"><input type="number" class="gc-grade-input" placeholder="학년" style="width:70px;"> 학년 <input type="text" class="gc-class-input" placeholder="반"></div>`); }
function goToPreSetupSub() {
  tempSignUpName = document.getElementById('signUpNameInput').value.trim();
  tempSignUpPwd = document.getElementById('signUpPasswordInput').value.trim();
  if(!tempSignUpName || !tempSignUpPwd) return alert("정보를 모두 입력하세요.");
  showView('preSetupSubView');
}
function goToPreSetupGc() {
  preSetupSubs = [];
  document.querySelectorAll('.sub-item-input').forEach(i => i.value && preSetupSubs.push(i.value.trim()));
  showView('preSetupGcView');
}
function goToTimetableSetup() {
  preSetupGcs = [];
  document.querySelectorAll('.gc-input-row').forEach(row => {
    const grade = row.querySelector('.gc-grade-input').value;
    const classes = row.querySelector('.gc-class-input').value.split(',');
    classes.forEach(c => c.trim() && preSetupGcs.push(`${grade}-${c.trim()}`));
  });
  initSetupTable();
  showView('setupView');
}
function openSetupFromDash() { isSignUpMode = false; showView('setupView'); }
function logout() { localStorage.removeItem('classFlow_userName'); location.reload(); }
function addOnePeriod() { if(maxSetupPeriod < 15) { maxSetupPeriod++; initSetupTable(); } }
function removeOnePeriod() { if(maxSetupPeriod > 1) { maxSetupPeriod--; initSetupTable(); } }
function toggleHistory() {
  const container = document.getElementById('historyContainer');
  const icon = document.getElementById('historyToggleIcon');
  container.classList.toggle('hidden');
  icon.classList.toggle('fa-chevron-up'); icon.classList.toggle('fa-chevron-down'); [cite: 248]
}