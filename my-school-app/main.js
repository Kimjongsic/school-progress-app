import { createClient } from '@supabase/supabase-js'

// 1. Supabase 연동 (정보 변경 필수)
const supabaseUrl = 'https://gckplcpwrvabhqqohuib.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdja3BsY3B3cnZhYmhxcW9odWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDI3NTYsImV4cCI6MjA5NDQ3ODc1Nn0.rg9p24pmgeAIe6EcNZjIFEePXtpesnOnOZRlQKyUcuU'
const supabase = createClient(supabaseUrl, supabaseKey)

// --- 앱 상태 관리 ---
let currentUser = localStorage.getItem('classFlow_userName');
let currentItem = {};
let tempSignUpData = { name: '', pwd: '', subs: [], gcs: [] };
let activeCell = null; // 시간표 설정 시 현재 포커스된 칸
let maxSetupPeriod = 7;
const daysArr = ['일','월','화','수','목','금','토'];

// --- 초기화 ---
window.onload = () => {
  if (currentUser) startApp();
  else showView('loginView');
  initEventListeners();
};

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

function initEventListeners() {
  // 로그인 & 가입 이동
  document.getElementById('loginBtn')?.addEventListener('click', handleLogin);
  document.getElementById('btnGoSignUp')?.addEventListener('click', () => { resetSignUpForm(); showView('signUpView'); });
  document.getElementById('btnCancelSignUp')?.addEventListener('click', () => showView('loginView'));
  
  // 뒤로 가기 버튼들
  document.querySelectorAll('.btnBack').forEach(btn => {
    btn.onclick = () => showView(btn.dataset.target);
  });

  // 가입 단계별 로직
  document.getElementById('step1NextBtn')?.onclick = goStep2;
  document.getElementById('btnAddSubInput')?.onclick = addSubField;
  document.getElementById('btnGoToStep3')?.onclick = goStep3;
  document.getElementById('btnAddGcInput')?.onclick = addGcField;
  document.getElementById('btnGoToTimetable')?.onclick = goTimetableSetup;
  
  // 대시보드 제어
  document.getElementById('btnPrevDate')?.onclick = () => moveDate(-1);
  document.getElementById('btnNextDate')?.onclick = () => moveDate(1);
  document.getElementById('hiddenDate')?.onchange = (e) => { updateDateDisplay(new Date(e.target.value)); startApp(); };
  document.getElementById('btnOpenSettings')?.onclick = openSetupView;
  
  // 저장 & 관리
  document.getElementById('saveBtn')?.onclick = saveProgress;
  document.getElementById('saveSetupBtn')?.onclick = handleSaveFullSetup;
  document.getElementById('addPeriodBtn')?.onclick = () => { if(maxSetupPeriod < 12) { maxSetupPeriod++; renderSetupTable(); } };
  document.getElementById('removePeriodBtn')?.onclick = () => { if(maxSetupPeriod > 1) { maxSetupPeriod--; renderSetupTable(); } };
  document.getElementById('btnCloseInput')?.onclick = () => showView('dashView');
  document.getElementById('setupCloseBtn')?.onclick = () => showView('dashView');
  document.getElementById('btnToggleHistory')?.onclick = toggleHistory;
  document.getElementById('setupLogoutBtn')?.onclick = handleLogout;
}

// --- 로그인/회원가입 로직 ---
async function handleLogin() {
  const name = document.getElementById('loginNameInput').value.trim();
  const pin = document.getElementById('loginPasswordInput').value.trim();
  if (!name || !pin) return alert("정보를 입력해주세요.");

  const { data } = await supabase.from('profiles').select('*').eq('name', name).eq('pin', pin).maybeSingle();
  if (data) {
    currentUser = name;
    localStorage.setItem('classFlow_userName', name);
    startApp();
  } else alert("로그인 실패: 정보를 다시 확인해주세요.");
}

function resetSignUpForm() {
  document.getElementById('subInputContainer').innerHTML = '<input type="text" class="sub-in-item" placeholder="과목 (예: 수학)" style="margin-bottom:8px;">';
  document.getElementById('gcInputContainer').innerHTML = '<div class="gc-row" style="display:flex; gap:8px; margin-bottom:8px;"><input type="number" class="gc-grade" placeholder="학년" style="width:70px;"><input type="text" class="gc-classes" placeholder="반 (1, 2, 3)"></div>';
}

