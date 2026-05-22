/* ===== history.js ===== */

// ===================== NAV =====================
function navigate(path) {
  window.location.href = path;
}

// ===================== DATA & STATE =====================
let allTasks = [];
let filtered = [];
let currentPage = 1;
let activeStatus = '';
const ROWS_PER_PAGE = 10;

const statusLabel  = { pending:'รอดำเนินการ', inprogress:'กำลังทำ', done:'เสร็จแล้ว', rejected:'ถูกตีกลับ' };
const prioLabel    = { high:'ด่วนมาก', med:'ปานกลาง', low:'ปกติ' };
const avColors     = ['av-blue','av-green','av-amber','av-pink','av-teal'];

// ---- FETCH DATA FROM API ----
async function fetchHistory() {
  try {
    const res = await fetch('/api/tickets');
    const data = await res.json();
    
    // Mapping ข้อมูลจาก DB (MySQL) ให้เข้ากับโครงสร้างที่ UI ต้องการ
    allTasks = data.map(t => ({
      id: `TK-${String(t.id).padStart(4, '0')}`,
      dateOpen: t.created_at ? new Date(t.created_at).toLocaleDateString('th-TH') : '—',
      timeOpen: t.created_at ? new Date(t.created_at).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}) + ' น.' : '',
      dateClose: t.status === 'done' ? 'เสร็จสิ้น' : '—',
      title: t.title,
      detail: t.detail,
      status: t.status,
      pri: t.priority,
      reporter: t.reporter_name || '—',
      assignees: [t.assignee ? t.assignee.substring(0, 2) : '??'],
      assigneeFull: t.assignee || 'ยังไม่ได้มอบหมาย',
      note: t.note || '—',
      adminNote: t.note || '—',
      // สร้าง Timeline จำลองจากข้อมูลจริง
      timeline: generateTimeline(t)
    }));

    applyFilters();
  } catch (e) {
    console.error("Fetch Error:", e);
    showToast('ไม่สามารถโหลดข้อมูลได้', 'bi-exclamation-triangle', '#EF4444');
  }
}

// ---- 
function generateTimeline(t) {
  const timeStr = t.created_at ? new Date(t.created_at).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}) : '';
  return [
    { state: 'done', label: 'แจ้งงานสำเร็จ', time: timeStr, by: t.reporter_name || '—' },
    { state: t.status === 'pending' ? 'active' : 'done', label: 'รอดำเนินการ', time: '—', by: t.assignee || '—' },
    { state: t.status === 'inprogress' ? 'active' : (t.status === 'done' ? 'done' : 'wait'), label: 'กำลังดำเนินการ', time: '—', by: t.assignee || '—' },
    { state: t.status === 'done' ? 'done' : 'wait', label: 'ปิดงาน', time: '—', by: t.assignee || '—' }
  ];
}

// ---- SUMMARY CHIPS ----
function renderChips() {
  const counts = { all: allTasks.length };
  ['done','pending','inprogress'].forEach(s => { 
    counts[s] = allTasks.filter(t => t.status === s).length; 
  });
  
  const chips = [
    { key:'', label:'ทั้งหมด', cls:'all', count: counts.all },
    { key:'done', label:'เสร็จแล้ว', cls:'done', count: counts.done },
    { key:'inprogress', label:'กำลังทำ', cls:'inprogress', count: counts.inprogress },
    { key:'pending', label:'รอดำเนินการ', cls:'pending', count: counts.pending },
  ];
  
  document.getElementById('summary-row').innerHTML = chips.map(c => `
    <div class="summary-chip ${c.cls} ${activeStatus === c.key ? 'active' : ''}" onclick="filterByStatus('${c.key}')">
      ${c.label} <span class="chip-count">${c.count}</span>
    </div>`).join('');
}
// ----
function filterByStatus(s) { 
  activeStatus = s; 
  currentPage = 1;
  applyFilters(); 
}

// ---- APPLY FILTERS ----
function applyFilters() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const pri = document.getElementById('filter-pri').value;
  const dFrom = document.getElementById('filter-date-from').value;
  const dTo = document.getElementById('filter-date-to').value;

  filtered = allTasks.filter(t => {
    if (activeStatus && t.status !== activeStatus) return false;
    if (q && !t.id.toLowerCase().includes(q) && !t.title.toLowerCase().includes(q)) return false;
    if (pri && t.pri !== pri) return false;
    // (เพิ่มเติม: กรองวันที่ถ้าจำเป็น)
    return true;
  });

  renderChips();
  renderTable();
}
// ---- 
function clearFilters() {
  document.getElementById('search-input').value = '';
  document.getElementById('filter-pri').value = '';
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
  activeStatus = '';
  applyFilters();
}

