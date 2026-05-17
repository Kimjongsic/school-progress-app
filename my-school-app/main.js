import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gckplcpwrvabhqqohuib.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdja3BsY3B3cnZhYmhxcW9odWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDI3NTYsImV4cCI6MjA5NDQ3ODc1Nn0.rg9p24pmgeAIe6EcNZjIFEePXtpesnOnOZRlQKyUcuU';
const supabase = createClient(supabaseUrl, supabaseKey);

let state = {
  user: JSON.parse(localStorage.getItem('cf_user')) || null,
  activeDate: new Date(),
  signUp: { step: 1, subs: [], gcs: [] },
  activeCell: null, 
  maxPeriods: 7, 
  isSheetOpen: false,
  isEditMode: false
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
  state.isEditMode = false;
  showView('mainView');
  const userDisplay = document.getElementById('userNameDisplay');
  if (userDisplay) userDisplay.innerText = state.user.name;
  updateDateUI();
  fetchTimetable();
}

function initEvents() {
  document.getElementById('btnLogin')?.addEventListener('click', handleLogin);
  document.getElementById('btnOpenSignUp')?.addEventListener('click', () => {
    state.isEditMode = false; state.signUp = { step: 1, subs: [], gcs: [] };
    updateSignUpUI(); showView('signUpContainer');
  });

  document.getElementById('btnSignUpBack')?.addEventListener('click', () => { if (state.signUp.step > 1) { state.signUp.step--; updateSignUpUI(); }});
  document.getElementById('btnSignUpClose')?.addEventListener('click', () => state.isEditMode ? initApp() : showView('loginView'));
  document.getElementById('btnNextStep')?.addEventListener('click', handleNextButton);

  document.getElementById('btnAddPeriod')?.addEventListener('click', () => { if(state.maxPeriods < 15) { state.maxPeriods++; renderSetupGrid(true); }});
  document.getElementById('btnRemovePeriod')?.addEventListener('click', () => { if(state.maxPeriods > 1) { state.maxPeriods--; renderSetupGrid(true); }});

  document.getElementById('sheetOverlay')?.addEventListener('click', () => toggleSheet(false));
  document.getElementById('settingsOverlay')?.addEventListener('click', () => toggleSettings(false));
  document.getElementById('btnSettings')?.addEventListener('click', () => toggleSettings(true));
  document.getElementById('btnMenuEditTime')?.addEventListener('click', openEditTimetable);
  document.getElementById('btnMenuLogout')?.addEventListener('click', () => { localStorage.clear(); location.reload(); });
  
  document.getElementById('btnSaveProgress')?.addEventListener('click', saveProgress);
  document.getElementById('btnPrevDate')?.addEventListener('click', () => moveDate(-1));
  document.getElementById('btnNextDate')?.addEventListener('click', () => moveDate(1));
}

// [핵심] 클릭 입력 기능을 포함한 칩 렌더링 함수
window.renderTags = (type, containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
    
    let html = arr.map((tag, i) => {
        const color = type === 'sub' ? subPalette[i % subPalette.length] : (gradePalette[tag[0]] || gradePalette.default);
        const style = type === 'sub' ? `background:${color}; color:white; border:none;` : `color:${color}; border:2px solid ${color}; background:white;`;
        
        // 클릭 시 시간표 칸을 채우는 fillCell 함수 호출
        return `<button onclick="window.fillCell('${type}', '${tag}', '${color}')" class="tag-chip px-4 py-2 rounded-2xl text-xs font-black shadow-sm active:scale-90 transition-all" style="${style}">${tag}</button>`;
    }).join('');

    // + 버튼 추가
    html += `
        <div id="${type}AddContainer" class="flex items-center">
            <button id="btnShow${type}Input" onclick="window.showInlineInput('${type}', '${containerId}')" class="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center active:scale-90 border-2 border-dashed border-slate-200 transition-all"><i class="fa-solid fa-plus"></i></button>
            <div id="${type}InputWrap" class="hidden flex items-center gap-1">
                <input type="text" id="${type}MiniInput" class="mini-input-chip">
                <button onclick="window.submitInlineInput('${type}', '${containerId}')" class="w-10 h-8 rounded-lg bg-[#005CC5] text-white text-[11px] font-black">확인</button>
            </div>
        </div>`;
    container.innerHTML = html;
}

