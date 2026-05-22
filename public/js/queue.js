/* ===== queue.js ===== */

// ============================================================
//  STAFF DATA (สมมติ)
// ============================================================
const staffList = [
  {
    id: 's1', name: 'ช่างประยงค์ มั่นใจ', role: 'ช่างไฟฟ้า',
    short: 'ปย', avCls: 'd-av-a',
    skills: ['ไฟฟ้า', 'แสงสว่าง', 'UPS', 'ระบบไฟ'],
    active: 2, max: 5
  },
  {
    id: 's2', name: 'ช่างวิชัย สุขใจ', role: 'ช่างระบบเครือข่าย',
    short: 'วช', avCls: 'd-av-b',
    skills: ['เน็ตเวิร์ค', 'WiFi', 'Server', 'IT', 'คอมพิวเตอร์'],
    active: 3, max: 5
  },
  {
    id: 's3', name: 'ช่างสมชาย ดีใจ', role: 'ช่างประปา',
    short: 'สช', avCls: 'd-av-c',
    skills: ['ประปา', 'น้ำรั่ว', 'ท่อ', 'ปั๊มน้ำ', 'ระบบน้ำ'],
    active: 1, max: 5
  },
];

const prioLabel = { high: 'ด่วนมาก', med: 'ปานกลาง', low: 'ปกติ' };
const SLA_HOURS = { high: 4, med: 24, low: 72 };

function calcDeadline(createdAt, priority) {
  if (!createdAt) return null;
  const h = SLA_HOURS[priority] || 24;
  return new Date(new Date(createdAt).getTime() + h * 3600000);
}

function formatDeadline(date) {
  if (!date) return '—';
  const d = date;
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()+543} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} น.`;
}

// ============================================================
//  STATE
// ============================================================
let tasks       = [];
let dSelTicket  = null;
let dSelStaff   = null;
let assignedMap = {};

// ============================================================
//  LOAD TICKETS FROM API
// ============================================================
async function loadTickets() {
  try {
    const res = await fetch('/api/tickets');
    if (!res.ok) throw new Error();
    const data = await res.json();

    tasks = data
      .filter(t => t.status === 'pending' || t.status === 'inprogress')
      .map(t => ({
        id:          'TK-' + String(t.id).padStart(4, '0'),
        _id:         t.id,
        title:       t.title,
        detail:      t.detail || '',
        pri:         t.priority || 'low',
        status:      t.status,
        note:        t.note || '',
        time:        formatTime(t.created_at),
        createdDate: formatDate(t.created_at),
        reporter: t.reporter_name || '—',
        assignee:    t.assignee || '—',
        needs:       [],
        deadlineDate: calcDeadline(t.created_at, t.priority),
        get deadlineStr() { return formatDeadline(this.deadlineDate); },
        get secsLeft() {
          if (!this.deadlineDate) return null;
          return Math.floor((this.deadlineDate.getTime() - Date.now()) / 1000);
        },
      }));

    // ✅ rebuild assignedMap จากข้อมูล DB
    // ✅ rebuild assignedMap จากข้อมูล DB
    assignedMap = {};
    staffList.forEach(s => { s.active = 0; }); // reset ก่อน

    tasks.forEach(t => {
    if (t.assignee && t.assignee !== '—') {
    assignedMap[t.id] = {
      staffId:   null,
      staffName: t.assignee,
      at:        t.time + ' น.',
    };

    // sync workload
    const staff = staffList.find(s => s.name === t.assignee);
    if (staff) staff.active = Math.min(staff.active + 1, staff.max);
  }
});

    renderDispatch();
  } catch {
    document.getElementById('dispatch-wrap').innerHTML = `
      <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:13px;gap:8px">
        <i class="bi bi-exclamation-circle" style="font-size:20px"></i>
        ไม่สามารถโหลดข้อมูลได้ กรุณารีเฟรชหน้า
      </div>`;
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
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()+543}`;
}

// ============================================================
//  HELPERS
// ============================================================
function setActive(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
}

function showToast(msg, icon = 'bi-check-circle-fill', color = '#10B981') {
  const el = document.getElementById('toast-bar');
  el.innerHTML = `<i class="bi ${icon}" style="color:${color}"></i>${msg}`;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2400);
}

