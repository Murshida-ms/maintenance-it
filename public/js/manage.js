/* ===== manage.js ===== */

// ===================================================
//  CONSTANTS
// ===================================================
const prioLabel  = { high:'ด่วนมาก', med:'ปานกลาง', low:'ปกติ' };
const statusLabel= { pending:'รอดำเนินการ', inprogress:'กำลังทำ', done:'เสร็จแล้ว', cancelled:'ยกเลิก' };
const SLA_HOURS  = { high: 4, med: 24, low: 72 };

// ===================================================
//  STATE
// ===================================================
let tasks = [];
let panelOpenTaskId = null;

// ===================================================
//  LOAD FROM API
// ===================================================
async function loadTickets() {
  try {
    const res = await fetch('/api/tickets');
    if (!res.ok) throw new Error();
    const raw = await res.json();

    tasks = raw
      // แสดงเฉพาะงานที่มี assignee แล้วเท่านั้น
      .filter(t => t.assignee && t.assignee !== '—' && t.assignee.trim() !== '')
      .map(t => ({
        _id:              t.id,
        id:               'TK-' + String(t.id).padStart(4,'0'),
        title:            t.title || '(ไม่มีหัวข้อ)',
        detail:           t.detail || '',
        note:             t.note || '',
        pri:              t.priority || 'low',
        status:           t.status || 'pending',
        reporter:         t.reporter_name || '—',
        reporterInitials: (t.assignee || '').substring(0, 2) || '—',
        assignee:         t.assignee || '',
        created_at:       t.created_at,
        time:             formatTime(t.created_at),
        reportDate:       formatDate(t.created_at),
        deadlineDate:     calcDeadline(t.created_at, t.priority),
        comments:         [],
        timeline:         buildTimeline(t),
      }));

    renderAll();
    updateTopbar();
    buildNotifications();
  } catch(e) {
    console.error(e);
    showToast('โหลดข้อมูลไม่สำเร็จ','bi-exclamation-triangle-fill','#EF4444');
  }
}

function formatTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const day   = d.getDate();
  const month = months[d.getMonth()];
  const year  = d.getFullYear() + 543;
  const hh    = String(d.getHours()).padStart(2,'0');
  const mm    = String(d.getMinutes()).padStart(2,'0');
  return `${day} ${month} ${year} ${hh}:${mm}`;
}

function calcDeadline(createdAt, priority) {
  if (!createdAt) return null;
  const h = SLA_HOURS[priority] || 24;
  return new Date(new Date(createdAt).getTime() + h * 3600000);
}

function buildTimeline(t) {
  return [
    { label:'แจ้งงานสำเร็จ', time: formatTime(t.created_at), by: t.reporter || t.assignee || '—', state:'done' },
    { label:'รับเรื่อง',     time:'—', by:'—', state: t.status !== 'pending' ? 'done' : 'active' },
    { label:'ดำเนินการ',     time:'—', by:'—', state: t.status === 'inprogress' ? 'active' : t.status === 'done' ? 'done' : 'wait' },
    { label:'เสร็จสิ้น',     time:'—', by:'—', state: t.status === 'done' ? 'done' : 'wait' },
  ];
}

// ===================================================
//  COUNTDOWN HELPERS
// ===================================================
function getSecsLeft(t) {
  if (!t.deadlineDate) return null;
  return Math.floor((t.deadlineDate.getTime() - Date.now()) / 1000);
}

function fmtCountdown(secs) {
  if (secs === null) return '—';
  const abs = Math.abs(secs);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const sign = secs < 0 ? '-' : '';
  if (h > 0) return `${sign}${h}:${String(m).padStart(2,'0')} ชม.`;
  return `${sign}${m}:${String(s).padStart(2,'0')} น.`;
}

function getCdClass(t, secs) {
  if (t.status === 'done') return 'cd-done';
  if (secs === null) return 'cd-ok';
  if (secs < 0) return 'cd-over';
  if (secs < 3600) return 'cd-urgent';
  if (secs < 7200) return 'cd-warn';
  return 'cd-ok';
}

