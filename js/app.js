// ====================================================
// APPLICATION STATE
// ====================================================
let state = {
  currentUser: null,
  sectors: [],
  activities: [],
  users: [], // Admin only
  activeContext: 'geral', // 'geral' or 'sec_id'
  currentTab: 'ops', // 'ops' | 'cal' | 'admin'
  calendarDate: new Date(),
  adminTab: 'sectors' // 'sectors' | 'users'
};

// ====================================================
// DOM ELEMENTS & INITIALIZATION
// ====================================================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Check user authentication
  checkAuth();
  
  // Register Global Event Listeners
  setupEventListeners();
}

// ====================================================
// AUTHENTICATION FLOW
// ====================================================
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const user = await res.json();
      onLoginSuccess(user);
    } else {
      showLoginView();
    }
  } catch (err) {
    showLoginView();
  }
}

function showLoginView() {
  state.currentUser = null;
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('main-view').classList.add('hidden');
  lucide.createIcons();
}

function onLoginSuccess(user) {
  state.currentUser = user;
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('main-view').classList.remove('hidden');
  
  // Set user display name & initials
  document.getElementById('user-display-name').textContent = user.username;
  const initials = user.username.substring(0, 2).toUpperCase();
  document.getElementById('user-avatar-initials').textContent = initials;
  
  // Show admin tab option if Admin
  if (user.role === 'admin') {
    document.getElementById('nav-admin').classList.remove('hidden');
  } else {
    document.getElementById('nav-admin').classList.add('hidden');
  }
  
  // Initialize App Data
  loadAppData();
}

// API Login Request
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usernameEl = document.getElementById('login-username');
  const passwordEl = document.getElementById('login-password');
  const btn = document.getElementById('btn-login-submit');
  
  btn.disabled = true;
  btn.innerHTML = '<span>Verificando...</span>';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: usernameEl.value.trim(),
        password: passwordEl.value
      })
    });
    
    if (res.ok) {
      const user = await res.json();
      showToast(`Bem-vindo, ${user.username}!`, 'success');
      onLoginSuccess(user);
      usernameEl.value = '';
      passwordEl.value = '';
    } else {
      const err = await res.json();
      showToast(err.message || 'Erro ao fazer login.', 'error');
    }
  } catch (err) {
    showToast('Falha na comunicação com o servidor.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Acessar o Painel</span> <i data-lucide="arrow-right"></i>';
    lucide.createIcons();
  }
});

// API Logout Request
document.getElementById('btn-logout').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    if (res.ok) {
      showToast('Sessão encerrada com sucesso.', 'success');
      showLoginView();
    }
  } catch (err) {
    showToast('Erro ao sair do sistema.', 'error');
  }
});

// ====================================================
// DATA LOADING
// ====================================================
async function loadAppData() {
  try {
    // 1. Load Sectors
    const sectorsRes = await fetch('/api/sectors');
    if (sectorsRes.ok) {
      state.sectors = await sectorsRes.json();
    }
    
    // 2. Set context list
    buildContextSelector();
    
    // 3. Load activities based on current context
    await refreshActivities();
    
    // 4. Load users list if Admin
    if (state.currentUser.role === 'admin') {
      await refreshUsersList();
    }
    
    // 5. Initial Render
    renderCurrentPage();
    
  } catch (err) {
    showToast('Erro ao carregar dados da aplicação.', 'error');
  }
}

async function refreshActivities() {
  try {
    const res = await fetch('/api/activities');
    if (res.ok) {
      state.activities = await res.json();
    }
  } catch (err) {
    console.error('Error refreshing activities:', err);
  }
}

async function refreshUsersList() {
  try {
    const res = await fetch('/api/users');
    if (res.ok) {
      state.users = await res.json();
    }
  } catch (err) {
    console.error('Error refreshing users:', err);
  }
}

// ====================================================
// CONTEXT SELECTOR & RBAC INTERFACE
// ====================================================
function buildContextSelector() {
  const select = document.getElementById('context-selector');
  select.innerHTML = '';
  
  if (state.currentUser.role === 'admin') {
    // Admin has Geral and all sectors
    const optGeral = document.createElement('option');
    optGeral.value = 'geral';
    optGeral.textContent = 'Geral (Todos os Setores)';
    select.appendChild(optGeral);
    
    state.sectors.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec.id;
      opt.textContent = `Setor: ${sec.name}`;
      select.appendChild(opt);
    });
    
    state.activeContext = 'geral';
  } else {
    // Common User only has access to their linked sectors
    const userSectors = state.sectors.filter(sec => state.currentUser.sectors.includes(sec.id));
    
    if (userSectors.length === 0) {
      const optNone = document.createElement('option');
      optNone.value = 'none';
      optNone.textContent = 'Sem setores vinculados';
      select.appendChild(optNone);
      state.activeContext = 'none';
    } else {
      userSectors.forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec.id;
        opt.textContent = `Setor: ${sec.name}`;
        select.appendChild(opt);
      });
      state.activeContext = userSectors[0].id;
    }
  }
  
  select.value = state.activeContext;
}

// Handle context change
document.getElementById('context-selector').addEventListener('change', async (e) => {
  state.activeContext = e.target.value;
  
  // Refresh activities to enforce access bounds
  await refreshActivities();
  
  // Re-render
  renderCurrentPage();
  showToast(`Visualização alternada com sucesso.`, 'success');
});