function wlCls(pct)   { return pct >= 90 ? 'd-wl-high' : pct >= 60 ? 'd-wl-med' : 'd-wl-low'; }
function wlColor(pct) { return pct >= 90 ? 'var(--rejected)' : pct >= 60 ? 'var(--pending)' : 'var(--done)'; }
function nowStr() {
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ' น.';
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ============================================================
//  SCORING — คำนวณความเหมาะสมของช่างกับงาน
// ============================================================
function scoreStaff(ticket, s) {
  const needs = ticket.needs || [];
  const matched = needs.length
    ? s.skills.filter(sk => needs.some(n => n === sk || sk.includes(n) || n.includes(sk)))
    : [];
  const skillScore = needs.length > 0 ? (matched.length / needs.length) * 60 : 30;
  const wlScore    = (1 - (s.active / s.max)) * 40;
  return { total: Math.round(skillScore + wlScore), matched };
}

// ============================================================
//  RENDER
// ============================================================
function renderDispatch() {
  const wrap = document.getElementById('dispatch-wrap');

  const pendingTasks  = tasks.filter(t => !assignedMap[t.id]);
  const assignedTasks = tasks.filter(t =>  assignedMap[t.id]);

  const navCount = document.getElementById('nav-pending-count');
  if (navCount) navCount.textContent = pendingTasks.length;

  const scoredStaff = dSelTicket
    ? staffList.map(s => ({ ...s, ...scoreStaff(dSelTicket, s) })).sort((a, b) => b.total - a.total)
    : staffList.map(s => {
        const wlPct = Math.round((s.active / s.max) * 100);
        return { ...s, total: Math.round((1 - s.active / s.max) * 100), matched: [] };
      }).sort((a, b) => b.total - a.total);

  wrap.innerHTML = `
    <!-- LEFT: รายการงาน -->
    <div class="dispatch-panel">
      <div class="dispatch-panel-head">
        <i class="bi bi-inbox" style="font-size:16px;color:var(--text-muted)"></i>
        <h2>งานที่รอมอบหมาย</h2>
        ${pendingTasks.length  ? `<span class="d-badge-count">${pendingTasks.length}</span>` : ''}
        ${assignedTasks.length ? `<span class="d-badge-done"><i class="bi bi-check-circle-fill"></i>${assignedTasks.length}</span>` : ''}
      </div>
      <div class="dispatch-panel-body">

        ${pendingTasks.length === 0 && assignedTasks.length === 0
          ? `<div class="d-empty"><i class="bi bi-inbox"></i><span>ไม่มีงานที่รอมอบหมาย</span></div>`
          : ''}

        ${pendingTasks.map(t => {
          const isSel = dSelTicket && dSelTicket.id === t.id;
          const secs = t.secsLeft;
          const isOver   = secs !== null && secs < 0;
          const isUrgent = secs !== null && secs >= 0 && secs < 3600;
          const dlColor  = isOver ? '#991B1B' : isUrgent ? '#92400E' : '#065F46';
          const dlBg     = isOver ? '#FEE2E2' : isUrgent ? '#FEF9C3' : '#DCFCE7';
          const dlIcon   = isOver ? 'bi-exclamation-triangle-fill' : 'bi-alarm';
          return `
          <div class="d-ticket-card${isSel ? ' d-selected' : ''}" onclick="dSelectTicket('${t.id}')">
            <div class="d-ticket-top">
              <span class="d-tid">${escHtml(t.id)}</span>
              <span class="d-pri-badge d-pri-${t.pri}">${prioLabel[t.pri] || t.pri}</span>
            </div>
            <div class="d-title">${escHtml(t.title)}</div>
            ${t.detail ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:7px;line-height:1.5">${escHtml(t.detail)}</div>` : ''}
            <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
                <span style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:4px">
                  <i class="bi bi-person-fill" style="font-size:10px;color:var(--primary)"></i>
                  <span style="font-weight:600;color:var(--text-main)"> ผู้แจ้ง : ${t.reporter && t.reporter !== '—' ? escHtml(t.reporter) : '—'}</span>
                </span>
                <span style="font-size:10px;color:var(--text-muted);display:flex;align-items:center;gap:3px">
                  <i class="bi bi-clock" style="font-size:10px"></i>${t.createdDate} ${t.time} น.
                </span>
              </div>
              <div style="display:flex;align-items:center;gap:5px;font-size:11px;background:${dlBg};color:${dlColor};padding:4px 8px;border-radius:6px;width:fit-content;font-weight:600">
                <i class="bi ${dlIcon}" style="font-size:11px"></i>
                กำหนดส่ง: ${t.deadlineStr}
              </div>
            </div>
          </div>`;
        }).join('')}

        ${assignedTasks.length ? `
          <hr class="d-divider">
          ${pendingTasks.length === 0 ? `
            <div class="d-empty" style="padding:16px">
              <i class="bi bi-check-circle-fill" style="font-size:28px;color:var(--done)"></i>
              <span>มอบหมายงานครบทุกรายการแล้ว</span>
            </div>` : ''}
          <div class="d-section-lbl">
            <i class="bi bi-check-circle-fill" style="color:var(--done)"></i>
            มอบหมายแล้ว (${assignedTasks.length})
          </div>
          ${assignedTasks.map(t => {
            const a = assignedMap[t.id];
            return `
            <div class="d-assigned-card">
              <div class="d-assigned-icon"><i class="bi bi-check-lg"></i></div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">
                  <span class="d-tid">${escHtml(t.id)}</span>
                  <span class="d-pri-badge d-pri-${t.pri}">${prioLabel[t.pri] || t.pri}</span>
                </div>
                <div class="d-assigned-name">${escHtml(t.title)}</div>
                <div class="d-meta" style="margin-top:4px">
                  <span><i class="bi bi-clock" style="font-size:10px"></i>${t.createdDate}</span>
                  ${t.reporter && t.reporter !== '—'
                    ? `<span><i class="bi bi-person" style="font-size:10px"></i>ผู้แจ้ง : ${escHtml(t.reporter)}</span>`
                    : ''}
                </div>
                <div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">
                  <span class="d-assigned-to">
                    <i class="bi bi-person-check-fill"></i>${escHtml(a.staffName)}
                  </span>
                  <span style="font-size:11px;color:var(--text-muted)">${a.at}</span>
                </div>
              </div>
            </div>`;
          }).join('')}
        ` : ''}

      </div>
    </div>

    <!-- RIGHT: เจ้าหน้าที่ -->
    <div class="dispatch-panel">
      <div class="dispatch-panel-head">
        <i class="bi bi-people" style="font-size:16px;color:var(--text-muted)"></i>
        <h2>${dSelTicket ? 'เลือกผู้รับผิดชอบ' : 'เจ้าหน้าที่ทั้งหมด'}</h2>
        <span style="font-size:11px;color:var(--text-muted)">${staffList.length} คน</span>
      </div>
      <div class="dispatch-panel-body">

        ${dSelTicket ? `
          <!-- งานที่เลือก -->
          <div style="background:var(--primary-light);border:1px solid #BFDBFE;border-radius:var(--radius-sm);padding:10px 12px;font-size:12px">
            <div style="font-weight:600;color:var(--primary);margin-bottom:4px;display:flex;align-items:center;gap:6px">
              <i class="bi bi-cursor-fill"></i> งานที่เลือก
            </div>
            <div style="font-weight:600;font-size:13px;color:var(--text-main)">${escHtml(dSelTicket.title)}</div>
            <div class="d-meta" style="margin-top:4px">
              <span>${escHtml(dSelTicket.id)}</span>
              <span><i class="bi bi-clock" style="font-size:10px"></i>${dSelTicket.createdDate}</span>
              ${dSelTicket.reporter && dSelTicket.reporter !== '—'
                ? `<span><i class="bi bi-person" style="font-size:10px"></i>ผู้แจ้ง: ${escHtml(dSelTicket.reporter)}</span>`
                : ''}
            </div>
          </div>
          <div class="d-section-lbl" style="margin-top:4px">
            <i class="bi bi-sort-down"></i> เลือกผู้รับผิดชอบ
          </div>
        ` : `
          <div style="background:#F8FAFC;border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:8px">
            <i class="bi bi-info-circle"></i>
            เลือกงาน
          </div>
        `}

        ${scoredStaff.map(s => {
          const isSel = dSelStaff && dSelStaff.id === s.id;
          const wlPct = Math.round((s.active / s.max) * 100);
          const isAvail = s.active < s.max;
          return `
          <div class="d-staff-card${isSel ? ' d-staff-selected' : ''}${!isAvail ? ' opacity-full' : ''}"
               onclick="${isAvail ? `dSelectStaff('${s.id}')` : 'void(0)'}">
            <div class="d-staff-top">
              <div class="d-avatar ${s.avCls}">${s.short}</div>
              <div>
                <div class="d-staff-name">${escHtml(s.name)}</div>
                <div class="d-staff-role">${escHtml(s.role)}</div>
              </div>
              <div class="d-staff-right">
                <div class="d-wl-num" style="color:${wlColor(wlPct)}">${s.active}/${s.max}</div>
                <div class="d-wl-lbl">งานในมือ</div>
                ${!isAvail ? `<div style="font-size:10px;color:var(--rejected);font-weight:600">เต็ม</div>` : ''}
              </div>
            </div>
            <div class="d-wl-bar">
              <div class="d-wl-fill ${wlCls(wlPct)}" style="width:${wlPct}%"></div>
            </div>
            <!-- ทักษะ -->
            <div class="d-skill-tags">
              ${s.skills.map(sk => {
                const isMatch = s.matched && s.matched.includes(sk);
                return `<span class="d-skill-tag${isMatch ? ' matched' : ''}">${escHtml(sk)}</span>`;
              }).join('')}
            </div>

          </div>`;
        }).join('')}

      </div>
      <div class="d-bottom">
        <button class="d-assign-btn" ${!dSelTicket || !dSelStaff ? 'disabled' : ''} onclick="doDispatchAssign()">
          <i class="bi bi-send"></i>
          ${dSelTicket && dSelStaff
            ? `มอบหมาย ${escHtml(dSelTicket.id)} → ${escHtml(dSelStaff.name)}`
            : 'เลือกงาน และผู้รับผิดชอบ'}
        </button>
      </div>
    </div>`;
}

// ============================================================
//  ACTIONS
// ============================================================
function dSelectTicket(id) {
  dSelTicket = tasks.find(t => t.id === id) || null;
  dSelStaff  = null;
  renderDispatch();
}

function dSelectStaff(id) {
  const s = staffList.find(x => x.id === id);
  if (!s || s.active >= s.max) return;
  dSelStaff = s;
  renderDispatch();
}

async function doDispatchAssign() {
  if (!dSelTicket || !dSelStaff) return;

  const tid   = dSelTicket.id;
  const sname = dSelStaff.name;

  try {
    const res = await fetch(`/api/tickets/${dSelTicket._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:    dSelTicket.title,
        detail:   dSelTicket.detail,
        note:     dSelTicket.note,
        priority: dSelTicket.pri,
        assignee: sname, 
      }),
    });

    if (!res.ok) throw new Error('PUT failed');

  } catch(err) {
    showToast('มอบหมายไม่สำเร็จ: ' + err.message, 'bi-x-circle-fill', '#EF4444');
    return;
  }

  assignedMap[tid] = { staffId: dSelStaff.id, staffName: sname, at: nowStr() };
  dSelStaff.active = Math.min(dSelStaff.active + 1, dSelStaff.max);

  const task = tasks.find(t => t.id === tid);
  if (task) { task.assignee = sname; }

  dSelTicket = null;
  dSelStaff  = null;

  renderDispatch();
  showToast(`มอบหมาย ${tid} ให้ ${sname} แล้ว`, 'bi-check-circle-fill', '#10B981');
}

async function resetDispatch() {
  // ✅ reset assignee และ status กลับเป็น pending ใน DB ด้วย
  const assignedTasks = tasks.filter(t => assignedMap[t.id]);
  
  await Promise.all(assignedTasks.map(t =>
    fetch(`/api/tickets/${t._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:    t.title,
        detail:   t.detail,
        note:     t.note,
        priority: t.pri,
        assignee: '—',
      }),
    })
  ));

  // reset workload
  staffList.forEach(s => { s.active = 0; });

  dSelTicket  = null;
  dSelStaff   = null;
  assignedMap = {};

  await loadTickets(); // โหลดใหม่จาก DB
  showToast('รีเซ็ตการมอบหมายแล้ว', 'bi-arrow-clockwise', '#64748B');
}