// ---- RENDER TABLE ----
function renderTable() {
  const tbody = document.getElementById('history-tbody');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('result-count');
  const start = (currentPage - 1) * ROWS_PER_PAGE;
  const page  = filtered.slice(start, start + ROWS_PER_PAGE);
  
  count.textContent = `${filtered.length} รายการ`;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = page.map((t, i) => {
      const avHtml = t.assignees.map((a,j) => `<div class="avatar-sm ${avColors[j%avColors.length]}">${a}</div>`).join('');
      return `<tr style="animation-delay:${i*0.03}s" onclick="openPanel('${t.id}')">
        <td><span class="ticket-id">${t.id}</span></td>
        <td> 
          <div style="font-size:13px; font-weight:500; color:var(--text-main); white-space:nowrap">${t.dateOpen}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px"><i class="bi bi-clock" style="font-size:10px"></i> ${t.timeOpen}</div>
        </td>
        <td>
          <div class="task-title">${t.title}</div>
          <div class="task-sub"><style="font-size:10px"></dstyle=> ${t.detail}</div>
        </td>
        <td><span class="badge-status ${t.status}">${statusLabel[t.status]}</span></td>
        <td><span class="priority-badge ${t.pri}">${prioLabel[t.pri]}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:13px;color:var(--text-main);white-space:nowrap">${t.assigneeFull}</span>
        </div>
        </td>
        <td style="font-size:12px;color:var(--text-muted)">${t.adminNote}</td>
        <td> 
          <div style="font-size:13px; font-weight:500; color:var(--text-main); white-space:nowrap">${t.dateClose}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px"><i class="bi bi-clock" style="font-size:10px"></i> ${t.timeClose}</div>
        </td>
        <td><button class="icon-btn" onclick="event.stopPropagation();openPanel('${t.id}')"><i class="bi bi-chevron-right"></i></button></td>
      </tr>`;
    }).join('');
  }
  renderPagination();
}

// ---- PAGINATION ----
function renderPagination() {
  const total = Math.ceil(filtered.length / ROWS_PER_PAGE);
  let html = `<button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}><i class="bi bi-chevron-left"></i></button>`;
  for (let p = 1; p <= total; p++) {
    html += `<button class="page-btn ${p===currentPage?'active':''}" onclick="goPage(${p})">${p}</button>`;
  }
  html += `<button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===total||total===0?'disabled':''}><i class="bi bi-chevron-right"></i></button>`;
  document.getElementById('page-btns').innerHTML = html;
}
// ---- 
function goPage(p) {
  currentPage = p;
  renderTable();
}