// ====================================================
// ROUTER / NAVIGATION
// ====================================================
function setupEventListeners() {
  // Navigation tabs clicks
  document.getElementById('nav-ops').addEventListener('click', () => switchTab('ops'));
  document.getElementById('nav-cal').addEventListener('click', () => switchTab('cal'));
  document.getElementById('nav-admin').addEventListener('click', () => switchTab('admin'));
  document.getElementById('brand-logo-btn').addEventListener('click', () => switchTab('ops'));

  // Activity Destination Radio Logic
  document.getElementById('dest-card-local').addEventListener('click', () => setDestType('local'));
  document.getElementById('dest-card-send').addEventListener('click', () => setDestType('send'));
  
  // Forms Submissions
  document.getElementById('activity-form').addEventListener('submit', handleActivitySubmit);
  document.getElementById('sector-form').addEventListener('submit', handleSectorSubmit);
  document.getElementById('user-form').addEventListener('submit', handleUserSubmit);
  document.getElementById('send-form').addEventListener('submit', handleSendSubmit);
  
  // Cancel buttons
  document.getElementById('btn-sector-cancel').addEventListener('click', resetSectorForm);
  document.getElementById('btn-user-cancel').addEventListener('click', resetUserForm);

  // Admin internal tabs
  document.getElementById('btn-tab-sectors').addEventListener('click', () => switchAdminTab('sectors'));
  document.getElementById('btn-tab-users').addEventListener('click', () => switchAdminTab('users'));
  
  // Calendar Navigation
  document.getElementById('btn-cal-prev').addEventListener('click', () => adjustCalendarMonth(-1));
  document.getElementById('btn-cal-next').addEventListener('click', () => adjustCalendarMonth(1));
  
  // Calendar Filters
  document.getElementById('cal-filter-sector').addEventListener('change', renderCalendar);
  document.getElementById('cal-filter-status').addEventListener('change', renderCalendar);
  
  // Modals close
  document.getElementById('btn-close-send-modal').addEventListener('click', () => closeModal('send-modal'));
  document.getElementById('btn-cancel-send-modal').addEventListener('click', () => closeModal('send-modal'));
  document.getElementById('btn-close-details-modal').addEventListener('click', () => closeModal('details-modal'));
  document.getElementById('btn-close-details-footer').addEventListener('click', () => closeModal('details-modal'));
}

function switchTab(tabName) {
  state.currentTab = tabName;
  
  // Toggle Navigation Link classes
  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
  document.getElementById(`page-ops`).classList.add('hidden');
  document.getElementById(`page-cal`).classList.add('hidden');
  document.getElementById(`page-admin`).classList.add('hidden');
  
  if (tabName === 'ops') {
    document.getElementById('nav-ops').classList.add('active');
    document.getElementById('page-ops').classList.remove('hidden');
  } else if (tabName === 'cal') {
    document.getElementById('nav-cal').classList.add('active');
    document.getElementById('page-cal').classList.remove('hidden');
  } else if (tabName === 'admin') {
    document.getElementById('nav-admin').classList.add('active');
    document.getElementById('page-admin').classList.remove('hidden');
  }
  
  renderCurrentPage();
}

function switchAdminTab(adminTabName) {
  state.adminTab = adminTabName;
  document.getElementById('btn-tab-sectors').classList.remove('active');
  document.getElementById('btn-tab-users').classList.remove('active');
  
  document.getElementById('admin-sectors-panel').classList.add('hidden');
  document.getElementById('admin-users-panel').classList.add('hidden');
  
  if (adminTabName === 'sectors') {
    document.getElementById('btn-tab-sectors').classList.add('active');
    document.getElementById('admin-sectors-panel').classList.remove('hidden');
  } else {
    document.getElementById('btn-tab-users').classList.add('active');
    document.getElementById('admin-users-panel').classList.remove('hidden');
  }
  lucide.createIcons();
}

function renderCurrentPage() {
  if (state.currentTab === 'ops') {
    renderOperationsPage();
  } else if (state.currentTab === 'cal') {
    renderCalendarPage();
  } else if (state.currentTab === 'admin') {
    renderAdminPage();
  }
  lucide.createIcons();
}

// Set form destination style
function setDestType(type) {
  document.getElementById('dest-card-local').classList.remove('active');
  document.getElementById('dest-card-send').classList.remove('active');
  
  const localRadio = document.getElementById('dest-local');
  const sendRadio = document.getElementById('dest-send');
  const destSelectGroup = document.getElementById('dest-sector-group');
  const destSelect = document.getElementById('act-dest-sector');
  
  if (type === 'local') {
    document.getElementById('dest-card-local').classList.add('active');
    localRadio.checked = true;
    destSelectGroup.classList.add('hidden');
    destSelect.removeAttribute('required');
  } else {
    document.getElementById('dest-card-send').classList.add('active');
    sendRadio.checked = true;
    destSelectGroup.classList.remove('hidden');
    destSelect.setAttribute('required', 'true');
  }
}

