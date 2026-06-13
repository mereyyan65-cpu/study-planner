/* ================================================================
   考研打卡 - 核心逻辑
   ================================================================ */

// ===== 工具函数 =====
function $(sel, parent) { return (parent || document).querySelector(sel); }
function $$(sel, parent) { return [...(parent || document).querySelectorAll(sel)]; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function fmtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h} 小时 ${m} 分钟`;
}
function fmtTimeShort(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function today() { return new Date().toISOString().slice(0, 10); }
function now() { return Date.now(); }
function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

// ===== 数据层 =====
const DB = {
  load(key, fallback) {
    try {
      const raw = localStorage.getItem('sp_' + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  save(key, val) {
    localStorage.setItem('sp_' + key, JSON.stringify(val));
  },

  get subjects()     { return this.load('subjects', []); },
  set subjects(v)    { this.save('subjects', v); },
  get records()      { return this.load('records', []); },
  set records(v)     { this.save('records', v); },
  get reminders()    { return this.load('reminders', []); },
  set reminders(v)   { this.save('reminders', v); },
  get settings()     { return this.load('settings', { dailyGoal: 8 }); },
  set settings(v)    { this.save('settings', v); },
  get timerState()   { return this.load('timerState', null); },
  set timerState(v)  { this.save('timerState', v); },

  // 默认科目
  initDefaults() {
    if (this.subjects.length === 0) {
      this.subjects = [
        { id: uid(), name: '数学', color: '#EF4444', icon: '📐', createdAt: now() },
        { id: uid(), name: '英语', color: '#4A6CF7', icon: '📖', createdAt: now() },
        { id: uid(), name: '政治', color: '#F59E0B', icon: '🏛️', createdAt: now() },
        { id: uid(), name: '专业课', color: '#10B981', icon: '📚', createdAt: now() },
      ];
    }
    if (this.reminders.length === 0) {
      this.reminders = [
        { id: uid(), label: '上午数学复习', subjectId: this.subjects[0]?.id || '', time: '09:00', days: [1,2,3,4,5], enabled: true, createdAt: now() },
        { id: uid(), label: '下午英语学习', subjectId: this.subjects[1]?.id || '', time: '14:00', days: [1,2,3,4,5], enabled: true, createdAt: now() },
      ];
    }
  },

  getSubject(id) { return this.subjects.find(s => s.id === id); },
};

// ===== Toast =====
function toast(msg, duration = 2000) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => {
    el.classList.remove('show');
    el.classList.add('hidden');
  }, duration);
}

// ===== 通知权限 =====
async function requestNotification() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(title, {
    body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'study-reminder',
    requireInteraction: true,
  });
}

// ===== 页面导航 =====
function navigate(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const target = $('#page-' + page);
  if (target) target.classList.add('active');

  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = $(`.nav-btn[data-page="${page}"]`);
  if (navBtn) navBtn.classList.add('active');

  // 切换页面时刷新
  if (page === 'home') renderHome();
  if (page === 'timer') renderTimer();
  if (page === 'stats') renderStats();
  if (page === 'settings') renderSettings();

  // FAB 只在首页显示
  $('#quick-start-btn').classList.toggle('hidden', page !== 'home');
}

// ===== 渲染：首页 =====
function renderHome() {
  const records = DB.records.filter(r => r.date === today());
  const totalSeconds = records.reduce((s, r) => s + r.duration, 0);
  const goalHours = DB.settings.dailyGoal || 8;
  const goalSeconds = goalHours * 3600;

  // 今日总计
  $('#today-total').textContent = fmtTime(totalSeconds);
  const pct = Math.min(100, Math.round((totalSeconds / goalSeconds) * 100));
  $('#today-bar').style.width = pct + '%';
  $('#today-goal-text').textContent = `目标 ${goalHours}h · ${pct}%`;

  // 各科进度
  const subjects = DB.subjects;
  const subjectTime = {};
  records.forEach(r => { subjectTime[r.subjectId] = (subjectTime[r.subjectId] || 0) + r.duration; });

  const progressList = $('#subject-progress-list');
  progressList.innerHTML = subjects.length === 0
    ? '<div class="empty-hint">还没有科目，去「设置」添加吧</div>'
    : subjects.map(s => {
        const sec = subjectTime[s.id] || 0;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const barPct = goalSeconds > 0 ? Math.min(100, (sec / goalSeconds) * 100) : 0;
        return `
          <div>
            <div class="subject-progress-item">
              <span class="progress-dot" style="background:${s.color}"></span>
              <span class="progress-name">${s.icon || ''} ${s.name}</span>
              <span class="progress-time">${h}h ${m}m</span>
            </div>
            <div class="progress-bar-mini">
              <div class="progress-bar-mini-fill" style="width:${barPct}%;background:${s.color}"></div>
            </div>
          </div>`;
      }).join('');

  // 今日记录
  const recordsList = $('#today-records-list');
  if (records.length === 0) {
    recordsList.innerHTML = '<div class="empty-hint">今天还没有学习记录</div>';
  } else {
    recordsList.innerHTML = records
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(r => {
        const subj = DB.getSubject(r.subjectId);
        return `
          <div class="record-item">
            <span class="record-dot" style="background:${subj?.color || '#ccc'}"></span>
            <div class="record-info">
              <div class="record-subject">${subj?.icon || ''} ${subj?.name || '未知科目'}</div>
              ${r.note ? `<div class="record-note">${r.note}</div>` : ''}
            </div>
            <span class="record-duration">${fmtTime(r.duration)}</span>
          </div>`;
      }).join('');
  }

  // 更新日期
  const d = new Date();
  $('#header-date').textContent = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 星期${'日一二三四五六'[d.getDay()]}`;
}

