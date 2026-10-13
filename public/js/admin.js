let teams = [];
let members = [];
let events = [];
let dateSurveys = [];

async function init() {
  await loadTeams();
  await loadMembers();
  await loadEvents();
  await loadDefaultMenus();
}

// ===== 탭 전환 =====
function showTab(tab) {
  ['event', 'datesurvey', 'member', 'coffee', 'dispatch', 'summary'].forEach(t => {
    document.getElementById(`section-${t}`).classList.add('hidden');
    document.getElementById(`tab-${t}`).classList.remove('active');
  });
  document.getElementById(`section-${tab}`).classList.remove('hidden');
  document.getElementById(`tab-${tab}`).classList.add('active');

  if (tab === 'summary') loadSummary();
  if (tab === 'coffee') loadDefaultMenus();
  if (tab === 'dispatch') initDispatch();
  if (tab === 'datesurvey') loadDateSurveys();
}

// ===== 팀 =====
async function loadTeams() {
  const res = await fetch('/api/teams');
  teams = await res.json();

  const list = document.getElementById('team-list');
  list.innerHTML = teams.map(t => `
    <div class="list-item">
      <span>${t.name}</span>
      <button class="del-btn" onclick="deleteTeam(${t.id})">삭제</button>
    </div>
  `).join('');

  const sel = document.getElementById('member-team-select');
  sel.innerHTML = teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
}

async function addTeam() {
  const name = document.getElementById('team-name-input').value.trim();
  if (!name) return alert('팀 이름을 입력해주세요!');
  await fetch('/api/teams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  document.getElementById('team-name-input').value = '';
  await loadTeams();
}

async function deleteTeam(id) {
  if (!confirm('팀을 삭제할까요? 소속 인원도 영향받을 수 있어요.')) return;
  await fetch(`/api/teams/${id}`, { method: 'DELETE' });
  await loadTeams();
}

// ===== 인원 =====
async function loadMembers() {
  const res = await fetch('/api/members');
  members = await res.json();

  const list = document.getElementById('member-list-admin');

  const groups = {};
  members.forEach(m => {
    const team = m.team_name || '기타';
    if (!groups[team]) groups[team] = [];
    groups[team].push(m);
  });

  list.innerHTML = Object.entries(groups).map(([team, members]) => `
    <div class="team-group" style="margin-bottom:8px;">
      <div class="team-header">${team}</div>
      ${members.map(m => `
        <div class="list-item">
          <span>${m.name} <span style="color:#888;font-size:13px;">${m.rank || ''} ${m.workplace ? '· ' + m.workplace : ''}</span></span>
          <button class="del-btn" onclick="deleteMember(${m.id})">삭제</button>
        </div>
      `).join('')}
    </div>
  `).join('');
}

async function addMember() {
  const team_id = document.getElementById('member-team-select').value;
  const name = document.getElementById('member-name-input').value.trim();
  const rank = document.getElementById('member-rank-input').value.trim();
  const workplace = document.getElementById('member-workplace-input').value.trim();
  if (!name) return alert('이름을 입력해주세요!');
  await fetch('/api/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team_id, name, rank, workplace })
  });
  document.getElementById('member-name-input').value = '';
  document.getElementById('member-rank-input').value = '';
  document.getElementById('member-workplace-input').value = '';
  await loadMembers();
}