// ====================================================
// PAGE RENDERING: OPERATIONS
// ====================================================
function renderOperationsPage() {
  // Subtitle
  const currentSecObj = state.sectors.find(s => s.id === state.activeContext);
  const contextName = currentSecObj ? currentSecObj.name : 'Geral';
  document.getElementById('ops-page-subtitle').textContent = 
    `Visão do Setor: ${contextName}. Cadastro, acompanhamento e recebimento de atividades.`;
    
  // Populate Form Origin & Destination Sectors
  populateActivityFormSectors();

  // Draw Confirmations List (SLA Flow Subpage 2)
  renderConfirmationsList();
  
  // Draw Active Tasks List
  renderActiveTasksList();
}

function populateActivityFormSectors() {
  const originSelect = document.getElementById('act-origin-sector');
  const destSelect = document.getElementById('act-dest-sector');
  
  originSelect.innerHTML = '';
  destSelect.innerHTML = '';
  
  // Determine allowed origin sectors for this user in current context
  let allowedOrigins = [];
  if (state.currentUser.role === 'admin') {
    // Admin can create for any sector
    allowedOrigins = [...state.sectors];
  } else {
    // Standard user can only create for their linked sectors
    allowedOrigins = state.sectors.filter(s => state.currentUser.sectors.includes(s.id));
  }
  
  allowedOrigins.forEach(sec => {
    const opt = document.createElement('option');
    opt.value = sec.id;
    opt.textContent = sec.name;
    originSelect.appendChild(opt);
  });
  
  // Set default origin based on context
  if (state.activeContext !== 'geral' && state.activeContext !== 'none') {
    originSelect.value = state.activeContext;
    // If user is common user, lock origin to active context to prevent mistakes
    if (state.currentUser.role !== 'admin') {
      originSelect.disabled = true;
    } else {
      originSelect.disabled = false;
    }
  } else {
    originSelect.disabled = false;
  }
  
  // Populate destination options (all sectors except current selected origin)
  const populateDestOptions = () => {
    destSelect.innerHTML = '<option value="">-- Selecione o setor de destino --</option>';
    const selectedOriginId = originSelect.value;
    state.sectors.forEach(sec => {
      if (sec.id !== selectedOriginId) {
        const opt = document.createElement('option');
        opt.value = sec.id;
        opt.textContent = sec.name;
        destSelect.appendChild(opt);
      }
    });
  };
  
  populateDestOptions();
  originSelect.addEventListener('change', populateDestOptions);
}

function renderConfirmationsList() {
  const container = document.getElementById('list-confirmations');
  container.innerHTML = '';
  
  // Filter activities waiting confirmation at destination
  let toConfirm = [];
  if (state.activeContext === 'geral') {
    // Show all waiting confirmations in general view
    toConfirm = state.activities.filter(a => a.status === 'waiting_confirmation');
  } else {
    // Show waiting confirmations where destination is active sector
    toConfirm = state.activities.filter(a => a.status === 'waiting_confirmation' && a.destinationSectorId === state.activeContext);
  }
  
  if (toConfirm.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="inbox"></i>
        <span>Nenhuma atividade aguardando recebimento no setor de destino.</span>
      </div>`;
    return;
  }
  
  toConfirm.forEach(act => {
    const origin = state.sectors.find(s => s.id === act.originSectorId)?.name || 'Desconhecido';
    const current = state.sectors.find(s => s.id === act.currentSectorId)?.name || 'Desconhecido';
    const dest = state.sectors.find(s => s.id === act.destinationSectorId)?.name || 'Desconhecido';
    
    // Calculate transit time
    const elapsed = calculateTimeElapsed(act.sentAt);
    
    const card = document.createElement('div');
    card.className = 'activity-card';
    
    // Verify permission: User must belong to the destination sector to confirm receipt
    const canConfirm = state.currentUser.role === 'admin' || state.currentUser.sectors.includes(act.destinationSectorId);
    const confirmBtnHtml = canConfirm 
      ? `<button class="btn-sm btn-warning" onclick="confirmReceipt('${act.id}')"><i data-lucide="check-circle2"></i> Confirmar Recebimento</button>`
      : `<span style="font-size: 11px; color: var(--text-dark); font-style: italic;">Aguardando setor ${dest}</span>`;
      
    card.innerHTML = `
      <div class="activity-top">
        <div class="activity-title-group">
          <div class="activity-name">${act.name}</div>
          <div class="activity-meta">
            <span class="badge waiting_confirmation">Aguardando Recebimento</span>
            <span><i data-lucide="arrow-right-left"></i> Fluxo: <strong>${current}</strong> &rarr; <strong>${dest}</strong></span>
          </div>
        </div>
        <div class="sla-duration" title="Tempo em trânsito">Há ${elapsed}</div>
      </div>
      ${act.observation ? `<div class="activity-desc">${act.observation}</div>` : ''}
      <div class="activity-meta" style="margin-top: 0;">
        <span><i data-lucide="clock"></i> Prazo Final: <strong>${formatDateTime(act.endDeadline)}</strong></span>
      </div>
      <div class="activity-actions">
        <button class="btn-sm btn-secondary-outline" onclick="openDetailsModal('${act.id}')">Ver SLA</button>
        ${confirmBtnHtml}
      </div>
    `;
    
    container.appendChild(card);
  });
}

function renderActiveTasksList() {
  const container = document.getElementById('list-active-tasks');
  container.innerHTML = '';
  
  // Filter active tasks (status pending, confirmed, completed) in current sector
  let activeTasks = [];
  if (state.activeContext === 'geral') {
    // Show all non-transit activities
    activeTasks = state.activities.filter(a => a.status !== 'waiting_confirmation');
  } else {
    // Show non-transit activities inside active sector
    activeTasks = state.activities.filter(a => a.status !== 'waiting_confirmation' && a.currentSectorId === state.activeContext);
  }
  
  // Sort: completed tasks at the bottom, others sorted by deadline
  activeTasks.sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    return new Date(a.endDeadline) - new Date(b.endDeadline);
  });
  
  if (activeTasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="clipboard-check"></i>
        <span>Nenhuma atividade em andamento no setor atual.</span>
      </div>`;
    return;
  }
  
  activeTasks.forEach(act => {
    const origin = state.sectors.find(s => s.id === act.originSectorId)?.name || 'Desconhecido';
    const current = state.sectors.find(s => s.id === act.currentSectorId)?.name || 'Desconhecido';
    
    const statusText = {
      'pending': 'Pendente',
      'confirmed': 'Confirmado',
      'completed': 'Concluído'
    }[act.status];
    
    const card = document.createElement('div');
    card.className = 'activity-card';
    
    // Check permissions on buttons
    const canManage = state.currentUser.role === 'admin' || state.currentUser.sectors.includes(act.currentSectorId);
    
    let actionButtons = '';
    if (act.status !== 'completed' && canManage) {
      actionButtons = `
        <button class="btn-sm btn-secondary-outline" onclick="openSendModal('${act.id}')"><i data-lucide="send"></i> Encaminhar</button>
        <button class="btn-sm btn-success" onclick="completeActivity('${act.id}')"><i data-lucide="check"></i> Concluir</button>
      `;
    }
    
    card.innerHTML = `
      <div class="activity-top">
        <div class="activity-title-group">
          <div class="activity-name">${act.name}</div>
          <div class="activity-meta">
            <span class="badge ${act.status}">${statusText}</span>
            <span><i data-lucide="folder"></i> Setor: <strong>${current}</strong></span>
            ${act.originSectorId !== act.currentSectorId ? `<span><i data-lucide="corner-down-right"></i> Origem: ${origin}</span>` : ''}
          </div>
        </div>
      </div>
      ${act.observation ? `<div class="activity-desc">${act.observation}</div>` : ''}
      <div class="activity-meta" style="margin-top: 0;">
        <span><i data-lucide="calendar-range"></i> Período: ${formatDateTime(act.startDeadline)} &rarr; ${formatDateTime(act.endDeadline)}</span>
      </div>
      <div class="activity-actions">
        <button class="btn-sm btn-secondary-outline" onclick="openDetailsModal('${act.id}')">SLA & Detalhes</button>
        ${actionButtons}
      </div>
    `;
    
    container.appendChild(card);
  });
}