// ===== 渲染：计时页 =====
function renderTimer() {
  // 科目选择列表
  const grid = $('#subject-select-list');
  const subjects = DB.subjects;
  if (subjects.length === 0) {
    grid.innerHTML = '<div class="empty-hint">还没有科目，去「设置」添加吧</div>';
  } else {
    grid.innerHTML = subjects.map(s => `
      <button class="subject-btn" data-id="${s.id}">
        <span class="subject-btn-icon">${s.icon || '📝'}</span>
        <span class="subject-btn-name">${s.name}</span>
      </button>`).join('');
  }

  // 手动补录科目下拉
  const sel = $('#manual-subject');
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">选择科目</option>' +
    subjects.map(s => `<option value="${s.id}">${s.icon || ''} ${s.name}</option>`).join('');
  sel.value = currentVal;

  // 手动补录日期默认今天
  $('#manual-date').value = today();

  // 恢复计时器状态
  restoreTimerUI();
}

// ===== 计时器逻辑 =====
let timerInterval = null;

function restoreTimerUI() {
  const state = DB.timerState;
  if (!state || state.status === 'idle') {
    $('#subject-select-card').classList.remove('hidden');
    $('#timer-panel').classList.add('hidden');
    return;
  }

  const subj = DB.getSubject(state.subjectId);
  if (!subj) {
    DB.timerState = null;
    $('#subject-select-card').classList.remove('hidden');
    $('#timer-panel').classList.add('hidden');
    return;
  }

  // 显示计时面板
  $('#subject-select-card').classList.add('hidden');
  $('#timer-panel').classList.remove('hidden');
  $('#timer-subject-name').textContent = subj.icon + ' ' + subj.name;

  if (state.status === 'running') {
    $('#timer-status').textContent = '学习中...';
    $('#btn-start').classList.add('hidden');
    $('#btn-pause').classList.remove('hidden');
    $('#btn-stop').classList.remove('hidden');
    startTimerTick(state);
  } else if (state.status === 'paused') {
    const elapsed = state.tempElapsed || 0;
    $('#timer-display').textContent = fmtTimeShort(Math.floor(elapsed));
    $('#timer-status').textContent = '已暂停';
    $('#btn-start').textContent = '▶ 继续';
    $('#btn-start').classList.remove('hidden');
    $('#btn-pause').classList.add('hidden');
    $('#btn-stop').classList.remove('hidden');
  }
}

function getElapsedSeconds(state) {
  if (!state) return 0;
  const accPause = state.accumulatedPause || 0;
  if (state.status === 'paused') {
    return state.tempElapsed || 0;
  }
  const extraPause = state.pausedAt ? (now() - state.pausedAt) : 0;
  return Math.floor((now() - state.startTime - accPause - extraPause) / 1000);
}