window.showInlineInput = (type, containerId) => {
    document.getElementById(`btnShow${type}Input`).classList.add('hidden');
    document.getElementById(`${type}InputWrap`).classList.remove('hidden');
    const input = document.getElementById(`${type}MiniInput`);
    input.focus();
    input.onkeypress = (e) => { if(e.key === 'Enter') window.submitInlineInput(type, containerId); };
};

window.submitInlineInput = (type, containerId) => {
    const input = document.getElementById(`${type}MiniInput`);
    const val = input.value.trim();
    if (val && ! (type === 'sub' ? state.signUp.subs : state.signUp.gcs).includes(val)) {
        const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
        arr.push(val);
        // 반 정렬 로직 (1-1, 2-1 순)
        if (type === 'gc') arr.sort((a,b) => { 
            const aP = a.split('-').map(Number); const bP = b.split('-').map(Number); 
            return aP[0] !== bP[0] ? aP[0]-bP[0] : (aP[1]||0)-(bP[1]||0); 
        });
    }
    window.renderTags(type, containerId);
    if(state.isEditMode) renderSetupGrid(true);
};

// [중요] 시간표 클릭 입력 로직
window.fillCell = (type, val, color) => {
  if (!state.activeCell || state.activeCell.type !== type) return;
  const current = document.querySelector(`.${type}-cell[data-day="${state.activeCell.day}"][data-p="${state.activeCell.p}"]`);
  if (current) {
    current.innerText = val;
    if (type === 'sub') {
      current.style.background = color; current.classList.add('sub-filled');
      // 과목 입력 후 '반' 칸으로 자동 포커스
      const nextGc = document.querySelector(`.gc-cell[data-day="${state.activeCell.day}"][data-p="${state.activeCell.p}"]`);
      if (nextGc) nextGc.click();
    } else {
      current.style.color = color; current.classList.add('gc-filled');
    }
  }
};

function renderSetupGrid(keepValues = false) {
  const body = document.getElementById('setupTableBody');
  if (!body) return;
  const saved = [];
  if(keepValues) {
    document.querySelectorAll('.setup-in').forEach(btn => {
        if(btn.innerText !== '과목' && btn.innerText !== '반') {
            saved.push({ d: btn.dataset.day, p: btn.dataset.p, val: btn.innerText, type: btn.classList.contains('sub-cell') ? 'sub' : 'gc', color: btn.style.background || btn.style.color });
        }
    });
  }
  body.innerHTML = '';
  for (let p = 1; p <= state.maxPeriods; p++) {
    const row = document.createElement('tr');
    row.innerHTML = `<td class="header-cell text-center font-bold text-slate-400 text-[11px]">${p}</td>` + 
      ['월','화','수','목','금'].map(d => `<td><button class="setup-in sub-cell" data-day="${d}" data-p="${p}">과목</button><button class="setup-in gc-cell mt-1" data-day="${d}" data-p="${p}">반</button></td>`).join('');
    body.appendChild(row);
  }
  saved.forEach(s => {
    const target = document.querySelector(`.${s.type}-cell[data-day="${s.d}"][data-p="${s.p}"]`);
    if(target) {
        target.innerText = s.val;
        if(s.type === 'sub') { target.style.background = s.color; target.classList.add('sub-filled'); }
        else { target.style.color = s.color; target.classList.add('gc-filled'); }
    }
  });
  
  // 하단 퀵 버튼 영역 렌더링
  window.renderTags('sub', 'quickSubSection'); 
  window.renderTags('gc', 'quickGcSection');

  document.querySelectorAll('.setup-in').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.setup-in').forEach(b => b.classList.remove('active-cell'));
    btn.classList.add('active-cell');
    state.activeCell = { type: btn.classList.contains('sub-cell') ? 'sub' : 'gc', day: btn.dataset.day, p: btn.dataset.p };
  }));
}

// --- 유틸리티 및 데이터 통신 ---
async function handleLogin() {
  const n = document.getElementById('loginName')?.value.trim();
  const p = document.getElementById('loginPin')?.value.trim();
  const { data } = await supabase.from('profiles').select('*').eq('name', n).eq('pin', p).maybeSingle();
  if (data) { state.user = data; localStorage.setItem('cf_user', JSON.stringify(data)); initApp(); }
  else alert('로그인 정보를 확인해주세요.');
}

