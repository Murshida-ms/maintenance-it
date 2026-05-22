/* ===== form.js ===== */

// =====================================================================
// SLA CONFIG
// =====================================================================
const SLA_CONFIG = {
  low:  { hours: 72, label: 'ปกติ (72 ชม.)',    color: '#10B981', bg: '#ECFDF5', emoji: '🟢' },
  med:  { hours: 24, label: 'ปานกลาง (24 ชม.)', color: '#F59E0B', bg: '#FFFBEB', emoji: '🟡' },
  high: { hours:  4, label: 'ด่วน (4 ชม.)',     color: '#EF4444', bg: '#FEF2F2', emoji: '🔴' },
};

let slaDeadline = null;
let slaLevel    = null;

// =====================================================================
// PRIORITY + SLA
// =====================================================================
function selectPriority(el, level) {
  document.querySelectorAll('.priority-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');

  slaLevel = level;
  const cfg = SLA_CONFIG[level];
  const now = new Date();
  slaDeadline = new Date(now.getTime() + cfg.hours * 60 * 60 * 1000);

  const block = document.getElementById('sla-block');
  block.style.setProperty('--sla-color', cfg.color);
  block.style.setProperty('--sla-bg', cfg.bg);

  document.getElementById('sla-badge-label').textContent = cfg.label;
  document.getElementById('sla-dl-time').textContent     = formatTime(slaDeadline);
  document.getElementById('sla-dl-date').textContent     = formatDateThai(slaDeadline);

  block.style.display = 'block';
}

// =====================================================================
// DATE HELPERS
// =====================================================================
const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                     'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function formatTime(d) {
  const h = String(d.getHours()).padStart(2,'0');
  const m = String(d.getMinutes()).padStart(2,'0');
  return `${h}:${m} น.`;
}

function formatDateThai(d) {
  const day   = d.getDate();
  const month = THAI_MONTHS[d.getMonth()];
  const year  = d.getFullYear() + 543;
  return `${day} ${month} ${year}`;
}

function timeAgo(dateStr) {
  const now  = new Date();
  const past = new Date(dateStr);
  const diff = Math.floor((now - past) / 60000);
  if (diff < 1)  return 'เพิ่งสักครู่';
  if (diff < 60) return `${diff} นาทีที่แล้ว`;
  const h = Math.floor(diff / 60);
  if (h < 24)    return `${h} ชม.ที่แล้ว`;
  const d = Math.floor(h / 24);
  return `${d} วันที่แล้ว`;
}

// =====================================================================
// RECENT TASKS
// =====================================================================
const STATUS_MAP = {
  pending:    { label: 'รอดำเนินการ',    cls: 'pending' },
  inprogress: { label: 'กำลังดำเนินการ', cls: 'progress' },
  done:       { label: 'เสร็จแล้ว',      cls: 'done' },
};

let recentCache = [];

function taskToHtml(t) {
  const st = STATUS_MAP[t.status] || { label: t.status, cls: 'pending' };
  const ticketNo = 'TK-' + String(t.id).padStart(4, '0');
  return `
    <div class="recent-item" id="ri-${t.id}" onclick="window.location.href='/timeline?id=${ticketNo}'">
      <div class="ri-dot ${st.cls}"></div>
      <div class="ri-body">
        <div class="ri-title">${escHtml(t.title)}</div>
        <div class="ri-meta">
          <span class="ri-ticket">${ticketNo}</span>
          <span class="ri-time">${timeAgo(t.created_at)}</span>
        </div>
      </div>
      <span class="ri-badge ${st.cls}">${st.label}</span>
    </div>`;
}

function renderRecentTasks(tasks) {
  const list    = document.getElementById('recent-list');
  const countEl = document.getElementById('recent-count');
  recentCache   = tasks.slice(0, 6);
  if (recentCache.length === 0) {
    list.innerHTML = `<div class="recent-empty"><i class="bi bi-inbox"></i>ยังไม่มีรายการ</div>`;
    countEl.textContent = '0 รายการ';
    return;
  }
  countEl.textContent = `${recentCache.length} รายการล่าสุด`;
  list.innerHTML = recentCache.map(taskToHtml).join('');
}

