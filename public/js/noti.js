/* ===== noti.js — โมดูลแจ้งเตือนกลาง (ใช้ร่วมกันทุกหน้า) =====
 * วิธีใช้: ใส่ <script src="/js/noti.js"></script> ก่อน script ประจำหน้า
 * จากนั้นเรียก Noti.init()  ภายใน loadUser() หลังจากโหลด user สำเร็จ
 * และเรียก Noti.build(tickets) เมื่อได้ข้อมูล tickets มาแล้ว
 */

const Noti = (() => {
  let notifications = [];

  // ── localStorage helpers ──────────────────────────────────────────
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

  // ── สร้าง notifications จาก array ของ tickets ─────────────────────
  // tickets ต้องมี field: id (number), title, status, assignee,
  //                        created_at, updated_at
  function build(tickets) {
    const readSet = getReadSet();
    notifications = [];

    tickets.forEach(t => {
      const title = t.title || '';
      const tid   = 'TK-' + String(t.id).padStart(4, '0');

      if (t.status === 'done') {
        const id = tid + '-done';
        notifications.push({
          id, ticketId: tid, read: readSet.has(id),
          icon: 'bi-check-circle-fill', iconBg: '#BBF7D0', iconColor: '#166534',
          title: `${tid} เสร็จแล้ว`,
          desc:  `"${title}" เสร็จสิ้นแล้ว`,
          time:  _fmt(t.updated_at),
        });
      }

      if (t.status === 'inprogress') {
        const id = tid + '-prog';
        notifications.push({
          id, ticketId: tid, read: readSet.has(id),
          icon: 'bi-tools', iconBg: '#FDE68A', iconColor: '#92400E',
          title: `${tid} กำลังดำเนินการ`,
          desc:  `"${title}" ช่างรับงานแล้ว`,
          time:  _fmt(t.updated_at),
        });
      }

      if (t.status === 'pending' && (!t.assignee || t.assignee === '—')) {
        const id = tid + '-wait';
        notifications.push({
          id, ticketId: tid, read: readSet.has(id),
          icon: 'bi-hourglass-split', iconBg: '#FEF9C3', iconColor: '#854D0E',
          title: `${tid} รอมอบหมาย`,
          desc:  `"${title}" ยังไม่มีผู้รับผิดชอบ`,
          time:  _fmt(t.created_at),
        });
      }
    });

    _renderBadge();
  }

  // ── สร้าง notifications สำหรับ staff (manage / queue) ─────────────
  // เพิ่มแจ้งเตือน "งานใหม่" และ "เกิน SLA"
  function buildStaff(tasks, knownIds, isFirst, SLA_HOURS) {
    const readSet   = getReadSet();
    const newNotifs = [];

    tasks.forEach(t => {
      const nidNew = t.id + '-new';
      const nidSla = t.id + '-sla';
      const secsLeft = t.deadlineDate
        ? Math.floor((t.deadlineDate.getTime() - Date.now()) / 1000)
        : null;

      if (t.status === 'pending' && !knownIds.has(nidNew)) {
        if (!isFirst) {
          newNotifs.push({
            id: nidNew, ticketId: t.id, read: false,
            icon: 'bi-plus-circle-fill', iconBg: '#FEF9C3', iconColor: '#854D0E',
            title: `งานใหม่: ${t.id}`,
            desc: t.title,
            time: t.reportDate || '',
          });
        }
        knownIds.add(nidNew);
      }

      if (t.status !== 'done' && secsLeft !== null && secsLeft < 0 && !knownIds.has(nidSla)) {
        if (!isFirst) {
          newNotifs.push({
            id: nidSla, ticketId: t.id, read: false,
            icon: 'bi-exclamation-triangle-fill', iconBg: '#FEE2E2', iconColor: '#991B1B',
            title: `เกิน SLA: ${t.id}`,
            desc: t.title,
            time: t.reportDate || '',
          });
        }
        knownIds.add(nidSla);
      }
    });

    newNotifs.forEach(n => {
      if (!notifications.find(x => x.id === n.id)) notifications.unshift(n);
    });

    notifications.forEach(n => { if (readSet.has(n.id)) n.read = true; });
    _renderBadge();
  }

  // ── badge dot ──────────────────────────────────────────────────────
  function _renderBadge() {
    const unread = notifications.filter(n => !n.read).length;
    const dot = document.getElementById('noti-dot');
    if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
  }

  // ── format date ───────────────────────────────────────────────────
  function _fmt(dateStr) {
    if (!dateStr) return '—';
    try { return new Date(dateStr).toLocaleString('th-TH'); }
    catch { return dateStr; }
  }

  // ── render dropdown list ──────────────────────────────────────────
  function _renderList() {
    const list = document.getElementById('noti-list');
    if (!list) return;

    if (notifications.length === 0) {
      list.innerHTML = `
        <div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">
          <i class="bi bi-bell-slash" style="font-size:24px;display:block;margin-bottom:8px;opacity:.3"></i>
          ไม่มีการแจ้งเตือน
        </div>`;
      return;
    }

    list.innerHTML = notifications.slice(0, 8).map(n => `
      <div class="noti-item ${n.read ? '' : 'unread'}"
           onclick="Noti._click('${n.id}','${n.ticketId}')">
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

  // ── click handler (internal — ต้อง expose เพราะ onclick ใน string) ─
  function _click(notiId, ticketId) {
    const n = notifications.find(x => x.id === notiId);
    if (n) { n.read = true; saveRead(notiId); }
    _renderBadge();
    document.getElementById('noti-dropdown').style.display = 'none';

    // ถ้าหน้านี้มี selectTicket() (timeline / manage) ใช้เลย
    // ถ้าไม่มีก็ redirect ไป /timeline
    if (typeof selectTicket === 'function') {
      selectTicket(ticketId);
    } else {
      window.location.href = '/timeline';
    }
  }

  // ── public API ────────────────────────────────────────────────────
  function toggle() {
    const dd     = document.getElementById('noti-dropdown');
    const isOpen = dd.style.display !== 'none';
    dd.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) _renderList();
  }

  function markAllRead() {
    notifications.forEach(n => n.read = true);
    saveAllRead();
    _renderBadge();
    _renderList();
  }

  // ปิด dropdown เมื่อคลิกนอก — เรียกครั้งเดียวตอน DOMContentLoaded
  function init() {
    document.addEventListener('click', e => {
      const wrap = document.getElementById('noti-wrap');
      if (!wrap?.contains(e.target)) {
        const dd = document.getElementById('noti-dropdown');
        if (dd) dd.style.display = 'none';
      }
    });
  }

  return { build, buildStaff, toggle, markAllRead, init, _click };
})();