// ---- OPEN PANEL ----
function openPanel(id) {
  const t = allTasks.find(x => x.id === id);
  if (!t) return;

  document.getElementById('panel-id').textContent = t.id + '  ' + t.title;
  document.getElementById('panel-status-badge').innerHTML = `<span class="badge-status ${t.status}">${statusLabel[t.status]}</span>`;

  // 1. สร้าง HTML สำหรับ Timeline
  const tlHtml = t.timeline.map(tl => `
    <div class="tl-item">
      <div class="tl-dot ${tl.state}">
        ${tl.state === 'done' ? '<i class="bi bi-check-lg"></i>' : tl.state === 'active' ? '<i class="bi bi-arrow-repeat"></i>' : '<i class="bi bi-circle"></i>'}
      </div>
      <div class="tl-text">
        <h6>${tl.label}</h6>
        <small>${tl.time && tl.time !== '—' ? tl.time : ''} ${tl.by && tl.by !== '—' ? '· ' + tl.by : ''}</small>
      </div>
    </div>`).join('');

  // 2. สร้าง HTML สำหรับ ความคิดเห็น (Comments)
  const commentsHtml = (t.comments && t.comments.length) ? t.comments.map(c => `
    <div class="comment-item">
      <div class="comment-author">${c.author}</div>
      <div class="comment-text">${c.text}</div>
      <div class="comment-time">${c.time}</div>
    </div>`).join('') : '<div style="font-size:12px;color:var(--text-muted)">ยังไม่มีความคิดเห็น</div>';

  // 3. ปรับโครงสร้างจัดวางใหม่เพื่อบล็อกตำแหน่งผู้แจ้งงานไว้ล่างสุด
  document.getElementById('panel-body').innerHTML = `
    <div class="panel-scroll-content" style="max-height: calc(100vh - 200px); overflow-y: auto; padding-bottom: 15px;">
      
      <div class="panel-section">
        <div class="panel-label">รายละเอียดงาน</div>
        <div class="panel-value" style="line-height:1.6; white-space:pre-line;">${t.detail || '—'}</div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:20px;">
        <div>
          <div class="panel-label">วันที่แจ้ง</div>
          <div class="panel-value" style="font-size:13px;">${t.dateOpen} ${t.timeOpen || ''}</div>
        </div>
        <div>
          <div class="panel-label">วันที่ปิดงาน</div>
          <div class="panel-value" style="font-size:13px;">${t.dateClose} ${t.timeClose || '—'}</div>
        </div>
        <div>
          <div class="panel-label">ความเร่งด่วน</div>
          <div style="margin-top:4px;"><span class="priority-badge ${t.pri}">${prioLabel[t.pri]}</span></div>
        </div>
      </div>

      <div class="panel-section" style="border-top:1px solid var(--border); padding-top:15px;">
        <div class="panel-label">ผู้รับผิดชอบ</div>
        <div style="display:flex; align-items:center; gap:10px; margin-top:6px;">
          <div class="avatar-sm ${avColors[0]}" style="width:32px; height:32px; font-size:11px; display:flex; align-items:center; justify-content:center; border-radius:50%;">
            ${t.assignees && t.assignees[0] ? t.assignees[0] : '??'}
          </div>
          <span style="font-size:13px; font-weight:500; color:var(--text-main);">${t.assigneeFull || 'ยังไม่ได้มอบหมาย'}</span>
        </div>
      </div>

      <div class="panel-section" style="border-top:1px solid var(--border); padding-top:15px;">
        <div class="panel-label">ไทม์ไลน์</div>
        <div class="timeline" style="margin-top:10px;">${tlHtml}</div>
      </div>

      <div class="panel-section" style="border-top:1px solid var(--border); padding-top:15px;">
        <div class="panel-label">หมายเหตุ</div>
        <div class="panel-value" style="background:#f8fafc; padding:10px; border-radius:6px; font-size:12px; color:var(--text-muted); border:1px solid var(--border);">
          ${t.adminNote || '—'}
        </div>
      </div>

      <div class="panel-section" style="border-top:1px solid var(--border); padding-top:15px; margin-bottom:10px;">
        <div class="panel-label">ความคิดเห็น / บันทึกเพิ่มเติม</div>
        <div class="comment-list" style="margin-top:10px; max-height:200px; overflow-y:auto;">${commentsHtml}</div>
        <div class="comment-box" style="margin-top:12px; display:flex; gap:8px;">
          <textarea class="comment-input" id="comment-input-${t.id}" rows="2" placeholder="พิมพ์ความคิดเห็นที่นี่..." style="width:100%; padding:8px; border:1px solid var(--border); border-radius:6px; font-size:13px; resize:none; outline:none;"></textarea>
          <button class="btn-primary-sm" onclick="addComment('${t.id}')" style="align-self:flex-end; padding:8px 12px; background:var(--primary); color:white; border:none; border-radius:6px; cursor:pointer;">
            <i class="bi bi-send-fill"></i>
          </button>
        </div>
      </div>

    </div>

    <div class="panel-fixed-footer" style="position: sticky; bottom: 0; background: white; border-top:1px solid var(--border); padding-top:15px; padding-bottom: 5px; z-index: 10;">
      <div class="panel-label">ผู้แจ้งงาน</div>
      <div style="display:flex; align-items:center; gap:10px; margin-top:6px;">
        <div class="avatar-sm av-teal" style="width:32px; height:32px; font-size:11px; display:flex; align-items:center; justify-content:center; border-radius:50%;">
          ${t.reporter ? t.reporter.substring(0, 2) : 'US'}
        </div>
        <span style="font-size:13px; font-weight:500; color:var(--text-main);">${t.reporter}</span>
      </div>
    </div>
  `;

  // เปิดใช้งานสไลด์และฉากหลัง (Backdrop)
  document.getElementById('detail-panel').classList.add('open');
  document.getElementById('backdrop').classList.add('show');
}

// ---- CLOSE PANEL ----
function closePanel() {
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('backdrop').classList.remove('show');
}

function addComment(id) {
  const t = allTasks.find(x => x.id === id);
  const inp = document.getElementById('comment-input-' + id);
  if (!t || !inp || !inp.value.trim()) return;
  if (!t.comments) t.comments = [];
  t.comments.push({ author:'Admin', text: inp.value.trim(), time:'เดี๋ยวนี้' });
  showToast('ส่งความคิดเห็นแล้ว', 'bi-chat-dots-fill', '#2563EB');
  closePanel();
  setTimeout(() => openPanel(id), 50);
}

// ---- TOAST & USER ----
let currentUserName = '';

async function loadUser() {
  try {
    const res = await fetch('/api/me');
    if (res.status === 401) { window.location.href = '/login'; return; }
    const data = await res.json();
    currentUserName = data.fullName; // เก็บไว้ใช้
    document.getElementById('user-fullname').textContent = data.fullName;
    document.getElementById('user-role').textContent = data.role;
    document.getElementById('user-avatar').textContent = data.fullName.substring(0, 2);
  } catch(e) { console.error(e); }
}

function showToast(msg, icon, color) {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast-msg show';
  el.innerHTML = `<i class="bi ${icon}" style="color:${color}"></i> ${msg}`;
  wrap.appendChild(el);
  setTimeout(() => { el.remove(); }, 3000);
}

// ---- EXPORT CSV ----
function exportCSV() {
  const headers = ['Ticket','วันที่แจ้ง','หัวข้อ','สถานะ','ความเร่งด่วน','ผู้รับผิดชอบ','หมายเหตุ'];
  const rows = filtered.map(t => [t.id, t.dateOpen, t.title, statusLabel[t.status], prioLabel[t.pri], t.assigneeFull, t.adminNote]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'history_export.csv';
  a.click();
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  await loadUser();  
  fetchHistory();    
});