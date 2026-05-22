/* ===== timeline.js ===== */

// ===== CONSTANTS =====
const statusLabel = { pending:'รอดำเนินการ', inprogress:'กำลังทำ', done:'เสร็จแล้ว' };
const prioLabel   = { high:'🔴 ด่วน', med:'🟡 ปานกลาง', low:'🟢 ปกติ' };
const prioClass   = { high:'prio-high', med:'prio-med', low:'prio-low' };

let tickets = [];
let currentFilter = 'all';
let currentSearch = '';
let currentTicket = null;
let currentUser   = { fullName: '—', initials: '??' };

// Lightbox state
let lbImages = [];
let lbIndex  = 0;

// ===== FORMAT DATE =====
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('th-TH', {
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit'
    });
  } catch(e) { return dateStr; }
}

function fmtDateOnly(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('th-TH', {
      day:'2-digit', month:'long', year:'numeric'
    });
  } catch(e) { return dateStr; }
}

function fmtTimeOnly(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleTimeString('th-TH', {
      hour:'2-digit', minute:'2-digit'
    });
  } catch(e) { return dateStr; }
}

// ===== GET INITIALS ===== 
function getInitials(name) {
  if (!name || name === '—') return '?';
  return name.substring(0, 2);
}

// ===== GENERATE STEPS =====
function generateSteps(t) {
  const assigneeName     = t.assignee || '—';
  const assigneeInitials = getInitials(assigneeName);
  const hasAssignee      = assigneeName && assigneeName !== '—';

  const isPending    = t.status === 'pending';
  const isInprogress = t.status === 'inprogress';
  const isDone       = t.status === 'done';

  return [
    {
      status: 'done',
      icon: 'bi-check-lg',
      title: 'แจ้งงานสำเร็จ',
      time: fmtDate(t.rawCreatedAt),
      actor: {
        name: t.reporter || 'ผู้ใช้งาน',
        role: 'ผู้แจ้งงาน',
        initials: getInitials(t.reporter),
        bg: '#E0E7FF', tc: '#3730A3'
      },
      photos: []
    },
    {
      status: !hasAssignee ? 'wait' : (isPending ? 'active' : 'done'),
      icon: 'bi-person-check',
      title: 'รับเรื่องและมอบหมายงาน',
      time: !hasAssignee ? '' : (isPending ? '' : fmtDate(t.rawUpdatedAt)),
      detail: !hasAssignee
        ? 'รออนุมัติ'
        : `มอบหมายให้: ${assigneeName}`,
      actor: hasAssignee ? {
        name: assigneeName, role: 'ผู้รับผิดชอบ',
        initials: assigneeInitials, bg: '#BBF7D0', tc: '#166534'
      } : null,
      photos: []
    },
    {
      status: (!hasAssignee || isPending) ? 'wait' : (isInprogress ? 'active' : 'done'),
      icon: 'bi-tools',
      title: 'กำลังดำเนินการ',
      time: (!hasAssignee || isPending) ? ''
          : (isInprogress || isDone) ? fmtDate(t.rawUpdatedAt) : '',
      detail: (!hasAssignee || isPending) ? ''
            : (isInprogress ? 'ช่างกำลังดำเนินการแก้ไข' : 'ดำเนินการเสร็จสิ้น'),
      actor: (hasAssignee && !isPending) ? {
        name: assigneeName, role: 'ผู้รับผิดชอบ',
        initials: assigneeInitials, bg: '#FDE68A', tc: '#92400E'
      } : null,
      photos: (hasAssignee && !isPending) ? ['placeholder','placeholder'] : []
    },
    {
      status: isDone ? 'done' : 'wait',
      icon: 'bi-clipboard-check',
      title: 'ปิดงานเรียบร้อย',
      time: isDone ? fmtDate(t.rawUpdatedAt) : '',
      detail: isDone ? 'งานเสร็จสมบูรณ์ สามารถประเมินความพึงพอใจได้' : '',
      actor: isDone ? {
        name: assigneeName, role: 'ผู้รับผิดชอบ',
        initials: assigneeInitials, bg: '#BBF7D0', tc: '#166534'
      } : null,
      photos: []
    }
  ];
}

