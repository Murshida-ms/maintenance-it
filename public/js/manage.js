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
    const res = await fetch('/api/my-tasks');
    if (!res.ok) throw new Error();
    const raw = await res.json();

    tasks = raw
      .filter(t => t.assignee && t.assignee !== '—' && t.assignee.trim() !== '')
      .map(t => ({
        _id:              t.id,
        id:               'TK-' + String(t.id).padStart(4,'0'),
        title:            t.title || '',
        detail:           t.detail || '',
        note:             t.note || '',
        pri:              t.priority || 'low',
        status:           t.status || 'pending',
        reporter:         t.reporter_name || '—',
        reporterInitials: (t.reporter_name || '').substring(0, 2) || '—',
        assignee:         t.assignee || '',
        created_at:       t.created_at,
        time:             formatTime(t.created_at),
        reportDate:       formatDate(t.created_at),
        deadlineDate:     calcDeadline(t.created_at, t.priority),
        attachments:      t.attachments || [],
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
    {
      label: 'แจ้งงานสำเร็จ',
      time:  formatTime(t.created_at),
      by:    t.reporter_name || t.reporter || '—',
      state: 'done'
    },
    {
      label: 'รับเรื่อง',
      time:  t.acceptedAt || '—',
      by:    t.acceptedBy || '—',
      state: t.status !== 'pending' ? 'done' : 'active'
    },
    {
      label: 'ดำเนินการ',
      time:  t.acceptedAt || '—',
      by:    t.assignee   || '—',
      state: t.status === 'inprogress' ? 'active' : t.status === 'done' ? 'done' : 'wait'
    },
    {
      label: 'เสร็จสิ้น',
      time:  t.doneAt || '—',
      by:    t.doneBy || '—',
      state: t.status === 'done' ? 'done' : 'wait'
    },
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
      const reporterInitials = (t.reporter || '').substring(0, 2) || '—';
      const avHtml = t.reporter
        ? `<div class="avatar-sm av-blue" title="${escHtml(t.reporter)}">${reporterInitials}</div>`
        : `<div class="avatar-sm av-blue" style="color:#94A3B8;background:#F1F5F9">—</div>`;

      const secs    = getSecsLeft(t);
      const cdClass = getCdClass(t, secs);
      const cdHtml  = `<span class="cd-badge ${cdClass}" data-task-id="${t.id}">${getCdLabel(t, secs)}</span>`;

      const isOver   = secs !== null && secs < 0;
      const isUrgent = secs !== null && secs >= 0 && secs < 3600;
      const dlColor  = isOver ? '#991B1B' : isUrgent ? '#92400E' : '#065F46';
      const dlBg     = isOver ? '#FEE2E2' : isUrgent ? '#FEF9C3' : '#DCFCE7';
      const dlIcon   = isOver ? 'bi-exclamation-triangle-fill' : 'bi-alarm';

      const deadlineStr = t.deadlineDate
        ? `${String(t.deadlineDate.getDate()).padStart(2,'0')}/${String(t.deadlineDate.getMonth()+1).padStart(2,'0')}/${t.deadlineDate.getFullYear()+543} ${String(t.deadlineDate.getHours()).padStart(2,'0')}:${String(t.deadlineDate.getMinutes()).padStart(2,'0')} น.`
        : '—';

      const attachCount = (t.attachments && t.attachments.length) ? t.attachments.length : 0;
      const attachHtml = `
        <div style="margin-top:6px">
          ${attachCount > 0
            ? `<span style="display:inline-flex;align-items:center;gap:4px;background:#F0FDF4;color:#166534;border:1px solid #BBF7D0;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:600">
                 <i class="bi bi-paperclip" style="font-size:10px"></i> ${attachCount} ไฟล์แนบ
               </span>`
            : `<span style="display:inline-flex;align-items:center;gap:4px;background:#F8FAFC;color:var(--text-muted);border:1px solid var(--border);padding:3px 9px;border-radius:99px;font-size:11px;font-weight:600">
                 <i class="bi bi-paperclip" style="font-size:10px"></i> 0 ไฟล์แนบ
               </span>`}
        </div>`;

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
      card.draggable = true;
      card.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', t.id);
        setTimeout(() => card.style.opacity = '0.4', 0);
      });
      card.addEventListener('dragend', () => {
        card.style.opacity = '';
        document.querySelectorAll('.qcol-body').forEach(c => c.classList.remove('drag-over'));
      });
      card.innerHTML = `
        <div class="qcard-accent"></div>
        <div class="qcard-top">
          <span class="qcard-id">${t.id}</span>
          <span class="priority-badge ${t.pri}">${prioLabel[t.pri]}</span>
        </div>
        <div class="qcard-title">${escHtml(t.title)}</div>
        <div class="qcard-meta">
          <span class="qcard-meta-item"><i class="bi bi-calendar3" style="font-size:10px"></i>${t.reportDate}</span>
        </div>
        ${attachHtml}
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
          <div style="display:inline-flex;align-items:center;gap:5px;font-size:11px;background:${dlBg};color:${dlColor};padding:4px 8px;border-radius:6px;font-weight:600">
            <i class="bi ${dlIcon}" style="font-size:11px"></i>
            กำหนดส่ง: ${deadlineStr}
          </div>
        </div>
        <div class="qcard-footer">
          <div class="avatar-group" style="display:flex;align-items:center;gap:6px">
            ${avHtml}
            <span style="font-size:11px;color:var(--text-muted);font-weight:500">${escHtml(t.reporter || '—')}</span>
          </div>
          ${cdHtml}
        </div>
        ${quickHtml}`;
      col.appendChild(card);
    });
  });
  initDropZones();
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

  const secs        = getSecsLeft(t);
  const cdClass     = getCdClass(t, secs);
  const cdLabel     = getCdLabel(t, secs);
  const deadlineStr = t.deadlineDate
    ? t.deadlineDate.toLocaleString('th-TH',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'2-digit'})
    : '—';

  const slaRow = t.status !== 'done' ? `
    <div class="sla-row">
      <div>
        <div class="sla-label">กำหนดส่ง</div>
        <div style="font-size:12px;font-weight:500">${deadlineStr}</div>
      </div>
      <span class="cd-badge ${cdClass}">${cdLabel}</span>
    </div>` : `
    <div class="sla-row" style="background:var(--done-bg)">
      <div><div class="sla-label" style="color:#065F46">เสร็จสิ้น</div></div>
      <span class="cd-badge cd-done"><i class="bi bi-check-circle-fill"></i> เสร็จแล้ว</span>
    </div>`;

  const steps = generateStepsForPanel(t);
  let tlHtml = '';
  steps.forEach((step, i) => {
    const isLast    = i === steps.length - 1;
    const iconStyle = step.status === 'done'
      ? 'background:var(--done-bg);color:var(--done);border:2.5px solid var(--done)'
      : step.status === 'active'
      ? 'background:var(--inprogress-bg);color:var(--inprogress);border:2.5px solid var(--inprogress)'
      : 'background:#F8FAFC;color:#CBD5E1;border:2.5px solid var(--border)';
    const lineColor  = step.status === 'done' ? 'var(--done)' : 'var(--border)';
    const titleColor = step.status === 'wait' ? 'var(--text-muted)' : 'var(--text-main)';
    const pulse      = step.status === 'active' ? 'animation:tl-pulse 2s infinite' : '';

    const statusBadge = step.status === 'active'
      ? `<span style="font-size:10px;background:var(--inprogress-bg);color:var(--inprogress);padding:2px 8px;border-radius:99px;margin-left:6px;font-weight:600">กำลังดำเนินการ</span>`
      : '';

    const actorHtml = step.actor ? `
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
        <div style="width:26px;height:26px;border-radius:50%;flex-shrink:0;background:${step.actor.bg};color:${step.actor.tc};font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">${step.actor.initials}</div>
        <div>
          <div style="font-size:12px;font-weight:500">${escHtml(step.actor.name)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${step.actor.role}</div>
        </div>
      </div>` : '';

    const detailHtml = step.detail ? `
      <div style="background:var(--body-bg);border-radius:var(--radius-sm);padding:8px 12px;font-size:12px;color:var(--text-muted);margin-top:6px;line-height:1.6">
        <i class="bi bi-sticky" style="margin-right:4px;color:var(--pending)"></i>${escHtml(step.detail)}
      </div>` : '';

    tlHtml += `
      <div style="display:flex;gap:14px;padding-bottom:${isLast ? '0' : '28px'}">
        <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:40px">
          <div style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;${iconStyle};${pulse}">
            <i class="bi ${step.icon}" style="font-size:16px"></i>
          </div>
          ${!isLast ? `<div style="flex:1;width:2px;margin-top:4px;min-height:24px;background:${lineColor}"></div>` : ''}
        </div>
        <div style="flex:1;padding-top:8px">
          <div style="font-size:14px;font-weight:600;color:${titleColor}">${escHtml(step.title)}${statusBadge}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">${step.time || (step.status === 'wait' ? 'ยังไม่ถึงขั้นตอนนี้' : '')}</div>
          ${detailHtml}${actorHtml}
        </div>
      </div>`;
  });

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
      <div class="panel-section">
        <div class="panel-label"><i class="bi bi-paperclip"></i> รูปภาพ / เอกสารแนบ</div>
        ${t.attachments && t.attachments.length
          ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
              ${t.attachments.map((a, i) => {
                const ext = (a.name || '').split('.').pop().toUpperCase();
                const isPdf = a.isPdf || ext === 'PDF';
                const docExts = ['DOC','DOCX','XLS','XLSX','PPT','PPTX','TXT','CSV'];
                if (isPdf) {
                  return `<div onclick="openAttachFromManage('${t.id}',${i})" style="cursor:pointer;width:80px;text-align:center">
                    <div style="width:80px;height:80px;border-radius:8px;border:1px solid var(--border);background:#FEF2F2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
                      <i class="bi bi-file-earmark-pdf-fill" style="font-size:28px;color:#EF4444"></i>
                      <span style="font-size:9px;font-weight:700;color:#EF4444">${ext}</span>
                    </div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px" title="${a.name}">${a.name}</div>
                  </div>`;
                } else if (docExts.includes(ext)) {
                  return `<div onclick="openAttachFromManage('${t.id}',${i})" style="cursor:pointer;width:80px;text-align:center">
                    <div style="width:80px;height:80px;border-radius:8px;border:1px solid var(--border);background:#EFF6FF;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
                      <i class="bi bi-file-earmark-text-fill" style="font-size:28px;color:var(--primary)"></i>
                      <span style="font-size:9px;font-weight:700;color:var(--primary)">${ext}</span>
                    </div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px" title="${a.name}">${a.name}</div>
                  </div>`;
                } else {
                  return `<div onclick="openAttachFromManage('${t.id}',${i})" style="cursor:pointer;width:80px;text-align:center">
                    <div style="width:80px;height:80px;border-radius:8px;border:1px solid var(--border);overflow:hidden">
                      <img src="${a.url || a}" style="width:100%;height:100%;object-fit:cover">
                    </div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px" title="${a.name}">${a.name}</div>
                  </div>`;
                }
              }).join('')}
            </div>`
          : `<span style="font-size:13px;color:var(--text-muted)">—</span>`}
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

function initDropZones() {
  document.querySelectorAll('.qcol-body').forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', e => {
      if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
    });
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const taskId    = e.dataTransfer.getData('text/plain');
      const newStatus = col.id.replace('col-', '');
      const t = tasks.find(x => x.id === taskId);
      if (!t || t.status === newStatus) return;
      await changeStatus(taskId, newStatus);
    });
  });
}

function generateStepsForPanel(t) {
  const assigneeName = t.assignee || '—';
  const hasAssignee  = assigneeName && assigneeName !== '—';
  const isPending    = t.status === 'pending';
  const isInprogress = t.status === 'inprogress';
  const isDone       = t.status === 'done';

  return [
    {
      status: 'done',
      icon:   'bi-check-lg',
      title:  'แจ้งงานสำเร็จ',
      time:   t.reportDate,
      detail: '',
      actor:  { name: t.reporter||'—', role:'ผู้แจ้งงาน', initials:(t.reporter||'—').substring(0,2), bg:'#E0E7FF', tc:'#3730A3' }
    },
    {
      status: !hasAssignee ? 'wait' : (isPending ? 'active' : 'done'),
      icon:   'bi-person-check',
      title:  'รับเรื่องและมอบหมายงาน',
      time:   t.acceptedAt ? t.acceptedAt + ' น.' : '',
      detail: !hasAssignee ? 'รออนุมัติ' : 'มอบหมายให้: ' + assigneeName,
      actor:  hasAssignee ? { name:assigneeName, role:'ผู้รับผิดชอบ', initials:assigneeName.substring(0,2), bg:'#BBF7D0', tc:'#166534' } : null
    },
    {
      status: (!hasAssignee || isPending) ? 'wait' : (isInprogress ? 'active' : 'done'),
      icon:   'bi-tools',
      title:  'กำลังดำเนินการ',
      time:   t.acceptedAt ? t.acceptedAt + ' น.' : '',
      detail: (!hasAssignee || isPending) ? '' : (isInprogress ? 'ช่างกำลังดำเนินการแก้ไข' : 'ดำเนินการเสร็จสิ้น'),
      actor:  (hasAssignee && !isPending) ? { name:assigneeName, role:'ผู้รับผิดชอบ', initials:assigneeName.substring(0,2), bg:'#FDE68A', tc:'#92400E' } : null
    },
    {
      status: isDone ? 'done' : 'wait',
      icon:   'bi-clipboard-check',
      title:  'ปิดงานเรียบร้อย',
      time:   t.doneAt ? t.doneAt + ' น.' : '',
      detail: isDone ? 'งานเสร็จสมบูรณ์' : '',
      actor:  isDone ? { name:t.doneBy||assigneeName, role:'ผู้ปิดงาน', initials:(t.doneBy||assigneeName).substring(0,2), bg:'#BBF7D0', tc:'#166534' } : null
    }
  ];
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
//  NOTIFICATIONS (เหมือน timeline)
// ===================================================
let notifications = [];
let knownTaskIds  = new Set();
let isFirstLoad   = true;

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
    const nidNew = t.id + '-new';
    const nidSla = t.id + '-sla';

    // งานใหม่ pending
    if (t.status === 'pending' && !knownTaskIds.has(nidNew)) {
      if (!isFirstLoad) {
        newNotifs.push({
          id: nidNew, ticketId: t.id, read: false,
          icon: 'bi-plus-circle-fill', iconBg: '#FEF9C3', iconColor: '#854D0E',
          title: `งานใหม่: ${t.id}`,
          desc: t.title,
          time: t.reportDate,
        });
      }
      knownTaskIds.add(nidNew);
    }

    // เกิน SLA
    const secs = getSecsLeft(t);
    if (t.status !== 'done' && secs !== null && secs < 0 && !knownTaskIds.has(nidSla)) {
      if (!isFirstLoad) {
        newNotifs.push({
          id: nidSla, ticketId: t.id, read: false,
          icon: 'bi-exclamation-triangle-fill', iconBg: '#FEE2E2', iconColor: '#991B1B',
          title: `เกิน SLA: ${t.id}`,
          desc: t.title,
          time: t.reportDate,
        });
      }
      knownTaskIds.add(nidSla);
    }
  });

  isFirstLoad = false;
  newNotifs.forEach(n => {
    if (!notifications.find(x => x.id === n.id)) notifications.unshift(n);
  });

  // sync read state
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
  if (ticketId) openPanel(ticketId);
}

function markAllRead() {
  notifications.forEach(n => n.read = true);
  saveAllRead();
  renderNotiBadge();
  renderNotiList();
}

// ===================================================
//  POLL
// ===================================================
async function pollNewTickets() {
  try {
    const res = await fetch('/api/my-tasks');
    if (!res.ok) return;
    const raw = await res.json();

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
        reporter:    t.reporter_name || '—',
        assignee:    t.assignee || '—',
        deadlineDate: calcDeadline(t.created_at, t.priority),
      }));

    const freshIds   = fresh.map(x => x.id).sort().join(',');
    const currentIds = tasks.map(x => x.id).sort().join(',');
    if (freshIds !== currentIds) {
      await loadTickets();
    }
    buildNotifications();
  } catch { /* silent */ }
}

// ===================================================
//  INIT
// ===================================================
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closePanel();
    closeCancelModal();
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

function openAttachFromManage(taskId, idx) {
  const t = tasks.find(x => x.id === taskId);
  if (!t || !t.attachments || !t.attachments[idx]) return;
  const a   = t.attachments[idx];
  const url = a.url || a;
  const win = window.open();
  if (win) {
    win.document.write(`
      <!DOCTYPE html><html><head><title>${a.name || 'ไฟล์แนบ'}</title></head>
      <body style="margin:0;background:#1a1a2e;display:flex;align-items:center;justify-content:center;min-height:100vh">
        ${(a.isPdf || (a.name||'').toLowerCase().endsWith('.pdf'))
          ? `<iframe src="${url}" style="width:100vw;height:100vh;border:none"></iframe>`
          : `<img src="${url}" style="max-width:100vw;max-height:100vh;object-fit:contain">`}
      </body></html>`);
  }
}

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
setInterval(pollNewTickets, 30000);