function startTimerTick(state) {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsed = getElapsedSeconds(state);
    $('#timer-display').textContent = fmtTimeShort(Math.max(0, elapsed));
  }, 200);
}

function selectSubjectForTimer(subjectId) {
  const state = DB.timerState;
  if (state && state.status !== 'idle' && state.subjectId !== subjectId) {
    if (!confirm('当前有正在进行的计时，切换科目会丢弃当前计时，确定吗？')) return;
    clearInterval(timerInterval);
    DB.timerState = null;
  }

  DB.timerState = {
    subjectId,
    startTime: now(),
    pausedAt: 0,
    accumulatedPause: 0,
    status: 'running',
  };

  renderTimer();
}

function pauseTimer() {
  const state = DB.timerState;
  if (!state || state.status !== 'running') return;
  const elapsed = getElapsedSeconds(state);
  clearInterval(timerInterval);
  state.status = 'paused';
  state.pausedAt = now();
  state.tempElapsed = elapsed;
  DB.timerState = state;
  renderTimer();
}

function resumeTimer() {
  const state = DB.timerState;
  if (!state || state.status !== 'paused') return;
  // 累加暂停时长
  state.accumulatedPause += now() - state.pausedAt;
  state.pausedAt = 0;
  state.status = 'running';
  state.tempElapsed = undefined;
  DB.timerState = state;
  renderTimer();
}

function stopTimer() {
  const state = DB.timerState;
  if (!state || state.status === 'idle') return;
  clearInterval(timerInterval);
  const elapsed = getElapsedSeconds(state);
  if (elapsed < 10) {
    toast('学习时间太短（不足10秒），不记录');
    DB.timerState = null;
    renderTimer();
    return;
  }

  // 保存记录
  const records = DB.records;
  records.push({
    id: uid(),
    subjectId: state.subjectId,
    date: today(),
    duration: elapsed,
    note: '',
    createdAt: now(),
  });
  DB.records = records;

  const subj = DB.getSubject(state.subjectId);
  toast(`已记录 ${subj?.name || ''} ${fmtTime(elapsed)}`);

  DB.timerState = null;
  renderTimer();
  renderHome();
}

// ===== 手动补录 =====
function manualSave() {
  const subjectId = $('#manual-subject').value;
  const hours = parseInt($('#manual-hours').value) || 0;
  const minutes = parseInt($('#manual-minutes').value) || 0;
  const date = $('#manual-date').value;
  const note = $('#manual-note').value.trim();

  if (!subjectId) { toast('请选择科目'); return; }
  const duration = hours * 3600 + minutes * 60;
  if (duration <= 0) { toast('请至少输入1分钟'); return; }
  if (!date) { toast('请选择日期'); return; }

  const records = DB.records;
  records.push({ id: uid(), subjectId, date, duration, note, createdAt: now() });
  DB.records = records;

  const subj = DB.getSubject(subjectId);
  toast(`已补录 ${subj?.name || ''} ${fmtTime(duration)}`);

  $('#manual-hours').value = '0';
  $('#manual-minutes').value = '0';
  $('#manual-note').value = '';
  renderHome();
}

// ===== 渲染：统计页 =====
let chartWeekly = null;
let chartSubjects = null;