// Activity Create handler
async function handleActivitySubmit(e) {
  e.preventDefault();
  
  const name = document.getElementById('act-name').value.trim();
  const observation = document.getElementById('act-obs').value.trim();
  const startDeadline = document.getElementById('act-start').value;
  const endDeadline = document.getElementById('act-end').value;
  const originSectorId = document.getElementById('act-origin-sector').value;
  
  const destType = document.querySelector('input[name="dest-type"]:checked').value;
  const destinationSectorId = destType === 'send' ? document.getElementById('act-dest-sector').value : null;

  if (new Date(startDeadline) >= new Date(endDeadline)) {
    showToast('O prazo de início deve ser anterior ao prazo final.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        observation,
        startDeadline: new Date(startDeadline).toISOString(),
        endDeadline: new Date(endDeadline).toISOString(),
        originSectorId,
        destinationSectorId
      })
    });
    
    if (res.ok) {
      showToast('Atividade cadastrada com sucesso!', 'success');
      document.getElementById('activity-form').reset();
      setDestType('local');
      
      await refreshActivities();
      renderOperationsPage();
    } else {
      const err = await res.json();
      showToast(err.message || 'Erro ao cadastrar atividade.', 'error');
    }
  } catch (err) {
    showToast('Erro ao se conectar ao servidor.', 'error');
  }
}

// Confirm receipt SLA transition
window.confirmReceipt = async (id) => {
  try {
    const res = await fetch(`/api/activities/${id}/confirm`, {
      method: 'POST'
    });
    if (res.ok) {
      showToast('Recebimento confirmado! SLA registrado.', 'success');
      await refreshActivities();
      renderOperationsPage();
    } else {
      const err = await res.json();
      showToast(err.message || 'Erro ao confirmar recebimento.', 'error');
    }
  } catch (err) {
    showToast('Erro ao se conectar ao servidor.', 'error');
  }
};

// Finish activity inside sector
window.completeActivity = async (id) => {
  try {
    const res = await fetch(`/api/activities/${id}/complete`, {
      method: 'POST'
    });
    if (res.ok) {
      showToast('Atividade concluída com sucesso!', 'success');
      await refreshActivities();
      renderOperationsPage();
    } else {
      const err = await res.json();
      showToast(err.message || 'Erro ao concluir atividade.', 'error');
    }
  } catch (err) {
    showToast('Erro ao se conectar ao servidor.', 'error');
  }
};

