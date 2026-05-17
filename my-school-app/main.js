import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gckplcpwrvabhqqohuib.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdja3BsY3B3cnZhYmhxcW9odWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDI3NTYsImV4cCI6MjA5NDQ3ODc1Nn0.rg9p24pmgeAIe6EcNZjIFEePXtpesnOnOZRlQKyUcuU'
const supabase = createClient(supabaseUrl, supabaseKey)

let currentUser = localStorage.getItem('classFlow_userName');
let currentItem = {};
let tempSignUp = { name: '', pwd: '', subs: [], gcs: [] };
let activeCell = null;

window.onload = () => {
  if (currentUser) startApp();
  else showView('loginView');
  initEvents();
};

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

function initEvents() {
  document.getElementById('loginBtn')?.addEventListener('click', doLogin);
  document.getElementById('btnGoSignUp')?.addEventListener('click', () => { resetSignUp(); showView('signUpView'); });
  document.getElementById('step1NextBtn')?.addEventListener('click', goStep2);
  document.getElementById('btnAddSubInput')?.addEventListener('click', addSubField);
  document.getElementById('btnGoToStep3')?.addEventListener('click', goStep3);
  document.getElementById('btnAddGcInput')?.addEventListener('click', addGcField);
  document.getElementById('btnGoToTimetable')?.addEventListener('click', goTimetable);
  document.getElementById('saveSetupBtn')?.addEventListener('click', saveTimetable);
  document.getElementById('saveBtn')?.addEventListener('click', saveProgress);
  document.getElementById('btnOpenSettings')?.addEventListener('click', () => showView('setupView'));
  document.getElementById('setupLogoutBtn')?.addEventListener('click', () => { localStorage.clear(); location.reload(); });
  document.getElementById('hiddenDate')?.addEventListener('change', startApp);
}

// --- 로그인/가입 ---
async function doLogin() {
  const name = document.getElementById('loginNameInput').value;
  const pin = document.getElementById('loginPasswordInput').value;
  const { data } = await supabase.from('profiles').select('*').eq('name', name).eq('pin', pin).maybeSingle();
  if (data) { currentUser = name; localStorage.setItem('classFlow_userName', name); startApp(); }
  else alert("정보가 일치하지 않습니다.");
}

function resetSignUp() {
  document.getElementById('subInputContainer').innerHTML = '<input type="text" class="sub-in-item" placeholder="과목명" style="margin-bottom:5px;">';
  document.getElementById('gcInputContainer').innerHTML = '<input type="text" class="gc-in-item" placeholder="학년-반 (예: 2-1)" style="margin-bottom:5px;">';
}

function addSubField() { document.getElementById('subInputContainer').insertAdjacentHTML('beforeend', '<input type="text" class="sub-in-item" placeholder="과목명" style="margin-bottom:5px;">'); }
function addGcField() { document.getElementById('gcInputContainer').insertAdjacentHTML('beforeend', '<input type="text" class="gc-in-item" placeholder="학년-반" style="margin-bottom:5px;">'); }

function goStep2() { 
    tempSignUp.name = document.getElementById('signUpNameInput').value;
    tempSignUp.pwd = document.getElementById('signUpPasswordInput').value;
    showView('preSetupSubView'); 
}
function goStep3() { 
    tempSignUp.subs = Array.from(document.querySelectorAll('.sub-in-item')).map(i => i.value).filter(v => v);
    showView('preSetupGcView'); 
}
function goTimetable() {
    tempSignUp.gcs = Array.from(document.querySelectorAll('.gc-in-item')).map(i => i.value).filter(v => v);
    renderSetupTable();
    showView('setupView');
}

// --- 시간표 설정 ---
function renderSetupTable() {
  const body = document.getElementById('setupBody');
  body.innerHTML = '';
  for (let p = 1; p <= 7; p++) {
    let row = `<tr><td>${p}</td>` + ['월','화','수','목','금'].map(d => `<td>
      <input type="text" class="setup-in" data-day="${d}" data-p="${p}" placeholder="과목/반" onfocus="this.select()">
    </td>`).join('') + `</tr>`;
    body.insertAdjacentHTML('beforeend', row);
  }
  // 빠른 선택 버튼 생성
  const qSub = document.getElementById('quickSubBtns');
  const qGc = document.getElementById('quickGcBtns');
  qSub.innerHTML = tempSignUp.subs.map(s => `<button class="btn-outline" style="width:auto; padding:5px 10px; font-size:10px;" onclick="fillActive('${s}')">${s}</button>`).join('');
}

// --- 대시보드 ---
async function startApp() {
  showView('loadingView');
  const dateStr = document.getElementById('hiddenDate').value || new Date().toISOString().split('T')[0];
  document.getElementById('dateText').innerText = dateStr;
  
  const { data: basic } = await supabase.from('basic_timetable').select('*').eq('user_name', currentUser);
  const { data: records } = await supabase.from('lesson_records').select('*').eq('user_name', currentUser).eq('date', dateStr);
  
  const list = document.getElementById('dashList');
  list.innerHTML = '';
  basic?.forEach(item => {
    const rec = records?.find(r => r.period == item.period);
    const card = `<div class="card" onclick='openInput(${JSON.stringify(item)})'>
      <span class="period-badge">${item.period}교시</span> <strong>${item.subject} (${item.grade_class})</strong>
      <div style="font-size:12px; margin-top:5px; color:#666;">진도: ${rec ? rec.content : '기록 없음'}</div>
    </div>`;
    list.insertAdjacentHTML('beforeend', card);
  });
  showView('dashView');
}

window.openInput = (item) => {
  currentItem = item;
  document.getElementById('inputTitle').innerText = `${item.period}교시 ${item.subject}`;
  showView('inputView');
};

async function saveProgress() {
  const content = document.getElementById('progContent').value;
  const note = document.getElementById('progNotes').value;
  const dateStr = document.getElementById('dateText').innerText;
  
  await supabase.from('lesson_records').upsert({
    user_name: currentUser, date: dateStr, period: currentItem.period,
    subject: currentItem.subject, grade_class: currentItem.grade_class,
    content, note
  });
  alert("저장되었습니다.");
  startApp();
}

async function saveTimetable() {
  const inputs = document.querySelectorAll('.setup-in');
  const rows = [];
  inputs.forEach(i => {
    if (i.value) rows.push({ user_name: currentUser || tempSignUp.name, day: i.dataset.day, period: i.dataset.p, subject: i.value, grade_class: 'N/A' });
  });
  
  if (!currentUser) { // 회원가입 시
    await supabase.from('profiles').insert({ name: tempSignUp.name, pin: tempSignUp.pwd });
    currentUser = tempSignUp.name;
    localStorage.setItem('classFlow_userName', currentUser);
  }
  
  await supabase.from('basic_timetable').delete().eq('user_name', currentUser);
  await supabase.from('basic_timetable').insert(rows);
  alert("시간표가 저장되었습니다.");
  startApp();
}