async function deleteMember(id) {
  if (!confirm('이 인원을 삭제할까요?')) return;
  try {
    const res = await fetch(`/api/members/${id}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) {
      console.error('삭제 실패:', data);
      alert('❌ 삭제 실패했어요!\n\n원인: ' + (data.error || 'Unknown error'));
      return;
    }

    alert('✅ 인원이 삭제되었어요!');
    await loadMembers();
  } catch (err) {
    console.error('삭제 중 오류:', err);
    alert('❌ 오류가 발생했어요:\n' + err.message);
  }
}

// ===== 이벤트 =====
async function loadEvents() {
  const res = await fetch('/api/events');
  events = await res.json();

  const list = document.getElementById('event-list');
  if (events.length === 0) {
    list.innerHTML = '<p style="color:#aaa;font-size:14px;">등록된 이벤트가 없어요.</p>';
  } else {
    list.innerHTML = events.map(e => `
      <div class="list-item">
        <span>
          <strong>${e.title}</strong>
          ${e.restaurant ? `· 📍${e.restaurant}` : ''}
          ${e.is_coffee_enabled ? '· ☕커피O' : '· ☕커피X'}
          ${e.is_closed ? '· 🔒마감' : '· 🟢진행중'}
        </span>
        <div style="display:flex;gap:6px;">
          <button class="edit-btn" onclick="openEditModal(${e.id})">수정</button>
          <button class="del-btn" onclick="deleteEvent(${e.id})">삭제</button>
        </div>
      </div>
    `).join('');
  }

  const coffSel = document.getElementById('coffee-event-select');
  coffSel.innerHTML = events.map(e => `<option value="${e.id}">${e.title}</option>`).join('');
  if (events.length > 0) loadCoffeeMenus(events[0].id);

  const customSel = document.getElementById('custom-field-event-select');
  customSel.innerHTML = events.map(e => `<option value="${e.id}">${e.title}</option>`).join('');
  if (events.length > 0) loadCustomFields();

  const sumSel = document.getElementById('summary-event-select');
  sumSel.innerHTML = events.map(e => `<option value="${e.id}">${e.title}</option>`).join('');
}

async function addEvent() {
  const title = document.getElementById('event-title').value.trim();
  const restaurant = document.getElementById('event-restaurant').value.trim();
  const restaurant_url = document.getElementById('event-restaurant-url').value.trim();
  const restaurant_address = document.getElementById('event-restaurant-address').value.trim();
  const is_coffee_enabled = document.getElementById('event-coffee').checked ? 1 : 0;
  if (!title) return alert('회식 제목을 입력해주세요!');
  await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, restaurant, restaurant_url, restaurant_address, is_coffee_enabled })
  });
  document.getElementById('event-title').value = '';
  document.getElementById('event-restaurant').value = '';
  document.getElementById('event-restaurant-url').value = '';
  document.getElementById('event-restaurant-address').value = '';
  await loadEvents();
}

async function deleteEvent(id) {
  if (!confirm('이벤트를 삭제할까요? 관련 응답도 모두 삭제돼요.')) return;
  await fetch(`/api/events/${id}`, { method: 'DELETE' });
  await loadEvents();
}

function openEditModal(id) {
  const event = events.find(e => e.id === id);
  if (!event) return;

  document.getElementById('edit-event-id').value = event.id;
  document.getElementById('edit-event-title').value = event.title || '';
  document.getElementById('edit-event-restaurant').value = event.restaurant || '';
  document.getElementById('edit-event-restaurant-address').value = event.restaurant_address || '';
  document.getElementById('edit-event-restaurant-url').value = event.restaurant_url || '';
  document.getElementById('edit-event-coffee').checked = event.is_coffee_enabled === 1;
  document.getElementById('edit-event-closed').checked = event.is_closed === 1;

  document.getElementById('event-edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('event-edit-modal').classList.add('hidden');
}

async function submitEditEvent() {
  const id = document.getElementById('edit-event-id').value;
  const title = document.getElementById('edit-event-title').value.trim();
  const restaurant = document.getElementById('edit-event-restaurant').value.trim();
  const restaurant_address = document.getElementById('edit-event-restaurant-address').value.trim();
  const restaurant_url = document.getElementById('edit-event-restaurant-url').value.trim();
  const is_coffee_enabled = document.getElementById('edit-event-coffee').checked ? 1 : 0;
  const is_closed = document.getElementById('edit-event-closed').checked ? 1 : 0;

  if (!title) return alert('회식 제목을 입력해주세요!');

  await fetch(`/api/events/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, restaurant, restaurant_url, restaurant_address, is_coffee_enabled, is_closed })
  });

  alert('수정됐어요! ✅');
  closeEditModal();
  await loadEvents();
}

// ===== 커피 메뉴 =====
async function loadCoffeeMenus(eventId) {
  if (!eventId) return;
  const res = await fetch(`/api/coffee-menus/${eventId}`);
  const menus = await res.json();

  const list = document.getElementById('coffee-menu-list');
  list.innerHTML = menus.map(m => `
    <div class="list-item">
      <span>${m.name}</span>
      <button class="del-btn" onclick="deleteCoffeeMenu(${m.id})">삭제</button>
    </div>
  `).join('');
}

async function addCoffeeMenu() {
  const eventId = document.getElementById('coffee-event-select').value;
  const name = document.getElementById('coffee-menu-input').value.trim();
  if (!name) return alert('메뉴명을 입력해주세요!');
  if (!eventId) return alert('이벤트를 먼저 선택해주세요!');
  await fetch('/api/coffee-menus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id: eventId, name })
  });
  document.getElementById('coffee-menu-input').value = '';
  await loadCoffeeMenus(eventId);
}

async function deleteCoffeeMenu(id) {
  const eventId = document.getElementById('coffee-event-select').value;
  await fetch(`/api/coffee-menus/${id}`, { method: 'DELETE' });
  await loadCoffeeMenus(eventId);
}

document.getElementById('coffee-event-select').addEventListener('change', (e) => {
  loadCoffeeMenus(e.target.value);
});

// ===== 기본 커피 메뉴 =====
async function loadDefaultMenus() {
  const res = await fetch('/api/default-coffee-menus');
  const menus = await res.json();

  const list = document.getElementById('default-coffee-list');
  list.innerHTML = menus.map(m => `
    <div class="list-item">
      <span>${m.name}</span>
      <button class="del-btn" onclick="deleteDefaultMenu(${m.id})">삭제</button>
    </div>
  `).join('');
}

