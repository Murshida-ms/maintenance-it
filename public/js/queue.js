/* ===== queue.js ===== */

const prioLabel = { high: 'ด่วนมาก', med: 'ปานกลาง', low: 'ปกติ' };
const SLA_HOURS = { high: 4, med: 24, low: 72 };

// ========== STATE ==========
let tasks       = [];
let staffList   = [];
let dSelTicket  = null;
let dSelStaff   = null;
let assignedMap = {};
let notifications  = [];
let knownTaskIds   = new Set();
let isFirstLoad    = true;

// ========== HELPERS ==========
function calcDeadline(createdAt, priority) {
  if (!createdAt) return null;
  const h = SLA_HOURS[priority] || 24;
  return new Date(new Date(createdAt).getTime() + h * 3600000);
}

function formatDeadline(date) {
  if (!date) return '—';
  return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()+543} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')} น.`;
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
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()+543} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function nowStr() {
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ' น.';
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function wlColor(pct) {
  return pct >= 80 ? 'var(--rejected)' : pct >= 50 ? 'var(--pending)' : 'var(--done)';
}

function wlCls(pct) {
  return pct >= 80 ? 'd-wl-high' : pct >= 50 ? 'd-wl-med' : 'd-wl-low';
}

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? parts[0].charAt(0) + parts[1].charAt(0)
    : name.substring(0, 2);
}

const AV_COLORS = ['d-av-a','d-av-b','d-av-c','d-av-d','d-av-e'];

function showToast(msg, icon = 'bi-check-circle-fill', color = '#10B981') {
  const el = document.getElementById('toast-bar');
  el.innerHTML = `<i class="bi ${icon}" style="color:${color}"></i>${msg}`;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2400);
}

// ========== LOAD STAFF FROM API ==========
async function loadStaff() {
  try {
    const res = await fetch('/api/staff');
    if (!res.ok) throw new Error();
    const data = await res.json();

    staffList = data.map((s, i) => ({
      id:       s.staff_id,
      name:     s.staff_name,
      username: s.username_staff,
      role:     s.role_name || 'เจ้าหน้าที่',
      short:    getInitials(s.staff_name),
      avCls:    AV_COLORS[i % AV_COLORS.length],
      active:   Number(s.active_tasks) || 0,
    }));

  } catch (e) {
    console.error('โหลดเจ้าหน้าที่ไม่สำเร็จ:', e);
    staffList = [];
  }
}

// ========== LOAD TICKETS ==========
async function loadTickets() {
  try {
    const res = await fetch('/api/all-tickets');
    if (!res.ok) throw new Error();
    const data = await res.json();

    tasks = data
      .filter(t => t.status === 'pending' || t.status === 'inprogress')
      .map(t => ({
        id:           'TK-' + String(t.id).padStart(4, '0'),
        _id:          t.id,
        title:        t.title,
        detail:       t.detail || '',
        pri:          t.priority || 'low',
        status:       t.status,
        note:         t.note || '',
        time:         formatTime(t.created_at),
        createdDate:  formatDate(t.created_at),
        reporter:     t.reporter_name || '—',
        assignee:     t.assignee || '—',
        needs:        [],
        deadlineDate: calcDeadline(t.created_at, t.priority),
        get deadlineStr() { return formatDeadline(this.deadlineDate); },
        get secsLeft() {
          if (!this.deadlineDate) return null;
          return Math.floor((this.deadlineDate.getTime() - Date.now()) / 1000);
        },
      }));

    // rebuild assignedMap + workload
    assignedMap = {};
    staffList.forEach(s => { s.active = 0; });

    tasks.forEach(t => {
      if (t.assignee && t.assignee !== '—') {
        assignedMap[t.id] = {
          staffName: t.assignee,
          at: t.time + ' น.',
        };
        const staff = staffList.find(s => s.name === t.assignee);
        if (staff) staff.active = Math.min(staff.active + 1, staff.max);
      }
    });

    renderDispatch();
    buildNotifications();
  } catch (e) {
    console.error(e);
    document.getElementById('dispatch-wrap').innerHTML = `
      <div style="flex:1;display:flex;align-items:center;justify-content:center;
                  color:var(--text-muted);font-size:13px;gap:8px;padding:40px">
        <i class="bi bi-exclamation-circle" style="font-size:20px"></i>
        ไม่สามารถโหลดข้อมูลได้ กรุณารีเฟรชหน้า
      </div>`;
  }
}