function addSubField() { document.getElementById('subInputContainer').insertAdjacentHTML('beforeend', '<input type="text" class="sub-in-item" placeholder="과목 추가" style="margin-bottom:8px;">'); }
function addGcField() { document.getElementById('gcInputContainer').insertAdjacentHTML('beforeend', '<div class="gc-row" style="display:flex; gap:8px; margin-bottom:8px;"><input type="number" class="gc-grade" placeholder="학년" style="width:70px;"><input type="text" class="gc-classes" placeholder="반"></div>'); }

function goStep2() {
  tempSignUpData.name = document.getElementById('signUpNameInput').value.trim();
  tempSignUpData.pwd = document.getElementById('signUpPasswordInput').value.trim();
  if (!tempSignUpData.name || tempSignUpData.pwd.length < 4) return alert("올바른 이름과 4자리 비밀번호를 입력하세요.");
  showView('preSetupSubView');
}

function goStep3() {
  tempSignUpData.subs = Array.from(document.querySelectorAll('.sub-in-item')).map(i => i.value.trim()).filter(v => v);
  if (tempSignUpData.subs.length === 0) return alert("과목을 하나 이상 입력하세요.");
  showView('preSetupGcView');
}

function goTimetableSetup() {
  tempSignUpData.gcs = [];
  document.querySelectorAll('.gc-row').forEach(row => {
    const grade = row.querySelector('.gc-grade').value;
    const classes = row.querySelector('.gc-classes').value.split(',').map(c => c.trim()).filter(c => c);
    classes.forEach(c => tempSignUpData.gcs.push(`${grade}-${c}`));
  });
  if (tempSignUpData.gcs.length === 0) return alert("학년과 반을 입력하세요.");
  
  renderSetupTable();
  showView('setupView');
}

