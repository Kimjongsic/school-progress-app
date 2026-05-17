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
  isEditMode: false,
  isTagEditMode: false
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
  const target = document.getElementById(id);
  if (target) target.classList.remove('hidden');
}

async function initApp() {
  state.isEditMode = false;
  state.isTagEditMode = false;
  showView('mainView');
  
  const userDisplay = document.getElementById('userNameDisplay');
  if (userDisplay) userDisplay.innerText = state.user.name;

  const { data: current } = await supabase.from('basic_timetable').select('*').eq('user_name', state.user.name);
  if (current) {
    state.signUp.subs = [...new Set(current.map(i => i.subject))];
    state.signUp.gcs = [...new Set(current.map(i => i.grade_class))].sort();
  }

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
  
  document.getElementById('btnSignUpClose')?.addEventListener('click', () => {
    if (state.isEditMode) {
      if(confirm('수정 중인 내용이 사라집니다. 취소할까요?')) initApp();
    } else { showView('loginView'); }
  });

  document.getElementById('btnNextStep')?.addEventListener('click', handleNextButton);
  document.getElementById('btnAddPeriod')?.addEventListener('click', () => { if(state.maxPeriods < 15) { state.maxPeriods++; renderSetupGrid(true); }});
  document.getElementById('btnRemovePeriod')?.addEventListener('click', () => { if(state.maxPeriods > 1) { state.maxPeriods--; renderSetupGrid(true); }});

  document.getElementById('sheetOverlay')?.addEventListener('click', () => toggleSheet(false));
  document.getElementById('settingsOverlay')?.addEventListener('click', () => toggleSettings(false));
  document.getElementById('btnSettings')?.addEventListener('click', () => toggleSettings(true));
  document.getElementById('btnMenuEditTime')?.addEventListener('click', openEditTimetable);
  document.getElementById('btnMenuLogout')?.addEventListener('click', () => { localStorage.clear(); location.reload(); });
  
  document.getElementById('btnSaveProgress')?.addEventListener('click', saveProgress);
  document.querySelectorAll('.btnCloseSheet').forEach(btn => btn.addEventListener('click', () => toggleSheet(false)));

  document.getElementById('btnPrevDate')?.addEventListener('click', () => moveDate(-1));
  document.getElementById('btnNextDate')?.addEventListener('click', () => moveDate(1));
  
  // 4. 날짜 텍스트 그룹 클릭 시 달력 열기 보강
  document.getElementById('dateTextGroup')?.addEventListener('click', () => {
    const picker = document.getElementById('datePicker');
    if (picker && typeof picker.showPicker === 'function') {
        picker.showPicker();
    } else {
        picker.click(); // 폴백
    }
  });
  
  document.getElementById('datePicker')?.addEventListener('change', (e) => {
    state.activeDate = new Date(e.target.value);
    updateDateUI();
    fetchTimetable();
  });
}

window.toggleTagEditMode = () => {
    state.isTagEditMode = !state.isTagEditMode;
    const btnText = state.isTagEditMode ? "완료" : "편집";
    ['btnEditTagsStep2', 'btnEditTagsStep3', 'btnEditTagsStep4'].forEach(id => {
        const btn = document.getElementById(id); if(btn) btn.innerText = btnText;
    });
    if (state.signUp.step === 2) window.renderTags('sub', 'subTagContainer');
    else if (state.signUp.step === 3) window.renderTags('gc', 'gcTagContainer');
    else if (state.signUp.step === 4) renderSetupGrid(true);
};

window.renderTags = (type, containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
    
    let html = arr.map((tag, i) => {
        const color = type === 'sub' ? subPalette[state.signUp.subs.indexOf(tag) % subPalette.length] : (gradePalette[tag[0]] || gradePalette.default);
        const style = type === 'sub' ? `background:${color}; color:white; border:none;` : `color:${color}; border:2px solid ${color}; background:white;`;
        return `
            <div class="tag-chip">
                ${state.isTagEditMode ? `<button onclick="window.removeTag('${type}', ${i}, '${containerId}')" class="absolute -top-2 -left-2 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] z-10 shadow-sm"><i class="fa-solid fa-minus"></i></button>` : ''}
                <button onclick="window.fillCell('${type}', '${tag}', '${color}')" class="px-4 py-2 rounded-2xl text-xs font-black shadow-sm active:scale-95 transition-all" style="${style}">${tag}</button>
            </div>`;
    }).join('');

    if (state.isTagEditMode) {
        html += `<button onclick="window.showInlineInput('${type}', '${containerId}')" id="btnShow${type}Input" class="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center active:scale-90 border-2 border-dashed border-slate-200 transition-all"><i class="fa-solid fa-plus text-xs"></i></button>
                 <div id="${type}InputWrap" class="hidden flex items-center gap-1"><input type="text" id="${type}MiniInput" class="mini-input-chip"><button onclick="window.submitInlineInput('${type}', '${containerId}')" class="w-10 h-8 rounded-lg bg-[#005CC5] text-white text-[11px] font-black">확인</button></div>`;
    }
    container.innerHTML = html;
}