// ========== RENDER ==========
function renderDispatch() {
  const wrap = document.getElementById('dispatch-wrap');

  const pendingTasks  = tasks.filter(t => !t.assignee || t.assignee === '—');
  const assignedTasks = tasks.filter(t => t.assignee && t.assignee !== '—');

  wrap.innerHTML = `
    <!-- LEFT: รายการงาน -->
    <div class="dispatch-panel">
      <div class="dispatch-panel-head">
        <i class="bi bi-inbox" style="font-size:16px;color:var(--text-muted)"></i>
        <h2>งานรอมอบหมาย</h2>
        ${pendingTasks.length  ? `<span class="d-badge-count">${pendingTasks.length}</span>` : ''}
        ${assignedTasks.length ? `<span class="d-badge-done"><i class="bi bi-check-circle-fill"></i>${assignedTasks.length}</span>` : ''}
      </div>
      <div class="dispatch-panel-body">

        ${pendingTasks.length === 0 && assignedTasks.length === 0
          ? `<div class="d-empty">
               <i class="bi bi-inbox"></i>
               <span>ไม่มีงานที่รอมอบหมาย</span>
             </div>`
          : ''}

        ${pendingTasks.map(t => renderTicketCard(t, false)).join('')}

        ${assignedTasks.length ? `
          <hr class="d-divider">
          <div class="d-section-lbl">
            <i class="bi bi-check-circle-fill" style="color:var(--done)"></i>
            มอบหมายแล้ว (${assignedTasks.length})
          </div>
          ${assignedTasks.map(t => renderAssignedCard(t)).join('')}
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
          <div style="background:var(--primary-light);border:1px solid #BFDBFE;
                      border-radius:var(--radius-sm);padding:10px 12px;font-size:12px;margin-bottom:4px">
            <div style="font-weight:600;color:var(--primary);margin-bottom:4px;
                        display:flex;align-items:center;gap:6px">
              <i class="bi bi-cursor-fill"></i> งานที่เลือก
            </div>
            <div style="font-weight:600;font-size:13px;color:var(--text-main)">
              ${escHtml(dSelTicket.title)}
            </div>
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
          <div style="background:#F8FAFC;border:1px solid var(--border);
                      border-radius:var(--radius-sm);padding:10px 12px;
                      font-size:12px;color:var(--text-muted);
                      display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <i class="bi bi-info-circle"></i>
            กรุณาเลือกงานจากรายการซ้ายมือก่อน
          </div>
        `}

        ${staffList.length === 0
          ? `<div class="d-empty">
               <i class="bi bi-people"></i>
               <span>ไม่พบข้อมูลเจ้าหน้าที่</span>
             </div>`
          : staffList.map(s => renderStaffCard(s)).join('')}

      </div>

      <!-- ปุ่มมอบหมาย -->
      <div class="d-bottom">
        <button class="d-assign-btn"
          ${!dSelTicket || !dSelStaff ? 'disabled' : ''}
          onclick="doDispatchAssign()">
          <i class="bi bi-send"></i>
          ${dSelTicket && dSelStaff
            ? `มอบหมาย ${escHtml(dSelTicket.id)} → ${escHtml(dSelStaff.name)}`
            : 'เลือกงาน และผู้รับผิดชอบ'}
        </button>
      </div>
    </div>`;
}

