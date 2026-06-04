/* ===== board.js (refactored) ===== */

const statusLabel = { pending:'รอดำเนินการ', inprogress:'กำลังทำ', done:'เสร็จแล้ว', rejected:'ถูกตีกลับ' };
const prioLabel   = { high:'ด่วนมาก', med:'ปานกลาง', low:'ปกติ' };
const avColors    = ['av-blue','av-green','av-amber','av-pink','av-teal'];

// ── ข้อมูล chart (คงไว้ hardcode เพราะต้องการ endpoint แยก) ──────────
const cats = [
  { name:'IT / คอมพิวเตอร์', val:58, color:'#2563EB' },
  { name:'ไฟฟ้า / อาคาร',    val:49, color:'#F59E0B' },
  { name:'เครือข่าย',        val:37, color:'#10B981' },
  { name:'ระบบน้ำ',          val:27, color:'#EF4444' },
  { name:'อื่นๆ',            val:18, color:'#8B5CF6' },
];

const barData = [
  { day:'จ',  new:12, done:9  },
  { day:'อ',  new:8,  done:11 },
  { day:'พ',  new:15, done:7  },
  { day:'พฤ', new:10, done:13 },
  { day:'ศ',  new:18, done:8  },
  { day:'ส',  new:5,  done:10 },
  { day:'อา', new:3,  done:6  },
];

// ── STAT CARDS (ดึงจาก API จริง) ─────────────────────────────────────
async function loadStats() {
  try {
    const res  = await fetch('/api/tickets');
    if (!res.ok) return;
    const data = await res.json();

    const counts = { pending:0, inprogress:0, done:0, rejected:0 };
    data.forEach(t => {
      if (counts[t.status] !== undefined) counts[t.status]++;
    });

    document.getElementById('num-pending').textContent    = counts.pending;
    document.getElementById('num-inprogress').textContent = counts.inprogress;
    document.getElementById('num-done').textContent       = counts.done;
    document.getElementById('num-rejected').textContent   = counts.rejected;

    renderTaskTable(data);
    renderTimeline(data);
    renderQueueList(data);
    Noti.build(data);
  } catch (e) {
    console.error('loadStats error:', e);
  }
}