window.showInlineInput = (type, containerId) => {
    const btn = document.getElementById(`btnShow${type}Input`);
    const wrap = document.getElementById(`${type}InputWrap`);
    if(btn) btn.classList.add('hidden');
    if(wrap) wrap.classList.remove('hidden');
    const input = document.getElementById(`${type}MiniInput`);
    if(input) { input.focus(); input.onkeypress = (e) => { if(e.key === 'Enter') window.submitInlineInput(type, containerId); }; }
};

window.submitInlineInput = (type, containerId) => {
    const input = document.getElementById(`${type}MiniInput`);
    const val = input?.value.trim();
    if (val) {
        const arr = type === 'sub' ? state.signUp.subs : state.signUp.gcs;
        if(!arr.includes(val)) {
            arr.push(val);
            if (type === 'gc') arr.sort((a,b) => { const aP=a.split('-').map(Number); const bP=b.split('-').map(Number); return aP[0]!==bP[0]?aP[0]-bP[0]:(aP[1]||0)-(bP[1]||0); });
        }
    }
    window.renderTags(type, containerId);
    if(state.isEditMode) renderSetupGrid(true);
};

window.removeTag = (type, i, containerId) => {
    (type === 'sub' ? state.signUp.subs : state.signUp.gcs).splice(i, 1);
    window.renderTags(type, containerId);
    if(state.isEditMode) renderSetupGrid(true);
};

function renderSetupGrid(keepValues = false) {
  const body = document.getElementById('setupTableBody');
  if (!body) return;
  const saved = [];
  if(keepValues) {
    document.querySelectorAll('.setup-in').forEach(btn => {
        if(btn.innerText !== '과목' && btn.innerText !== '반') {
            saved.push({ d: btn.dataset.day, p: btn.dataset.p, val: btn.dataset.fullName || btn.innerText, type: btn.classList.contains('sub-cell') ? 'sub' : 'gc', color: btn.style.background || btn.style.color });
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
        target.innerText = s.type === 'sub' ? s.val.substring(0, 4) : s.val;
        target.dataset.fullName = s.val;
        if(s.type === 'sub') { target.style.background = s.color; target.classList.add('sub-filled'); }
        else { target.style.color = s.color; target.classList.add('gc-filled'); }
    }
  });
  window.renderTags('sub', 'quickSubSection'); window.renderTags('gc', 'quickGcSection');
  document.querySelectorAll('.setup-in').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.setup-in').forEach(b => b.classList.remove('active-cell'));
    btn.classList.add('active-cell');
    state.activeCell = { type: btn.classList.contains('sub-cell') ? 'sub' : 'gc', day: btn.dataset.day, p: btn.dataset.p };
  }));
}

window.fillCell = (type, val, color) => {
  if (state.isTagEditMode) return;
  if (!state.activeCell || state.activeCell.type !== type) return;
  const current = document.querySelector(`.${type}-cell[data-day="${state.activeCell.day}"][data-p="${state.activeCell.p}"]`);
  if (current) {
    current.innerText = type === 'sub' ? val.substring(0, 4) : val;
    current.dataset.fullName = val; 
    if (type === 'sub') {
      current.style.background = color; current.classList.add('sub-filled');
      const nextGc = document.querySelector(`.gc-cell[data-day="${state.activeCell.day}"][data-p="${state.activeCell.p}"]`);
      if (nextGc) nextGc.click();
    } else { current.style.color = color; current.classList.add('gc-filled'); }
  }
};