// ====================================================
// PAGE RENDERING: CALENDAR OF DELIVERIES
// ====================================================
function renderCalendarPage() {
  // Setup sector calendar filter options
  const filterSec = document.getElementById('cal-filter-sector');
  const savedVal = filterSec.value;
  filterSec.innerHTML = '<option value="all">Geral (Todos os Setores)</option>';
  state.sectors.forEach(sec => {
    const opt = document.createElement('option');
    opt.value = sec.id;
    opt.textContent = sec.name;
    filterSec.appendChild(opt);
  });
  
  if (state.activeContext !== 'geral' && state.activeContext !== 'none') {
    filterSec.value = state.activeContext;
  } else {
    filterSec.value = savedVal || 'all';
  }

  renderCalendar();
}

function adjustCalendarMonth(val) {
  state.calendarDate.setMonth(state.calendarDate.getMonth() + val);
  renderCalendar();
}

function renderCalendar() {
  const grid = document.getElementById('calendar-cells-grid');
  grid.innerHTML = '';
  
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();
  
  // Set month/year title
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  document.getElementById('calendar-month-year-label').textContent = `${monthNames[month]} ${year}`;
  
  // Get calendar filter criteria
  const filterSector = document.getElementById('cal-filter-sector').value;
  const filterStatus = document.getElementById('cal-filter-status').value;
  
  // First day of current month
  const firstDay = new Date(year, month, 1);
  const startDayIdx = firstDay.getDay(); // 0 is Sunday, 6 is Saturday
  
  // Total days in current month
  const totalDays = new Date(year, month + 1, 0).getDate();
  
  // Total days in previous month (to fill preceding days)
  const prevMonthTotalDays = new Date(year, month, 0).getDate();
  
  // Draw preceding days from previous month
  for (let i = startDayIdx - 1; i >= 0; i--) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day-cell outside';
    dayCell.innerHTML = `<span class="day-number">${prevMonthTotalDays - i}</span>`;
    grid.appendChild(dayCell);
  }
  
  // Draw days of current month
  const today = new Date();
  const isCurrentMonthYear = today.getFullYear() === year && today.getMonth() === month;
  
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cellDate = new Date(year, month, d);
    
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day-cell';
    if (isCurrentMonthYear && today.getDate() === d) {
      dayCell.classList.add('today');
    }
    
    dayCell.innerHTML = `<span class="day-number">${d}</span>`;
    
    // Container for events on this day
    const evContainer = document.createElement('div');
    evContainer.className = 'calendar-events-container';
    
    // Filter activities which intersect with this day
    const dayActivities = state.activities.filter(act => {
      // Filter by sector if specified
      if (filterSector !== 'all') {
        if (act.currentSectorId !== filterSector && act.destinationSectorId !== filterSector) {
          return false;
        }
      }
      // Filter by status if specified
      if (filterStatus !== 'all' && act.status !== filterStatus) {
        return false;
      }
      
      // Check date intersection: activity start to end inclusive
      const start = new Date(act.startDeadline);
      const end = new Date(act.endDeadline);
      
      // Strip time elements for day check
      const startZero = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endZero = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
      
      return cellDate >= startZero && cellDate <= endZero;
    });
    
    // Draw event pills (maximum 3 in vertical box, count rest)
    const maxVisible = 2;
    dayActivities.slice(0, maxVisible).forEach(act => {
      const ev = document.createElement('div');
      ev.className = `calendar-event ${act.status}`;
      ev.textContent = act.name;
      ev.title = act.name;
      ev.addEventListener('click', (e) => {
        e.stopPropagation();
        openDetailsModal(act.id);
      });
      evContainer.appendChild(ev);
    });
    
    if (dayActivities.length > maxVisible) {
      const more = document.createElement('div');
      more.style.fontSize = '9px';
      more.style.fontWeight = 'bold';
      more.style.color = 'var(--text-muted)';
      more.style.textAlign = 'right';
      more.textContent = `+ ${dayActivities.length - maxVisible} mais`;
      evContainer.appendChild(more);
    }
    
    dayCell.appendChild(evContainer);
    grid.appendChild(dayCell);
  }
  
  // Fill in following days from next month to make full week grid row
  const totalCellsWritten = startDayIdx + totalDays;
  const remainingCells = (7 - (totalCellsWritten % 7)) % 7;
  for (let n = 1; n <= remainingCells; n++) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day-cell outside';
    dayCell.innerHTML = `<span class="day-number">${n}</span>`;
    grid.appendChild(dayCell);
  }
  
  lucide.createIcons();
}

// ====================================================
// PAGE RENDERING: CONFIGURATION (ADMIN ONLY)
// ====================================================
function renderAdminPage() {
  if (state.adminTab === 'sectors') {
    renderAdminSectors();
  } else {
    renderAdminUsers();
  }
}