// ===== FETCH TICKETS =====
async function fetchTickets(silent = false) {
  try {
    const res = await fetch('/api/tickets');
    const data = await res.json();

    tickets = data.map(t => {
      const assigneeName = t.assignee || '—';

      const ticket = {
        id: `TK-${t.id.toString().padStart(4, '0')}`,
        status: t.status,
        priority: t.priority || 'low',
        title: t.title,
        detail: t.detail || '',
        note: t.note || '',
        reporter: t.reporter_name || '—',
        reporterAv: {
          initials: (t.reporter_name || '—').substring(0, 2),
          bg: '#BFDBFE',
          tc: '#1E40AF'
        },
        assignee: assigneeName,
        assigneeAv: {
          initials: getInitials(assigneeName),
          bg: '#BBF7D0',
          tc: '#166534'
        },
        created: fmtDate(t.created_at),
        rawCreatedAt: t.created_at,
        rawUpdatedAt: t.updated_at,
        chatMessages: [],
        attachments: []
      };

      ticket.steps = generateSteps(ticket);
      return ticket;
    });

    updateCounts();
    calcQueue();
    renderList();

    if (silent) {
      if (currentTicket) {
        const updated = tickets.find(t => t.id === currentTicket.id);
        if (updated) {
          updated.attachments  = currentTicket.attachments;
          updated.chatMessages = currentTicket.chatMessages;
          currentTicket = updated;
          renderDetail();
        }
      }
    } else {
      if (tickets.length > 0) {
        currentTicket = tickets[0];
        renderDetail();
      }
    }
  } catch (e) {
    console.error('โหลดข้อมูลไม่สำเร็จ:', e);
    if (!silent) {
      document.getElementById('ticket-list').innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--rejected)">
          <i class="bi bi-exclamation-triangle" style="font-size:32px;display:block;margin-bottom:8px"></i>
          ไม่สามารถโหลดข้อมูลได้<br>
          <small style="color:var(--text-muted)">${e.message}</small>
        </div>`;
    }
  }
}

// ===== UPDATE COUNT BADGES =====
function updateCounts() {
  document.getElementById('cnt-all').textContent        = tickets.length;
  document.getElementById('cnt-pending').textContent    = tickets.filter(t => t.status === 'pending').length;
  document.getElementById('cnt-inprogress').textContent = tickets.filter(t => t.status === 'inprogress').length;
  document.getElementById('cnt-done').textContent       = tickets.filter(t => t.status === 'done').length;
}

// ===== CALC QUEUE ===== ← แก้ bug noAssignee ไม่ได้ declare
function calcQueue() {
  const assigneeMap = {};
  tickets
    .filter(t => t.status !== 'done' && t.assignee && t.assignee !== '—')
    .sort((a, b) => new Date(a.rawCreatedAt) - new Date(b.rawCreatedAt))
    .forEach(t => {
      if (!assigneeMap[t.assignee]) assigneeMap[t.assignee] = [];
      assigneeMap[t.assignee].push(t.id);
    });

  tickets.forEach(t => {
    const noAssignee = !t.assignee || t.assignee === '—'; // ← declare ตรงนี้
    if (t.status === 'done' || noAssignee) {
      t.queuePos   = null;
      t.queueTotal = null;
    } else {
      const q = assigneeMap[t.assignee] || [];
      t.queuePos   = q.indexOf(t.id) + 1;
      t.queueTotal = q.length;
    }
  });
}

// ===== RENDER LIST =====
function renderList() {
  const list = document.getElementById('ticket-list');
  let filtered = tickets.filter(t => {
    const matchStatus = currentFilter === 'all' || t.status === currentFilter;
    const q = currentSearch.toLowerCase();
    const matchSearch = !q || t.id.toLowerCase().includes(q)
      || t.title.toLowerCase().includes(q)
      || t.reporter.toLowerCase().includes(q)
      || t.assignee.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  document.getElementById('list-count').textContent = filtered.length;

  if (filtered.length === 0) {
    const isEmpty = tickets.length === 0;
    list.innerHTML = `
      <div style="text-align:center;padding:48px 24px;color:var(--text-muted)">
        <i class="bi bi-${isEmpty ? 'clipboard-plus' : 'inbox'}" style="font-size:40px;display:block;margin-bottom:12px;opacity:.4"></i>
        <div style="font-size:14px;font-weight:600;color:var(--text-main);margin-bottom:6px">
          ${isEmpty ? 'ยังไม่มีงานในระบบ' : 'ไม่พบรายการที่ตรงกัน'}
        </div>
        <div style="font-size:12px;margin-bottom:${isEmpty ? '20px' : '0'}">
          ${isEmpty ? 'เริ่มต้นแจ้งงานเพื่อให้เจ้าหน้าที่รับทราบและดำเนินการ' : 'ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ'}
        </div>
        ${isEmpty ? `<button class="btn-act btn-primary-act" style="margin:0 auto" onclick="window.location='/form'">
          <i class="bi bi-plus-lg"></i> แจ้งงานแรก
        </button>` : ''}
      </div>`;
    return;
  }

  list.innerHTML = '';
  filtered.forEach(t => {
    const sel = currentTicket && currentTicket.id === t.id ? 'selected' : '';

    const queueBadge = t.queuePos
      ? `<span style="
            display:inline-flex;align-items:center;gap:4px;
            background:#F3E8FF;color:#6B21A8;
            border:1px solid #D8B4FE;
            padding:2px 9px;border-radius:99px;font-size:10px;font-weight:700;
            margin-left:6px;white-space:nowrap">
            <i class="bi bi-list-ol" style="font-size:10px"></i>
            คิวที่ ${t.queuePos}
          </span>`
      : '';

    const attachBadge = t.attachments && t.attachments.length > 0
      ? `<span style="display:inline-flex;align-items:center;gap:3px;background:#F0FDF4;color:#166634;border:1px solid #BBF7D0;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:600;margin-left:4px">
           <i class="bi bi-paperclip" style="font-size:9px"></i>${t.attachments.length}
         </span>`
      : '';

    list.innerHTML += `
    <div class="ticket-card ${t.status} ${sel}" id="tc-${t.id}" onclick="selectTicket('${t.id}')">
      <div class="tc-top">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
            <span class="tc-id">${t.id}</span>
            ${queueBadge}${attachBadge}
          </div>
          <div class="tc-title" style="margin-top:6px">${t.title}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;margin-left:8px">
          <span class="badge-s ${t.status}">${statusLabel[t.status]}</span>
        </div>
      </div>
      <div class="tc-meta">
        <span><i class="bi bi-person-fill"></i>${t.assignee}</span>
        <span><i class="bi bi-calendar3"></i>${t.created}</span>
        <span class="${prioClass[t.priority]}" style="padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">${prioLabel[t.priority]}</span>
      </div>
    </div>`;
  });
}

// ===== SELECT TICKET =====
function selectTicket(id) {
  currentTicket = tickets.find(t => t.id === id);
  renderList();
  renderDetail();
  document.querySelectorAll('.dp-tab').forEach((tab, i) => {
    tab.classList.toggle('active', i === 0);
  });
  document.getElementById('tab-timeline').style.display = 'block';
  document.getElementById('tab-info').style.display     = 'none';
  document.getElementById('tab-chat').style.display     = 'none';
  document.getElementById('tab-rating').style.display   = 'none';
}

// ===== BUILD ATTACHMENT HTML =====
function buildAttachmentSection(t) {
  const attachments = t.attachments || [];
  const isDone = t.status === 'done';

  let gridHtml = '';
  if (attachments.length === 0) {
    gridHtml = isDone
      ? '' // งานเสร็จแล้ว ไม่มีไฟล์ → ไม่แสดงอะไรเลย
      : `<div class="attach-empty">
           <i class="bi bi-images"></i>
           ยังไม่มีไฟล์แนบ
           <div class="attach-empty-hint">กดปุ่ม "แก้ไข" เพื่อเพิ่มรูปภาพหรือเอกสารประกอบ</div>
         </div>`;
  } else {
    attachments.forEach((a, i) => {
      const ext = a.name.split('.').pop().toUpperCase();
      if (a.isPdf) {
        gridHtml += `
          <div class="attach-item" onclick="openAttach('${t.id}', ${i})">
            <div class="attach-pdf">
              <i class="bi bi-file-earmark-pdf-fill"></i>
              <span class="attach-pdf-ext">${ext}</span>
            </div>
            <div class="attach-overlay"><i class="bi bi-eye"></i><span>เปิดดู</span></div>
            <div class="attach-name" title="${a.name}">${a.name}</div>
          </div>`;
      } else {
        const docExts = ['doc','docx','xls','xlsx','ppt','pptx','txt','csv'];
        if (docExts.includes(ext.toLowerCase())) {
          gridHtml += `
            <div class="attach-item" onclick="openAttach('${t.id}', ${i})">
              <div class="attach-doc">
                <i class="bi bi-file-earmark-text-fill"></i>
                <span class="attach-doc-ext">${ext}</span>
              </div>
              <div class="attach-overlay"><i class="bi bi-download"></i><span>ดาวน์โหลด</span></div>
              <div class="attach-name" title="${a.name}">${a.name}</div>
            </div>`;
        } else {
          gridHtml += `
            <div class="attach-item" onclick="openAttach('${t.id}', ${i})">
              <img class="attach-img" src="${a.dataURL}" alt="${a.name}">
              <div class="attach-overlay"><i class="bi bi-zoom-in"></i><span>ขยาย</span></div>
              <div class="attach-name" title="${a.name}">${a.name}</div>
            </div>`;
        }
      }
    });
  }

  return `
    <div class="attach-section">
      <div class="attach-section-header">
        <div class="attach-section-title">
          <i class="bi bi-paperclip"></i> รูปภาพ / เอกสารแนบ
        </div>
        <span class="attach-count-badge">${attachments.length} ไฟล์</span>
        ${!isDone ? `
        <button class="attach-add-btn" onclick="openEditModal('${t.id}')">
          <i class="bi bi-plus-lg"></i> เพิ่มไฟล์
        </button>` : ''}
      </div>
      ${gridHtml 
        ? `<div class="attach-grid">${gridHtml}</div>` 
        : (isDone && attachments.length === 0 ? '' : `<div class="attach-grid">${gridHtml}</div>`)}
    </div>`;
}

// ===== RENDER DETAIL =====
function renderDetail() {
  const t = currentTicket;
  if (!t) return;

  const queueInfo = t.queuePos
    ? `<div style="
          margin-top:14px;padding:10px 16px;
          background:#F8FAFC;border:1px solid var(--border);
          border-radius:var(--radius-sm);
          display:flex;align-items:center;gap:10px">
        <div style="
          width:36px;height:36px;border-radius:50%;flex-shrink:0;
          background:var(--primary-light);color:var(--primary);
          font-size:15px;font-weight:800;
          display:flex;align-items:center;justify-content:center">
          ${t.queuePos}
        </div>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text-main)">คิวที่ ${t.queuePos}</div>
          <div style="font-size:11px;color:var(--text-muted)">ของ ${t.assignee}</div>
        </div>
      </div>`
    : '';

  document.getElementById('dp-header').innerHTML = `
    <div class="dp-header-top">
      <span class="dp-ticket-id">${t.id}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="badge-s ${t.status}">${statusLabel[t.status]}</span>
        ${t.status === 'done' 
        ? `<span style="font-size:12px;color:var(--done);font-weight:600;display:flex;align-items:center;gap:5px"> </span>`
        : `<button class="btn-act btn-ghost-act" style="padding:4px 12px;font-size:12px" onclick="openEditModal('${t.id}')"><i class="bi bi-pencil"></i> แก้ไข</button>
     <button class="btn-act btn-danger-act" style="padding:4px 12px;font-size:12px" onclick="confirmDelete('${t.id}')"><i class="bi bi-trash3"></i> ลบ</button>`
}
      </div>
    </div>
    <div class="dp-title">${t.title}</div>
    <div class="dp-sub">
      <span><i class="bi bi-person-fill"></i> ${t.assignee}</span>
      <span><i class="bi bi-calendar3"></i> ${t.created}</span>
      ${t.attachments && t.attachments.length > 0
        ? `<span style="color:var(--done)"><i class="bi bi-paperclip"></i> ${t.attachments.length} ไฟล์แนบ</span>`
        : ''}
    </div>
    ${queueInfo}`;

  // --- TIMELINE ---
  let tlHtml = '<div class="timeline">';
  t.steps.forEach((step, i) => {
    const isLast     = i === t.steps.length - 1;
    const lineClass  = step.status === 'done' ? 'done' : step.status === 'active' ? 'active' : '';
    const iconClass  = step.status === 'done' ? 'done' : step.status === 'active' ? 'active' : step.status === 'rejected' ? 'rejected' : 'wait';
    const titleColor = step.status === 'wait' ? 'var(--text-muted)' : 'var(--text-main)';

    let actorHtml = '';
    if (step.actor) {
      actorHtml = `
        <div class="tl-actor">
          <div class="tl-avatar" style="background:${step.actor.bg};color:${step.actor.tc}">${step.actor.initials}</div>
          <div>
            <div class="tl-actor-name">${step.actor.name}</div>
            <div class="tl-actor-role">${step.actor.role}</div>
          </div>
        </div>`;
    }

    let photoHtml = '';
    if (step.photos.length > 0) {
      photoHtml = '<div class="tl-photo">';
      step.photos.forEach(() => {
        photoHtml += `
          <div class="tl-img-placeholder" style="${step.status !== 'wait' ? 'background:#F1F5F9' : ''}">
            ${step.status !== 'wait'
              ? '<i class="bi bi-image" style="font-size:20px;color:#CBD5E1"></i><span>รูปภาพ</span>'
              : '<span>รอรูป</span>'}
          </div>`;
      });
      if (step.status === 'active') {
        photoHtml += `
          <div class="tl-img-placeholder" style="cursor:pointer;border-color:var(--primary);color:var(--primary)" onclick="alert('แนบรูปภาพ')">
            <i class="bi bi-camera" style="font-size:18px"></i>
            <span>เพิ่มรูป</span>
          </div>`;
      }
      photoHtml += '</div>';
    }

    const detailHtml = step.detail
      ? `<div class="tl-detail"><i class="bi bi-sticky" style="margin-right:5px;color:var(--pending)"></i><strong>หมายเหตุ:</strong> ${step.detail.replace(/^หมายเหตุ:\s*/, '')}</div>`
      : '';

    let statusBadge = '';
    if (step.status === 'active') {
      statusBadge = `<span style="font-size:10px;background:var(--inprogress-bg);color:var(--inprogress);padding:2px 8px;border-radius:99px;margin-left:6px;font-weight:600">กำลังดำเนินการ</span>`;
    } else if (step.status === 'rejected') {
      statusBadge = `<span style="font-size:10px;background:var(--rejected-bg);color:var(--rejected);padding:2px 8px;border-radius:99px;margin-left:6px;font-weight:600">ถูกปฏิเสธ</span>`;
    }

    tlHtml += `
    <div class="tl-step">
      <div class="tl-left">
        <div class="tl-icon ${iconClass}">
          <i class="bi ${step.icon}" style="font-size:16px"></i>
        </div>
        ${!isLast ? `<div class="tl-line ${lineClass}"></div>` : ''}
      </div>
      <div class="tl-content">
        <div class="tl-title" style="color:${titleColor}">
          ${step.title}${statusBadge}
        </div>
        <div class="tl-time">${step.time || (step.status === 'wait' ? 'ยังไม่ถึงขั้นตอนนี้' : '')}</div>
        ${detailHtml}${actorHtml}${photoHtml}
      </div>
    </div>`;
  });
  tlHtml += '</div>';
  document.getElementById('tab-timeline').innerHTML = tlHtml;

  // --- INFO TAB ---
  document.getElementById('tab-info').innerHTML = `
  <table class="info-table">
    <tr><td class="it-label">หมายเลข Ticket</td><td class="it-val" style="font-family:monospace;color:var(--primary)">${t.id}</td></tr>
    <tr><td class="it-label">หัวข้อ</td><td class="it-val">${t.title}</td></tr>
    <tr><td class="it-label">รายละเอียด</td><td class="it-val">${t.detail || '—'}</td></tr>
    <tr><td class="it-label">ผู้แจ้งงาน</td><td class="it-val">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:24px;height:24px;border-radius:50%;background:${t.reporterAv.bg};color:${t.reporterAv.tc};font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">${t.reporterAv.initials}</div>
        ${t.reporter}
      </div>
    </td></tr>
    <tr><td class="it-label">ผู้รับผิดชอบ</td><td class="it-val">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:24px;height:24px;border-radius:50%;background:${t.assigneeAv.bg};color:${t.assigneeAv.tc};font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">${t.assigneeAv.initials}</div>
        ${t.assignee}
      </div>
    </td></tr>
    <tr><td class="it-label">ความเร่งด่วน</td><td class="it-val"><span class="${prioClass[t.priority]} prio-badge">${prioLabel[t.priority]}</span></td></tr>
    <tr><td class="it-label">วันที่แจ้ง</td><td class="it-val">${t.created}</td></tr>
    <tr><td class="it-label">อัปเดตล่าสุด</td><td class="it-val">${fmtDate(t.rawUpdatedAt)}</td></tr>
    <tr><td class="it-label">กำหนดส่ง</td><td class="it-val">${t.created}</td></tr>
    <tr><td class="it-label">สถานะ</td><td class="it-val"><span class="badge-s ${t.status}">${statusLabel[t.status]}</span></td></tr>
  </table>
  ${buildAttachmentSection(t)}`;

  // --- CHAT TAB ---
  let chatHtml = '<div class="chat-wrap">';
  if (t.chatMessages.length === 0) {
    chatHtml += `<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:13px">
      <i class="bi bi-chat-dots" style="font-size:28px;display:block;margin-bottom:8px;opacity:.4"></i>
      ยังไม่มีข้อความ
    </div>`;
  }
  t.chatMessages.forEach(m => {
    const isSelf = m.from === 'user';
    chatHtml += `
    <div class="chat-bubble ${isSelf ? 'self' : ''}">
      <div class="chat-av" style="background:${m.av.bg};color:${m.av.tc}">${m.av.initials}</div>
      <div class="chat-body">
        <div class="chat-name">${m.name}</div>
        <div class="chat-text">${m.text}</div>
        <div class="chat-time">${m.time}</div>
      </div>
    </div>`;
  });
  chatHtml += `</div>
  <div class="chat-input-wrap">
    <button class="chat-img-btn" title="แนบรูป"><i class="bi bi-image"></i></button>
    <input type="text" class="chat-input" placeholder="พิมพ์ข้อความ..." id="chat-inp-${t.id}" onkeydown="if(event.key==='Enter')sendChat('${t.id}')">
    <button class="chat-send" onclick="sendChat('${t.id}')"><i class="bi bi-send-fill" style="font-size:14px"></i></button>
  </div>`;
  document.getElementById('tab-chat').innerHTML = chatHtml;

  // --- RATING TAB ---
  const isDone = t.status === 'done';
  document.getElementById('tab-rating').innerHTML = isDone ? `
    <div style="text-align:center;padding:8px 0 20px">
      <div style="font-size:40px;margin-bottom:12px">⭐</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:6px">ประเมินการบริการ</div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:20px">งาน ${t.id} โดย ${t.assignee}</div>
      <div class="star-row" style="justify-content:center;margin-bottom:20px" id="stars">
        <span class="star" onclick="rateStar(1)">★</span>
        <span class="star" onclick="rateStar(2)">★</span>
        <span class="star" onclick="rateStar(3)">★</span>
        <span class="star" onclick="rateStar(4)">★</span>
        <span class="star" onclick="rateStar(5)">★</span>
      </div>
      <div id="star-label" style="font-size:13px;color:var(--text-muted);margin-bottom:16px">คลิกให้คะแนน</div>
      <textarea style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:inherit;resize:none;outline:none;margin-bottom:14px" rows="3" placeholder="แสดงความคิดเห็นเพิ่มเติม (ถ้ามี)"></textarea>
      <button class="btn-act btn-primary-act" style="width:100%;justify-content:center" onclick="submitRating()"><i class="bi bi-check-lg"></i> ส่งการประเมิน</button>
    </div>
  ` : `<div style="text-align:center;padding:40px 0;color:var(--text-muted)">
    <i class="bi bi-lock" style="font-size:40px;display:block;margin-bottom:12px"></i>
    <div style="font-size:14px;font-weight:500">ประเมินได้เมื่องานเสร็จสิ้น</div>
    <div style="font-size:12px;margin-top:6px">สถานะปัจจุบัน: <strong>${statusLabel[t.status]}</strong></div>
  </div>`;
}

// ===== TABS =====
function switchTab(name, el) {
  document.querySelectorAll('.dp-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  ['timeline','info','chat','rating'].forEach(n => {
    document.getElementById('tab-' + n).style.display = n === name ? 'block' : 'none';
  });
}

// ===== FILTER =====
function filterStatus(status, el) {
  currentFilter = status;
  document.querySelectorAll('.fc').forEach(f => f.classList.remove('active'));
  el.classList.add('active');
  renderList();
}
function filterTickets(q) {
  currentSearch = q;
  renderList();
}
function sortTickets(by) {
  if (by === 'priority') {
    const ord = { high:0, med:1, low:2 };
    tickets.sort((a,b) => ord[a.priority] - ord[b.priority]);
  } else if (by === 'status') {
    const ord = { inprogress:0, pending:1, done:2 };
    tickets.sort((a,b) => ord[a.status] - ord[b.status]);
  } else {
    tickets.sort((a,b) => new Date(b.rawCreatedAt) - new Date(a.rawCreatedAt));
  }
  renderList();
}

// ===== LOAD USER =====
async function loadUser() {
  try {
    const res = await fetch('/api/me');
    if (res.status === 401) { window.location.href = '/login'; return; }
    const data = await res.json();

    currentUser.fullName = data.fullName;
    currentUser.initials = data.fullName.substring(0, 2);

    document.getElementById('user-fullname').textContent = data.fullName;
    document.getElementById('user-role').textContent     = data.role;
    document.getElementById('user-avatar').textContent   = data.fullName.substring(0, 2);

    await fetchTickets();
  } catch(e) { console.error(e); }
}

// ===== CHAT =====
function sendChat(id) {
  const inp  = document.getElementById('chat-inp-' + id);
  const text = inp.value.trim();
  if (!text) return;
  const t = tickets.find(x => x.id === id);
  t.chatMessages.push({
    from: 'user',
    name: 'คุณ',
    av: { bg:'#BFDBFE', tc:'#1E40AF', initials:'คณ' },
    text,
    time: 'เมื่อกี้'
  });
  inp.value = '';
  renderDetail();
  switchTab('chat', null);
  document.querySelectorAll('.dp-tab').forEach((tab, i) => tab.classList.toggle('active', i === 2));
  setTimeout(() => {
    const w = document.getElementById('tab-chat');
    w.scrollTop = w.scrollHeight;
  }, 50);
}

// ===== RATING =====
const starLabels = ['','แย่มาก','พอใช้','ดี','ดีมาก','ดีเยี่ยม 🎉'];
function rateStar(n) {
  document.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('lit', i < n));
  document.getElementById('star-label').textContent = starLabels[n];
  document.getElementById('star-label').style.color = n >= 4 ? 'var(--done)' : 'var(--pending)';
}
function submitRating() {
  const starsLit = document.querySelectorAll('.star.lit').length;
  if (!starsLit) { alert('กรุณาให้คะแนนก่อน'); return; }
  document.getElementById('tab-rating').innerHTML = `
    <div style="text-align:center;padding:40px 0">
      <div style="font-size:48px;margin-bottom:12px">🎉</div>
      <div style="font-size:16px;font-weight:700;color:var(--done)">ขอบคุณสำหรับการประเมิน!</div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:8px">คะแนน ${starsLit}/5 ดาว · ${starLabels[starsLit]}</div>
    </div>`;
}

// ===== ATTACHMENTS / LIGHTBOX =====
function openAttach(ticketId, idx) {
  const t = tickets.find(x => x.id === ticketId);
  if (!t || !t.attachments[idx]) return;
  const a = t.attachments[idx];

  if (a.isPdf) {
    if (a.dataURL) {
      const win = window.open();
      if (win) {
        win.document.write(`
          <!DOCTYPE html><html><head><title>${a.name}</title></head>
          <body style="margin:0;background:#1a1a2e">
            <iframe src="${a.dataURL}" style="width:100vw;height:100vh;border:none"></iframe>
          </body></html>`);
      }
    }
    return;
  }

  lbImages = t.attachments
    .map((att, i) => ({ ...att, originalIdx: i }))
    .filter(att => !att.isPdf && att.dataURL);
  lbIndex = lbImages.findIndex(att => att.originalIdx === idx);
  if (lbIndex < 0) lbIndex = 0;
  showLightboxAt(lbIndex);
}

function showLightboxAt(i) {
  if (lbImages.length === 0) return;
  lbIndex = (i + lbImages.length) % lbImages.length;
  const a = lbImages[lbIndex];
  document.getElementById('lightbox-img').src = a.dataURL;
  document.getElementById('lightbox-caption').textContent = a.name;
  document.getElementById('lightbox-counter').textContent = `${lbIndex + 1} / ${lbImages.length}`;
  document.getElementById('lightbox').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function navigateLightbox(dir) { showLightboxAt(lbIndex + dir); }

function closeLightbox(e) {
  if (e.target === document.getElementById('lightbox')) {
    document.getElementById('lightbox').classList.remove('show');
    document.body.style.overflow = '';
  }
}

document.addEventListener('keydown', e => {
  const lb = document.getElementById('lightbox');
  if (!lb.classList.contains('show')) return;
  if (e.key === 'Escape')      { lb.classList.remove('show'); document.body.style.overflow = ''; }
  if (e.key === 'ArrowRight')  navigateLightbox(1);
  if (e.key === 'ArrowLeft')   navigateLightbox(-1);
});

// ===== DELETE =====
function confirmDelete(id) {
  const t = tickets.find(x => x.id === id);
  if (!t) return;
  document.getElementById('delete-ticket-id').textContent    = t.id;
  document.getElementById('delete-ticket-title').textContent = t.title;
  document.getElementById('delete-modal').dataset.ticketId   = id;
  document.getElementById('delete-modal').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeDeleteModal(e) {
  if (e && e.target !== document.getElementById('delete-modal')) return;
  document.getElementById('delete-modal').classList.remove('show');
  document.body.style.overflow = '';
}

async function submitDelete() {
  const id    = document.getElementById('delete-modal').dataset.ticketId;
  const rawId = id.replace('TK-', '').replace(/^0+/, '');

  try {
    const res = await fetch(`/api/tickets/${rawId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('ลบไม่สำเร็จ');

    tickets = tickets.filter(t => t.id !== id);

    if (currentTicket?.id === id) {
      currentTicket = tickets.length > 0 ? tickets[0] : null;
      if (currentTicket) renderDetail();
      else {
        document.getElementById('dp-header').innerHTML = `
          <div style="text-align:center;padding:20px;color:var(--text-muted)">
            <i class="bi bi-card-list" style="font-size:32px;display:block;margin-bottom:8px"></i>
            เลือก Ticket เพื่อดูรายละเอียด
          </div>`;
        ['timeline','info','chat','rating'].forEach(n => {
          document.getElementById('tab-' + n).innerHTML = '';
        });
      }
    }

    updateCounts();
    calcQueue();
    renderList();

    document.getElementById('delete-modal').classList.remove('show');
    document.body.style.overflow = '';
    showToast('ลบ Ticket เรียบร้อยแล้ว');
  } catch(err) {
    alert('เกิดข้อผิดพลาด: ' + err.message);
  }
}