function renderStats() {
  const subjects = DB.subjects;
  const records = DB.records;
  const ws = weekStart();
  const todayStr = today();

  // 近7天每日时长
  const dayLabels = [];
  const dayData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayName = `${d.getMonth()+1}/${d.getDate()} 周${'日一二三四五六'[d.getDay()]}`;
    dayLabels.push(dayName);
    const total = records.filter(r => r.date === dateStr).reduce((s, r) => s + r.duration, 0);
    dayData.push(Math.round(total / 3600 * 10) / 10);
  }

  // 本周科目分布
  const weekRecords = records.filter(r => r.date >= ws && r.date <= todayStr);
  const subjectData = {};
  weekRecords.forEach(r => {
    subjectData[r.subjectId] = (subjectData[r.subjectId] || 0) + r.duration;
  });

  const pieLabels = [];
  const pieData = [];
  const pieColors = [];
  Object.entries(subjectData).forEach(([sid, sec]) => {
    const s = DB.getSubject(sid);
    pieLabels.push(s ? s.name : '未知');
    pieData.push(Math.round(sec / 3600 * 10) / 10);
    pieColors.push(s ? s.color : '#ccc');
  });

  // 柱状图（Chart.js 不可用时跳过）
  if (typeof Chart !== 'undefined') {
    const ctx1 = $('#chart-weekly');
    if (chartWeekly) chartWeekly.destroy();
    chartWeekly = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: dayLabels,
        datasets: [{
          label: '学习时长 (小时)',
          data: dayData,
          backgroundColor: dayData.map(v => v > 0 ? '#4A6CF7' : '#CBD5E1'),
          borderRadius: 8,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => v + 'h' }, grid: { color: '#F1F5F9' } },
          x: { ticks: { font: { size: 11 } }, grid: { display: false } },
        },
      },
    });

    // 饼图
    const ctx2 = $('#chart-subjects');
    if (chartSubjects) chartSubjects.destroy();
    if (pieData.length === 0 || pieData.every(v => v === 0)) {
      chartSubjects = new Chart(ctx2, {
        type: 'doughnut',
        data: { labels: ['暂无数据'], datasets: [{ data: [1], backgroundColor: ['#E2E8F0'] }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
        },
      });
    } else {
      chartSubjects = new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: pieLabels,
          datasets: [{ data: pieData, backgroundColor: pieColors, borderWidth: 2, borderColor: '#fff' }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true } },
          },
        },
      });
    }
  } else {
    // Chart.js 未加载，隐藏图表框
    const chartCards = $$('.card:has(canvas)');
    chartCards.forEach(c => c.style.opacity = '0.5');
    console.warn('Chart.js not loaded, charts disabled');
  }

  // 统计数字
  const weekSec = weekRecords.reduce((s, r) => s + r.duration, 0);
  const monthStart = todayStr.slice(0, 7) + '-01';
  const monthRecords = records.filter(r => r.date >= monthStart && r.date <= todayStr);
  const monthSec = monthRecords.reduce((s, r) => s + r.duration, 0);
  const totalSec = records.reduce((s, r) => s + r.duration, 0);

  // 连续打卡天数
  let streak = 0;
  const checkDate = new Date();
  while (true) {
    const ds = checkDate.toISOString().slice(0, 10);
    const hasRecord = records.some(r => r.date === ds);
    if (hasRecord) { streak++; checkDate.setDate(checkDate.getDate() - 1); }
    else break;
  }

  $('#stat-week').textContent = Math.round(weekSec / 3600 * 10) / 10 + 'h';
  $('#stat-month').textContent = Math.round(monthSec / 3600 * 10) / 10 + 'h';
  $('#stat-total').textContent = Math.round(totalSec / 3600 * 10) / 10 + 'h';
  $('#stat-streak').textContent = streak + '天';
}

// ===== 渲染：设置页 =====
function renderSettings() {
  const subjects = DB.subjects;
  const reminders = DB.reminders;

  // 每日目标
  $('#daily-goal').value = DB.settings.dailyGoal || 8;

  // 科目管理列表
  const smList = $('#subject-manage-list');
  if (subjects.length === 0) {
    smList.innerHTML = '<div class="empty-hint">还没有科目，点下方添加</div>';
  } else {
    smList.innerHTML = subjects.map(s => `
      <div class="subject-manage-item">
        <span class="subject-manage-color" style="background:${s.color}"></span>
        <span>${s.icon || ''}</span>
        <span class="subject-manage-name">${s.name}</span>
        <div class="action-btns">
          <button class="btn btn-outline btn-xs edit-subject-btn" data-id="${s.id}">✎</button>
          <button class="btn btn-danger btn-xs del-subject-btn" data-id="${s.id}">✕</button>
        </div>
      </div>`).join('');
  }

  // 提醒列表
  const remList = $('#reminder-list');
  if (reminders.length === 0) {
    remList.innerHTML = '<div class="empty-hint">还没有提醒，点下方添加</div>';
  } else {
    remList.innerHTML = reminders.map(r => {
      const subj = r.subjectId ? DB.getSubject(r.subjectId) : null;
      const dayNames = (r.days || []).map(d => '日一二三四五六'[d]).join(' ');
      return `
        <div class="reminder-item">
          <div class="switch ${r.enabled ? 'on' : ''}" data-rid="${r.id}" data-action="toggle"></div>
          <div class="reminder-info">
            <div class="reminder-label">${r.label}</div>
            <div class="reminder-meta">
              ⏰ ${r.time} ｜ 📅 ${dayNames || '每天'}
              ${subj ? ' ｜ 📖 ' + subj.name : ''}
            </div>
          </div>
          <div class="action-btns">
            <button class="btn btn-outline btn-xs edit-reminder-btn" data-id="${r.id}">✎</button>
            <button class="btn btn-danger btn-xs del-reminder-btn" data-id="${r.id}">✕</button>
          </div>
        </div>`;
    }).join('');
  }

  // 提醒关联科目下拉
  const remSubjectSel = $('#new-reminder-subject');
  const curVal = remSubjectSel.value;
  remSubjectSel.innerHTML = '<option value="">关联科目（可选）</option>' +
    subjects.map(s => `<option value="${s.id}">${s.icon || ''} ${s.name}</option>`).join('');
  remSubjectSel.value = curVal;
}

