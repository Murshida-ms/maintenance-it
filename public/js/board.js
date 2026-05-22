/* ===== board.js ===== */

const tasks = [
  { id:'TK-0248', title:'เครื่องปริ้นท์ไม่ทำงาน', loc:'ห้อง 301', status:'pending',  pri:'high',   assignees:['วช','สม'], date:'11/05/68' },
  { id:'TK-0247', title:'แอร์ไม่เย็น ห้องประชุม',  loc:'ห้อง 203', status:'inprogress',pri:'high',   assignees:['วิ','ณ'],  date:'11/05/68' },
  { id:'TK-0246', title:'อินเทอร์เน็ตขัดข้อง',     loc:'อาคาร C',  status:'inprogress',pri:'med',    assignees:['ปร'],      date:'11/05/68' },
  { id:'TK-0245', title:'ไฟฟ้าดับห้อง IT',         loc:'ชั้น 2',   status:'inprogress',pri:'high',   assignees:['สจ','วช'],  date:'10/05/68' },
  { id:'TK-0244', title:'น้ำรั่วห้องน้ำหญิง',      loc:'ชั้น 1',   status:'done',     pri:'med',    assignees:['มน'],       date:'10/05/68' },
  { id:'TK-0243', title:'ประตูชำรุด',              loc:'อาคาร A',  status:'done',     pri:'low',    assignees:['ปร'],       date:'09/05/68' },
  { id:'TK-0242', title:'ปลั๊กไฟไม่มีกระแส',      loc:'ห้อง 105', status:'rejected', pri:'med',    assignees:['วิ'],       date:'09/05/68' },
];

const staffData = [
  { name:'ช่างวิชัย',  avatar:'วช', done:28, total:30 },
  { name:'ช่างสมชาย', avatar:'สจ', done:22, total:26 },
  { name:'ช่างประยงค์',avatar:'ปร', done:19, total:22 },
  { name:'ช่างวิโรจน์',avatar:'วิ', done:15, total:18 },
  { name:'ช่างมนัส',   avatar:'มน', done:17, total:17 },
];

const cats = [
  { name:'IT / คอมพิวเตอร์', val:58, color:'#2563EB' },
  { name:'ไฟฟ้า / อาคาร',   val:49, color:'#F59E0B' },
  { name:'เครือข่าย',        val:37, color:'#10B981' },
  { name:'ระบบน้ำ',          val:27, color:'#EF4444' },
  { name:'อื่นๆ',            val:18, color:'#8B5CF6' },
];

const barData = [
  { day:'จ', new:12, done:9 },
  { day:'อ', new:8,  done:11 },
  { day:'พ', new:15, done:7 },
  { day:'พฤ',new:10, done:13 },
  { day:'ศ', new:18, done:8 },
  { day:'ส', new:5,  done:10 },
  { day:'อา',new:3,  done:6 },
];

const statusLabel = { pending:'รอดำเนินการ', inprogress:'กำลังทำ', done:'เสร็จแล้ว', rejected:'ถูกตีกลับ' };
const prioLabel   = { high:'ด่วนมาก', med:'ปานกลาง', low:'ปกติ' };
const avColors    = ['av-blue','av-green','av-amber','av-pink','av-teal'];

// TASK TABLE
const tbody = document.getElementById('task-tbody');
tasks.forEach(t => {
  const avHtml = t.assignees.map((a,i) =>
    `<div class="avatar-sm ${avColors[i%avColors.length]}">${a}</div>`).join('');
  tbody.innerHTML += `<tr>
    <td><span class="ticket-id">${t.id}</span></td>
    <td><div class="task-title">${t.title}</div><div class="task-sub"><i class="bi bi-geo-alt-fill" style="font-size:10px"></i> ${t.loc}</div></td>
    <td><span class="badge-status ${t.status}">${statusLabel[t.status]}</span></td>
    <td><span class="priority-badge ${t.pri}">${prioLabel[t.pri]}</span></td>
    <td><div class="avatar-group">${avHtml}</div></td>
    <td style="color:var(--text-muted);font-size:12px">${t.date}</td>
  </tr>`;
});

// STAFF TABLE
const stbody = document.getElementById('staff-tbody');
staffData.forEach((s,i) => {
  const rate = Math.round(s.done/s.total*100);
  const rateColor = rate >= 90 ? 'var(--done)' : rate >= 75 ? 'var(--pending)' : 'var(--rejected)';
  stbody.innerHTML += `<tr>
    <td style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="avatar-sm ${avColors[i%avColors.length]}" style="font-size:11px">${s.avatar}</div>
        <span style="font-weight:500">${s.name}</span>
      </div>
    </td>
    <td style="text-align:center;padding:8px 0;border-bottom:1px solid var(--border);color:var(--text-muted)">${s.total}</td>
    <td style="text-align:center;padding:8px 0;border-bottom:1px solid var(--border);font-weight:600;color:var(--done)">${s.done}</td>
    <td style="text-align:right;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-weight:700;color:${rateColor}">${rate}%</span>
    </td>
  </tr>`;
});

// BAR CHART
const maxVal = Math.max(...barData.map(d => Math.max(d.new, d.done)));
const barWrap = document.getElementById('bar-chart');
barData.forEach(d => {
  barWrap.innerHTML += `
  <div class="bar-col">
    <div style="display:flex;gap:2px;align-items:flex-end;height:70px">
      <div class="bar" style="height:${Math.max(4,d.new/maxVal*70)}px;background:#BFDBFE;width:12px" title="เข้าใหม่ ${d.new}"></div>
      <div class="bar" style="height:${Math.max(4,d.done/maxVal*70)}px;background:#2563EB;width:12px" title="เสร็จ ${d.done}"></div>
    </div>
    <div class="bar-label">${d.day}</div>
  </div>`;
});

// DONUT CHART
const total = cats.reduce((s,c)=>s+c.val, 0);
const cx=55, cy=55, r=38, stroke=14;
const circ = 2*Math.PI*r;
let offset = 0;
const gEl = document.getElementById('donut-g');
const legEl = document.getElementById('donut-legend');
cats.forEach(cat => {
  const pct = cat.val/total;
  const dash = pct*circ;
  const el = document.createElementNS('http://www.w3.org/2000/svg','circle');
  el.setAttribute('cx',cx); el.setAttribute('cy',cy); el.setAttribute('r',r);
  el.setAttribute('fill','none'); el.setAttribute('stroke',cat.color);
  el.setAttribute('stroke-width',stroke);
  el.setAttribute('stroke-dasharray',`${dash} ${circ-dash}`);
  el.setAttribute('stroke-dashoffset',-offset*circ + circ*0.25);
  el.setAttribute('transform',`rotate(-90 ${cx} ${cy})`);
  gEl.appendChild(el);
  offset += pct;
  legEl.innerHTML += `<div class="legend-item">
    <span class="legend-dot" style="background:${cat.color}"></span>
    <span class="legend-name" style="font-size:12px;color:var(--text-muted)">${cat.name}</span>
    <span class="legend-val" style="font-size:12px">${cat.val}</span>
    <span class="legend-pct">${Math.round(pct*100)}%</span>
  </div>`;
});

// UI HELPERS
function setActive(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
}
function switchTab(el) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

// LOAD USER
async function loadUser() {
  try {
    const res = await fetch('/api/me');
    if (res.status === 401) { window.location.href = '/login'; return; }
    const data = await res.json();
    document.getElementById('user-fullname').textContent = data.fullName;
    document.getElementById('user-role').textContent = data.role;
    document.getElementById('user-avatar').textContent = data.fullName.substring(0, 2);
  } catch(e) { console.error(e); }
}
loadUser();