// ===== EDIT MODAL =====
let editFiles = [];

function openEditModal(id) {
  const t = tickets.find(x => x.id === id);
  if (!t) return;
  // ถ้างานเสร็จแล้ว ห้ามแก้ไข
  if (t.status === 'done') {
    return;
  }
  document.getElementById('modal-ticket-id').textContent = t.id;
  document.getElementById('edit-title').value    = t.title;
  document.getElementById('edit-detail').value   = t.detail;
  document.getElementById('edit-note').value     = t.note;
  document.getElementById('edit-priority').value = t.priority;
  document.getElementById('edit-assignee').value = t.assignee === '—' ? '' : t.assignee;

  editFiles = [];
  document.getElementById('upload-preview').innerHTML = '';
  document.getElementById('file-chips').innerHTML     = '';
  document.getElementById('edit-file-input').value   = '';

  document.getElementById('edit-modal').dataset.ticketId = id;
  document.getElementById('edit-modal').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeEditModal(e) {
  if (e && e.target !== document.getElementById('edit-modal')) return;
  document.getElementById('edit-modal').classList.remove('show');
  document.body.style.overflow = '';
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  files.forEach(file => {
    if (file.size > 10 * 1024 * 1024) {
      alert(`ไฟล์ "${file.name}" ใหญ่เกิน 10MB`);
      return;
    }
    const isImg = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    const fileObj = { name: file.name, type: file.type, isPdf, dataURL: null };
    editFiles.push(fileObj);
    const idx = editFiles.length - 1;

    if (isImg) {
      const reader = new FileReader();
      reader.onload = ev => {
        editFiles[idx].dataURL = ev.target.result;
        const preview = document.getElementById('upload-preview');
        preview.innerHTML += `
          <div class="upload-thumb-wrap" id="thumb-${idx}">
            <img src="${ev.target.result}" class="upload-thumb">
            <button class="upload-thumb-del" onclick="removeFile(${idx})">✕</button>
          </div>`;
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = ev => { editFiles[idx].dataURL = ev.target.result; };
      reader.readAsDataURL(file);
      const chips = document.getElementById('file-chips');
      chips.innerHTML += `
        <div class="file-chip" id="chip-${idx}">
          <i class="bi bi-file-earmark-${isPdf ? 'pdf' : 'text'}" style="color:${isPdf ? 'var(--rejected)' : 'var(--primary)'}"></i>
          <span style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${file.name}</span>
          <button class="file-chip-del" onclick="removeFile(${idx})">✕</button>
        </div>`;
    }
  });
}

function removeFile(idx) {
  editFiles[idx] = null;
  document.getElementById('thumb-' + idx)?.remove();
  document.getElementById('chip-'  + idx)?.remove();
}

async function submitEdit() {
  const id    = document.getElementById('edit-modal').dataset.ticketId;
  const title = document.getElementById('edit-title').value.trim();
  if (!title) {
    document.getElementById('edit-title').focus();
    document.getElementById('edit-title').style.borderColor = 'var(--rejected)';
    return;
  }
  document.getElementById('edit-title').style.borderColor = '';

  const payload = {
    title,
    detail:   document.getElementById('edit-detail').value.trim(),
    note:     document.getElementById('edit-note').value.trim(),
    priority: document.getElementById('edit-priority').value,
    assignee: document.getElementById('edit-assignee').value.trim() || '—',
  };

  try {
    const rawId = id.replace('TK-', '').replace(/^0+/, '');
    const res = await fetch(`/api/tickets/${rawId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('บันทึกไม่สำเร็จ');

    const t = tickets.find(x => x.id === id);
    const newAttachments = editFiles
      .filter(f => f !== null)
      .map(f => ({ name: f.name, type: f.type, dataURL: f.dataURL, isPdf: f.isPdf }));

    Object.assign(t, payload);
    t.attachments = [...(t.attachments || []), ...newAttachments];
    t.steps = generateSteps(t);

    calcQueue();
    renderList();
    if (currentTicket?.id === id) renderDetail();

    closeEditModal(null);
    showToast(`บันทึกเรียบร้อย${newAttachments.length > 0 ? ` · เพิ่มไฟล์ ${newAttachments.length} รายการ` : ''}`);
  } catch(err) {
    alert('เกิดข้อผิดพลาด: ' + err.message);
  }
}

// ===== TOAST =====
function showToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:#0F172A;color:#fff;padding:10px 20px;border-radius:99px;
    font-size:13px;font-weight:500;z-index:999;
    display:flex;align-items:center;gap:8px;
    box-shadow:0 4px 20px rgba(0,0,0,.2);
    animation:fadeInUp .2s ease;`;
  toast.innerHTML = `<i class="bi bi-check-circle-fill" style="color:#10B981"></i> ${msg}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

// ===== MISC =====
function setNav(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
}

// ===== INIT =====
let refreshTimer = null;

async function autoRefresh() {
  await fetchTickets(true);
  refreshTimer = setTimeout(autoRefresh, 45000);
}

document.addEventListener('DOMContentLoaded', () => {
  loadUser();
  autoRefresh();
});

window.addEventListener('beforeunload', () => {
  clearTimeout(refreshTimer);
});