// ============================================================
//  NOTIFICATION SYSTEM
// ============================================================
let notifications = [];
let knownTaskIds  = new Set();
let isFirstLoad   = true;

function buildNotifications() {
  const newNotifs = [];
  tasks.forEach(t => {
    const nid = t.id + '_new';

    if (t.status === 'pending' && (!t.assignee || t.assignee === '—') && !knownTaskIds.has(nid)) {
      if (!isFirstLoad) {
        //  มีงานใหม่ สร้าง notification
        newNotifs.push({
          id: nid, type: 'new-task', icon: 'bi-plus-circle-fill',
          title: `งานใหม่รอมอบหมาย: ${t.id}`,
          sub: `${t.title}${t.reporter !== '—' ? ' · ผู้แจ้ง: ' + t.reporter : ''}`,
          time: t.createdDate + ' ' + t.time + ' น.',
          read: false, taskId: t.id,
        });
      }
      knownTaskIds.add(nid);
    }
  });

  isFirstLoad = false;
  newNotifs.forEach(n => { if (!notifications.find(x => x.id === n.id)) notifications.unshift(n); });
  renderNotifDropdown();
}

async function pollNewTickets() {
  try {
    const res = await fetch('/api/tickets');
    if (!res.ok) return;
    const data = await res.json();

    const fresh = data.filter(t => t.status === 'pending' || t.status === 'inprogress')
      .map(t => ({
        id: 'TK-' + String(t.id).padStart(4,'0'), _id: t.id,
        title: t.title, detail: t.detail || '',
        pri: t.priority || 'low', status: t.status, note: t.note || '',
        time: formatTime(t.created_at), createdDate: formatDate(t.created_at),
        reporter: t.reporter_name || '—',  
        assignee: t.assignee || '—', needs: [],
        deadlineDate: calcDeadline(t.created_at, t.priority),
        get deadlineStr() { return formatDeadline(this.deadlineDate); },
        get secsLeft() { if (!this.deadlineDate) return null; return Math.floor((this.deadlineDate.getTime() - Date.now()) / 1000); },
      }));

    const freshIds   = fresh.map(x => x.id).sort().join(',');
    const currentIds = tasks.map(x => x.id).sort().join(',');

    if (freshIds !== currentIds) {
      // มีงานใหม่หรืองานหาย → อัปเดต tasks และ rebuild
      tasks = fresh;
      assignedMap = {};
      staffList.forEach(s => { s.active = 0; });
      tasks.forEach(t => {
        if (t.assignee && t.assignee !== '—') {
          assignedMap[t.id] = { staffId: null, staffName: t.assignee, at: t.time + ' น.' };
          const staff = staffList.find(s => s.name === t.assignee);
          if (staff) staff.active = Math.min(staff.active + 1, staff.max);
        }
      });
      renderDispatch();
    }

    // ✅ เรียก buildNotifications ทุกครั้ง ไม่ใช่แค่ตอน ID เปลี่ยน
    buildNotifications();

  } catch { /* silent */ }
}

function renderNotifDropdown() {
  const list   = document.getElementById('notif-list');
  const badge  = document.getElementById('notif-badge');
  const unread = notifications.filter(n => !n.read).length;
  badge.style.display = unread > 0 ? 'flex' : 'none';
  badge.textContent   = unread > 99 ? '99+' : unread;
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
  if (taskId) dSelectTicket(taskId);
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

// ============================================================
//  INIT
// ============================================================
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNotif(); });
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
    document.getElementById('user-avatar').textContent   = data.fullName.substring(0, 2);
  } catch(e) { console.error(e); }
}

loadUser();
loadTickets().then(() => {
  buildNotifications(); 
});
setInterval(pollNewTickets, 30000);