async function handleNextButton() {
  const step = state.signUp.step;
  if (step === 1) {
    const name = document.getElementById('regName')?.value.trim();
    const pin = document.getElementById('regPin')?.value.trim();
    if (!name || pin?.length !== 4) return alert('확인 필요');
    showView('loadingView');
    const { data } = await supabase.from('profiles').select('name').eq('name', name).maybeSingle();
    showView('signUpContainer');
    if (data) return alert('중복된 이름');
    state.signUp.step++; updateSignUpUI();
  } else if (step < 4) { if (validateStep(step)) { state.signUp.step++; updateSignUpUI(); }} 
  else handleFinalSignUpSubmit();
}

function updateSignUpUI() {
  document.querySelectorAll('.signUpStep').forEach(s => s.classList.add('hidden'));
  document.getElementById(`step${state.signUp.step}`)?.classList.remove('hidden');
  const progW = document.getElementById('progressWrapper');
  const setupT = document.getElementById('setupTitle');
  const nextB = document.getElementById('btnNextStep');
  if(state.isEditMode) { progW.classList.add('hidden'); setupT.innerText = "전체 시간표 수정"; nextB.innerText = "수정 완료"; }
  else { progW.classList.remove('hidden'); document.getElementById('signUpProgress').style.width = `${(state.signUp.step / 4) * 100}%`; nextB.innerText = state.signUp.step === 4 ? '가입 완료' : '다음으로'; }
  
  if (state.signUp.step === 2) window.renderTags('sub', 'subTagContainer');
  else if (state.signUp.step === 3) window.renderTags('gc', 'gcTagContainer');
  else if (state.signUp.step === 4) renderSetupGrid(state.isEditMode);
}

async function openEditTimetable() {
    toggleSettings(false); state.isEditMode = true; state.signUp.step = 4;
    showView('loadingView');
    const { data: current } = await supabase.from('basic_timetable').select('*').eq('user_name', state.user.name);
    state.signUp.subs = [...new Set(current?.map(i => i.subject) || [])];
    state.signUp.gcs = [...new Set(current?.map(i => i.grade_class) || [])].sort((a,b) => { const aP = a.split('-').map(Number); const bP = b.split('-').map(Number); return aP[0] !== bP[0] ? aP[0]-bP[0] : (aP[1]||0)-(bP[1]||0); });
    state.maxPeriods = Math.max(7, ... (current?.map(i => i.period) || [7]));
    showView('signUpContainer'); updateSignUpUI();
    current?.forEach(item => {
        const subCell = document.querySelector(`.sub-cell[data-day="${item.day}"][data-p="${item.period}"]`);
        const gcCell = document.querySelector(`.gc-cell[data-day="${item.day}"][data-p="${item.period}"]`);
        if(subCell) { subCell.innerText = item.subject; subCell.classList.add('sub-filled'); subCell.style.background = subPalette[state.signUp.subs.indexOf(item.subject) % subPalette.length]; }
        if(gcCell) { gcCell.innerText = item.grade_class; gcCell.classList.add('gc-filled'); gcCell.style.color = gradePalette[item.grade_class[0]] || gradePalette.default; }
    });
}