function renderAdminSectors() {
  const tbody = document.getElementById('table-sectors-body');
  tbody.innerHTML = '';
  
  if (state.sectors.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted)">Nenhum setor cadastrado.</td></tr>`;
    return;
  }
  
  state.sectors.forEach(sec => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600;">${sec.name}</td>
      <td style="color: var(--text-muted);">${sec.description || '-'}</td>
      <td style="text-align: center;">
        <div style="display: flex; gap: 8px; justify-content: center;">
          <button class="btn-sm btn-secondary-outline" onclick="editSector('${sec.id}')" title="Editar"><i data-lucide="edit-3" style="width: 14px; height: 14px;"></i></button>
          <button class="btn-sm btn-danger-outline" onclick="deleteSector('${sec.id}')" title="Excluir"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAdminUsers() {
  const tbody = document.getElementById('table-users-body');
  tbody.innerHTML = '';
  
  // Load checklist of sectors in form
  const chkContainer = document.getElementById('user-sectors-checklist');
  chkContainer.innerHTML = '';
  
  state.sectors.forEach(sec => {
    const div = document.createElement('div');
    div.className = 'sector-select-item';
    div.innerHTML = `
      <input type="checkbox" id="user-chk-sec-${sec.id}" value="${sec.id}">
      <label for="user-chk-sec-${sec.id}">${sec.name}</label>
    `;
    chkContainer.appendChild(div);
  });
  
  // Handle role selection to toggle checklist display (Admin does not require sector bindings)
  const roleSelect = document.getElementById('user-role');
  const checklistGroup = document.getElementById('user-sectors-checklist-group');
  
  const toggleChecklist = () => {
    if (roleSelect.value === 'admin') {
      checklistGroup.classList.add('hidden');
    } else {
      checklistGroup.classList.remove('hidden');
    }
  };
  
  roleSelect.removeEventListener('change', toggleChecklist);
  roleSelect.addEventListener('change', toggleChecklist);
  toggleChecklist();

  if (state.users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted)">Nenhum usuário cadastrado.</td></tr>`;
    return;
  }

  state.users.forEach(usr => {
    const roleBadge = usr.role === 'admin' 
      ? '<span class="badge" style="background: rgba(99,102,241,0.15); color: var(--primary);">Administrador</span>' 
      : '<span class="badge pending">Comum</span>';
      
    // Format linked sectors list
    let sectorTags = '';
    if (usr.role === 'admin') {
      sectorTags = '<span class="tag-mini" style="background: rgba(99,102,241,0.1); color: var(--primary); border-color: rgba(99,102,241,0.2)">Todos (Admin)</span>';
    } else if (usr.sectors.length === 0) {
      sectorTags = '<span class="tag-mini" style="color: #ef4444; border-color: rgba(239,68,68,0.2)">Nenhum</span>';
    } else {
      usr.sectors.forEach(sId => {
        const name = state.sectors.find(s => s.id === sId)?.name || sId;
        sectorTags += `<span class="tag-mini">${name}</span> `;
      });
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600;">${usr.username}</td>
      <td>${roleBadge}</td>
      <td><div class="user-sectors-tags">${sectorTags}</div></td>
      <td style="text-align: center;">
        <div style="display: flex; gap: 8px; justify-content: center;">
          <button class="btn-sm btn-secondary-outline" onclick="editUser('${usr.id}')" title="Editar"><i data-lucide="edit-3" style="width: 14px; height: 14px;"></i></button>
          <button class="btn-sm btn-danger-outline" onclick="deleteUser('${usr.id}')" title="Excluir" ${usr.id === state.currentUser.id ? 'disabled' : ''}><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// -------------------------
// SECTOR ACTIONS
// -------------------------
async function handleSectorSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('sector-id').value;
  const name = document.getElementById('sector-name').value.trim();
  const description = document.getElementById('sector-desc').value.trim();
  
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/sectors/${id}` : '/api/sectors';
  
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });
    
    if (res.ok) {
      showToast(id ? 'Setor atualizado com sucesso!' : 'Setor cadastrado com sucesso!', 'success');
      resetSectorForm();
      await loadAppData();
    } else {
      const err = await res.json();
      showToast(err.message || 'Erro ao salvar setor.', 'error');
    }
  } catch (err) {
    showToast('Falha na comunicação com o servidor.', 'error');
  }
}

window.editSector = (id) => {
  const sec = state.sectors.find(s => s.id === id);
  if (!sec) return;
  
  document.getElementById('sector-id').value = sec.id;
  document.getElementById('sector-name').value = sec.name;
  document.getElementById('sector-desc').value = sec.description;
  
  document.getElementById('sector-form-title').textContent = 'Editar Setor';
  document.getElementById('btn-sector-cancel').classList.remove('hidden');
  
  // Focus name field
  document.getElementById('sector-name').focus();
};

function resetSectorForm() {
  document.getElementById('sector-id').value = '';
  document.getElementById('sector-form').reset();
  document.getElementById('sector-form-title').textContent = 'Cadastrar Setor';
  document.getElementById('btn-sector-cancel').classList.add('hidden');
}

window.deleteSector = async (id) => {
  if (!confirm('Deseja realmente excluir este setor? Isso removerá o setor de todos os usuários vinculados.')) return;
  
  try {
    const res = await fetch(`/api/sectors/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Setor excluído com sucesso!', 'success');
      await loadAppData();
    } else {
      const err = await res.json();
      showToast(err.message || 'Erro ao excluir setor.', 'error');
    }
  } catch (err) {
    showToast('Falha na comunicação com o servidor.', 'error');
  }
};

// -------------------------
// USER ACTIONS
// -------------------------
async function handleUserSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('user-id').value;
  const username = document.getElementById('user-name').value.trim();
  const password = document.getElementById('user-pass').value;
  const role = document.getElementById('user-role').value;
  
  // Get checked sectors
  const sectors = [];
  if (role !== 'admin') {
    document.querySelectorAll('#user-sectors-checklist input[type="checkbox"]:checked').forEach(chk => {
      sectors.push(chk.value);
    });
  }
  
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/users/${id}` : '/api/users';
  
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role, sectors })
    });
    
    if (res.ok) {
      showToast(id ? 'Usuário atualizado!' : 'Usuário cadastrado!', 'success');
      resetUserForm();
      await loadAppData();
    } else {
      const err = await res.json();
      showToast(err.message || 'Erro ao salvar usuário.', 'error');
    }
  } catch (err) {
    showToast('Falha na comunicação com o servidor.', 'error');
  }
}

window.editUser = (id) => {
  const usr = state.users.find(u => u.id === id);
  if (!usr) return;
  
  document.getElementById('user-id').value = usr.id;
  document.getElementById('user-name').value = usr.username;
  document.getElementById('user-role').value = usr.role;
  
  // If editing, password is not required (leave empty to keep same)
  const passEl = document.getElementById('user-pass');
  passEl.removeAttribute('required');
  passEl.placeholder = 'Deixe em branco para manter a atual';
  document.getElementById('user-pass-label').innerHTML = 'Senha <span style="font-size:9px; color:var(--text-muted)">(Opcional)</span>';
  
  // Checkboxes
  document.querySelectorAll('#user-sectors-checklist input[type="checkbox"]').forEach(chk => {
    chk.checked = usr.sectors.includes(chk.value);
  });
  
  // Trigger change to update sectors layout visibility
  const event = new Event('change');
  document.getElementById('user-role').dispatchEvent(event);
  
  document.getElementById('user-form-title').textContent = 'Editar Usuário';
  document.getElementById('btn-user-cancel').classList.remove('hidden');
  
  document.getElementById('user-name').focus();
};

function resetUserForm() {
  document.getElementById('user-id').value = '';
  document.getElementById('user-form').reset();
  
  const passEl = document.getElementById('user-pass');
  passEl.setAttribute('required', 'true');
  passEl.placeholder = 'Digite a senha';
  document.getElementById('user-pass-label').textContent = 'Senha';
  
  document.getElementById('user-form-title').textContent = 'Cadastrar Usuário';
  document.getElementById('btn-user-cancel').classList.add('hidden');
  
  // Uncheck all sectors
  document.querySelectorAll('#user-sectors-checklist input[type="checkbox"]').forEach(chk => {
    chk.checked = false;
  });
  
  // Trigger role update checklist
  const event = new Event('change');
  document.getElementById('user-role').dispatchEvent(event);
}

window.deleteUser = async (id) => {
  if (id === state.currentUser.id) {
    showToast('Você não pode excluir o seu próprio usuário logado.', 'error');
    return;
  }
  
  if (!confirm('Deseja realmente excluir este usuário?')) return;
  
  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Usuário excluído com sucesso!', 'success');
      await loadAppData();
    } else {
      const err = await res.json();
      showToast(err.message || 'Erro ao excluir usuário.', 'error');
    }
  } catch (err) {
    showToast('Falha na comunicação com o servidor.', 'error');
  }
};

// ====================================================
// MODAL & TRANSFER FLOWS
// ====================================================
window.openSendModal = (id) => {
  const act = state.activities.find(a => a.id === id);
  if (!act) return;
  
  document.getElementById('send-activity-id').value = act.id;
  
  // Fill target sector selector excluding current sector
  const select = document.getElementById('send-dest-sector');
  select.innerHTML = '<option value="">-- Selecione o setor de destino --</option>';
  state.sectors.forEach(sec => {
    if (sec.id !== act.currentSectorId) {
      const opt = document.createElement('option');
      opt.value = sec.id;
      opt.textContent = sec.name;
      select.appendChild(opt);
    }
  });
  
  openModal('send-modal');
};

async function handleSendSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('send-activity-id').value;
  const destinationSectorId = document.getElementById('send-dest-sector').value;
  
  try {
    const res = await fetch(`/api/activities/${id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinationSectorId })
    });
    
    if (res.ok) {
      showToast('Atividade encaminhada com sucesso!', 'success');
      closeModal('send-modal');
      await refreshActivities();
      renderOperationsPage();
    } else {
      const err = await res.json();
      showToast(err.message || 'Erro ao encaminhar atividade.', 'error');
    }
  } catch (err) {
    showToast('Erro ao se conectar ao servidor.', 'error');
  }
}

