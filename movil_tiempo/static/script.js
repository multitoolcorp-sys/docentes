let scheduleGroups = [];
let nextAlarmTime = null;
let currentAlarmItem = null;
let selectedDays = [];
let appLoaded = false;
let pendingPdfData = null;
let editingGroupId = null;

document.addEventListener('DOMContentLoaded', () => {
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(() => console.log("PWA Ready")).catch(err => console.log("PWA Error", err));
    }

    loadLocalData();
    startClock();
    setupEventListeners();
    setTimeout(() => { appLoaded = true; }, 3000);
    setInterval(checkAlarms, 1000);
});

function startClock() {
    const clockEl = document.getElementById('live-clock');
    // Important for mobile sound unlocking
    document.addEventListener('touchstart', () => {
        const sound = document.getElementById('alarm-sound');
        if (sound.paused && !sound.src.includes('data:')) {
             sound.play().then(() => { sound.pause(); sound.currentTime = 0; }).catch(() => {});
        }
    }, { once: true });

    setInterval(() => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, 1000);
}

function setupEventListeners() {
    document.getElementById('pdf-input').addEventListener('change', handleFileUpload);
    document.getElementById('sound-input').addEventListener('change', handleSoundUpload);
    document.querySelectorAll('.day-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            const day = parseInt(btn.dataset.day);
            if (selectedDays.includes(day)) selectedDays = selectedDays.filter(d => d !== day);
            else selectedDays.push(day);
        });
    });
}

function handleSoundUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const data = ev.target.result;
        document.getElementById('alarm-sound').src = data;
        document.getElementById('current-sound-name').textContent = `Sonido: ${file.name}`;
        localStorage.setItem('custom_alarm_sound', data);
        localStorage.setItem('custom_alarm_name', file.name);
        testSound();
    };
    reader.readAsDataURL(file);
}

function testSound() {
    const s = document.getElementById('alarm-sound');
    s.play().catch(() => {});
    setTimeout(() => { s.pause(); s.currentTime = 0; }, 2000);
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById('upload-status');
    status.innerHTML = '⚡ Analizando...';
    const fd = new FormData();
    fd.append('file', file);
    try {
        const res = await fetch('/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (json.status === 'success') {
            pendingPdfData = json.data;
            document.getElementById('pdf-group-name').value = file.name.replace('.pdf', '');
            openModal('pdf-name-modal');
            status.innerHTML = '';
        }
    } catch(err) { status.innerHTML = '❌ Error'; }
}

function confirmPdfUpload() {
    const name = document.getElementById('pdf-group-name').value || "Nuevo Horario";
    const items = pendingPdfData.map(i => ({
        id: Math.random() + Date.now(),
        subject: i.subject,
        start: i.start || i.time,
        enabled: true,
        days: [1,2,3,4,5]
    }));
    scheduleGroups.push({ id: Date.now(), name, enabled: true, collapsed: false, items });
    saveLocalData(); renderSchedule(); closeModal('pdf-name-modal');
    pendingPdfData = null;
}

function openEditName(id) {
    editingGroupId = id;
    const g = scheduleGroups.find(g => g.id == id);
    if(g) {
        document.getElementById('edit-group-input').value = g.name;
        openModal('edit-group-modal');
    }
}

function saveGroupName() {
    const name = document.getElementById('edit-group-input').value;
    const g = scheduleGroups.find(g => g.id == editingGroupId);
    if(g && name) {
        g.name = name;
        saveLocalData(); renderSchedule(); closeModal('edit-group-modal');
    }
}

function saveManualAlarm() {
    const sub = document.getElementById('manual-subject').value;
    const time = document.getElementById('manual-time').value;
    if(!sub || !time) return;
    const item = { id: Math.random(), subject: sub, start: time, enabled: true, days: selectedDays.slice() };
    let g = scheduleGroups.find(g => g.id === 'personal');
    if(!g) {
        g = { id: 'personal', name: "Mis Alarmas", enabled: true, collapsed: false, items: [] };
        scheduleGroups.push(g);
    }
    g.items.push(item);
    saveLocalData(); renderSchedule(); closeModal('add-modal');
    document.getElementById('manual-subject').value = '';
    document.getElementById('manual-time').value = '';
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
    selectedDays = [];
}

function toggleGroup(id, val) { const g = scheduleGroups.find(g => g.id == id); if(g) { g.enabled = val; saveLocalData(); updateNextEvent(); } }
function toggleItem(gid, iid) { const g = scheduleGroups.find(g => g.id == gid); if(g) { const i = g.items.find(i => i.id == iid); if(i) { i.enabled = !i.enabled; saveLocalData(); updateNextEvent(); } } }
function toggleCollapse(id) { const g = scheduleGroups.find(g => g.id == id); if(g) { g.collapsed = !g.collapsed; saveLocalData(); renderSchedule(); } }
function deleteGroup(id) { if(confirm("¿Borrar este horario?")) { scheduleGroups = scheduleGroups.filter(g => g.id != id); saveLocalData(); renderSchedule(); } }