async function fetchTimetable() {
  const dateStr = state.activeDate.toISOString().split('T')[0];
  const dayName = ['일','월','화','수','목','금','토'][state.activeDate.getDay()];
  const list = document.getElementById('timetableList');
  if (!list) return;
  list.innerHTML = `<div class="py-20 text-center"><i class="fa-solid fa-spinner fa-spin text-2xl text-slate-200"></i></div>`;
  const [basic, records] = await Promise.all([
    supabase.from('basic_timetable').select('*').eq('user_name', state.user.name).eq('day', dayName).order('period'),
    supabase.from('lesson_records').select('*').eq('user_name', state.user.name).eq('date', dateStr)
  ]);
  list.innerHTML = basic.data?.length ? '' : `<div class="py-20 text-center text-slate-400 font-bold">수업이 없습니다.</div>`;
  for (const item of basic.data || []) {
    const { data: prev } = await supabase.from('lesson_records').select('content').eq('user_name', state.user.name).eq('grade_class', item.grade_class).eq('subject', item.subject).lt('date', dateStr).order('date', { ascending: false }).limit(1).maybeSingle();
    const today = records.data?.find(r => r.period == item.period);
    const card = document.createElement('div');
    card.className = "bg-white p-6 rounded-[32px] border border-slate-50 shadow-sm flex justify-between items-center active:scale-95 transition-all cursor-pointer";
    card.innerHTML = `<div class="flex-1"><div class="flex items-center gap-2 mb-2"><span class="text-[9px] font-black bg-[#005CC5] text-white px-2 py-0.5 rounded-md uppercase tracking-tighter">${item.period}교시</span><span class="text-[10px] font-black text-slate-300 uppercase">${item.grade_class}</span></div><h4 class="text-xl font-black text-slate-900">${item.subject}</h4><p class="text-[11px] font-bold text-slate-400 mt-2 line-clamp-1">이전: <span class="text-slate-600">${prev?.content || '-'}</span></p></div><div class="w-14 h-14 rounded-[22px] ${today ? 'bg-blue-50 text-[#005CC5]' : 'bg-slate-50 text-slate-200'} flex items-center justify-center text-2xl"><i class="fa-solid ${today ? 'fa-check-circle' : 'fa-feather-pointed'}"></i></div>`;
    card.addEventListener('click', () => {
      state.selectedItem = item;
      document.getElementById('sheetBadge').innerText = item.grade_class;
      document.getElementById('sheetTitle').innerText = `${item.subject} 진도 기록`;
      document.getElementById('prevProgressText').innerText = prev?.content || '첫 기록';
      document.getElementById('progContent').value = today ? today.content : '';
      document.getElementById('progNote').value = today ? today.note : '';
      toggleSheet(true);
    });
    list.appendChild(card);
  }
}

async function handleFinalSignUpSubmit() {
  const name = state.isEditMode ? state.user.name : document.getElementById('regName')?.value.trim();
  const pin = document.getElementById('regPin')?.value.trim();
  showView('loadingView');
  try {
    if (!state.isEditMode) await supabase.from('profiles').insert({ name, pin });
    const timetableData = [];
    ['월','화','수','목','금'].forEach(d => {
      for (let p = 1; p <= state.maxPeriods; p++) {
        const sub = document.querySelector(`.sub-cell[data-day="${d}"][data-p="${p}"]`)?.innerText;
        const gc = document.querySelector(`.gc-cell[data-day="${d}"][data-p="${p}"]`)?.innerText;
        if (sub && sub !== '과목' && gc && gc !== '반') timetableData.push({ user_name: name, day: d, period: p, subject: sub, grade_class: gc });
      }
    });
    await supabase.from('basic_timetable').delete().eq('user_name', name);
    if (timetableData.length) await supabase.from('basic_timetable').insert(timetableData);
    state.isEditMode ? initApp() : location.reload();
  } catch (err) { alert(err.message); showView('signUpContainer'); }
}

function toggleSettings(open) {
    const sheet = document.getElementById('settingsSheet');
    const overlay = document.getElementById('settingsOverlay');
    if(sheet) sheet.style.transform = open ? 'translateY(0)' : 'translateY(100%)';
    if(overlay) open ? overlay.classList.add('overlay-show') : overlay.classList.remove('overlay-show');
}

function toggleSheet(o) {
  const s = document.getElementById('inputSheet');
  const ov = document.getElementById('sheetOverlay');
  if (s) s.style.transform = o ? 'translateY(0)' : 'translateY(100%)';
  if (ov) o ? ov.classList.add('overlay-show') : ov.classList.remove('overlay-show');
}

async function saveProgress() {
  const c = document.getElementById('progContent')?.value.trim();
  const n = document.getElementById('progNote')?.value.trim();
  const d = state.activeDate.toISOString().split('T')[0];
  if (!c) return alert('진도 입력');
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

function moveDate(offset) {
  state.activeDate.setDate(state.activeDate.getDate() + offset);
  updateDateUI(); fetchTimetable();
}

function validateStep(step) {
  if (step === 2 && !state.signUp.subs.length) return false;
  if (step === 3 && !state.signUp.gcs.length) return false;
  return true;
}