// ===== 提醒弹窗编辑 =====
function showReminderEditor(reminder = null) {
  const isEdit = !!reminder;
  const r = reminder || { id: '', label: '', subjectId: '', time: '09:00', days: [1,2,3,4,5], enabled: true };

  const subjects = DB.subjects;
  const subjectOptions = '<option value="">不关联</option>' +
    subjects.map(s => `<option value="${s.id}" ${r.subjectId === s.id ? 'selected' : ''}>${s.icon || ''} ${s.name}</option>`).join('');

  const allDays = [0,1,2,3,4,5,6];
  const dayNames = '日一二三四五六';
  const dayBtns = allDays.map(d => `
    <button class="day-btn ${(r.days || []).includes(d) ? 'active' : ''}" data-day="${d}">${dayNames[d]}</button>
  `).join('');

  $('#modal-content').innerHTML = `
    <h3>${isEdit ? '编辑提醒' : '添加提醒'}</h3>
    <label style="font-size:13px;color:var(--text-secondary)">提醒名称</label>
    <input class="input" id="edit-reminder-label" value="${escapeHtml(r.label)}" placeholder="如：上午数学复习">
    <label style="font-size:13px;color:var(--text-secondary)">时间</label>
    <input class="input" type="time" id="edit-reminder-time" value="${r.time}">
    <label style="font-size:13px;color:var(--text-secondary)">重复日期</label>
    <div class="day-selector" id="edit-day-selector">${dayBtns}</div>
    <label style="font-size:13px;color:var(--text-secondary)">关联科目</label>
    <select class="input" id="edit-reminder-subject">${subjectOptions}</select>
    <div class="modal-buttons">
      <button class="btn btn-outline btn-sm" id="btn-modal-cancel">取消</button>
      <button class="btn btn-primary btn-sm" id="btn-modal-save">${isEdit ? '保存修改' : '添加'}</button>
    </div>
  `;

  $('#modal-overlay').classList.remove('hidden');

  // 星期按钮点击
  $$('.day-btn', $('#edit-day-selector')).forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });

  $('#btn-modal-cancel').onclick = () => $('#modal-overlay').classList.add('hidden');
  $('#btn-modal-save').onclick = () => {
    const label = $('#edit-reminder-label').value.trim();
    const time = $('#edit-reminder-time').value;
    const subjectId = $('#edit-reminder-subject').value;
    const days = $$('.day-btn.active', $('#edit-day-selector')).map(b => parseInt(b.dataset.day));

    if (!label) { toast('请输入提醒名称'); return; }
    if (!time) { toast('请选择时间'); return; }
    if (days.length === 0) { toast('请至少选一天'); return; }

    const reminders = DB.reminders;
    if (isEdit) {
      const idx = reminders.findIndex(rr => rr.id === reminder.id);
      if (idx !== -1) {
        reminders[idx] = { ...reminders[idx], label, time, subjectId, days };
      }
    } else {
      reminders.push({ id: uid(), label, time, subjectId, days, enabled: true, createdAt: now() });
    }
    DB.reminders = reminders;
    $('#modal-overlay').classList.add('hidden');
    renderSettings();
    toast(isEdit ? '提醒已更新' : '提醒已添加');
  };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== 提醒检查器 =====