// SLA Details Modal
window.openDetailsModal = (id) => {
  const act = state.activities.find(a => a.id === id);
  if (!act) return;
  
  document.getElementById('details-act-name').textContent = act.name;
  document.getElementById('details-act-obs').textContent = act.observation || 'Nenhuma observação cadastrada.';
  document.getElementById('details-act-start').textContent = formatDateTime(act.startDeadline);
  document.getElementById('details-act-end').textContent = formatDateTime(act.endDeadline);
  
  // Current sector
  const currentSec = state.sectors.find(s => s.id === act.currentSectorId)?.name || 'Desconhecido';
  const destSec = act.destinationSectorId ? state.sectors.find(s => s.id === act.destinationSectorId)?.name : null;
  
  document.getElementById('details-act-current').textContent = destSec ? `${currentSec} ➔ Trânsito` : currentSec;
  
  // Status badge
  const statusBadge = document.getElementById('details-act-status');
  statusBadge.className = '';
  
  const statusText = {
    'pending': 'Pendente',
    'waiting_confirmation': 'Aguardando Recebimento',
    'confirmed': 'Confirmado',
    'completed': 'Concluído'
  }[act.status];
  
  statusBadge.className = `badge ${act.status}`;
  statusBadge.textContent = statusText;
  
  // Timeline building
  const timeline = document.getElementById('details-act-timeline');
  timeline.innerHTML = '';
  
  // Base creation item
  const creator = state.users.find(u => u.id === act.createdBy)?.username || 'Usuário';
  const originName = state.sectors.find(s => s.id === act.originSectorId)?.name || 'Setor Inicial';
  const baseItem = document.createElement('div');
  baseItem.className = 'sla-timeline-item completed';
  baseItem.innerHTML = `
    <div class="sla-flow-header">Atividade Cadastrada</div>
    <div class="sla-flow-times">Por <strong>${creator}</strong> no setor <strong>${originName}</strong> em ${formatDateTime(act.createdAt)}</div>
  `;
  timeline.appendChild(baseItem);
  
  // Process history movements
  if (act.slaHistory && act.slaHistory.length > 0) {
    act.slaHistory.forEach((step, idx) => {
      const fromName = state.sectors.find(s => s.id === step.fromSectorId)?.name || step.fromSectorId;
      const toName = state.sectors.find(s => s.id === step.toSectorId)?.name || step.toSectorId;
      
      const item = document.createElement('div');
      
      if (step.confirmedAt) {
        item.className = 'sla-timeline-item completed';
        const slaText = formatDuration(step.durationMs);
        item.innerHTML = `
          <div class="sla-flow-header">Transferência: ${fromName} &rarr; ${toName}</div>
          <div class="sla-flow-times">
            Enviado em: ${formatDateTime(step.sentAt)}<br>
            Recebido em: ${formatDateTime(step.confirmedAt)}<br>
            <span style="color: var(--secondary); font-weight: 600;">SLA de Recebimento: ${slaText}</span>
          </div>
        `;
      } else {
        item.className = 'sla-timeline-item waiting';
        const pendingFor = calculateTimeElapsed(step.sentAt);
        item.innerHTML = `
          <div class="sla-flow-header" style="color: var(--status-waiting)">Trânsito: ${fromName} &rarr; ${toName}</div>
          <div class="sla-flow-times">
            Enviado em: ${formatDateTime(step.sentAt)}<br>
            <span style="color: var(--status-waiting); font-weight: 600;">Aguardando confirmação há: ${pendingFor}</span>
          </div>
        `;
      }
      timeline.appendChild(item);
    });
  }
  
  // Base completion item
  if (act.status === 'completed') {
    const endItem = document.createElement('div');
    endItem.className = 'sla-timeline-item completed';
    
    // Total closing cycle duration
    const totalDuration = new Date(act.completedAt).getTime() - new Date(act.createdAt).getTime();
    
    endItem.innerHTML = `
      <div class="sla-flow-header" style="color: var(--status-completed)">Atividade Concluída</div>
      <div class="sla-flow-times">
        Conclusão em: ${formatDateTime(act.completedAt)}<br>
        <span style="color: var(--status-completed); font-weight: 600;">Ciclo total de fechamento: ${formatDuration(totalDuration)}</span>
      </div>
    `;
    timeline.appendChild(endItem);
  }
  
  openModal('details-modal');
};

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.add('active');
  lucide.createIcons();
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.remove('active');
}