function getCdLabel(t, secs) {
  if (t.status === 'done') return '<i class="bi bi-check-circle-fill"></i> เสร็จ';
  if (secs === null) return '—';
  if (secs < 0) return '<i class="bi bi-exclamation-triangle-fill"></i> เกิน SLA ' + fmtCountdown(secs);
  return '<i class="bi bi-clock-fill"></i> ' + fmtCountdown(secs);
}

// ===================================================
//  RENDER ALL
// ===================================================
function renderAll() { renderStats(); renderCards(); }

function updateTopbar() {
  const now = new Date();
  const days = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  document.getElementById('topbar-sub').textContent =
    `อัปเดต: วัน${days[now.getDay()]}ที่ ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()+543} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} น.`;
}

// ===================================================
//  STAT STRIP
// ===================================================
function renderStats() {
  const pend    = tasks.filter(t => t.status === 'pending').length;
  const prog    = tasks.filter(t => t.status === 'inprogress').length;
  const done    = tasks.filter(t => t.status === 'done').length;
  const overSla = tasks.filter(t => t.status !== 'done' && getSecsLeft(t) !== null && getSecsLeft(t) < 0).length;

  // [FIX] ใช้ optional chaining ป้องกัน null reference
  const navPendingBadge = document.getElementById('nav-pending-badge');
  if (navPendingBadge) navPendingBadge.textContent = pend;

  document.getElementById('stat-strip').innerHTML = `
    <div class="sstrip">
      <div class="sstrip-icon" style="background:var(--pending-bg);color:var(--pending)"><i class="bi bi-hourglass-split"></i></div>
      <div><div class="sstrip-num" style="color:var(--pending)">${pend}</div><div class="sstrip-label">รอดำเนินการ</div></div>
    </div>
    <div class="sstrip">
      <div class="sstrip-icon" style="background:var(--inprogress-bg);color:var(--inprogress)"><i class="bi bi-gear-wide-connected"></i></div>
      <div><div class="sstrip-num" style="color:var(--inprogress)">${prog}</div><div class="sstrip-label">กำลังดำเนินการ</div></div>
    </div>
    <div class="sstrip">
      <div class="sstrip-icon" style="background:var(--done-bg);color:var(--done)"><i class="bi bi-check-circle-fill"></i></div>
      <div><div class="sstrip-num" style="color:var(--done)">${done}</div><div class="sstrip-label">เสร็จสิ้น</div></div>
    </div>
    <div class="sstrip" style="${overSla>0?'border-color:#FECACA':''}">
      <div class="sstrip-icon" style="background:${overSla>0?'#FEE2E2':'#F3E8FF'};color:${overSla>0?'#991B1B':'#7C3AED'}">
        <i class="bi ${overSla>0?'bi-exclamation-triangle-fill':'bi-shield-check'}"></i>
      </div>
      <div><div class="sstrip-num" style="color:${overSla>0?'#991B1B':'#7C3AED'}">${overSla}</div><div class="sstrip-label">เกิน SLA</div></div>
    </div>`;
}

// ===================================================
//  FILTER & RENDER CARDS
// ===================================================
function getFilteredTasks() {
  const q  = (document.getElementById('search-input').value||'').toLowerCase();
  const fp = document.getElementById('filter-priority').value;
  return tasks.filter(t => {
    const matchQ = !q  || t.id.toLowerCase().includes(q) || t.title.includes(q) || t.detail.includes(q) || t.reporter.includes(q);
    const matchP = !fp || t.pri === fp;
    return matchQ && matchP;
  });
}

function filterCards() { renderCards(); }

