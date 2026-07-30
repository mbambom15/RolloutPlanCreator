let rowCounter = 0;
let lastSchedule = null;
let lastHolidayMap = null;
let lastSessionResults = null;
let lastExamDate = null;
let lastSummary = null;

function addModuleRow(name = '', credits = ''){
  rowCounter++;
  const tbody = document.getElementById('moduleBody');
  const tr = document.createElement('tr');
  tr.className = 'module-row';
  tr.dataset.id = rowCounter;
  tr.innerHTML = `
    <td class="num">${tbody.children.length + 1}</td>
    <td><input type="text" class="mod-name" value="${escapeHtml(name)}" placeholder="e.g. Software Engineering, Level 6, 20 Credits"></td>
    <td><input type="number" class="mod-credits num" min="0" step="1" value="${credits}"></td>
    <td><button class="btn ghost" type="button" title="Remove" onclick="removeRow(this)">&times;</button></td>
  `;
  tbody.appendChild(tr);
  renumber();
}

function removeRow(btn){
  const tr = btn.closest('tr');
  tr.remove();
  renumber();
}

function renumber(){
  const rows = document.querySelectorAll('#moduleBody tr');
  rows.forEach((r,i)=>{ r.children[0].textContent = i+1; });
}

function clearAll(){
  document.getElementById('moduleBody').innerHTML = '';
  document.getElementById('scheduleArea').innerHTML = '<div class="empty">No schedule yet — add modules above and click "Calculate Roll-out Plan".</div>';
  document.getElementById('summaryArea').innerHTML = '<div class="empty">Summary will appear once a schedule is calculated.</div>';
  lastSchedule = null;
  lastHolidayMap = null;
  lastSessionResults = null;
  lastExamDate = null;
  lastSummary = null;
  const sessionArea = document.getElementById('sessionPlanArea');
  if(sessionArea) sessionArea.innerHTML = '<div class="empty">Calculate the roll-out plan above, choose a pattern, then click "Generate Session Dates".</div>';
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ---------- Date helpers ----------
function parseISO(s){
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}
function fmt(d){
  return d.toLocaleDateString('en-ZA', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
}
function fmtDateOnly(d){
  return d.toLocaleDateString('en-ZA', { day:'2-digit', month:'short', year:'numeric' });
}
function addCalendarDays(d, n){
  const nd = new Date(d);
  nd.setDate(nd.getDate()+n);
  return nd;
}
function pad2(n){ return String(n).padStart(2,'0'); }
function isoKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }

// ---------- South African public holidays ----------
// Not shown to the user anywhere in the UI/PDF, but still fully applied
// under the hood so the available-day pool and every module/session date
// correctly skip them.
function easterSunday(year){
  const a = year % 19;
  const b = Math.floor(year/100);
  const c = year % 100;
  const d = Math.floor(b/4);
  const e = b % 4;
  const f = Math.floor((b+8)/25);
  const g = Math.floor((b-f+1)/3);
  const h = (19*a + b - d - g + 15) % 30;
  const i = Math.floor(c/4);
  const k = c % 4;
  const l = (32 + 2*e + 2*i - h - k) % 7;
  const m = Math.floor((a + 11*h + 22*l)/451);
  const month = Math.floor((h + l - 7*m + 114)/31);
  const day = ((h + l - 7*m + 114) % 31) + 1;
  return new Date(year, month-1, day);
}
function saPublicHolidaysForYear(year){
  const list = [];
  const add = (m,d,name) => list.push({ date: new Date(year, m, d), name });
  add(0,1,"New Year's Day");
  add(2,21,"Human Rights Day");
  const easter = easterSunday(year);
  list.push({ date: addCalendarDays(easter,-2), name: "Good Friday" });
  list.push({ date: addCalendarDays(easter, 1), name: "Family Day" });
  add(3,27,"Freedom Day");
  add(4,1,"Workers' Day");
  add(5,16,"Youth Day");
  add(7,9,"National Women's Day");
  add(8,24,"Heritage Day");
  add(11,16,"Day of Reconciliation");
  add(11,25,"Christmas Day");
  add(11,26,"Day of Goodwill");
  return list;
}
function buildHolidayMap(startYear, endYear){
  const map = new Map();
  for(let y = startYear; y <= endYear; y++){
    saPublicHolidaysForYear(y).forEach(h => {
      const key = isoKey(h.date);
      if(!map.has(key)) map.set(key, h.name);
      if(h.date.getDay() === 0){
        const mon = addCalendarDays(h.date, 1);
        const mkey = isoKey(mon);
        if(!map.has(mkey)) map.set(mkey, h.name + ' (observed, fell on Sunday)');
      }
    });
  }
  return map;
}
// December break: last contact day is 18 Dec, resumes 4 Jan — every year.
function isDecemberBreak(d){
  const m = d.getMonth();
  const day = d.getDate();
  if(m === 11 && day >= 19) return true;
  if(m === 0 && day <= 3) return true;
  return false;
}
function isValidContactDay(d, holidayMap, daySet){
  if(!daySet.has(d.getDay())) return false;
  if(isDecemberBreak(d)) return false;
  if(holidayMap.has(isoKey(d))) return false;
  return true;
}
function nextContactDay(d, holidayMap, daySet){
  const nd = new Date(d);
  let guard = 0;
  while(!isValidContactDay(nd, holidayMap, daySet)){
    nd.setDate(nd.getDate()+1);
    guard++;
    if(guard > 3650) break;
  }
  return nd;
}
function businessDayEnd(start, days, holidayMap, daySet){
  if(days <= 0) return new Date(start);
  let d = new Date(start);
  let count = 1;
  while(count < days){
    d.setDate(d.getDate()+1);
    if(isValidContactDay(d, holidayMap, daySet)) count++;
  }
  return d;
}
function countBusinessDaysBetween(start, end, holidayMap, daySet){
  if(end < start) return 0;
  let d = new Date(start);
  let count = 0;
  while(d <= end){
    if(isValidContactDay(d, holidayMap, daySet)) count++;
    d.setDate(d.getDate()+1);
  }
  return count;
}
function twelveMonthExamDate(start){
  const d = new Date(start);
  d.setFullYear(d.getFullYear(), d.getMonth()+12, d.getDate());
  d.setDate(d.getDate()-1);
  return d;
}

// ---------- Stage 1: proportional business-day allocation ----------
// Always works in a standard Mon–Fri business week — which specific
// weekday(s) sessions actually fall on is decided in Stage 2, not here.
function computeSchedule(){
  const cohortName = document.getElementById('cohortName').value.trim();
  const startInput = document.getElementById('startDate').value;
  const inductionInput = document.getElementById('inductionDate')?.value || '';
  if(!startInput){ alert('Please set a programme start date.'); return; }

  const rawStart = parseISO(startInput);
  let inductionDate = null;
  if(inductionInput){
    inductionDate = parseISO(inductionInput);
    if(inductionDate <= rawStart){
      alert('Induction date must be after the programme start date. Fix this before calculating — the schedule will not be generated until it is.');
      return;
    }
  }
  // Counting begins from the induction date when one's given (it must be
  // after the start date, enforced above); otherwise from the start date
  // itself. The exam deadline is still fixed off the original start date.
  const countingStart = inductionDate || rawStart;

  const daySet = new Set([1,2,3,4,5]);
  const examDate = twelveMonthExamDate(rawStart);
  const holidayMap = buildHolidayMap(rawStart.getFullYear() - 1, examDate.getFullYear() + 1);
  const start = nextContactDay(countingStart, holidayMap, daySet);

  const rows = document.querySelectorAll('#moduleBody tr');
  if(rows.length === 0){ alert('Add at least one module first.'); return; }
  const modules = [];
  rows.forEach(r => {
    const name = r.querySelector('.mod-name').value.trim() || '(untitled module)';
    const credits = parseFloat(r.querySelector('.mod-credits').value) || 0;
    modules.push({ name, credits });
  });

  const totalCredits = modules.reduce((sum, m) => sum + m.credits, 0);
  if(totalCredits <= 0){ alert('Add credits to at least one module before calculating.'); return; }

  const availableBusinessDays = countBusinessDaysBetween(start, examDate, holidayMap, daySet);
  if(availableBusinessDays <= 0){ alert('There are no available business days between the start date and the exam deadline — check the programme start date.'); return; }

  let cursor = new Date(start);
  let allocatedDays = 0;
  const schedule = [];

  modules.forEach((mod, index) => {
    let days;
    if(index === modules.length - 1){
      // last module absorbs whatever's left so the programme lands exactly on the deadline
      days = availableBusinessDays - allocatedDays;
    } else {
      days = Math.round((mod.credits / totalCredits) * availableBusinessDays);
      allocatedDays += days;
    }
    days = Math.max(days, 0);

    let moduleStart = null, moduleEnd = null;
    if(days > 0){
      moduleStart = nextContactDay(cursor, holidayMap, daySet);
      moduleEnd = businessDayEnd(moduleStart, days, holidayMap, daySet);
      cursor = nextContactDay(addCalendarDays(moduleEnd, 1), holidayMap, daySet);
    }

    schedule.push({
      name: mod.name,
      credits: mod.credits,
      pct: totalCredits > 0 ? (mod.credits / totalCredits) * 100 : 0,
      days,
      moduleStart,
      moduleEnd
    });
  });

  const totalAllocatedDays = schedule.reduce((sum, s) => sum + s.days, 0);

  lastSchedule = schedule;
  lastHolidayMap = holidayMap;
  lastExamDate = examDate;
  lastSessionResults = null;
  const sessionAreaReset = document.getElementById('sessionPlanArea');
  if(sessionAreaReset) sessionAreaReset.innerHTML = '<div class="empty">Roll-out plan updated — choose a pattern and click "Generate Session Dates" to refresh the session table.</div>';

  renderSchedule(schedule);

  lastSummary = {
    totalCredits,
    availableBusinessDays,
    totalAllocatedDays,
    utilisation: availableBusinessDays > 0 ? (totalAllocatedDays / availableBusinessDays) * 100 : 0,
    avgDaysPerCredit: totalCredits > 0 ? (totalAllocatedDays / totalCredits) : 0
  };

  renderSummary({
    cohortName,
    inductionDate,
    rawStart,
    start,
    examDate,
    ...lastSummary
  });
  // Holidays/December break are still fully applied above — just not listed out here.
}

function renderSchedule(schedule){
  const area = document.getElementById('scheduleArea');
  let html = `<table><thead><tr>
    <th>#</th><th>Module</th><th class="num">Credits</th><th class="num">Notional Hrs</th>
    <th class="num">% of Programme</th><th class="num">Allocated Days</th><th>Start</th><th>End</th>
  </tr></thead><tbody>`;
  schedule.forEach((s,i) => {
    html += `<tr>
      <td class="num">${i+1}</td>
      <td>${escapeHtml(s.name)}</td>
      <td class="num">${s.credits}</td>
      <td class="num">${s.credits * 10}</td>
      <td class="num">${s.pct.toFixed(1)}%</td>
      <td class="num">${s.days}</td>
      <td>${s.moduleStart ? fmt(s.moduleStart) : '—'}</td>
      <td>${s.moduleEnd ? fmt(s.moduleEnd) : '—'}</td>
    </tr>`;
  });
  html += `</tbody></table>
  <div class="callout" style="margin-top:10px;">Notional Hours (credits &times; 10) is shown for SETA/assessor reference only — it does not drive the schedule above.</div>`;
  area.innerHTML = html;
}

function renderSummary(sum){
  const area = document.getElementById('summaryArea');
  area.innerHTML = `
    <div class="summary-grid">
      <div class="summary-cell">
        <div class="label">Cohort</div>
        <div class="value" style="font-size:16px;">${sum.cohortName ? escapeHtml(sum.cohortName) : '—'}</div>
      </div>
      <div class="summary-cell">
        <div class="label">Induction Date</div>
        <div class="value" style="font-size:16px;">${sum.inductionDate ? fmt(sum.inductionDate) : '—'}</div>
      </div>
      <div class="summary-cell">
        <div class="label">Programme Start</div>
        <div class="value" style="font-size:16px;">${fmt(sum.rawStart)}</div>
      </div>
      <div class="summary-cell">
        <div class="label">Programme End (Exam Deadline)</div>
        <div class="value" style="font-size:16px;">${fmt(sum.examDate)}</div>
      </div>
      <div class="summary-cell">
        <div class="label">Available Business Days</div>
        <div class="value">${sum.availableBusinessDays}</div>
      </div>
      <div class="summary-cell">
        <div class="label">Allocated Business Days</div>
        <div class="value">${sum.totalAllocatedDays}</div>
      </div>
      <div class="summary-cell ${Math.abs(sum.utilisation-100) < 0.05 ? 'flag-good' : ''}">
        <div class="label">Utilisation</div>
        <div class="value">${sum.utilisation.toFixed(1)}%</div>
      </div>
      <div class="summary-cell">
        <div class="label">Total Credits</div>
        <div class="value">${sum.totalCredits}</div>
      </div>
      <div class="summary-cell" style="grid-column: span 2;">
        <div class="label">Average Days per Credit</div>
        <div class="value">${sum.avgDaysPerCredit.toFixed(2)}</div>
      </div>
    </div>
    <div class="callout" style="margin-top:10px;">Because the last module absorbs whatever business days are left over after
      the others are allocated by credit share, the programme always finishes exactly on the exam
      deadline (${fmt(sum.examDate)}).</div>
  `;
}

// ---------- Stage 2: Session Planner ----------
function getRecurrenceType(){
  return document.querySelector('input[name="recurrenceType"]:checked')?.value || 'weekly';
}
function onRecurrenceTypeChange(){
  const type = getRecurrenceType();
  const weekly = document.getElementById('weeklyOptions');
  const biweekly = document.getElementById('biweeklyOptions');
  const monthly = document.getElementById('monthlyOptions');
  if(weekly) weekly.style.display = type === 'weekly' ? 'block' : 'none';
  if(biweekly) biweekly.style.display = type === 'biweekly' ? 'block' : 'none';
  if(monthly) monthly.style.display = type === 'monthly' ? 'block' : 'none';
}
// Shared toggle for the single-select (radio) day chips used by bi-weekly/monthly
function onRadioDayToggle(radio){
  const group = radio.closest('.daypicker');
  if(group) group.querySelectorAll('.daychip').forEach(chip => chip.classList.remove('checked'));
  const chip = radio.closest('.daychip');
  if(chip) chip.classList.add('checked');
}
function onSessionDayChipToggle(checkbox){
  checkbox.closest('.daychip').classList.toggle('checked', checkbox.checked);
}
function onSessionWeekChipToggle(checkbox){
  checkbox.closest('.daychip').classList.toggle('checked', checkbox.checked);
}
function getSessionDaySet(){
  const boxes = document.querySelectorAll('#sessionDayPicker input[type=checkbox]');
  const set = new Set();
  boxes.forEach(b => { if(b.checked) set.add(parseInt(b.value,10)); });
  return set;
}
function setSessionPreset(preset){
  // Quick patterns are weekly-only — switch back to weekly mode if another is selected
  const weeklyRadio = document.querySelector('input[name="recurrenceType"][value="weekly"]');
  if(weeklyRadio && !weeklyRadio.checked){
    weeklyRadio.checked = true;
    onRecurrenceTypeChange();
  }
  const map = { all:[1,2,3,4,5], mon:[1], tuethu:[2,4], mwf:[1,3,5] };
  const selected = new Set(map[preset] || []);
  document.querySelectorAll('#sessionDayPicker input[type=checkbox]').forEach(b => {
    b.checked = selected.has(parseInt(b.value,10));
    b.closest('.daychip').classList.toggle('checked', b.checked);
  });
}

// Weekly: every occurrence of the selected weekday(s) within the range.
function generateSessionsInRange(start, end, holidayMap, daySet){
  const sessions = [];
  if(!start || !end) return sessions;
  let d = new Date(start);
  while(d <= end){
    if(daySet.has(d.getDay()) && !isDecemberBreak(d) && !holidayMap.has(isoKey(d))){
      sessions.push(new Date(d));
    }
    d.setDate(d.getDate()+1);
  }
  return sessions;
}
// The Nth (1-4) occurrence of `weekday` (0=Sun..6=Sat) in a given month/year.
function nthWeekdayOfMonth(year, month, weekday, n){
  const first = new Date(year, month, 1);
  const firstWeekday = first.getDay();
  const day = 1 + ((7 + weekday - firstWeekday) % 7) + (n - 1) * 7;
  return new Date(year, month, day);
}
// Unified generator for both Bi-weekly and Monthly patterns: one session
// per selected week-of-month (weeksOfMonth can be any combination of
// 1-4, e.g. {1,3} for "1st and 3rd week" = 2 sessions/month, or a single
// value for Monthly's "once a month"), on the chosen weekday, repeated
// every month across the module's date range. An occurrence that lands
// on a holiday or inside the December break is skipped for that month
// only — the pattern still applies every other month.
function generateWeekOfMonthSessions(start, end, holidayMap, weekday, weeksOfMonth){
  const sessions = [];
  if(!start || !end || !weeksOfMonth || weeksOfMonth.size === 0) return sessions;
  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = end.getFullYear();
  const endM = end.getMonth();
  const weeks = Array.from(weeksOfMonth).sort((a,b) => a - b);
  let guard = 0;
  while(y < endY || (y === endY && m <= endM)){
    weeks.forEach(wk => {
      const occurrence = nthWeekdayOfMonth(y, m, weekday, wk);
      if(occurrence >= start && occurrence <= end && !isDecemberBreak(occurrence) && !holidayMap.has(isoKey(occurrence))){
        sessions.push(occurrence);
      }
    });
    m++;
    if(m > 11){ m = 0; y++; }
    guard++;
    if(guard > 600) break; // safety valve against a runaway range
  }
  return sessions;
}

function generateSessionPlan(){
  if(!lastSchedule || !lastHolidayMap){
    alert('Calculate the roll-out plan above first — the session planner schedules within the date ranges it produces.');
    return;
  }

  const recurrenceType = getRecurrenceType();
  let results;

  if(recurrenceType === 'biweekly'){
    const dayVal = document.querySelector('input[name="biweeklyDay"]:checked')?.value;
    if(!dayVal){ alert('Select a day for the bi-weekly pattern.'); return; }
    const weekday = parseInt(dayVal, 10);
    const weeksOfMonth = new Set();
    document.querySelectorAll('#biweeklyWeekPicker input[type=checkbox]:checked').forEach(b => weeksOfMonth.add(parseInt(b.value, 10)));
    if(weeksOfMonth.size === 0){ alert('Select at least one week of the month for the bi-weekly pattern (e.g. Week 1 and Week 3).'); return; }
    results = lastSchedule.map(mod => ({
      name: mod.name,
      moduleStart: mod.moduleStart,
      moduleEnd: mod.moduleEnd,
      sessions: generateWeekOfMonthSessions(mod.moduleStart, mod.moduleEnd, lastHolidayMap, weekday, weeksOfMonth)
    }));
  } else if(recurrenceType === 'monthly'){
    const dayVal = document.querySelector('input[name="monthlyDay"]:checked')?.value;
    if(!dayVal){ alert('Select a day for the monthly pattern.'); return; }
    const weekday = parseInt(dayVal, 10);
    const weekOfMonth = parseInt(document.querySelector('input[name="monthlyWeek"]:checked')?.value || '1', 10);
    results = lastSchedule.map(mod => ({
      name: mod.name,
      moduleStart: mod.moduleStart,
      moduleEnd: mod.moduleEnd,
      sessions: generateWeekOfMonthSessions(mod.moduleStart, mod.moduleEnd, lastHolidayMap, weekday, new Set([weekOfMonth]))
    }));
  } else {
    const daySet = getSessionDaySet();
    if(daySet.size === 0){ alert('Select at least one session day.'); return; }
    results = lastSchedule.map(mod => ({
      name: mod.name,
      moduleStart: mod.moduleStart,
      moduleEnd: mod.moduleEnd,
      sessions: generateSessionsInRange(mod.moduleStart, mod.moduleEnd, lastHolidayMap, daySet)
    }));
  }

  lastSessionResults = results;
  renderSessionPlan(results);
}
function renderSessionPlan(results){
  const area = document.getElementById('sessionPlanArea');
  let html = '';
  results.forEach(r => {
    html += `<div class="module-block">
      <div style="font-size:14px; font-weight:600; color:var(--text); margin-bottom:6px;">${escapeHtml(r.name)}</div>`;
    if(!r.moduleStart || !r.moduleEnd){
      html += `<div class="empty">No date range allocated to this module.</div></div>`;
      return;
    }
    html += `<div class="callout" style="margin-bottom:8px;">${fmt(r.moduleStart)} &ndash; ${fmt(r.moduleEnd)} &nbsp;&mdash;&nbsp; <strong>${r.sessions.length}</strong> session(s)</div>`;
    if(r.sessions.length){
      html += `<table><thead><tr><th style="width:46px;">#</th><th>Session Date</th><th>Day</th></tr></thead><tbody>`;
      r.sessions.forEach((s,i) => {
        html += `<tr><td class="num">${i+1}</td><td>${fmtDateOnly(s)}</td><td>${s.toLocaleDateString('en-ZA',{weekday:'long'})}</td></tr>`;
      });
      html += `</tbody></table>`;
    } else {
      html += `<div class="empty">No qualifying session dates in this module's range with the selected pattern.</div>`;
    }
    html += `</div>`;
  });
  area.innerHTML = html || '<div class="empty">No sessions generated — check that the roll-out plan has allocated date ranges.</div>';
}

// ---------- Export payload (shared by PDF and Excel) ----------
function buildExportPayload(){
  const cohortName = document.getElementById('cohortName').value.trim();
  const inductionInput = document.getElementById('inductionDate')?.value || '';
  const startInput = document.getElementById('startDate').value;

  return {
    cohortName,
    inductionDate: inductionInput ? fmtDateOnly(parseISO(inductionInput)) : null,
    startDate: startInput ? fmtDateOnly(parseISO(startInput)) : null,
    examDate: lastExamDate ? fmtDateOnly(lastExamDate) : null,
    modules: lastSchedule.map(s => ({
      name: s.name,
      credits: s.credits,
      notionalHours: s.credits * 10,
      pct: s.pct,
      days: s.days,
      start: s.moduleStart ? fmtDateOnly(s.moduleStart) : null,
      end: s.moduleEnd ? fmtDateOnly(s.moduleEnd) : null
    })),
    summary: lastSummary,
    sessions: (lastSessionResults || []).map(r => ({
      name: r.name,
      start: r.moduleStart ? fmtDateOnly(r.moduleStart) : null,
      end: r.moduleEnd ? fmtDateOnly(r.moduleEnd) : null,
      rows: r.sessions.map((s,i) => ({ n: i+1, date: fmtDateOnly(s), day: s.toLocaleDateString('en-ZA',{weekday:'long'}) }))
    }))
  };
}
function triggerBlobDownload(blob, cohortName, extension){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (cohortName || 'rollout-plan').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') + '.' + extension;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- PDF export ----------
async function downloadPDF(){
  if(!lastSchedule){
    alert('Calculate the roll-out plan first — the PDF is built from the computed schedule.');
    return;
  }
  const payload = buildExportPayload();

  try {
    const resp = await fetch('/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if(!resp.ok){
      const err = await resp.json().catch(() => ({}));
      alert(err.error || 'Could not generate the PDF (server error). Check that WeasyPrint is installed — see README.md.');
      return;
    }
    const blob = await resp.blob();
    triggerBlobDownload(blob, payload.cohortName, 'pdf');
  } catch(err){
    alert('Could not reach the server to generate the PDF: ' + err.message);
  }
}

// ---------- Excel export ----------
async function downloadExcel(){
  if(!lastSchedule){
    alert('Calculate the roll-out plan first — the Excel file is built from the computed schedule.');
    return;
  }
  const payload = buildExportPayload();

  try {
    const resp = await fetch('/export/xlsx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if(!resp.ok){
      const err = await resp.json().catch(() => ({}));
      alert(err.error || 'Could not generate the Excel file (server error).');
      return;
    }
    const blob = await resp.blob();
    triggerBlobDownload(blob, payload.cohortName, 'xlsx');
  } catch(err){
    alert('Could not reach the server to generate the Excel file: ' + err.message);
  }
}

// ---------- Upload / parse existing plan ----------
function colLetter(idx){
  let s = '';
  let n = idx + 1;
  while(n > 0){
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
// Strips non-breaking spaces, collapses runs of whitespace, trims, lowercases —
// so "TITLE  OF\u00a0UNIT STANDARDS" and "Title of Unit Standards" both match
// the same keyword checks regardless of stray spacing in the source file.
function normHeader(s){
  return String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}
// Scans a sheet's first few rows for a header containing a "credit" column,
// plus — separately — a "module" (grouping) column and a "unit standard"
// (line-item) column where present. Real roll-out plans typically have the
// Module cell merged/blank on every row after a unit standard's first, so
// this forward-fills the last-seen module name down through its rows.
//
// Pushes ONE ROW PER UNIT STANDARD into `outRows`, each keeping its own
// individual credit value straight from the CREDITS column (not summed
// under its parent module) — the module name is kept only as naming
// context, e.g. "Communication and Ethics: Business Writing".
function parseSheetForModules(rows, outRows){
  let headerRowIdx = -1, creditColIdx = -1, moduleColIdx = -1, usColIdx = -1;

  for(let r = 0; r < Math.min(6, rows.length); r++){
    const row = rows[r].map(normHeader);
    const cIdx = row.findIndex(c => c.includes('credit'));
    if(cIdx === -1) continue;

    const mIdx = row.findIndex(c => c.includes('module') || c.includes('grouping'));

    // Broadened net: catches "Title of Unit Standards", "US Title",
    // "US Description", "Standard Title", "Standard Description",
    // "Outcome", etc. — not just the literal phrase "unit standard".
    let uIdx = row.findIndex(c =>
      c.includes('unit standard') ||
      c.includes('us title') ||
      c.includes('us description') ||
      c.includes('standard title') ||
      c.includes('standard description') ||
      c.includes('outcome')
    );
    if(uIdx === -1){
      uIdx = row.findIndex((c, idx) => idx !== mIdx && (c.includes('title') || c.includes('component') || c.includes('description')));
    }

    headerRowIdx = r;
    creditColIdx = cIdx;
    moduleColIdx = mIdx;
    usColIdx = uIdx;
    break;
  }
  if(headerRowIdx === -1) return { ok: false };

  let currentModule = null;
  for(let r = headerRowIdx + 1; r < rows.length; r++){
    const row = rows[r];
    const rawCredit = row[creditColIdx];
    // Only accept genuinely numeric cells — parseFloat alone would also accept
    // free-text notes like "5 working days after last POE submission date"
    // (it happily reads the leading "5" as a number), which is not a credit value.
    let credit = NaN;
    if(typeof rawCredit === 'number'){
      credit = rawCredit;
    } else if(typeof rawCredit === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(rawCredit)){
      credit = parseFloat(rawCredit);
    }
    if(isNaN(credit) || credit <= 0) continue; // skips blank rows, section headers, free-text notes, totals rows

    let moduleName = moduleColIdx !== -1 ? String(row[moduleColIdx] || '').trim() : '';
    if(moduleName) currentModule = moduleName;
    else if(currentModule) moduleName = currentModule; // forward-fill a merged/blank module cell

    const usName = usColIdx !== -1 ? String(row[usColIdx] || '').trim() : '';

    let rowName;
    if(usName && moduleName) rowName = `${moduleName}: ${usName}`;
    else if(usName) rowName = usName;
    else if(moduleName) rowName = moduleName;
    else rowName = `Row ${r + 1}`;

    outRows.push({ name: rowName, credits: credit });
  }

  return {
    ok: true,
    moduleCol: moduleColIdx !== -1 ? colLetter(moduleColIdx) : null,
    usCol: usColIdx !== -1 ? colLetter(usColIdx) : null,
    creditCol: colLetter(creditColIdx),
  };
}

function handleUpload(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const outRows = [];
      let detection = null;

      wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if(rows.length < 2) return;
        const result = parseSheetForModules(rows, outRows);
        if(result.ok && !detection) detection = { sheet: sheetName, ...result };
      });

      if(outRows.length === 0){
        alert('Could not automatically detect a credits column (and ideally a module/unit standard column) in this file. You can still add rows manually below.');
        return;
      }

      clearAll();
      outRows.forEach(r => addModuleRow(r.name, r.credits));

      let msg = `Imported ${outRows.length} unit standard row(s), each keeping its own credit value.\n\n`;
      if(detection){
        msg += `Detected on sheet "${detection.sheet}" — Module: column ${detection.moduleCol || 'not found'}, `
             + `Unit Standard: column ${detection.usCol || 'not found'}, Credits: column ${detection.creditCol}.\n\n`;
        if(!detection.usCol){
          msg += 'Warning: no unit-standard column was detected — row names fell back to the module name or row number. Check the imported names below before calculating.\n\n';
        }
      }
      msg += 'Please review names and credits before calculating — automatic column detection is a best guess.';
      alert(msg);
    }catch(err){
      alert('Could not read that file as an Excel workbook: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);

}

// init with two blank rows
addModuleRow();
addModuleRow();