// ====================================================
// UTILITY FUNCTIONS
// ====================================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'info';
  if (type === 'success') icon = 'check-circle';
  if (type === 'error') icon = 'alert-triangle';
  if (type === 'warning') icon = 'alert-circle';
  
  toast.innerHTML = `
    <i data-lucide="${icon}"></i>
    <div style="font-size: 13px; font-weight: 500;">${message}</div>
  `;
  
  container.appendChild(toast);
  lucide.createIcons();
  
  // Remove after 4 seconds
  setTimeout(() => {
    toast.style.animation = 'slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) reverse forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

function formatDateTime(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '-';
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// Calculates elapsed time format for active waitings (e.g. 2h 4m)
function calculateTimeElapsed(sentAtIso) {
  if (!sentAtIso) return '-';
  const sent = new Date(sentAtIso).getTime();
  const now = new Date().getTime();
  const diff = now - sent;
  return formatDuration(diff);
}

// Format millisecond duration into text (e.g. 2d 4h 12m)
function formatDuration(ms) {
  if (ms < 0) return '0m';
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hours = Math.floor(min / 60);
  const days = Math.floor(hours / 24);
  
  const remMin = min % 60;
  const remHours = hours % 24;
  
  let out = [];
  if (days > 0) out.push(`${days}d`);
  if (hours > 0) out.push(`${remHours}h`);
  out.push(`${remMin}m`);
  
  return out.join(' ');
}