function prependRecentTask(t) {
  const list    = document.getElementById('recent-list');
  const countEl = document.getElementById('recent-count');
  const empty   = list.querySelector('.recent-empty');
  if (empty) empty.remove();
  list.insertAdjacentHTML('afterbegin', taskToHtml(t));
  recentCache.unshift(t);
  if (recentCache.length > 6) {
    recentCache.pop();
    const items = list.querySelectorAll('.recent-item');
    if (items.length > 6) items[items.length - 1].remove();
  }
  countEl.textContent = `${Math.min(recentCache.length, 6)} รายการล่าสุด`;
  const newEl = list.querySelector('.recent-item');
  if (newEl) {
    newEl.style.transition = 'background .4s';
    newEl.style.background = 'var(--primary-light)';
    setTimeout(() => { newEl.style.background = ''; }, 1200);
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadRecentTasks() {
  try {
    const res = await fetch('/api/tickets');
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderRecentTasks(Array.isArray(data) ? data.slice(0, 6) : []);
  } catch {
    renderRecentTasks([]);
  }
}

// =====================================================================
// FILE UPLOAD
// =====================================================================
let uploadedFiles = [];

function handleFiles(files) {
  const preview = document.getElementById('file-preview');
  [...files].slice(0, 5 - uploadedFiles.length).forEach(file => {
    uploadedFiles.push(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        const idx = uploadedFiles.length - 1;
        preview.innerHTML += `<div class="file-thumb" id="ft-${idx}"><img src="${e.target.result}" alt="preview"><div class="ft-remove" onclick="removeFile(${idx})"><i class="bi bi-x"></i></div></div>`;
      };
      reader.readAsDataURL(file);
    } else {
      const idx = uploadedFiles.length - 1;
      preview.innerHTML += `<div class="file-thumb" id="ft-${idx}" style="flex-direction:column;gap:4px"><i class="bi bi-file-earmark-pdf" style="font-size:24px;color:#EF4444"></i><span style="font-size:9px;color:var(--text-muted);text-align:center;padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%">${file.name}</span><div class="ft-remove" onclick="removeFile(${idx})"><i class="bi bi-x"></i></div></div>`;
    }
  });
}

function removeFile(idx) {
  uploadedFiles.splice(idx, 1);
  const el = document.getElementById('ft-' + idx);
  if (el) el.remove();
}

function dragOver(e)  { e.preventDefault(); document.getElementById('file-drop').classList.add('drag'); }
function dragLeave()  { document.getElementById('file-drop').classList.remove('drag'); }
function dropFile(e)  { e.preventDefault(); dragLeave(); handleFiles(e.dataTransfer.files); }

// =====================================================================
// CHAR COUNT
// =====================================================================
function countChars(el, counterId, max) {
  const c = el.value.length;
  const el2 = document.getElementById(counterId);
  el2.textContent = `${c} / ${max}`;
  el2.style.color = c > max * 0.9 ? 'var(--pending)' : 'var(--text-muted)';
}

// =====================================================================
// SUBMIT
// =====================================================================
async function submitForm() {
  const title      = document.getElementById('task-title').value.trim();
  const detail     = document.getElementById('task-detail').value.trim();
  const priorityEl = document.querySelector('input[name="priority"]:checked');
  const msg        = document.getElementById('validate-msg');

  if (!title || !priorityEl) {
    const errorText = !title ? 'กรุณากรอกหัวข้องาน' : 'กรุณาเลือกระดับความเร่งด่วน';
    msg.innerHTML = `<i class="bi bi-exclamation-circle"></i> ${errorText}`;
    msg.style.display = 'flex';
    setTimeout(() => { msg.style.display = 'none'; }, 3000);
    return;
  }

  try {
    const formData = new FormData();
    formData.append('title',    title);
    formData.append('detail',   detail);
    formData.append('priority', priorityEl.value);
    formData.append('note',     document.getElementById('priority-note').value.trim());
    if (slaDeadline) formData.append('sla_deadline', slaDeadline.toISOString());
    uploadedFiles.forEach(file => formData.append('files', file));

    const res  = await fetch('/api/submit-ticket', { method:'POST', body:formData });
    const data = await res.json();

    if (data.success) {
      if (slaLevel && slaDeadline) {
        const cfg = SLA_CONFIG[slaLevel];
        const modalSla = document.getElementById('modal-sla-info');
        modalSla.style.display = 'block';
        const badge = document.getElementById('modal-sla-badge');
        badge.textContent = cfg.emoji + ' ' + cfg.label;
        badge.style.cssText = `background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.color}40`;
        document.getElementById('modal-sla-deadline').textContent =
          `${formatDateThai(slaDeadline)} · ${formatTime(slaDeadline)}`;
      }
      document.getElementById('success-modal').classList.add('show');
      prependRecentTask({
        id:         data.ticketId,
        title:      title,
        status:     'pending',
        priority:   priorityEl.value,
        created_at: new Date().toISOString(),
      });
    } else {
      alert('เกิดข้อผิดพลาด: ' + data.error);
    }
  } catch (err) {
    alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
  }
}

function closeModal() { document.getElementById('success-modal').classList.remove('show'); }

function resetForm() {
  closeModal();
  slaDeadline = null;
  slaLevel    = null;
  document.getElementById('task-title').value    = '';
  document.getElementById('task-detail').value   = '';
  document.getElementById('priority-note').value = '';
  document.getElementById('file-preview').innerHTML = '';
  document.querySelectorAll('.priority-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('sla-block').style.display = 'none';
  uploadedFiles = [];
  document.getElementById('modal-sla-info').style.display = 'none';
  const cur  = parseInt(document.getElementById('ticket-id').textContent.replace('TK-',''));
  const next = 'TK-' + String(cur + 1).padStart(4,'0');
  document.getElementById('ticket-id').textContent        = next;
  document.getElementById('modal-ticket-num').textContent = next;
}

function setActive(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
}

function goToTrackPage() { window.location.href = '/timeline'; }

// =====================================================================
// DATE TIME
// =====================================================================
function setThaiDateTime() {
  const now = new Date();
  const thaiYear = now.getFullYear() + 543;
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const day   = now.getDate();
  const month = months[now.getMonth()];
  const hour  = String(now.getHours()).padStart(2,'0');
  const min   = String(now.getMinutes()).padStart(2,'0');
  document.getElementById('tk-date').textContent =
    `วันที่ ${day} ${month} ${thaiYear} · ${hour}:${min} น.`;
}
setThaiDateTime();

// =====================================================================
// LOAD USER + RECENT
// =====================================================================
async function loadUser() {
  try {
    const res = await fetch('/api/me');
    if (res.status === 401) { window.location.href = '/login'; return; }
    const data = await res.json();
    document.getElementById('user-fullname').textContent = data.fullName;
    document.getElementById('user-role').textContent     = data.role;
    document.getElementById('user-avatar').textContent   = data.fullName.substring(0, 2);
    const contact = document.getElementById('contact-name');
    if (contact) contact.value = data.fullName;

    const tkRes  = await fetch('/api/next-ticket');
    const tkData = await tkRes.json();
    document.getElementById('ticket-id').textContent        = tkData.ticketNo;
    document.getElementById('modal-ticket-num').textContent = tkData.ticketNo;
  } catch(e) { console.error(e); }
}

loadUser();
loadRecentTasks();