// ========== CARD BUILDERS ==========
function renderTicketCard(t, isSelected) {
  const isSel    = dSelTicket && dSelTicket.id === t.id;
  const secs     = t.secsLeft;
  const isOver   = secs !== null && secs < 0;
  const isUrgent = secs !== null && secs >= 0 && secs < 3600;
  const dlColor  = isOver ? '#991B1B' : isUrgent ? '#92400E' : '#065F46';
  const dlBg     = isOver ? '#FEE2E2' : isUrgent ? '#FEF9C3' : '#DCFCE7';
  const dlIcon   = isOver ? 'bi-exclamation-triangle-fill' : 'bi-alarm';

  return `
    <div class="d-ticket-card${isSel ? ' d-selected' : ''}"
         onclick="dSelectTicket('${t.id}')">
      <div class="d-ticket-top">
        <span class="d-tid">${escHtml(t.id)}</span>
        <span class="d-pri-badge d-pri-${t.pri}">${prioLabel[t.pri]}</span>
      </div>
      <div class="d-title">${escHtml(t.title)}</div>
      ${t.detail
        ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:7px;
                       line-height:1.5">${escHtml(t.detail)}</div>`
        : ''}
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;
                  padding-top:6px;border-top:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
          <span style="font-size:12px;color:var(--text-main);font-weight:600;
                       display:flex;align-items:center;gap:4px">
            <i class="bi bi-person-fill" style="font-size:11px;color:var(--primary)"></i>
            ผู้แจ้ง: ${escHtml(t.reporter)}
          </span>
          <span style="font-size:11px;color:var(--text-muted)">
            <i class="bi bi-clock" style="font-size:10px"></i> ${t.createdDate}
          </span>
        </div>
        <div style="display:inline-flex;align-items:center;gap:5px;font-size:11px;
                    background:${dlBg};color:${dlColor};padding:4px 10px;
                    border-radius:6px;font-weight:600;width:fit-content">
          <i class="bi ${dlIcon}" style="font-size:11px"></i>
          กำหนดส่ง: ${t.deadlineStr}
        </div>
      </div>
    </div>`;
}

function renderAssignedCard(t) {
  return `
    <div class="d-assigned-card">
      <div class="d-assigned-icon"><i class="bi bi-check-lg"></i></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">
          <span class="d-tid">${escHtml(t.id)}</span>
          <span class="d-pri-badge d-pri-${t.pri}">${prioLabel[t.pri]}</span>
        </div>
        <div class="d-assigned-name">${escHtml(t.title)}</div>
        <div class="d-meta" style="margin-top:4px">
          ${t.reporter && t.reporter !== '—'
            ? `<span><i class="bi bi-person" style="font-size:10px"></i>ผู้แจ้ง: ${escHtml(t.reporter)}</span>`
            : ''}
          <span><i class="bi bi-clock" style="font-size:10px"></i>${t.createdDate}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
          <span class="d-assigned-to">
            <i class="bi bi-person-check-fill"></i>${escHtml(t.assignee)}
          </span>
        </div>
      </div>
    </div>`;
}

function renderStaffCard(s) {
  const isSel = dSelStaff && dSelStaff.id === s.id;

  return `
    <div class="d-staff-card${isSel ? ' d-staff-selected' : ''}"
         onclick="dSelectStaff('${s.id}')">
      <div class="d-staff-top">
        <div class="d-avatar ${s.avCls}">${s.short}</div>
        <div style="flex:1;min-width:0">
          <div class="d-staff-name">${escHtml(s.name)}</div>
          <div class="d-staff-role">${escHtml(s.role)}</div>
        </div>
        <div class="d-staff-right">
          <div class="d-wl-num">${s.active}</div>
          <div class="d-wl-lbl">งานในมือ</div>
        </div>
      </div>
      ${isSel ? `
        <div style="margin-top:8px;font-size:11px;color:var(--done);
                    font-weight:600;display:flex;align-items:center;gap:5px">
          <i class="bi bi-check-circle-fill"></i> เลือกแล้ว — กดปุ่มมอบหมายด้านล่าง
        </div>` : ''}
    </div>`;
}

// ========== ACTIONS ==========
function dSelectTicket(id) {
  dSelTicket = (dSelTicket && dSelTicket.id === id) ? null : tasks.find(t => t.id === id) || null;
  dSelStaff  = null;
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

    showToast(`มอบหมาย ${tid} ให้ ${sname} แล้ว`, 'bi-check-circle-fill', '#10B981');
  } catch (err) {
    showToast('มอบหมายไม่สำเร็จ: ' + err.message, 'bi-x-circle-fill', '#EF4444');
    return;
  }

  dSelTicket = null;
  dSelStaff  = null;

  await loadStaff();
  await loadTickets();
}

async function resetDispatch() {
  const assignedTasks = tasks.filter(t => t.assignee && t.assignee !== '—');
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
  dSelTicket  = null;
  dSelStaff   = null;
  assignedMap = {};
  await loadStaff();
  await loadTickets();
  showToast('รีเซ็ตการมอบหมายแล้ว', 'bi-arrow-clockwise', '#64748B');
}

// ========== NOTIFICATIONS ==========
function getReadSet() {
  try { return new Set(JSON.parse(localStorage.getItem('noti-read') || '[]')); }
  catch { return new Set(); }
}
function saveRead(id) {
  const s = getReadSet(); s.add(id);
  localStorage.setItem('noti-read', JSON.stringify([...s]));
}
function saveAllRead() {
  localStorage.setItem('noti-read', JSON.stringify(notifications.map(n => n.id)));
}

function buildNotifications() {
  const readSet   = getReadSet();
  const newNotifs = [];

  tasks.forEach(t => {
    const nid = t.id + '-wait';
    if (t.status === 'pending' && (!t.assignee || t.assignee === '—')) {
      if (!knownTaskIds.has(nid) && !isFirstLoad) {
        newNotifs.push({
          id: nid, ticketId: t.id, read: false,
          icon: 'bi-plus-circle-fill', iconBg: '#FEF9C3', iconColor: '#854D0E',
          title: 'งานใหม่รอมอบหมาย',
          desc: `${t.id} · "${t.title}"${t.reporter !== '—' ? ' · ผู้แจ้ง: ' + t.reporter : ''}`,
          time: t.createdDate,
        });
      }
      knownTaskIds.add(nid);
    }
  });

  isFirstLoad = false;
  newNotifs.forEach(n => {
    if (!notifications.find(x => x.id === n.id)) notifications.unshift(n);
  });

  // sync read state จาก localStorage
  notifications.forEach(n => { if (readSet.has(n.id)) n.read = true; });

  renderNotiBadge();
}

function renderNotiBadge() {
  const unread = notifications.filter(n => !n.read).length;
  const dot = document.getElementById('noti-dot');
  if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
}

function toggleNotification() {
  const dd = document.getElementById('noti-dropdown');
  const isOpen = dd.style.display !== 'none';
  dd.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) renderNotiList();
}

function renderNotiList() {
  const list = document.getElementById('noti-list');
  if (!list) return;
  if (notifications.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">
      <i class="bi bi-bell-slash" style="font-size:24px;display:block;margin-bottom:8px;opacity:.3"></i>
      ไม่มีการแจ้งเตือน</div>`;
    return;
  }
  list.innerHTML = notifications.slice(0, 8).map(n => `
    <div class="noti-item ${n.read ? '' : 'unread'}" onclick="clickNoti('${n.id}','${n.ticketId}')">
      <div class="noti-icon" style="background:${n.iconBg};color:${n.iconColor}">
        <i class="bi ${n.icon}"></i>
      </div>
      <div style="flex:1;min-width:0">
        <div class="noti-item-title">
          ${n.title}
          ${!n.read ? '<span class="noti-unread-dot"></span>' : ''}
        </div>
        <div class="noti-item-desc">${n.desc}</div>
        <div class="noti-item-time">${n.time}</div>
      </div>
    </div>`).join('');
}