function renderCards() {
  const filtered = getFilteredTasks();
  ['pending','inprogress','done'].forEach(s => {
    const col = document.getElementById('col-'+s);
    const cnt = document.getElementById('cnt-'+s);
    const items = filtered.filter(t => t.status === s);

    items.sort((a,b) => {
      const sa = getSecsLeft(a) ?? 99999;
      const sb = getSecsLeft(b) ?? 99999;
      if (sa < 0 && sb >= 0) return -1;
      if (sb < 0 && sa >= 0) return  1;
      return sa - sb;
    });
    cnt.textContent = items.length;
    col.innerHTML = '';
    if (items.length === 0) {
      col.innerHTML = `<div class="empty-state"><i class="bi bi-inbox"></i>ไม่มีงาน</div>`;
      return;
    }
    items.forEach(t => {
      const avHtml = t.reporter
        ? `<div class="avatar-sm av-blue">${t.reporterInitials}</div>`
        : `<div class="avatar-sm av-blue" style="color:#94A3B8;background:#F1F5F9">—</div>`;

      const secs    = getSecsLeft(t);
      const cdClass = getCdClass(t, secs);
      const cdHtml  = `<span class="cd-badge ${cdClass}" data-task-id="${t.id}">${getCdLabel(t, secs)}</span>`;
      
      // เพิ่ม deadline
      const isOver   = secs !== null && secs < 0;
      const isUrgent = secs !== null && secs >= 0 && secs < 3600;
      const dlColor  = isOver ? '#991B1B' : isUrgent ? '#92400E' : '#065F46';
      const dlBg     = isOver ? '#FEE2E2' : isUrgent ? '#FEF9C3' : '#DCFCE7';
      const dlIcon   = isOver ? 'bi-exclamation-triangle-fill' : 'bi-alarm';

      // format deadline
      const deadlineStr = t.deadlineDate
      ? `${String(t.deadlineDate.getDate()).padStart(2,'0')}/${String(t.deadlineDate.getMonth()+1).padStart(2,'0')}/${t.deadlineDate.getFullYear()+543} ${String(t.deadlineDate.getHours()).padStart(2,'0')}:${String(t.deadlineDate.getMinutes()).padStart(2,'0')} น.`
      : '—';

      let quickHtml = '';
      if (s === 'pending') {
        quickHtml = `
          <div class="qcard-quick" onclick="event.stopPropagation()">
            <button class="qbtn accept" onclick="changeStatus('${t.id}','inprogress')"><i class="bi bi-play-fill"></i>รับงาน</button>
            <button class="qbtn detail" onclick="openPanel('${t.id}')"><i class="bi bi-info-circle"></i>รายละเอียด</button>
          </div>`;
      } else if (s === 'inprogress') {
        quickHtml = `
          <div class="qcard-quick" onclick="event.stopPropagation()">
            <button class="qbtn close-task" onclick="changeStatus('${t.id}','done')"><i class="bi bi-check-lg"></i>ปิดงาน</button>
            <button class="qbtn detail" onclick="openPanel('${t.id}')"><i class="bi bi-pencil"></i>รายละเอียด</button>
          </div>`;
      }

      const card = document.createElement('div');
      card.className = 'qcard';
      card.setAttribute('data-task-id', t.id);
      card.onclick = () => openPanel(t.id);
      card.innerHTML = `
        <div class="qcard-accent"></div>
        <div class="qcard-top">
          <span class="qcard-id">${t.id}</span>
          <span class="priority-badge ${t.pri}">${prioLabel[t.pri]}</span>
        </div>
        <div class="qcard-title">${escHtml(t.title)}</div>
        <div class="qcard-meta">
          <span class="qcard-meta-item"><i class="bi bi-calendar3" style="font-size:10px"></i>${t.reportDate}</span>
          ${t.reporter ? `<span class="qcard-meta-item"><i class="bi bi-person-fill" style="font-size:10px"></i>${escHtml(t.reporter)}</span>` : ''}
        </div>

        <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
        <div style="display:inline-flex;align-items:center;gap:5px;font-size:11px;
                background:${dlBg};color:${dlColor};
                padding:4px 8px;border-radius:6px;font-weight:600">
        <i class="bi ${dlIcon}" style="font-size:11px"></i>
          กำหนดส่ง: ${deadlineStr}
        </div>
      </div>
        <div class="qcard-footer">
          <div class="avatar-group">${avHtml}</div>
          ${cdHtml}
        </div>
        ${quickHtml}`;
      col.appendChild(card);
    });
  });
}