async function addDefaultMenu() {
  const name = document.getElementById('default-coffee-input').value.trim();
  if (!name) return alert('메뉴명을 입력해주세요!');
  await fetch('/api/default-coffee-menus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  document.getElementById('default-coffee-input').value = '';
  await loadDefaultMenus();
}

async function deleteDefaultMenu(id) {
  if (!confirm('기본 메뉴에서 삭제할까요?')) return;
  await fetch(`/api/default-coffee-menus/${id}`, { method: 'DELETE' });
  await loadDefaultMenus();
}

// ===== 커스텀 항목 =====
async function loadCustomFields() {
  const eventId = document.getElementById('custom-field-event-select').value;
  if (!eventId) return;

  const res = await fetch(`/api/custom-fields/${eventId}`);
  const fields = await res.json();

  const container = document.getElementById('custom-fields-container');

  if (fields.length === 0) {
    container.innerHTML = '<p style="color:#aaa;font-size:14px;margin-bottom:8px;">등록된 항목이 없어요.</p>';
    return;
  }

  container.innerHTML = fields.map(field => `
    <div class="custom-field-item" id="custom-field-${field.id}">
      <div class="custom-field-header">
        <span class="custom-field-name">📌 ${field.field_name}</span>
        <button class="del-btn" onclick="deleteCustomField(${field.id})">항목 삭제</button>
      </div>
      <div class="custom-options-list" id="custom-options-${field.id}">
        ${field.options.map(opt => `
          <div class="custom-option-item">
            <span>${opt.option_name}</span>
            <button class="del-btn" onclick="deleteCustomOption(${opt.id})">삭제</button>
          </div>
        `).join('')}
      </div>
      <div class="custom-option-add">
        <input type="text" id="option-input-${field.id}" placeholder="선택지 입력 (예: 삼겹살)" />
        <button onclick="addCustomOption(${field.id})">+ 선택지 추가</button>
      </div>
    </div>
  `).join('');
}

async function addCustomField() {
  const eventId = document.getElementById('custom-field-event-select').value;
  if (!eventId) return alert('회식을 먼저 선택해주세요!');

  const name = prompt('추가할 항목 이름을 입력해주세요!\n(예: 점심메뉴, 디저트, 음료)');
  if (!name || !name.trim()) return;

  await fetch('/api/custom-fields', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id: eventId, field_name: name.trim() })
  });

  await loadCustomFields();
}

async function deleteCustomField(fieldId) {
  if (!confirm('이 항목과 모든 선택지를 삭제할까요?')) return;
  await fetch(`/api/custom-fields/${fieldId}`, { method: 'DELETE' });
  await loadCustomFields();
}

async function addCustomOption(fieldId) {
  const input = document.getElementById(`option-input-${fieldId}`);
  const name = input.value.trim();
  if (!name) return alert('선택지를 입력해주세요!');

  await fetch('/api/custom-field-options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_id: fieldId, option_name: name })
  });

  input.value = '';
  await loadCustomFields();
}

async function deleteCustomOption(optionId) {
  await fetch(`/api/custom-field-options/${optionId}`, { method: 'DELETE' });
  await loadCustomFields();
}

// ===== 응답 현황 =====
async function loadSummary() {
  const eventId = document.getElementById('summary-event-select').value;
  if (!eventId) return;

  const res = await fetch(`/api/responses/${eventId}`);
  const responses = await res.json();

  const allMembersRes = await fetch('/api/members');
  const allMembers = await allMembersRes.json();

  const customFieldsRes = await fetch(`/api/custom-fields/${eventId}`);
  const customFields = await customFieldsRes.json();

  const customResponsesRes = await fetch(`/api/custom-responses/${eventId}`);
  const customResponses = await customResponsesRes.json();

  const attending = responses.filter(r => r.is_attending === 1).length;
  const absent = responses.filter(r => r.is_attending === 0).length;
  const noResponse = allMembers.length - responses.length;

  // 미응답자 명단
  const respondedIds = new Set(responses.map(r => r.member_id));
  const notResponded = allMembers.filter(m => !respondedIds.has(m.id));

  document.getElementById('summary-stats').innerHTML = `
    ✅ 참석 <strong>${attending}명</strong> &nbsp;
    ❌ 미참석 <strong>${absent}명</strong> &nbsp;
    ⏳ 미응답 <strong>${noResponse}명</strong> &nbsp;
    👥 전체 <strong>${allMembers.length}명</strong>
    ${notResponded.length > 0 ? `
      <div style="margin-top:12px;padding:12px;background:#fff8e1;border-radius:8px;font-size:14px;">
        ⏳ <strong>미응답자:</strong> ${notResponded.map(m => `${m.name} ${m.rank || ''}`).join(', ')}
      </div>
    ` : '<div style="margin-top:12px;padding:12px;background:#e6f9ee;border-radius:8px;font-size:14px;">🎉 모든 인원이 응답했어요!</div>'}
  `;

  // 커피 집계
  const event = events.find(e => e.id === parseInt(eventId));
  if (event && event.is_coffee_enabled) {
    const coffeeCount = {};
    responses.forEach(r => {
      if (r.is_attending === 1 && r.coffee_name) {
        const key = r.coffee_name;
        if (!coffeeCount[key]) coffeeCount[key] = { HOT: 0, ICE: 0, 미선택: 0 };
        const hotIce = r.hot_ice || '미선택';
        coffeeCount[key][hotIce] = (coffeeCount[key][hotIce] || 0) + 1;
      }
    });

    const coffeeMenuNames = Object.keys(coffeeCount);
    if (coffeeMenuNames.length > 0) {
      const totalHot = Object.values(coffeeCount).reduce((s, v) => s + (v.HOT || 0), 0);
      const totalIce = Object.values(coffeeCount).reduce((s, v) => s + (v.ICE || 0), 0);
      const totalNone = Object.values(coffeeCount).reduce((s, v) => s + (v.미선택 || 0), 0);

      document.getElementById('summary-coffee-wrap').innerHTML = `
        <div class="admin-section">
          <h3>☕ 커피 주문 집계</h3>
          <table class="summary-table" style="margin-top:12px;">
            <thead>
              <tr>
                <th>메뉴</th>
                <th>☕ HOT</th>
                <th>🧊 ICE</th>
                <th>미선택</th>
                <th>합계</th>
              </tr>
            </thead>
            <tbody>
              ${coffeeMenuNames.map(name => {
                const hot = coffeeCount[name].HOT || 0;
                const ice = coffeeCount[name].ICE || 0;
                const none = coffeeCount[name].미선택 || 0;
                const total = hot + ice + none;
                return `
                  <tr>
                    <td><strong>${name}</strong></td>
                    <td>${hot > 0 ? `<span class="badge-hot">${hot}잔</span>` : '-'}</td>
                    <td>${ice > 0 ? `<span class="badge-ice">${ice}잔</span>` : '-'}</td>
                    <td>${none > 0 ? none + '잔' : '-'}</td>
                    <td><strong>${total}잔</strong></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr style="background:#f0f4f8;font-weight:700;">
                <td>합계</td>
                <td>${totalHot > 0 ? `<span class="badge-hot">${totalHot}잔</span>` : '-'}</td>
                <td>${totalIce > 0 ? `<span class="badge-ice">${totalIce}잔</span>` : '-'}</td>
                <td>${totalNone > 0 ? totalNone + '잔' : '-'}</td>
                <td><strong>${totalHot + totalIce + totalNone}잔</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    } else {
      document.getElementById('summary-coffee-wrap').innerHTML = '';
    }
  } else {
    document.getElementById('summary-coffee-wrap').innerHTML = '';
  }

  const groups = {};
  allMembers.forEach(m => {
    const team = m.team_name || '기타';
    if (!groups[team]) groups[team] = [];
    groups[team].push(m);
  });

  const customHeaders = customFields.map(f => `<th>${f.field_name}</th>`).join('');

  let tableHtml = `
    <table class="summary-table">
      <thead>
        <tr>
          <th>팀</th>
          <th>이름</th>
          <th>직급</th>
          <th>참석여부</th>
          <th>커피</th>
          <th>HOT/ICE</th>
          ${customHeaders}
          <th>비고</th>
        </tr>
      </thead>
      <tbody>
  `;

  Object.entries(groups).forEach(([team, members]) => {
    members.forEach((m, i) => {
      const r = responses.find(r => r.member_id === m.id);
      const attendBadge = r
        ? (r.is_attending === 1
          ? '<span class="badge-attend">✅ 참석</span>'
          : '<span class="badge-absent">❌ 미참석</span>')
        : '<span class="badge-none">미응답</span>';

      const customCells = customFields.map(f => {
        const cr = customResponses.find(cr => cr.member_id === m.id && cr.field_id === f.id);
        return `<td>${cr ? cr.option_name : '-'}</td>`;
      }).join('');

      tableHtml += `
        <tr>
          <td>${i === 0 ? team : ''}</td>
          <td>${m.name}</td>
          <td>${m.rank || '-'}</td>
          <td>${attendBadge}</td>
          <td>${r?.coffee_name || '-'}</td>
          <td>${r?.hot_ice || '-'}</td>
          ${customCells}
          <td>${r?.note || '-'}</td>
        </tr>
      `;
    });
  });

  tableHtml += '</tbody></table>';
  document.getElementById('summary-table-wrap').innerHTML = tableHtml;
}