// 4. 대시보드 렌더링 및 크기/아이콘/색상 수정
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

  if (!basic.data?.length) { list.innerHTML = `<div class="py-20 text-center text-slate-400 font-bold">수업이 없는 날입니다 ☕️</div>`; return; }

  // [수정] 한 번에 로드하기 위해 병렬로 HTML 생성
  const dashboardHTML = await Promise.all(basic.data.map(async (item) => {
    const { data: prev } = await supabase.from('lesson_records').select('content').eq('user_name', state.user.name).eq('grade_class', item.grade_class).eq('subject', item.subject).lt('date', dateStr).order('date', { ascending: false }).limit(1).maybeSingle();
    const today = records.data?.find(r => r.period == item.period);
    
    const subColor = subPalette[state.signUp.subs.indexOf(item.subject) % subPalette.length] || '#1E293B';
    const gcColor = gradePalette[item.grade_class[0]] || gradePalette.default;

    return `
      <div class="class-card bg-white p-6 rounded-[32px] border border-slate-50 shadow-sm active:scale-95 transition-all cursor-pointer" 
           onclick='window.openInputSheet(${JSON.stringify(item)}, "${prev?.content || '첫 기록'}", ${JSON.stringify(today)})'>
        <div class="flex items-center justify-between mb-5">
          <div class="flex items-center gap-3">
            <span class="text-[14px] font-black bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg uppercase tracking-tight">${item.period}교시</span>
            <span class="px-2.5 py-1 rounded-full text-[11px] font-black text-white shadow-sm" style="background:${subColor}">${item.subject}</span>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-white border-2" style="color:${gcColor}; border-color:${gcColor}">${item.grade_class}</span>
          </div>
          <div class="w-10 h-10 rounded-2xl ${today ? 'bg-blue-50 text-[#005CC5]' : 'bg-slate-50 text-slate-200'} flex items-center justify-center text-xl">
            <i class="fa-solid ${today ? 'fa-check-circle' : 'fa-pen-to-square'}"></i>
          </div>
        </div>
        <div class="space-y-2 pl-1 bg-slate-50/50 p-3 rounded-2xl border border-slate-100/50">
          <div class="flex gap-2">
            <span class="text-[9px] font-black text-slate-300 w-10 shrink-0">LAST</span>
            <p class="text-[11px] font-bold text-slate-500 line-clamp-1">${prev?.content || '-'}</p>
          </div>
          <div class="flex gap-2">
            <span class="text-[9px] font-black text-[#005CC5] w-10 shrink-0 uppercase">Today</span>
            <p class="text-[12px] font-black text-slate-700 line-clamp-1">${today ? today.content : '<span class="text-slate-200 font-medium italic text-[11px]">입력 전</span>'}</p>
          </div>
        </div>
      </div>`;
  }));

  list.innerHTML = dashboardHTML.join('');
}

window.openInputSheet = (item, prevContent, todayRec) => {
  state.selectedItem = item;
  
  // 3. 입력창 상단 태그 렌더링 (대시보드와 동일 디자인)
  const subColor = subPalette[state.signUp.subs.indexOf(item.subject) % subPalette.length] || '#1E293B';
  const gcColor = gradePalette[item.grade_class[0]] || gradePalette.default;
  
  const tagHtml = `
    <span class="text-[12px] font-black bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg uppercase">${item.period}교시</span>
    <span class="px-3 py-1 rounded-full text-[12px] font-black text-white" style="background:${subColor}">${item.subject}</span>
    <span class="px-3 py-0.5 rounded-full text-[11px] font-black bg-white border-2" style="color:${gcColor}; border-color:${gcColor}">${item.grade_class}</span>
  `;
  document.getElementById('sheetTagContainer').innerHTML = tagHtml;
  
  document.getElementById('prevProgressText').innerText = prevContent;
  document.getElementById('progContent').value = todayRec ? todayRec.content : '';
  document.getElementById('progNote').value = todayRec ? todayRec.note : '';
  toggleSheet(true);
};

async function saveProgress() {
  const content = document.getElementById('progContent')?.value.trim();
  const note = document.getElementById('progNote')?.value.trim();
  const dateStr = state.activeDate.toISOString().split('T')[0];

  if (!content) return alert('내용을 입력해 주세요.');
  
  showView('loadingView');
  try {
    const { error } = await supabase.from('lesson_records').upsert({
      user_name: state.user.name,
      date: dateStr,
      period: state.selectedItem.period,
      grade_class: state.selectedItem.grade_class,
      subject: state.selectedItem.subject,
      content: content,
      note: note || '-'
    }, { onConflict: 'user_name, date, period, grade_class, subject' });

    if (error) throw error;
    toggleSheet(false);
    fetchTimetable();
  } catch (err) {
    alert('저장 실패: ' + err.message);
  } finally {
    showView('mainView');
  }
}