let lastFiredReminders = {}; // { "HH:MM": true } 防止同分钟重复触发

function checkReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const nowDate = new Date();
  const currentTime = String(nowDate.getHours()).padStart(2, '0') + ':' + String(nowDate.getMinutes()).padStart(2, '0');
  const currentDay = nowDate.getDay();

  // 新的一分钟，重置防重复
  const minuteKey = currentTime;
  if (!lastFiredReminders._minute || lastFiredReminders._minute !== minuteKey) {
    lastFiredReminders = { _minute: minuteKey };
  }

  const reminders = DB.reminders.filter(r => r.enabled);
  reminders.forEach(r => {
    if (r.time === currentTime && (r.days || []).includes(currentDay)) {
      if (lastFiredReminders[r.id]) return; // 本分钟已触发
      lastFiredReminders[r.id] = true;

      const subj = r.subjectId ? DB.getSubject(r.subjectId) : null;
      const title = `⏰ ${r.label}`;
      const body = subj ? `该学${subj.name}了！加油💪` : '学习时间到了，加油！💪';
      notify(title, body);
    }
  });
}

// ===== 事件绑定 =====
function bindEvents() {
  // 底部导航
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  // FAB 快速开始
  $('#quick-start-btn').addEventListener('click', () => navigate('timer'));

  // 计时页：选择科目
  $('#subject-select-list').addEventListener('click', e => {
    const btn = e.target.closest('.subject-btn');
    if (!btn) return;
    selectSubjectForTimer(btn.dataset.id);
  });

  // 计时按钮
  $('#btn-start').addEventListener('click', () => {
    const state = DB.timerState;
    if (state && state.status === 'paused') {
      resumeTimer();
    }
  });
  $('#btn-pause').addEventListener('click', pauseTimer);
  $('#btn-stop').addEventListener('click', stopTimer);

  // 手动补录
  $('#btn-manual-save').addEventListener('click', manualSave);

  // 设置页：添加科目
  $('#btn-add-subject').addEventListener('click', () => {
    const name = $('#new-subject-name').value.trim();
    const color = $('#new-subject-color').value;
    if (!name) { toast('请输入科目名称'); return; }
    const subjects = DB.subjects;
    const icons = ['📐', '📖', '🏛️', '📚', '🔬', '💻', '📝', '🎯', '📋', '🧪'];
    const icon = icons[subjects.length % icons.length];
    subjects.push({ id: uid(), name, color, icon, createdAt: now() });
    DB.subjects = subjects;
    $('#new-subject-name').value = '';
    renderSettings();
    renderTimer();
    renderHome();
    toast(`已添加「${name}」`);
  });

  // 设置页：删除/编辑科目
  $('#subject-manage-list').addEventListener('click', e => {
    const delBtn = e.target.closest('.del-subject-btn');
    const editBtn = e.target.closest('.edit-subject-btn');
    if (delBtn) {
      const id = delBtn.dataset.id;
      const subj = DB.getSubject(id);
      if (!confirm(`确定删除「${subj?.name || '此科目'}」？\n相关学习记录会保留。`)) return;
      DB.subjects = DB.subjects.filter(s => s.id !== id);
      // 清理关联提醒
      DB.reminders = DB.reminders.map(r => r.subjectId === id ? { ...r, subjectId: '' } : r);
      renderSettings();
      renderTimer();
      renderHome();
      toast('已删除');
    }
    if (editBtn) {
      const id = editBtn.dataset.id;
      const subj = DB.getSubject(id);
      if (!subj) return;
      const newName = prompt('修改科目名称：', subj.name);
      if (newName && newName.trim()) {
        const subjects = DB.subjects;
        const idx = subjects.findIndex(s => s.id === id);
        subjects[idx].name = newName.trim();
        DB.subjects = subjects;
        renderSettings();
        renderTimer();
        renderHome();
        toast('已修改');
      }
    }
  });

  // 设置页：保存目标
  $('#btn-save-goal').addEventListener('click', () => {
    const goal = parseInt($('#daily-goal').value) || 8;
    DB.settings = { ...DB.settings, dailyGoal: Math.min(24, Math.max(1, goal)) };
    toast(`每日目标已设为 ${DB.settings.dailyGoal} 小时`);
    renderHome();
  });

  // 设置页：添加提醒
  $('#btn-add-reminder').addEventListener('click', () => showReminderEditor(null));

  // 设置页：提醒操作（开关/编辑/删除）
  $('#reminder-list').addEventListener('click', e => {
    const switchEl = e.target.closest('.switch');
    const editBtn = e.target.closest('.edit-reminder-btn');
    const delBtn = e.target.closest('.del-reminder-btn');

    if (switchEl && switchEl.dataset.action === 'toggle') {
      const rid = switchEl.dataset.rid;
      const reminders = DB.reminders;
      const idx = reminders.findIndex(r => r.id === rid);
      if (idx !== -1) {
        reminders[idx].enabled = !reminders[idx].enabled;
        DB.reminders = reminders;
        renderSettings();
      }
    }
    if (editBtn) {
      const rid = editBtn.dataset.id;
      const r = DB.reminders.find(rr => rr.id === rid);
      if (r) showReminderEditor(r);
    }
    if (delBtn) {
      const rid = delBtn.dataset.id;
      if (!confirm('确定删除此提醒？')) return;
      DB.reminders = DB.reminders.filter(r => r.id !== rid);
      renderSettings();
      toast('提醒已删除');
    }
  });

  // 弹窗关闭
  $('#modal-overlay').addEventListener('click', e => {
    if (e.target === $('#modal-overlay')) $('#modal-overlay').classList.add('hidden');
  });

  // 星期选择器（添加提醒区域）
  $('#day-selector').addEventListener('click', e => {
    const btn = e.target.closest('.day-btn');
    if (!btn) return;
    btn.classList.toggle('active');
  });

  // 导出数据
  $('#btn-export').addEventListener('click', () => {
    const data = {
      subjects: DB.subjects,
      records: DB.records,
      reminders: DB.reminders,
      settings: DB.settings,
      exportedAt: new Date().toISOString(),
      version: 1,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study-planner-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('数据已导出');
  });

  // 导入数据
  $('#import-file').addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.version || !data.subjects || !data.records) {
          throw new Error('格式不正确');
        }
        if (!confirm(`将导入 ${data.subjects.length} 个科目、${data.records.length} 条记录、${(data.reminders||[]).length} 个提醒。现有数据将被覆盖，确定吗？`)) return;
        DB.subjects = data.subjects;
        DB.records = data.records;
        DB.reminders = data.reminders || [];
        DB.settings = data.settings || { dailyGoal: 8 };
        toast('数据已导入');
        renderHome();
        renderSettings();
        renderTimer();
      } catch (err) {
        toast('导入失败：文件格式不正确');
      }
    };
    reader.readAsText(file);
    this.value = '';
  });

  // 清空数据
  $('#btn-clear').addEventListener('click', () => {
    if (!confirm('确定清空所有数据？此操作不可恢复！\n\n建议先导出备份。')) return;
    if (!confirm('再次确认：真的要删除所有学习记录吗？')) return;
    localStorage.clear();
    DB.initDefaults();
    DB.timerState = null;
    clearInterval(timerInterval);
    toast('数据已清空，已恢复默认设置');
    renderHome();
    renderSettings();
    renderTimer();
  });
}

// ===== 注册 Service Worker =====
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.log('SW failed:', err));
  }
}

// ===== 初始化 =====
function init() {
  DB.initDefaults();

  // 检查是否从通知恢复计时器
  restoreTimerUI();

  // 渲染首页
  renderHome();

  // 绑定事件
  bindEvents();

  // 注册 Service Worker
  registerSW();

  // 请求通知权限
  requestNotification().then(granted => {
    if (!granted) {
      console.log('通知权限未获取');
    }
  });

  // 提醒检查：每30秒
  setInterval(checkReminders, 30000);
  // 首次也检查一次
  setTimeout(checkReminders, 2000);

  // 页面从后台恢复时刷新首页
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      renderHome();
      // 恢复计时器 UI（防止后台时 interval 被暂停）
      restoreTimerUI();
    }
  });
}

// 启动
document.addEventListener('DOMContentLoaded', init);