// ===== 날짜 조사 =====
async function loadDateSurveys() {
  const res = await fetch('/api/date-surveys');
  dateSurveys = await res.json();

  const list = document.getElementById('datesurvey-list');
  if (dateSurveys.length === 0) {
    list.innerHTML = '<p style="color:#aaa;font-size:14px;">등록된 날짜 조사가 없어요.</p>';
  } else {
    list.innerHTML = dateSurveys.map(s => `
      <div class="list-item">
        <span>
          <strong>${s.title}</strong>
          · ${formatDate(s.start_date)} ~ ${formatDate(s.end_date)}
          ${s.is_closed ? '· 🔒마감' : '· 🟢진행중'}
        </span>
        <div style="display:flex;gap:6px;">
          <button class="edit-btn" onclick="openDateSurveyTargetModal(${s.id})">대상설정</button>
          <button class="edit-btn" onclick="openDateSurveyEditModal(${s.id})">수정</button>
          <button class="del-btn" onclick="deleteDateSurvey(${s.id})">삭제</button>
        </div>
      </div>
    `).join('');
  }

  const sel = document.getElementById('datesurvey-result-select');
  sel.innerHTML = dateSurveys.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
  if (dateSurveys.length > 0) loadDateSurveyResult();
}

async function addDateSurvey() {
  const title = document.getElementById('datesurvey-title').value.trim();
  const start_date = document.getElementById('datesurvey-start').value;
  const end_date = document.getElementById('datesurvey-end').value;

  if (!title) return alert('조사 제목을 입력해주세요!');
  if (!start_date || !end_date) return alert('날짜 범위를 입력해주세요!');
  if (start_date > end_date) return alert('시작 날짜가 종료 날짜보다 늦을 수 없어요!');

  const res = await fetch('/api/date-surveys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, start_date, end_date })
  });
  const data = await res.json();

  // 전체 인원을 기본 대상으로 설정
  const member_ids = members.map(m => m.id);
  await fetch('/api/date-survey-targets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ survey_id: data.id, member_ids })
  });

  document.getElementById('datesurvey-title').value = '';
  document.getElementById('datesurvey-start').value = '';
  document.getElementById('datesurvey-end').value = '';
  await loadDateSurveys();
  alert('날짜 조사가 등록됐어요! ✅\n대상 설정 버튼으로 조사 대상을 수정할 수 있어요.');
}