// --- 유틸리티 및 인증 ---
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
    if (!name) return;
    showView('loadingView');
    const { data } = await supabase.from('profiles').select('name').eq('name', name).maybeSingle();
    showView('signUpContainer');
    if (data) return alert('이미 가입된 이름입니다.');
    state.signUp.step++; updateSignUpUI();
  } else if (step < 4) { if (validateStep(step)) { state.signUp.step++; updateSignUpUI(); }} 
  else handleFinalSignUpSubmit();
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
        const subBtn = document.querySelector(`.sub-cell[data-day="${d}"][data-p="${p}"]`);
        const gcBtn = document.querySelector(`.gc-cell[data-day="${d}"][data-p="${p}"]`);
        const sub = subBtn?.dataset.fullName || subBtn?.innerText;
        const gc = gcBtn?.innerText;
        if (sub && sub !== '과목' && gc && gc !== '반') timetableData.push({ user_name: name, day: d, period: p, subject: sub, grade_class: gc });
      }
    });
    await supabase.from('basic_timetable').delete().eq('user_name', name);
    if (timetableData.length) await supabase.from('basic_timetable').insert(timetableData);
    state.isEditMode ? initApp() : location.reload();
  } catch (err) { alert(err.message); showView('signUpContainer'); }
}

async function openEditTimetable() {
    toggleSettings(false); state.isEditMode = true; state.isTagEditMode = false; state.signUp.step = 4;
    showView('loadingView');
    const { data: current } = await supabase.from('basic_timetable').select('*').eq('user_name', state.user.name);
    state.signUp.subs = [...new Set(current?.map(i => i.subject) || [])];
    state.signUp.gcs = [...new Set(current?.map(i => i.grade_class) || [])].sort();
    state.maxPeriods = Math.max(7, ... (current?.map(i => i.period) || [7]));
    showView('signUpContainer'); updateSignUpUI();
    current?.forEach(item => {
        const subCell = document.querySelector(`.sub-cell[data-day="${item.day}"][data-p="${item.period}"]`);
        const gcCell = document.querySelector(`.gc-cell[data-day="${item.day}"][data-p="${item.period}"]`);
        if(subCell) { subCell.innerText = item.subject.substring(0,4); subCell.dataset.fullName = item.subject; subCell.classList.add('sub-filled'); subCell.style.background = subPalette[state.signUp.subs.indexOf(item.subject) % subPalette.length]; }
        if(gcCell) { gcCell.innerText = item.grade_class; gcCell.classList.add('gc-filled'); gcCell.style.color = gradePalette[item.grade_class[0]] || gradePalette.default; }
    });
}

function updateSignUpUI() {
  document.querySelectorAll('.signUpStep').forEach(s => s.classList.add('hidden'));
  document.getElementById(`step${state.signUp.step}`)?.classList.remove('hidden');
  const backB = document.getElementById('btnSignUpBack');
  const nextB = document.getElementById('btnNextStep');
  const setupT = document.getElementById('setupTitle');

  if(state.isEditMode) {
      if(backB) backB.style.display = 'none';
      document.getElementById('progressWrapper').classList.add('hidden');
      setupT.innerText = "전체 시간표"; // 6, 7. 문구 수정
      nextB.innerText = "수정 완료";
  } else {
      if(backB) backB.style.display = 'flex';
      document.getElementById('progressWrapper').classList.remove('hidden');
      document.getElementById('signUpProgress').style.width = `${(state.signUp.step / 4) * 100}%`;
      setupT.innerText = "시간표 설정";
      nextB.innerText = state.signUp.step === 4 ? "가입 완료" : "다음 단계";
  }
  if (state.signUp.step === 2) window.renderTags('sub', 'subTagContainer');
  else if (state.signUp.step === 3) window.renderTags('gc', 'gcTagContainer');
  else if (state.signUp.step === 4) renderSetupGrid(state.isEditMode);
}

function toggleSettings(open) {
  const s = document.getElementById('settingsSheet');
  const o = document.getElementById('settingsOverlay');
  if(s) s.style.transform = open ? 'translateY(0)' : 'translateY(100%)';
  if(o) open ? o.classList.add('overlay-show') : o.classList.remove('overlay-show');
}

function toggleSheet(o) {
  const s = document.getElementById('inputSheet');
  const ov = document.getElementById('sheetOverlay');
  if (s) s.style.transform = o ? 'translateY(0)' : 'translateY(100%)';
  if (ov) o ? ov.classList.add('overlay-show') : ov.classList.remove('overlay-show');
}

function updateDateUI() {
  const d = document.getElementById('currentDateDisplay');
  if (d) d.innerText = state.activeDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
}

function moveDate(offset) { state.activeDate.setDate(state.activeDate.getDate() + offset); updateDateUI(); fetchTimetable(); }
function validateStep(step) { if (step === 2 && !state.signUp.subs.length) return false; if (step === 3 && !state.signUp.gcs.length) return false; return true; }