// ── TASK TABLE ────────────────────────────────────────────────────────
function renderTaskTable(tickets) {
  const tbody = document.getElementById('task-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // แสดง 7 รายการล่าสุด
  tickets.slice(0, 7).forEach(t => {
    const ticketNo  = 'TK-' + String(t.id).padStart(4, '0');
    const assignee  = t.assignee || '—';
    const initials  = assignee !== '—' ? assignee.substring(0, 2) : '—';
    const avHtml    = `<div class="avatar-sm ${avColors[0]}">${initials}</div>`;
    const dateStr   = t.created_at
      ? new Date(t.created_at).toLocaleDateString('th-TH', { day:'2-digit', month:'2-digit', year:'2-digit' })
      : '—';

    tbody.innerHTML += `<tr>
      <td><span class="ticket-id">${ticketNo}</span></td>
      <td>
        <div class="task-title">${escHtml(t.title)}</div>
        <div class="task-sub">${escHtml(t.detail || '')}</div>
      </td>
      <td><span class="badge-status ${t.status}">${statusLabel[t.status] || t.status}</span></td>
      <td><span class="priority-badge ${t.priority}">${prioLabel[t.priority] || t.priority}</span></td>
      <td><div class="avatar-group">${avHtml}</div></td>
      <td style="color:var(--text-muted);font-size:12px">${dateStr}</td>
    </tr>`;
  });
}

// ── TIMELINE (ติดตาม ticket ล่าสุดที่ยังไม่เสร็จ) ──────────────────
function renderTimeline(tickets) {
  const tlWrap = document.getElementById('tl-ticket-id');
  const tlBody = document.getElementById('tl-body');
  if (!tlWrap || !tlBody) return;

  // หา ticket ล่าสุดที่ยัง inprogress หรือ pending
  const active = tickets.find(t => t.status === 'inprogress')
              || tickets.find(t => t.status === 'pending')
              || tickets[0];

  if (!active) { tlBody.innerHTML = '<div style="font-size:13px;color:var(--text-muted)">ไม่มีงานที่กำลังดำเนินการ</div>'; return; }

  const ticketNo = 'TK-' + String(active.id).padStart(4, '0');
  tlWrap.textContent = ticketNo;

  const steps = [
    {
      done: true, active: false,
      icon: 'bi-check-lg',
      title: 'แจ้งงานสำเร็จ',
      sub: active.created_at
        ? new Date(active.created_at).toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' }) + ' น.'
        : '—',
    },
    {
      done: active.status !== 'pending',
      active: false,
      icon: 'bi-check-lg',
      title: 'หัวหน้ารับเรื่องแล้ว',
      sub: active.assignee ? `ผู้รับผิดชอบ: ${active.assignee}` : 'รอมอบหมาย',
    },
    {
      done: false,
      active: active.status === 'inprogress',
      icon: 'bi-arrow-repeat',
      title: 'กำลังดำเนินการ',
      sub: active.status === 'inprogress' ? (active.assignee || '') + ' กำลังดำเนินการ...' : 'รอดำเนินการ',
    },
    {
      done: active.status === 'done',
      active: false,
      icon: 'bi-circle',
      title: 'เสร็จสิ้น',
      sub: active.status === 'done' ? 'เสร็จสิ้นแล้ว' : 'รอดำเนินการ',
    },
  ];

  tlBody.innerHTML = steps.map(s => `
    <div class="tl-item">
      <div class="tl-dot ${s.done ? 'done' : s.active ? 'active' : 'wait'}">
        <i class="bi ${s.icon}" style="font-size:11px"></i>
      </div>
      <div class="tl-text">
        <h6>${s.title}</h6>
        <small>${s.sub}</small>
      </div>
    </div>`).join('');
}

// ── QUEUE LIST (งานรอดำเนินการ) ───────────────────────────────────────
function renderQueueList(tickets) {
  const qWrap = document.getElementById('queue-list');
  if (!qWrap) return;

  const priEmoji = { high:'🔴', med:'🟡', low:'🟢' };
  const priText  = { high:'ด่วนมาก', med:'ปานกลาง', low:'ปกติ' };

  const pending = tickets
    .filter(t => t.status === 'pending')
    .slice(0, 4);

  if (pending.length === 0) {
    qWrap.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:8px 0">ไม่มีงานรอดำเนินการ</div>';
    return;
  }

  qWrap.innerHTML = pending.map((t, i) => {
    const timeStr = t.created_at
      ? new Date(t.created_at).toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' }) + ' น.'
      : '—';
    return `
      <div class="queue-item">
        <div class="queue-num">${i + 1}</div>
        <div>
          <div class="queue-title">${escHtml(t.title)}</div>
          <div class="queue-meta">
            <i class="bi bi-geo-alt-fill" style="font-size:10px"></i>
            ${escHtml(t.detail || '—')} ·
            ${priEmoji[t.priority] || '⚪'} ${priText[t.priority] || ''} · ${timeStr}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── STAFF TABLE ───────────────────────────────────────────────────────
async function loadStaffTable() {
  try {
    const res  = await fetch('/api/staff');
    if (!res.ok) return;
    const data = await res.json();

    const stbody = document.getElementById('staff-tbody');
    if (!stbody) return;
    stbody.innerHTML = '';

    data.slice(0, 5).forEach((s, i) => {
      const done  = Number(s.done_tasks || 0);
      const total = Number(s.active_tasks || 0) + done;
      const rate  = total > 0 ? Math.round(done / total * 100) : 0;
      const rateColor = rate >= 90 ? 'var(--done)' : rate >= 75 ? 'var(--pending)' : 'var(--rejected)';
      const initials  = s.staff_name ? s.staff_name.substring(0, 2) : '??';

      stbody.innerHTML += `<tr>
        <td style="padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="avatar-sm ${avColors[i % avColors.length]}" style="font-size:11px">${initials}</div>
            <span style="font-weight:500">${escHtml(s.staff_name)}</span>
          </div>
        </td>
        <td style="text-align:center;padding:8px 0;border-bottom:1px solid var(--border);color:var(--text-muted)">${total}</td>
        <td style="text-align:center;padding:8px 0;border-bottom:1px solid var(--border);font-weight:600;color:var(--done)">${done}</td>
        <td style="text-align:right;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="font-weight:700;color:${rateColor}">${rate}%</span>
        </td>
      </tr>`;
    });
  } catch (e) {
    console.error('loadStaffTable error:', e);
  }
}

// ── BAR CHART ────────────────────────────────────────────────────────
function renderBarChart() {
  const barWrap = document.getElementById('bar-chart');
  if (!barWrap) return;
  const maxVal = Math.max(...barData.map(d => Math.max(d.new, d.done)));
  barData.forEach(d => {
    barWrap.innerHTML += `
      <div class="bar-col">
        <div style="display:flex;gap:2px;align-items:flex-end;height:70px">
          <div class="bar" style="height:${Math.max(4, d.new / maxVal * 70)}px;background:#BFDBFE;width:12px" title="เข้าใหม่ ${d.new}"></div>
          <div class="bar" style="height:${Math.max(4, d.done / maxVal * 70)}px;background:#2563EB;width:12px" title="เสร็จ ${d.done}"></div>
        </div>
        <div class="bar-label">${d.day}</div>
      </div>`;
  });
}

// ── DONUT CHART ──────────────────────────────────────────────────────
function renderDonut() {
  const total  = cats.reduce((s, c) => s + c.val, 0);
  const cx = 55, cy = 55, r = 38, stroke = 14;
  const circ   = 2 * Math.PI * r;
  let offset   = 0;
  const gEl    = document.getElementById('donut-g');
  const legEl  = document.getElementById('donut-legend');
  if (!gEl || !legEl) return;

  cats.forEach(cat => {
    const pct  = cat.val / total;
    const dash = pct * circ;
    const el   = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    el.setAttribute('cx', cx); el.setAttribute('cy', cy); el.setAttribute('r', r);
    el.setAttribute('fill', 'none'); el.setAttribute('stroke', cat.color);
    el.setAttribute('stroke-width', stroke);
    el.setAttribute('stroke-dasharray', `${dash} ${circ - dash}`);
    el.setAttribute('stroke-dashoffset', -offset * circ + circ * 0.25);
    el.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
    gEl.appendChild(el);
    offset += pct;

    legEl.innerHTML += `
      <div class="legend-item">
        <span class="legend-dot" style="background:${cat.color}"></span>
        <span class="legend-name" style="font-size:12px;color:var(--text-muted)">${cat.name}</span>
        <span class="legend-val" style="font-size:12px">${cat.val}</span>
        <span class="legend-pct">${Math.round(pct * 100)}%</span>
      </div>`;
  });
}

// ── UI HELPERS ────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function switchTab(el) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

// ── LOAD USER + INIT ──────────────────────────────────────────────────
async function loadUser() {
  try {
    const res  = await fetch('/api/me');
    if (res.status === 401) { window.location.href = '/login'; return; }
    const data = await res.json();
    document.getElementById('user-fullname').textContent = data.fullName;
    document.getElementById('user-role').textContent     = data.role;
    document.getElementById('user-avatar').textContent   = data.fullName.substring(0, 2);

    // โหลดข้อมูลทั้งหมดหลัง user พร้อม
    await loadStats();
    loadStaffTable();
  } catch (e) {
    console.error(e);
  }
}

Noti.init();
renderBarChart();
renderDonut();
loadUser();