// ===================================================
//  DETAIL PANEL
// ===================================================
function openPanel(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  document.getElementById('panel-id').textContent = t.id + '  ' + t.title;
  document.getElementById('panel-status-badge').innerHTML =
    `<span class="badge-status ${t.status}">${statusLabel[t.status]}</span>`;

  const secs       = getSecsLeft(t);
  const cdClass    = getCdClass(t, secs);
  const cdLabel    = getCdLabel(t, secs);
  const deadlineStr = t.deadlineDate
    ? t.deadlineDate.toLocaleString('th-TH',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'2-digit'})
    : '—';

  const slaRow = t.status !== 'done' ? `
    <div class="sla-row">
      <div>
        <div class="sla-label">กำหนดเสร็จ</div>
        <div style="font-size:12px;font-weight:500">${deadlineStr}</div>
      </div>
      <div style="text-align:right">
        <div class="sla-label">เวลาที่เหลือ</div>
        <div id="panel-cd" style="font-size:16px;font-weight:700;color:${secs!==null&&secs<0?'#991B1B':secs!==null&&secs<3600?'#991B1B':'#065F46'}">${fmtCountdown(secs)}</div>
      </div>
      <span class="cd-badge ${cdClass}">${cdLabel}</span>
    </div>` : `
    <div class="sla-row" style="background:var(--done-bg)">
      <div><div class="sla-label" style="color:#065F46">เสร็จสิ้น</div></div>
      <span class="cd-badge cd-done"><i class="bi bi-check-circle-fill"></i> เสร็จแล้ว</span>
    </div>`;

  const tlHtml = t.timeline.map(tl => `
    <div class="tl-item">
      <div class="tl-dot ${tl.state}">
        ${tl.state==='done'?'<i class="bi bi-check-lg"></i>':tl.state==='active'?'<i class="bi bi-arrow-repeat"></i>':'<i class="bi bi-circle"></i>'}
      </div>
      <div class="tl-text">
        <h6>${tl.label}</h6>
        <small>${tl.time !== '—' ? tl.time + ' น.' : ''} ${tl.by !== '—' ? '· ' + tl.by : ''}</small>
      </div>
    </div>`).join('');

  const commentsHtml = t.comments.length
    ? t.comments.map(c => `<div class="comment-item"><div class="comment-author">${escHtml(c.author)}</div><div class="comment-text">${escHtml(c.text)}</div><div class="comment-time">${c.time}</div></div>`).join('')
    : '<div style="font-size:12px;color:var(--text-muted)">ยังไม่มีความคิดเห็น</div>';

  const actionBtns = t.status === 'pending' ? `
    <button class="btn-primary-sm" onclick="changeStatus('${t.id}','inprogress')"><i class="bi bi-play-fill"></i> รับงาน</button>
    <button class="btn-danger-sm" onclick="closePanel()"><i class="bi bi-x-lg"></i> ยกเลิก</button>
  ` : t.status === 'inprogress' ? `
    <button class="btn-success-sm" onclick="changeStatus('${t.id}','done')"><i class="bi bi-check-lg"></i> ปิดงาน</button>
    <button class="btn-danger-sm" onclick="closePanel()"><i class="bi bi-x-lg"></i> ยกเลิก</button>
  ` : `<span style="font-size:12px;color:var(--done);font-weight:600"><i class="bi bi-check-circle-fill"></i> งานเสร็จสิ้นแล้ว</span>`;

  document.getElementById('panel-body').innerHTML = `
    ${slaRow}
    <div class="panel-section">
      <div class="panel-label">รายละเอียด</div>
      <div class="panel-value" style="line-height:1.6">${escHtml(t.detail) || '—'}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px">
      <div>
        <div class="panel-label">ความเร่งด่วน</div>
        <span class="priority-badge ${t.pri}">${prioLabel[t.pri]}</span>
      </div>
      <div>
        <div class="panel-label">ผู้แจ้งงาน</div>
        <div class="panel-value" style="display:flex;align-items:center;gap:6px">
          ${t.reporter ? `<div class="avatar-sm av-blue" style="width:20px;height:20px;font-size:9px;flex-shrink:0">${t.reporterInitials}</div>` : ''}
          ${escHtml(t.reporter) || '—'}
        </div>
      </div>
      <div>
        <div class="panel-label">วันที่แจ้ง</div>
        <div class="panel-value" style="font-size:13px;display:flex;align-items:center;gap:5px">
          <i class="bi bi-calendar3" style="color:var(--text-muted);font-size:12px"></i>
          ${t.reportDate}
        </div>
      </div>
      <div>
        <div class="panel-label">หมายเหตุ</div>
        <div class="panel-value" style="font-size:13px">${escHtml(t.note) || '—'}</div>
      </div>
    </div>
    <div class="panel-section">
      <div class="panel-label">ไทม์ไลน์</div>
      <div class="timeline">${tlHtml}</div>
    </div>
    <div class="panel-section">
      <div class="panel-label">การดำเนินการ</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${actionBtns}</div>
    </div>`;

  document.getElementById('detail-panel').classList.add('open');
  document.getElementById('backdrop').classList.add('show');
  panelOpenTaskId = t.id;
}