// --- 대시보드 핵심 로직  ---
async function startApp() {
  showView('loadingView');
  const dateStr = document.getElementById('hiddenDate').value || new Date().toISOString().split('T')[0];
  const dayName = daysArr[new Date(dateStr).getDay()];

  // 1. 기본 시간표 + 진도 기록 병렬 로드
  const [basicRes, recordRes] = await Promise.all([
    supabase.from('basic_timetable').select('*').eq('user_name', currentUser).eq('day', dayName),
    supabase.from('lesson_records').select('*').eq('user_name', currentUser).eq('date', dateStr)
  ]);

  if (!basicRes.data?.length) {
    showView('setupView');
    return;
  }

  const list = document.getElementById('dashList');
  list.innerHTML = '';
  
  for (const item of basicRes.data) {
    // 이전 진도 가져오기
    const { data: prev } = await supabase
      .from('lesson_records')
      .select('content')
      .eq('user_name', currentUser)
      .eq('grade_class', item.grade_class)
      .eq('subject', item.subject)
      .lt('date', dateStr)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const todayRec = recordRes.data?.find(r => r.period == item.period);

    const card = document.createElement('div');
    card.className = "card";
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="period-badge">${item.period}교시</span>
          <span style="font-weight:800; font-size:17px;">${item.subject}</span>
          <span style="color:var(--text-muted); font-size:14px;">(${item.grade_class})</span>
        </div>
        <i class="fa-solid fa-chevron-right" style="color:#CBD5E0;"></i>
      </div>
      <div style="background:#f1f5f9; padding:10px; border-radius:10px; font-size:13px; color:#475569;">
        <strong>이전:</strong> ${prev ? prev.content : '기록 없음'}
      </div>
      <div style="margin-top:8px; padding:10px; border-radius:10px; font-size:13px; font-weight:600; color:var(--primary); background:#ebf8ff; border:1px dashed #bee3f8;">
        <strong>오늘:</strong> ${todayRec ? todayRec.content : '기록하기 +'}
      </div>
    `;
    card.onclick = () => openInputView(item, prev?.content, todayRec);
    list.appendChild(card);
  }
  
  updateDateDisplay(new Date(dateStr));
  showView('dashView');
}

// --- 시간표 설정 UI ---
function renderSetupTable() {
  const body = document.getElementById('setupBody');
  body.innerHTML = '';
  for (let p = 1; p <= maxSetupPeriod; p++) {
    const row = document.createElement('tr');
    row.innerHTML = `<td style="font-weight:bold; color:#94a3b8;">${p}</td>` + ['월','화','수','목','금'].map(d => `
      <td><input type="text" class="setup-in" data-day="${d}" data-p="${p}" onfocus="setActive('${d}',${p})" placeholder="-"></td>
    `).join('');
    body.appendChild(row);
  }
  
  // 빠른 입력 버튼 (가입 데이터 활용)
  const qSection = document.getElementById('quickInputSection');
  const subs = tempSignUpData.subs.length ? tempSignUpData.subs : [...new Set(cachedSubs)];
  const gcs = tempSignUpData.gcs.length ? tempSignUpData.gcs : [...new Set(cachedGcs)];
  
  if(subs.length || gcs.length) {
    qSection.style.display = 'block';
    document.getElementById('quickSubBtns').innerHTML = subs.map(s => `<button class="btn-outline" style="width:auto; padding:4px 10px; font-size:11px; margin:0;" onclick="applyQuick('${s}')">${s}</button>`).join('');
    document.getElementById('quickGcBtns').innerHTML = gcs.map(g => `<button class="btn-outline" style="width:auto; padding:4px 10px; font-size:11px; margin:0;" onclick="applyQuick('${g}')">${g}</button>`).join('');
  }
}

window.setActive = (d, p) => activeCell = { d, p };
window.applyQuick = (val) => {
  if(!activeCell) return;
  const input = document.querySelector(`.setup-in[data-day="${activeCell.d}"][data-p="${activeCell.p}"]`);
  if(input) input.value = val;
};

// --- 데이터 저장/삭제 로직 ---
async function handleSaveFullSetup() {
  const rows = [];
  document.querySelectorAll('.setup-in').forEach(i => {
    if(i.value) {
      // "과목 반" 형식 파싱 시도 (예: 수학 2-1)
      const parts = i.value.split(' ');
      rows.push({
        user_name: currentUser || tempSignUpData.name,
        day: i.dataset.day,
        period: parseInt(i.dataset.p),
        subject: parts[0],
        grade_class: parts[1] || '미정'
      });
    }
  });

  if (!currentUser) { // 회원가입
    await supabase.from('profiles').insert({ name: tempSignUpData.name, pin: tempSignUpData.pwd });
    currentUser = tempSignUpData.name;
    localStorage.setItem('classFlow_userName', currentUser);
  }

  await supabase.from('basic_timetable').delete().eq('user_name', currentUser);
  await supabase.from('basic_timetable').insert(rows);
  alert("저장되었습니다!");
  startApp();
}

async function openInputView(item, prevContent, todayRec) {
  currentItem = item;
  document.getElementById('inputTitle').innerText = `${item.subject} (${item.grade_class})`;
  document.getElementById('progContent').value = todayRec ? todayRec.content : '';
  document.getElementById('progNotes').value = todayRec ? todayRec.note : '';
  
  const historyBox = document.getElementById('historyContainer');
  historyBox.innerHTML = '로딩 중...';
  historyBox.classList.add('hidden');
  showView('inputView');

  const { data } = await supabase
    .from('lesson_records')
    .select('*')
    .eq('user_name', currentUser)
    .eq('grade_class', item.grade_class)
    .eq('subject', item.subject)
    .order('date', { ascending: false });
    
  if(data?.length) {
    historyBox.innerHTML = data.map(h => `
      <div style="margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #f1f5f9;">
        <div style="color:var(--primary); font-weight:700; font-size:11px;">${h.date}</div>
        <div style="margin-top:2px;">${h.content}</div>
      </div>
    `).join('');
  } else historyBox.innerHTML = '기록이 없습니다.';
}

async function saveProgress() {
  const content = document.getElementById('progContent').value.trim();
  const note = document.getElementById('progNotes').value.trim();
  const dateStr = document.getElementById('hiddenDate').value;
  
  await supabase.from('lesson_records').upsert({
    user_name: currentUser, date: dateStr, period: currentItem.period,
    subject: currentItem.subject, grade_class: currentItem.grade_class,
    content: content || '-', note: note || '-'
  }, { onConflict: 'user_name, date, period, grade_class, subject' });
  
  alert("저장 성공!");
  startApp();
}

// --- 기타 유틸리티 ---
function updateDateDisplay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  document.getElementById('dateText').innerText = `${y}. ${m}. ${d} (${daysArr[date.getDay()]})`;
  document.getElementById('hiddenDate').value = `${y}-${m}-${d}`;
}

function moveDate(offset) {
  const current = new Date(document.getElementById('hiddenDate').value);
  current.setDate(current.getDate() + offset);
  updateDateDisplay(current);
  startApp();
}

function toggleHistory() {
  const box = document.getElementById('historyContainer');
  const icon = document.getElementById('historyIcon');
  box.classList.toggle('hidden');
  icon.classList.toggle('fa-chevron-up');
}

function handleLogout() { localStorage.clear(); location.reload(); }
async function openSetupView() {
  const { data } = await supabase.from('basic_timetable').select('*').eq('user_name', currentUser);
  // 기존 데이터가 있다면 채워넣기 로직 추가 가능
  renderSetupTable();
  showView('setupView');
}