function renderSchedule() {
    const container = document.getElementById('items-container');
    container.innerHTML = '';
    scheduleGroups.forEach((g) => {
        const div = document.createElement('div');
        div.className = 'schedule-group';
        div.innerHTML = `
            <div class="group-header ${g.collapsed ? 'collapsed' : ''}" onclick="toggleCollapse(${g.id})">
                <div class="group-info"><i class="fa-solid fa-chevron-down"></i> <span>${g.name}</span></div>
                <div class="group-actions" onclick="event.stopPropagation()">
                    <button class="btn-icon" onclick="openEditName(${g.id})"><i class="fa-solid fa-pen" style="font-size:0.8rem"></i></button>
                    <label class="switch"><input type="checkbox" ${g.enabled ? 'checked' : ''} onchange="toggleGroup(${g.id}, this.checked)"><span class="slider"></span></label>
                    <button class="btn-icon" onclick="deleteGroup(${g.id})"><i class="fa-solid fa-trash-can" style="color:var(--danger);font-size:0.8rem"></i></button>
                </div>
            </div>
            <div class="group-body ${g.collapsed ? 'collapsed' : ''}">
                ${g.items.map(i => `
                    <div class="schedule-item">
                        <div class="item-left"><h4>${i.subject}</h4><p>${i.start}</p></div>
                        <div class="item-right"><label class="switch"><input type="checkbox" ${i.enabled ? 'checked' : ''} onchange="toggleItem(${g.id}, ${i.id})"><span class="slider"></span></label></div>
                    </div>
                `).join('')}
            </div>
        `;
        container.appendChild(div);
    });
    updateNextEvent();
}

function updateNextEvent() {
    const now = new Date();
    const curDay = now.getDay();
    const curTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    let all = [];
    scheduleGroups.forEach(g => { if(g.enabled) g.items.forEach(i => all.push({...i, gid: g.id})); });
    const next = all.filter(i => {
        const days = i.days || [1,2,3,4,5];
        return i.start > curTime && days.includes(curDay);
    }).sort((a,b) => a.start.localeCompare(b.start))[0];

    const card = document.getElementById('next-event');
    if (next) {
        card.classList.remove('hidden');
        document.getElementById('next-subject').textContent = next.subject;
        document.getElementById('next-time-range').textContent = next.start;
        nextAlarmTime = next.start;
        currentAlarmItem = next;
    } else {
        card.classList.add('hidden');
        nextAlarmTime = null;
    }
}

function checkAlarms() {
    if (!nextAlarmTime || !appLoaded) return;
    const now = new Date();
    const curDay = now.getDay();
    const curTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    if (curTime === nextAlarmTime && now.getSeconds() === 0) {
        const g = scheduleGroups.find(g => g.id == currentAlarmItem.gid);
        if(g && g.enabled && (currentAlarmItem.days || [1,2,3,4,5]).includes(curDay)) triggerAlarm();
    }
}

function triggerAlarm() {
    document.getElementById('alarm-message').innerHTML = `Es hora de la clase: <b>${currentAlarmItem.subject}</b>`;
    document.getElementById('alarm-overlay').classList.remove('hidden');
    if (currentAlarmItem.enabled) document.getElementById('alarm-sound').play().catch(()=>{});
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function openAddModal() { openModal('add-modal'); }
function openSettings() { openModal('settings-modal'); }

function dismissAlarm() {
    document.getElementById('alarm-overlay').classList.add('hidden');
    document.getElementById('alarm-sound').pause(); document.getElementById('alarm-sound').currentTime = 0;
    nextAlarmTime = null; updateNextEvent();
}

function resetApp() { if(confirm("¿Borrar todos los horarios?")) { localStorage.clear(); location.reload(); } }
function saveLocalData() { localStorage.setItem('docente_groups', JSON.stringify(scheduleGroups)); }

function loadLocalData() {
    const saved = localStorage.getItem('docente_groups');
    if (saved) {
        scheduleGroups = JSON.parse(saved);
        if (scheduleGroups.length > 0) renderSchedule();
    }
    const snd = localStorage.getItem('custom_alarm_sound');
    if(snd) {
        document.getElementById('alarm-sound').src = snd;
        document.getElementById('current-sound-name').textContent = `Sonido: ${localStorage.getItem('custom_alarm_name')}`;
    }
}