function clickNoti(notiId, ticketId) {
  const n = notifications.find(x => x.id === notiId);
  if (n) { n.read = true; saveRead(notiId); }
  renderNotiBadge();
  document.getElementById('noti-dropdown').style.display = 'none';
  if (ticketId) dSelectTicket(ticketId);
}

function markAllRead() {
  notifications.forEach(n => n.read = true);
  saveAllRead();
  renderNotiBadge();
  renderNotiList();
}

// ========== POLL ==========
async function pollNewTickets() {
  try {
    const res = await fetch('/api/all-tickets');
    if (!res.ok) return;
    const data = await res.json();

    const fresh = data
      .filter(t => t.status === 'pending' || t.status === 'inprogress')
      .map(t => ({
        id: 'TK-' + String(t.id).padStart(4,'0'), _id: t.id,
        title: t.title, detail: t.detail || '',
        pri: t.priority || 'low', status: t.status, note: t.note || '',
        time: formatTime(t.created_at), createdDate: formatDate(t.created_at),
        reporter: t.reporter_name || '—',
        assignee: t.assignee || '—', needs: [],
        deadlineDate: calcDeadline(t.created_at, t.priority),
        get deadlineStr() { return formatDeadline(this.deadlineDate); },
        get secsLeft() {
          if (!this.deadlineDate) return null;
          return Math.floor((this.deadlineDate.getTime() - Date.now()) / 1000);
        },
      }));

    const freshIds   = fresh.map(x => x.id).sort().join(',');
    const currentIds = tasks.map(x => x.id).sort().join(',');

    if (freshIds !== currentIds) {
      tasks = fresh;
      assignedMap = {};
      await loadStaff();
      renderDispatch();
    }
    buildNotifications();
  } catch { /* silent */ }
}

// ========== STAFF SELECT ==========
function dSelectStaff(id) {
  const s = staffList.find(x => x.id === Number(id));
  if (!s) return;
  dSelStaff = (dSelStaff && dSelStaff.id === s.id) ? null : s;
  if (!dSelTicket) {
    showToast('กรุณาเลือกงานจากรายการซ้ายมือด้วย', 'bi-info-circle', '#F59E0B');
  }
  renderDispatch();
}

// ========== USER ==========
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

// ========== INIT ==========
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const dd = document.getElementById('noti-dropdown');
    if (dd) dd.style.display = 'none';
  }
});

document.addEventListener('click', e => {
  if (!document.getElementById('noti-wrap')?.contains(e.target)) {
    const dd = document.getElementById('noti-dropdown');
    if (dd) dd.style.display = 'none';
  }
});

async function init() {
  await loadUser();
  await loadStaff();
  await loadTickets();
  buildNotifications();
  setInterval(pollNewTickets, 30000);
}

init();