function closePanel() {
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('backdrop').classList.remove('show');
  panelOpenTaskId = null;
}

// ===================================================
//  CHANGE STATUS
// ===================================================
async function changeStatus(id, newStatus) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;

  t.status   = newStatus;
  t.timeline = buildTimeline({ ...t, status: newStatus, created_at: t.created_at, reporter: t.reporter });
  closePanel();
  renderAll();

  try {
    await fetch(`/api/tickets/${t._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:    t.title,
        detail:   t.detail,
        note:     t.note,
        priority: t.pri,
        reporter: t.reporter,
        assignee: t.assignee,
        status:   newStatus,
      }),
    });
    await loadTickets();
  } catch {
    showToast('บันทึกลง DB ไม่สำเร็จ','bi-exclamation-triangle-fill','#EF4444');
  }

  const labels = { inprogress:'รับงานแล้ว', done:'ปิดงานสำเร็จ', cancelled:'ยกเลิกงานแล้ว' };
  const icons  = { inprogress:'bi-play-fill', done:'bi-check-circle-fill', cancelled:'bi-x-circle-fill' };
  const colors = { inprogress:'#2563EB', done:'#10B981', cancelled:'#EF4444' };
  showToast(`${id} — ${labels[newStatus]}`, icons[newStatus], colors[newStatus]);
}

function addComment(id) {
  const t   = tasks.find(x => x.id === id);
  const inp = document.getElementById('comment-input-'+id);
  if (!t || !inp || !inp.value.trim()) return;
  t.comments.push({ author:'Admin', text: inp.value.trim(), time:'เดี๋ยวนี้' });
  showToast('ส่งความคิดเห็นแล้ว','bi-chat-dots-fill','#2563EB');
  closePanel();
  setTimeout(() => openPanel(id), 50);
}

// ===================================================
//  ADD TASK
// ===================================================
function openModal()  { document.getElementById('add-modal').classList.add('show'); }
function closeModal() { document.getElementById('add-modal').classList.remove('show'); }

let cancelTargetId = null;
function openCancelModal(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  cancelTargetId = id;
  document.getElementById('cancel-task-title').textContent = t.title;
  document.getElementById('cancel-task-id').textContent    = t.id;
  document.getElementById('cancel-modal').classList.add('show');
}
function closeCancelModal() {
  cancelTargetId = null;
  document.getElementById('cancel-modal').classList.remove('show');
}
async function confirmCancel() {
  if (!cancelTargetId) return;
  closeCancelModal();
  await changeStatus(cancelTargetId, 'cancelled');
}

async function addTask() {
  const title = document.getElementById('new-title').value.trim();
  if (!title) { showToast('กรุณากรอกชื่องาน','bi-exclamation-triangle-fill','#F59E0B'); return; }
  const priority = document.getElementById('new-priority').value;
  const reporter = document.getElementById('new-reporter').value.trim();
  const detail   = document.getElementById('new-detail').value.trim();
  const note     = document.getElementById('new-note').value.trim();

  try {
    const form = new FormData();
    form.append('title',    title);
    form.append('detail',   detail);
    form.append('priority', priority);
    form.append('note',     note);
    form.append('reporter', reporter);

    const res  = await fetch('/api/submit-ticket', { method:'POST', body:form });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    closeModal();
    document.getElementById('new-title').value    = '';
    document.getElementById('new-reporter').value = '';
    document.getElementById('new-detail').value   = '';
    document.getElementById('new-note').value     = '';

    await loadTickets();
    showToast('เพิ่มงานใหม่เรียบร้อย','bi-check-circle-fill','#10B981');
  } catch(e) {
    showToast('บันทึกไม่สำเร็จ: ' + e.message,'bi-exclamation-triangle-fill','#EF4444');
  }
}

// ===================================================
//  FILTERS
// ===================================================
function clearFilters() {
  document.getElementById('search-input').value    = '';
  document.getElementById('filter-priority').value = '';
  filterCards();
}

// ===================================================
//  HELPERS
// ===================================================
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showToast(msg, icon='bi-check-circle-fill', color='#10B981') {
  const wrap = document.getElementById('toast-wrap');
  const el   = document.createElement('div');
  el.className = 'toast-msg';
  el.innerHTML = `<i class="bi ${icon}" style="color:${color};font-size:15px"></i>${msg}`;
  wrap.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3000);
}

function setActive(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
}

// ===================================================
//  LIVE COUNTDOWN
// ===================================================
function tickCountdowns() {
  document.querySelectorAll('[data-task-id]').forEach(el => {
    const badge = el.querySelector('.cd-badge');
    if (!badge) return;
    const tid = el.getAttribute('data-task-id');
    const t   = tasks.find(x => x.id === tid);
    if (!t || t.status === 'done') return;
    const secs = getSecsLeft(t);
    badge.className = `cd-badge ${getCdClass(t, secs)}`;
    badge.innerHTML = getCdLabel(t, secs);
  });
  if (panelOpenTaskId) {
    const t  = tasks.find(x => x.id === panelOpenTaskId);
    const el = document.getElementById('panel-cd');
    if (t && el) {
      const secs = getSecsLeft(t);
      el.textContent = fmtCountdown(secs);
      el.style.color = secs !== null && secs < 0 ? '#991B1B' : secs !== null && secs < 3600 ? '#991B1B' : '#065F46';
    }
  }
  renderStats();
}

// ===================================================
//  NOTIFICATION SYSTEM
// ===================================================
let notifications  = [];
let knownTaskIds   = new Set();   // ID ที่รู้จักแล้ว (ไม่ trigger ซ้ำ)
let isFirstLoad    = true;        // รอบแรกไม่ notify — แค่ seed knownTaskIds

function buildNotifications() {
  const newNotifs = [];

  tasks.forEach(t => {
    const nidNew = t.id + '_new';
    const nidSla = t.id + '_sla';

    // งานใหม่ — เฉพาะ pending และไม่เคยเห็น
    if (t.status === 'pending' && !knownTaskIds.has(nidNew)) {
      if (!isFirstLoad) {
        newNotifs.push({
          id:     nidNew,
          type:   'new-task',
          icon:   'bi-plus-circle-fill',
          title:  `งานใหม่: ${t.id}`,
          sub:    t.title,
          time:   t.reportDate,
          read:   false,
          taskId: t.id,
        });
      }
      knownTaskIds.add(nidNew);
    }

    // เกิน SLA
    const secs = getSecsLeft(t);
    if (t.status !== 'done' && secs !== null && secs < 0 && !knownTaskIds.has(nidSla)) {
      if (!isFirstLoad) {
        newNotifs.push({
          id:     nidSla,
          type:   'over-sla',
          icon:   'bi-exclamation-triangle-fill',
          title:  `เกิน SLA: ${t.id}`,
          sub:    t.title,
          time:   t.reportDate,
          read:   false,
          taskId: t.id,
        });
      }
      knownTaskIds.add(nidSla);
    }
  });

  isFirstLoad = false;

  newNotifs.forEach(n => {
    if (!notifications.find(x => x.id === n.id)) {
      notifications.unshift(n);
    }
  });

  renderNotifDropdown();
}

// Poll API ทุก 30 วินาที เพื่อจับงานใหม่
async function pollNewTickets() {
  try {
    const res = await fetch('/api/tickets');
    if (!res.ok) return;
    const raw = await res.json();

    const SLA_H = { high: 4, med: 24, low: 72 };
    const fresh = raw
      .filter(t => t.assignee && t.assignee !== '—' && t.assignee.trim() !== '')
      .map(t => ({
        _id:         t.id,
        id:          'TK-' + String(t.id).padStart(4,'0'),
        title:       t.title || '',
        detail:      t.detail || '',
        pri:         t.priority || 'low',
        status:      t.status,
        note:        t.note || '',
        time:        formatTime(t.created_at),
        reportDate:  formatDate(t.created_at),
        reporter:    t.reporter || t.assignee || '—',
        assignee:    t.assignee || '—',
        needs:       [],
        deadlineDate: (() => {
          if (!t.created_at) return null;
          const h = SLA_H[t.priority] || 24;
          return new Date(new Date(t.created_at).getTime() + h * 3600000);
        })(),
        createdDate: formatDate(t.created_at),
      }));

    // อัปเดต tasks เฉพาะถ้าจำนวนหรือ ID เปลี่ยน
    const freshIds  = fresh.map(x => x.id).sort().join(',');
    const currentIds = tasks.map(x => x.id).sort().join(',');
    if (freshIds !== currentIds) {
      tasks = fresh;
      renderAll();
    }

    await loadTickets();
    buildNotifications();
  } catch { /* silent */ }
}

function renderNotifDropdown() {
  const list   = document.getElementById('notif-list');
  const badge  = document.getElementById('notif-badge');
  const unread = notifications.filter(n => !n.read).length;

  if (unread > 0) {
    badge.style.display = 'flex';
    badge.textContent   = unread > 99 ? '99+' : unread;
  } else {
    badge.style.display = 'none';
  }

  if (notifications.length === 0) {
    list.innerHTML = `<div class="notif-empty"><i class="bi bi-bell-slash"></i>ไม่มีการแจ้งเตือน</div>`;
    return;
  }

  list.innerHTML = notifications.map(n => `
    <div class="notif-item${n.read ? '' : ' unread'}" onclick="notifClick('${n.id}','${n.taskId}')">
      <div class="notif-icon ${n.type}"><i class="bi ${n.icon}"></i></div>
      <div class="notif-text">
        <div class="notif-text-title">${escHtml(n.title)}</div>
        <div class="notif-text-sub">${escHtml(n.sub)}</div>
        <div class="notif-time">${n.time}</div>
      </div>
      ${!n.read ? '<div class="notif-unread-dot"></div>' : ''}
    </div>`).join('');
}

function notifClick(notifId, taskId) {
  const n = notifications.find(x => x.id === notifId);
  if (n) n.read = true;
  renderNotifDropdown();
  closeNotif();
  if (taskId) openPanel(taskId);
}

function markAllRead() {
  notifications.forEach(n => { n.read = true; });
  renderNotifDropdown();
}

function toggleNotif(e) {
  e.stopPropagation();
  document.getElementById('notif-dropdown').classList.toggle('show');
}

function closeNotif() {
  document.getElementById('notif-dropdown').classList.remove('show');
}

// ===================================================
//  INIT
// ===================================================
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closePanel(); closeModal(); closeNotif(); closeCancelModal(); }
});

document.addEventListener('click', e => {
  const wrap = document.getElementById('notif-wrap');
  if (wrap && !wrap.contains(e.target)) closeNotif();
});

async function loadUser() {
  try {
    const res = await fetch('/api/me');
    if (res.status === 401) { window.location.href = '/login'; return; }
    const data = await res.json();
    document.getElementById('user-fullname').textContent = data.fullName;
    document.getElementById('user-role').textContent     = data.role;
    document.getElementById('user-avatar').textContent   = data.fullName.substring(0,2);
  } catch(e) { console.error(e); }
}

loadUser();
loadTickets();
setInterval(tickCountdowns, 1000);
setInterval(pollNewTickets, 30000);  // poll ทุก 30 วินาที