async function deleteDateSurvey(id) {
  if (!confirm('날짜 조사를 삭제할까요? 모든 응답도 삭제돼요.')) return;
  await fetch(`/api/date-surveys/${id}`, { method: 'DELETE' });
  await loadDateSurveys();
}

function openDateSurveyEditModal(id) {
  const survey = dateSurveys.find(s => s.id === id);
  if (!survey) return;

  document.getElementById('edit-datesurvey-id').value = survey.id;
  document.getElementById('edit-datesurvey-title').value = survey.title || '';
  document.getElementById('edit-datesurvey-start').value = survey.start_date?.split('T')[0] || '';
  document.getElementById('edit-datesurvey-end').value = survey.end_date?.split('T')[0] || '';
  document.getElementById('edit-datesurvey-closed').checked = survey.is_closed === 1;

  document.getElementById('datesurvey-edit-modal').classList.remove('hidden');
}

function closeDateSurveyEditModal() {
  document.getElementById('datesurvey-edit-modal').classList.add('hidden');
}

async function submitEditDateSurvey() {
  const id = document.getElementById('edit-datesurvey-id').value;
  const title = document.getElementById('edit-datesurvey-title').value.trim();
  const start_date = document.getElementById('edit-datesurvey-start').value;
  const end_date = document.getElementById('edit-datesurvey-end').value;
  const is_closed = document.getElementById('edit-datesurvey-closed').checked ? 1 : 0;

  if (!title) return alert('조사 제목을 입력해주세요!');
  if (!start_date || !end_date) return alert('날짜 범위를 입력해주세요!');

  await fetch(`/api/date-surveys/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, start_date, end_date, is_closed })
  });

  alert('수정됐어요! ✅');
  closeDateSurveyEditModal();
  await loadDateSurveys();
}

// ===== 날짜 조사 대상 설정 =====
let currentTargetSurveyId = null;

async function openDateSurveyTargetModal(surveyId) {
  currentTargetSurveyId = surveyId;

  // 현재 대상 불러오기
  const res = await fetch(`/api/date-survey-targets/${surveyId}`);
  const targets = await res.json();
  const targetIds = new Set(targets.map(t => t.member_id));

  // 팀별 그룹핑
  const groups = {};
  members.forEach(m => {
    const team = m.team_name || '기타';
    if (!groups[team]) groups[team] = [];
    groups[team].push(m);
  });

  document.getElementById('datesurvey-target-list').innerHTML = Object.entries(groups).map(([team, mems]) => `
    <div style="margin-bottom:12px;">
      <div style="font-weight:700;color:#4a90e2;margin-bottom:6px;display:flex;align-items:center;gap:8px;">
        ${team}
        <button onclick="toggleTeamTarget('${team}', ${JSON.stringify(mems.map(m => m.id))})" 
          style="font-size:11px;padding:2px 8px;border:1px solid #4a90e2;border-radius:4px;background:#fff;color:#4a90e2;cursor:pointer;">
          전체선택
        </button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${mems.map(m => `
          <label style="display:flex;align-items:center;gap:4px;background:#f8f8f8;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:13px;">
            <input type="checkbox" id="target-${m.id}" value="${m.id}" ${targetIds.has(m.id) ? 'checked' : ''} />
            ${m.name} ${m.rank || ''}
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');

  document.getElementById('datesurvey-target-modal').classList.remove('hidden');
}

function toggleTeamTarget(team, memberIds) {
  const allChecked = memberIds.every(id => document.getElementById(`target-${id}`)?.checked);
  memberIds.forEach(id => {
    const el = document.getElementById(`target-${id}`);
    if (el) el.checked = !allChecked;
  });
}

function closeDateSurveyTargetModal() {
  document.getElementById('datesurvey-target-modal').classList.add('hidden');
}

async function submitDateSurveyTargets() {
  const checkboxes = document.querySelectorAll('#datesurvey-target-list input[type="checkbox"]:checked');
  const member_ids = [...checkboxes].map(cb => parseInt(cb.value));

  if (member_ids.length === 0) return alert('최소 1명 이상 선택해주세요!');

  await fetch('/api/date-survey-targets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ survey_id: currentTargetSurveyId, member_ids })
  });

  alert('대상이 저장됐어요! ✅');
  closeDateSurveyTargetModal();
  await loadDateSurveyResult();
}

async function loadDateSurveyResult() {
  const surveyId = document.getElementById('datesurvey-result-select').value;
  if (!surveyId) return;

  const survey = dateSurveys.find(s => s.id === parseInt(surveyId));
  if (!survey) return;

  const [responsesRes, targetsRes] = await Promise.all([
    fetch(`/api/date-survey-responses/${surveyId}`),
    fetch(`/api/date-survey-targets/${surveyId}`)
  ]);

  const responses = await responsesRes.json();
  const targets = await targetsRes.json();

  const dates = getDatesInRange(survey.start_date, survey.end_date, true);

  // 날짜별 가능 인원 집계
  const dateMap = {};
  dates.forEach(d => { dateMap[d] = []; });
  responses.forEach(r => {
    const d = r.available_date?.split('T')[0];
    if (d && dateMap[d] !== undefined) {
      dateMap[d].push({ name: r.member_name, rank: r.rank || '' });
    }
  });

  // 미응답자
  const respondedMemberIds = new Set(responses.map(r => r.member_id));
  const notResponded = targets.filter(t => !respondedMemberIds.has(t.member_id));

  // 날짜별 체크 안 한 사람 계산
  const targetMemberIds = new Set(targets.map(t => t.member_id));
  const dateCheckedMap = {};
  responses.forEach(r => {
    const d = r.available_date?.split('T')[0];
    if (d) {
      if (!dateCheckedMap[d]) dateCheckedMap[d] = new Set();
      dateCheckedMap[d].add(r.member_id);
    }
  });

  let html = `
    <div style="margin-bottom:16px;font-size:15px;">
      📊 응답 <strong>${respondedMemberIds.size}명</strong> &nbsp;
      ⏳ 미응답 <strong>${notResponded.length}명</strong> &nbsp;
      👥 대상 <strong>${targets.length}명</strong>
    </div>
    ${notResponded.length > 0 ? `
      <div style="margin-bottom:16px;padding:12px;background:#fff8e1;border-radius:8px;font-size:14px;">
        ⏳ <strong>미응답자:</strong> ${notResponded.map(t => `${t.member_name} ${t.rank || ''}`).join(', ')}
      </div>
    ` : '<div style="margin-bottom:16px;padding:12px;background:#e6f9ee;border-radius:8px;font-size:14px;">🎉 모든 대상자가 응답했어요!</div>'}
    <table class="summary-table" style="margin-bottom:20px;">
      <thead>
        <tr>
          <th>날짜</th>
          <th>요일</th>
          <th style="color:#27ae60;">✅ 가능 (${targets.length}명 중)</th>
          <th style="color:#27ae60;">가능 인원</th>
          <th style="color:#e74c3c;">❌ 불가</th>
          <th style="color:#e74c3c;">불가 인원</th>
        </tr>
      </thead>
      <tbody>
        ${dates.map(d => {
          const availableNames = dateMap[d] || [];
          const checkedIds = dateCheckedMap[d] || new Set();
          const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][new Date(d + 'T12:00:00').getDay()];

          // 응답한 사람 중 해당 날짜 체크 안 한 사람
          const unavailableNames = targets
            .filter(t => respondedMemberIds.has(t.member_id) && !checkedIds.has(t.member_id))
            .map(t => `${t.member_name} ${t.rank || ''}`);

          return `
            <tr>
              <td><strong>${formatDate(d)}</strong></td>
              <td>${dayOfWeek}</td>
              <td><strong style="color:#27ae60;">${availableNames.length}명</strong></td>
              <td style="text-align:left;padding-left:8px;font-size:13px;">
                ${availableNames.length > 0
                  ? availableNames.map(n => `<span style="display:inline-block;background:#e6f9ee;color:#27ae60;padding:2px 8px;border-radius:12px;margin:2px;font-size:12px;">${n.name} ${n.rank}</span>`).join('')
                  : '<span style="color:#aaa;">-</span>'}
              </td>
              <td><strong style="color:#e74c3c;">${unavailableNames.length}명</strong></td>
              <td style="text-align:left;padding-left:8px;font-size:13px;">
                ${unavailableNames.length > 0
                  ? unavailableNames.map(n => `<span style="display:inline-block;background:#fde8e8;color:#e74c3c;padding:2px 8px;border-radius:12px;margin:2px;font-size:12px;">${n}</span>`).join('')
                  : '<span style="color:#aaa;">-</span>'}
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  document.getElementById('datesurvey-result').innerHTML = html;
}

function getDatesInRange(startDate, endDate, excludeWeekends = false) {
  const dates = [];
  const [sy, sm, sd] = startDate.split('T')[0].split('-').map(Number);
  const [ey, em, ed] = endDate.split('T')[0].split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const current = new Date(start);

  while (current <= end) {
    const day = current.getDay();
    if (!excludeWeekends || (day !== 0 && day !== 6)) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
  return `${m}/${d}`;
}

// ===== 차량 배차 =====
let dispatchAttendees = [];
let dispatchResult = [];
let carInputCount = 0;

async function initDispatch() {
  const res = await fetch('/api/events');
  const events = await res.json();

  const sel = document.getElementById('dispatch-event-select');
  sel.innerHTML = events.map(e => `<option value="${e.id}">${e.title}</option>`).join('');

  if (events.length > 0) {
    await loadDispatchAttendees();
  }
}

async function loadDispatchAttendees() {
  const eventId = document.getElementById('dispatch-event-select').value;
  if (!eventId) return;

  const res = await fetch(`/api/responses/${eventId}`);
  const responses = await res.json();

  dispatchAttendees = responses.filter(r => r.is_attending === 1);

  const section = document.getElementById('dispatch-attendees-section');
  const list = document.getElementById('dispatch-attendees-list');

  if (dispatchAttendees.length === 0) {
    list.innerHTML = '<p style="color:#aaa;font-size:14px;">참석자가 없어요.</p>';
    section.classList.remove('hidden');
    await loadDispatchHistory();
    return;
  }

  list.innerHTML = `
    <p style="font-size:13px;color:#888;margin-bottom:8px;">배차에서 제외할 인원을 체크해주세요!</p>
    <div style="display:flex;flex-wrap:wrap;gap:6px;">
      ${dispatchAttendees.map(a => `
        <label class="attendee-checkbox-label" id="attendee-label-${a.member_id}">
          <input type="checkbox" id="exclude-${a.member_id}" onchange="toggleExclude(${a.member_id})" />
          ${a.member_name} ${a.rank || ''}
        </label>
      `).join('')}
    </div>
    <p style="margin-top:10px;font-size:13px;color:#888;">총 <span id="dispatch-count">${dispatchAttendees.length}</span>명 배차 예정</p>
  `;

  section.classList.remove('hidden');
  carInputCount = 0;
  document.getElementById('car-list-inputs').innerHTML = '';
  addCarInput();

  document.getElementById('dispatch-result-section').classList.add('hidden');
  document.getElementById('dispatch-result').innerHTML = '';

  await loadDispatchHistory();
}

function toggleExclude(memberId) {
  const checked = document.getElementById(`exclude-${memberId}`).checked;
  const label = document.getElementById(`attendee-label-${memberId}`);
  if (checked) {
    label.style.textDecoration = 'line-through';
    label.style.opacity = '0.4';
  } else {
    label.style.textDecoration = 'none';
    label.style.opacity = '1';
  }

  const excludedCount = dispatchAttendees.filter(a =>
    document.getElementById(`exclude-${a.member_id}`)?.checked
  ).length;
  document.getElementById('dispatch-count').textContent = dispatchAttendees.length - excludedCount;
}

function addCarInput() {
  carInputCount++;
  const div = document.createElement('div');
  div.className = 'car-input-item';
  div.id = `car-input-${carInputCount}`;

  const driverOptions = dispatchAttendees.map(a =>
    `<option value="${a.member_id}">${a.member_name} ${a.rank || ''}</option>`
  ).join('');

  div.innerHTML = `
    <span style="font-size:14px;font-weight:600;color:#555;">🚗 차량 ${carInputCount}</span>
    <select id="driver-select-${carInputCount}">${driverOptions}</select>
    <label style="font-size:13px;color:#555;">정원</label>
    <input type="number" id="capacity-${carInputCount}" value="5" min="1" max="15" />
    <span style="font-size:13px;color:#888;">(본인 포함)</span>
    <button class="del-btn" onclick="removeCarInput(${carInputCount})">삭제</button>
  `;

  document.getElementById('car-list-inputs').appendChild(div);
}

function removeCarInput(id) {
  const el = document.getElementById(`car-input-${id}`);
  if (el) el.remove();
}

function doDispatch() {
  const carInputs = document.querySelectorAll('.car-input-item');
  if (carInputs.length === 0) return alert('차량을 먼저 추가해주세요!');

  const cars = [];
  const usedDrivers = new Set();

  for (const input of carInputs) {
    const idMatch = input.id.match(/car-input-(\d+)/);
    if (!idMatch) continue;
    const idx = idMatch[1];

    const driverId = parseInt(document.getElementById(`driver-select-${idx}`).value);
    const capacity = parseInt(document.getElementById(`capacity-${idx}`).value);

    if (usedDrivers.has(driverId)) {
      alert('같은 사람이 두 대의 차량 운전자로 선택됐어요!');
      return;
    }
    usedDrivers.add(driverId);
    cars.push({ driver_member_id: driverId, capacity, passengers: [] });
  }

  const excludedIds = new Set(
    dispatchAttendees
      .filter(a => document.getElementById(`exclude-${a.member_id}`)?.checked)
      .map(a => a.member_id)
  );

  let pool = dispatchAttendees
    .filter(a => !usedDrivers.has(a.member_id) && !excludedIds.has(a.member_id))
    .map(a => a.member_id);

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  let round = 0;
  while (pool.length > 0) {
    const car = cars[round % cars.length];
    if (car.passengers.length < car.capacity - 1) {
      car.passengers.push(pool.shift());
    }
    round++;
    if (cars.every(c => c.passengers.length >= c.capacity - 1)) break;
  }

  if (pool.length > 0) {
    cars[cars.length - 1].passengers.push(...pool);
  }

  dispatchResult = cars;
  renderDispatchResult(cars);
}

function renderDispatchResult(cars) {
  const section = document.getElementById('dispatch-result-section');
  const resultDiv = document.getElementById('dispatch-result');

  const memberMap = {};
  dispatchAttendees.forEach(a => {
    memberMap[a.member_id] = `${a.member_name} ${a.rank || ''}`;
  });

  resultDiv.innerHTML = `
    <p style="font-size:13px;color:#888;margin-bottom:12px;">💡 승객 태그를 드래그해서 다른 차량으로 옮길 수 있어요!</p>
    ${cars.map((car, i) => `
      <div class="dispatch-car-result"
           ondragover="event.preventDefault()"
           ondrop="dropPassenger(event, ${i})"
           data-car-index="${i}">
        <h4>🚗 차량 ${i + 1} · 정원 ${car.capacity}명 · <span id="car-count-${i}">${1 + car.passengers.length}</span>명 탑승</h4>
        <div class="dispatch-passenger-list" id="car-passengers-${i}">
          <span class="dispatch-driver-tag">👑 ${memberMap[car.driver_member_id]} (운전자)</span>
          ${car.passengers.map(pid => `
            <span class="dispatch-passenger-tag draggable-tag"
                  draggable="true"
                  data-member-id="${pid}"
                  data-car-index="${i}"
                  ondragstart="dragPassenger(event, ${pid}, ${i})"
                  style="cursor:grab;">
              ${memberMap[pid] || pid}
            </span>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `;

  section.classList.remove('hidden');
}

let dragMemberId = null;
let dragFromCarIndex = null;

function dragPassenger(event, memberId, carIndex) {
  dragMemberId = memberId;
  dragFromCarIndex = carIndex;
  event.dataTransfer.effectAllowed = 'move';
}

function dropPassenger(event, toCarIndex) {
  event.preventDefault();
  if (dragMemberId === null || dragFromCarIndex === toCarIndex) return;

  const fromCar = dispatchResult[dragFromCarIndex];
  fromCar.passengers = fromCar.passengers.filter(p => p !== dragMemberId);

  const toCar = dispatchResult[toCarIndex];
  toCar.passengers.push(dragMemberId);

  dragMemberId = null;
  dragFromCarIndex = null;

  renderDispatchResult(dispatchResult);
}

async function saveDispatch() {
  const eventId = document.getElementById('dispatch-event-select').value;
  if (!eventId) return alert('회식을 선택해주세요!');
  if (dispatchResult.length === 0) return alert('배차를 먼저 진행해주세요!');

  await fetch('/api/dispatches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id: eventId, cars: dispatchResult })
  });

  alert('배차가 저장됐어요! ✅');
  await loadDispatchHistory();
}

async function loadDispatchHistory() {
  const eventId = document.getElementById('dispatch-event-select').value;
  if (!eventId) return;

  const res = await fetch(`/api/dispatches/${eventId}`);
  const dispatches = await res.json();

  const historyDiv = document.getElementById('dispatch-history');

  if (dispatches.length === 0) {
    historyDiv.innerHTML = '<p style="color:#aaa;font-size:14px;">저장된 배차 이력이 없어요.</p>';
    return;
  }

  historyDiv.innerHTML = dispatches.map(dispatch => {
    const date = new Date(dispatch.created_at).toLocaleString('ko-KR');
    const carsHtml = dispatch.cars.map((car, i) => {
      const passengerTags = car.passengers.map(p =>
        `<span class="dispatch-passenger-tag">${p.member_name} ${p.member_rank || ''}</span>`
      ).join('');
      return `
        <div style="margin-bottom:8px;">
          <span style="font-size:13px;font-weight:600;">🚗 차량 ${i + 1}</span>
          <div class="dispatch-passenger-list" style="margin-top:4px;">
            <span class="dispatch-driver-tag">👑 ${car.driver_name} (운전자)</span>
            ${passengerTags || '<span style="color:#aaa;font-size:13px;">탑승자 없음</span>'}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="dispatch-history-item">
        <div class="dispatch-history-header">
          <span class="dispatch-history-date">🕐 ${date}</span>
          <div style="display:flex;gap:6px;">
            <button class="edit-btn" onclick="copyDispatch(${dispatch.id})">📋 복사</button>
            <button class="del-btn" onclick="deleteDispatch(${dispatch.id})">삭제</button>
          </div>
        </div>
        ${carsHtml}
      </div>
    `;
  }).join('');

  window.dispatchHistory = dispatches;
}

function copyDispatch(dispatchId) {
  const dispatch = window.dispatchHistory.find(d => d.id === dispatchId);
  if (!dispatch) return;

  const text = dispatch.cars.map(car => {
    const passengers = car.passengers.map(p => p.member_name).join(' ');
    return `${car.driver_name} : ${passengers || '탑승자 없음'}`;
  }).join('\n');

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    document.execCommand('copy');
    alert('배차 정보가 복사됐어요! ✅\n카톡에 붙여넣기 하세요 😊');
  } catch (err) {
    alert('복사 실패했어요. 직접 선택해서 복사해주세요!');
  }

  document.body.removeChild(textarea);
}

async function deleteDispatch(id) {
  if (!confirm('이 배차 이력을 삭제할까요?')) return;
  await fetch(`/api/dispatches/${id}`, { method: 'DELETE' });
  await loadDispatchHistory();
}

// ===== 비밀번호 변경 =====
function openPwChangeModal() {
  document.getElementById('current-pw-input').value = '';
  document.getElementById('new-pw-input').value = '';
  document.getElementById('new-pw-confirm-input').value = '';
  document.getElementById('pw-change-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('current-pw-input').focus(), 100);
}

function closePwChangeModal() {
  document.getElementById('pw-change-modal').classList.add('hidden');
}

async function submitPwChange() {
  const currentPassword = document.getElementById('current-pw-input').value;
  const newPassword = document.getElementById('new-pw-input').value;
  const newPasswordConfirm = document.getElementById('new-pw-confirm-input').value;

  if (!currentPassword) return alert('현재 비밀번호를 입력해주세요!');
  if (!newPassword) return alert('새 비밀번호를 입력해주세요!');
  if (newPassword.length < 4) return alert('새 비밀번호는 4자 이상이어야 해요!');
  if (newPassword !== newPasswordConfirm) return alert('새 비밀번호가 일치하지 않아요!');

  try {
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (res.ok) {
      alert('비밀번호가 변경됐어요! ✅ 다시 로그인해주세요.');
      closePwChangeModal();
      fetch('/api/admin/logout', { method: 'POST' })
        .then(() => window.location.href = '/');
    } else {
      alert(data.error || '오류가 발생했어요!');
    }
  } catch (err) {
    alert('오류가 발생했어요!');
  }
}

init();