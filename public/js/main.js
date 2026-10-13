let currentEvent = null;
let allMembers = [];
let coffeeMenus = [];
let responses = [];
let selectedMember = null;
let selectedAttend = null;
let selectedCoffeeId = null;
let selectedHotIce = null;
let customFields = [];
let customResponses = {};

async function init() {
  const res = await fetch('/api/events/latest');
  currentEvent = await res.json();

  if (!currentEvent) {
    document.getElementById('event-info').innerHTML = '현재 등록된 회식 일정이 없습니다.';
    return;
  }

document.getElementById('event-info').innerHTML = `
    <strong>${currentEvent.title}</strong>
    ${currentEvent.is_closed ? '<span style="color:#e74c3c;font-weight:700;margin-left:8px;">🔒 설문 마감</span>' : ''}
    ${currentEvent.restaurant
      ? currentEvent.restaurant_url
        ? `· 📍 <a href="${currentEvent.restaurant_url}" target="_blank" style="color:#4a90e2;text-decoration:none;font-weight:600;">${currentEvent.restaurant} 🔗</a>`
        : `· 📍 ${currentEvent.restaurant}`
      : ''}
    ${currentEvent.restaurant_address ? `<br><span style="font-size:13px;color:#888;">🏠 ${currentEvent.restaurant_address}</span>` : ''}
  `;

  const [membersRes, responsesRes, coffeeRes] = await Promise.all([
    fetch('/api/members'),
    fetch(`/api/responses/${currentEvent.id}`),
    fetch(`/api/coffee-menus/${currentEvent.id}`)
  ]);

  allMembers = await membersRes.json();
  responses = await responsesRes.json();
  coffeeMenus = await coffeeRes.json();

  await loadCustomFields();
  renderMembers(allMembers);
}

function renderMembers(members) {
  const container = document.getElementById('member-list');
  container.innerHTML = '';

  const groups = {};
  members.forEach(m => {
    const team = m.team_name || '기타';
    if (!groups[team]) groups[team] = [];
    groups[team].push(m);
  });

  Object.entries(groups).forEach(([team, members]) => {
    const group = document.createElement('div');
    group.className = 'team-group';
    group.innerHTML = `<div class="team-header">${team}</div>`;

    members.forEach(m => {
      const response = responses.find(r => r.member_id === m.id);
      let statusClass = 'status-none';
      let statusText = '미응답';

      if (response) {
        if (response.is_attending === 1) {
          statusClass = 'status-attend';
          statusText = '✅ 참석';
        } else if (response.is_attending === 0) {
          statusClass = 'status-absent';
          statusText = '❌ 미참석';
        }
      }

      const item = document.createElement('div');
      item.className = 'member-item';
      item.innerHTML = `
        <div class="member-info">
          <span class="member-name">${m.name}</span>
          <span class="member-rank">${m.rank || ''} ${m.workplace ? '· ' + m.workplace : ''}</span>
        </div>
        <span class="member-status ${statusClass}">${statusText}</span>
      `;
      item.onclick = () => openModal(m);
      group.appendChild(item);
    });

    container.appendChild(group);
  });
}

async function openModal(member) {
  if (currentEvent.is_closed) {
    alert('⛔ 설문이 마감되었습니다!');
    return;
  }
  selectedMember = member;
  selectedAttend = null;
  selectedCoffeeId = null;
  selectedHotIce = null;

  document.getElementById('modal-name').textContent = `${member.name} ${member.rank || ''}`;
  document.getElementById('note-input').value = '';
  document.getElementById('coffee-select').value = '';

  document.getElementById('btn-attend').classList.remove('active');
  document.getElementById('btn-absent').classList.remove('active');
  document.getElementById('btn-hot').classList.remove('active');
  document.getElementById('btn-ice').classList.remove('active');

  const existing = responses.find(r => r.member_id === member.id);
  if (existing) {
    if (existing.is_attending === 1) {
      setAttend(1);
    } else {
      setAttend(0);
    }
    if (existing.coffee_menu_id) {
      selectedCoffeeId = existing.coffee_menu_id;
      document.getElementById('coffee-select').value = existing.coffee_menu_id;
    }
    if (existing.hot_ice) {
      setHotIce(existing.hot_ice);
    }
    if (existing.note) {
      document.getElementById('note-input').value = existing.note;
    }
  }

  const coffeeSection = document.getElementById('coffee-section');
  const coffeeSelect = document.getElementById('coffee-select');
  coffeeSelect.innerHTML = '<option value="">선택 안 함</option>';
  coffeeMenus.forEach(c => {
    coffeeSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
  });
  if (selectedCoffeeId) coffeeSelect.value = selectedCoffeeId;

  if (currentEvent.is_coffee_enabled && coffeeMenus.length > 0) {
    coffeeSection.classList.remove('hidden');
  } else {
    coffeeSection.classList.add('hidden');
  }

  await renderCustomFields(member);

  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

function setAttend(val) {
  selectedAttend = val;
  document.getElementById('btn-attend').classList.toggle('active', val === 1);
  document.getElementById('btn-absent').classList.toggle('active', val === 0);
}

function setHotIce(val) {
  selectedHotIce = val;
  document.getElementById('btn-hot').classList.toggle('active', val === 'HOT');
  document.getElementById('btn-ice').classList.toggle('active', val === 'ICE');
}

async function submitResponse() {
  if (selectedAttend === null) {
    alert('참석 여부를 선택해주세요!');
    return;
  }

  const coffeeMenuId = document.getElementById('coffee-select').value || null;
  const note = document.getElementById('note-input').value;

  await fetch('/api/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: currentEvent.id,
      member_id: selectedMember.id,
      is_attending: selectedAttend,
      coffee_menu_id: coffeeMenuId,
      hot_ice: selectedHotIce,
      note: note
    })
  });

  for (const field of customFields) {
    const optionId = document.getElementById(`custom-field-select-${field.id}`)?.value;
    if (optionId) {
      await fetch('/api/custom-responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: currentEvent.id,
          member_id: selectedMember.id,
          field_id: field.id,
          option_id: optionId
        })
      });
    }
  }

  const responsesRes = await fetch(`/api/responses/${currentEvent.id}`);
  responses = await responsesRes.json();

  const searchVal = document.getElementById('search-input').value;
  const filtered = searchVal
    ? allMembers.filter(m => m.name.includes(searchVal))
    : allMembers;

  renderMembers(filtered);
  closeModal();
  alert('저장되었습니다! ✅');
}

async function loadCustomFields() {
  if (!currentEvent) return;
  const res = await fetch(`/api/custom-fields/${currentEvent.id}`);
  customFields = await res.json();
}

async function renderCustomFields(member) {
  document.querySelectorAll('.custom-field-section').forEach(el => el.remove());

  if (customFields.length === 0) return;

  const res = await fetch(`/api/custom-responses/${currentEvent.id}/${member.id}`);
  const existingResponses = await res.json();

  customResponses = {};
  existingResponses.forEach(r => {
    customResponses[r.field_id] = r.option_id;
  });

  const modalContent = document.querySelector('#modal .modal-content');
  const modalButtons = document.querySelector('#modal .modal-buttons');

  customFields.forEach(field => {
    const div = document.createElement('div');
    div.className = 'form-group custom-field-section';

    const selectedOptionId = customResponses[field.id] || '';

    div.innerHTML = `
      <label>📌 ${field.field_name}</label>
      <select id="custom-field-select-${field.id}">
        <option value="">선택 안 함</option>
        ${field.options.map(opt =>
          `<option value="${opt.id}" ${selectedOptionId == opt.id ? 'selected' : ''}>${opt.option_name}</option>`
        ).join('')}
      </select>
    `;

    modalContent.insertBefore(div, modalButtons);
  });
}

document.getElementById('search-input').addEventListener('input', (e) => {
  const val = e.target.value;
  const filtered = val
    ? allMembers.filter(m => m.name.includes(val))
    : allMembers;
  renderMembers(filtered);
});
// ===== 응답 현황 =====
async function loadStatusPage() {
  if (!currentEvent) return;

  const res = await fetch(`/api/responses/${currentEvent.id}`);
  const responses = await res.json();

  const allMembersRes = await fetch('/api/members');
  const allMembers = await allMembersRes.json();

  const customFieldsRes = await fetch(`/api/custom-fields/${currentEvent.id}`);
  const customFields = await customFieldsRes.json();

  const customResponsesRes = await fetch(`/api/custom-responses/${currentEvent.id}`);
  const customResponses = await customResponsesRes.json();

  const attending = responses.filter(r => r.is_attending === 1).length;
  const absent = responses.filter(r => r.is_attending === 0).length;
  const noResponse = allMembers.length - responses.length;

  document.getElementById('status-stats').innerHTML = `
    ✅ 참석 <strong>${attending}명</strong> &nbsp;
    ❌ 미참석 <strong>${absent}명</strong> &nbsp;
    ⏳ 미응답 <strong>${noResponse}명</strong> &nbsp;
    👥 전체 <strong>${allMembers.length}명</strong>
  `;

  // ===== 커피 집계 테이블 =====
  if (currentEvent.is_coffee_enabled) {
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
    const totalHot = Object.values(coffeeCount).reduce((s, v) => s + (v.HOT || 0), 0);
    const totalIce = Object.values(coffeeCount).reduce((s, v) => s + (v.ICE || 0), 0);
    const totalNone = Object.values(coffeeCount).reduce((s, v) => s + (v.미선택 || 0), 0);

    let coffeeHtml = '';
    if (coffeeMenuNames.length > 0) {
      coffeeHtml = `
        <div class="admin-section" style="margin-top:20px;">
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
    }
    document.getElementById('status-coffee-wrap').innerHTML = coffeeHtml;
  }

  // ===== 응답 현황 테이블 =====
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
  document.getElementById('status-table-wrap').innerHTML = tableHtml;
}

// ===== 날짜 조사 =====
let currentDateSurvey = null;
let allDateSurveys = [];
let selectedDates = new Set();

async function loadDateSurveyPage() {
  const res = await fetch('/api/date-surveys');
  allDateSurveys = await res.json();

  const sel = document.getElementById('datesurvey-user-select');
  if (allDateSurveys.length === 0) {
    sel.innerHTML = '<option value="">등록된 날짜 조사가 없어요</option>';
    document.getElementById('datesurvey-info').innerHTML = '<p style="color:#aaa;">등록된 날짜 조사가 없어요.</p>';
    return;
  }

  sel.innerHTML = allDateSurveys.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
  await loadDateSurveyUserPage();
}

async function loadDateSurveyUserPage() {
  const surveyId = document.getElementById('datesurvey-user-select').value;
  if (!surveyId) return;

  currentDateSurvey = allDateSurveys.find(s => s.id === parseInt(surveyId));
  if (!currentDateSurvey) return;

  // 조사 정보 표시
  const start = formatDateKo(currentDateSurvey.start_date);
  const end = formatDateKo(currentDateSurvey.end_date);
  document.getElementById('datesurvey-info').innerHTML = `
    📅 기간: <strong>${start} ~ ${end}</strong>
    ${currentDateSurvey.is_closed ? ' &nbsp; 🔒 <span style="color:#e74c3c;font-weight:700;">마감됨</span>' : ''}
  `;

  // 대상자 목록만 불러오기
  const targetsRes = await fetch(`/api/date-survey-targets/${surveyId}`);
  const targets = await targetsRes.json();

  const memberSel = document.getElementById('datesurvey-member-select');
  memberSel.innerHTML = '<option value="">이름 선택</option>' +
    targets.map(t => `<option value="${t.member_id}">${t.member_name} ${t.rank || ''}</option>`).join('');

  memberSel.onchange = () => loadMemberDateResponse();

  document.getElementById('datesurvey-dates-wrap').classList.add('hidden');
  selectedDates = new Set();
}

async function loadMemberDateResponse() {
  const memberId = document.getElementById('datesurvey-member-select').value;
  if (!memberId || !currentDateSurvey) return;

  const res = await fetch(`/api/date-survey-responses/${currentDateSurvey.id}/member/${memberId}`);
  const existingDates = await res.json();
  selectedDates = new Set(existingDates.map(d => d.split('T')[0]));

  // 주말 포함해서 날짜 가져오기
  const dates = getDatesInRange(currentDateSurvey.start_date, currentDateSurvey.end_date, false);
  const isClosed = currentDateSurvey.is_closed === 1;

  const daysKo = ['일', '월', '화', '수', '목', '금', '토'];

  // 월별 그룹핑
  const monthGroups = {};
  dates.forEach(d => {
    const [y, m] = d.split('-');
    const key = `${y}-${m}`;
    if (!monthGroups[key]) monthGroups[key] = [];
    monthGroups[key].push(d);
  });

  let html = '';
  Object.entries(monthGroups).forEach(([monthKey, monthDates]) => {
    const [y, m] = monthKey.split('-').map(Number);

    html += `
      <div style="margin-bottom:20px;">
        <div style="font-size:16px;font-weight:700;color:#4a90e2;margin-bottom:10px;">
          ${y}년 ${m}월
        </div>
        <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
          <thead>
            <tr>
            <th style="text-align:center;padding:6px;font-size:13px;color:#e74c3c;font-weight:600;">일</th>
<th style="text-align:center;padding:6px;font-size:13px;color:#555;font-weight:600;">월</th>
<th style="text-align:center;padding:6px;font-size:13px;color:#555;font-weight:600;">화</th>
<th style="text-align:center;padding:6px;font-size:13px;color:#555;font-weight:600;">수</th>
<th style="text-align:center;padding:6px;font-size:13px;color:#555;font-weight:600;">목</th>
<th style="text-align:center;padding:6px;font-size:13px;color:#555;font-weight:600;">금</th>
<th style="text-align:center;padding:6px;font-size:13px;color:#e74c3c;font-weight:600;">토</th>
            </tr>
          </thead>
          <tbody>
    `;

    // 첫째 날 요일 계산 (월=1 기준)
const firstDate = new Date(monthDates[0] + 'T12:00:00');
    const firstDay = firstDate.getDay(); // 0=일 기준 그대로 사용
    const offset = firstDay; // 일=0, 월=1...토=6

    // 7열 셀 배열
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    monthDates.forEach(d => cells.push(d));
    while (cells.length % 7 !== 0) cells.push(null);

    for (let i = 0; i < cells.length; i += 7) {
      html += '<tr>';
      for (let j = 0; j < 7; j++) {
        const cell = cells[i + j];
        const isWeekend = j === 0 || j === 6; // 일=0, 토=6

        if (!cell) {
          html += `<td style="padding:3px;"></td>`;
        } else {
          const isSelected = selectedDates.has(cell);
          const [cy, cm, cd] = cell.split('-').map(Number);
          const canSelect = !isClosed && !isWeekend;

          let bgColor = '#fff';
          let borderColor = '#ddd';
          let textColor = isWeekend ? '#e74c3c' : '#333';

          if (isWeekend) {
            bgColor = '#fff5f5';
            borderColor = '#fcc';
          } else if (isSelected) {
            bgColor = '#e6f9ee';
            borderColor = '#27ae60';
          }

          html += `
            <td style="padding:3px;text-align:center;">
              <button
                id="date-btn-${cell}"
                ${canSelect ? `onclick="toggleDate('${cell}')"` : ''}
                style="
                  width:100%;
                  height:52px;
                  border-radius:8px;
                  border: 2px solid ${borderColor};
                  background: ${bgColor};
                  color: ${textColor};
                  font-size:12px;
                  font-weight: ${isSelected ? '700' : '400'};
                  cursor: ${canSelect ? 'pointer' : 'not-allowed'};
                  opacity: ${isClosed && !isWeekend ? '0.7' : '1'};
                  transition: all 0.15s;
                  display:flex;
                  flex-direction:column;
                  align-items:center;
                  justify-content:center;
                  gap:2px;
                "
              >
                <span>${cd}일</span>
                <span style="font-size:11px;">${isSelected ? '✅' : (isWeekend ? '휴' : '')}</span>
              </button>
            </td>
          `;
        }
      }
      html += '</tr>';
    }

    html += `</tbody></table></div>`;
  });

  document.getElementById('datesurvey-dates-list').innerHTML = html;
  document.getElementById('datesurvey-dates-wrap').classList.remove('hidden');
}

function toggleDate(date) {
  if (selectedDates.has(date)) {
    selectedDates.delete(date);
  } else {
    selectedDates.add(date);
  }

  const btn = document.getElementById(`date-btn-${date}`);
  const isSelected = selectedDates.has(date);
  const [y, m, d] = date.split('-').map(Number);

  btn.style.border = `2px solid ${isSelected ? '#27ae60' : '#ddd'}`;
  btn.style.background = isSelected ? '#e6f9ee' : '#fff';
  btn.style.fontWeight = isSelected ? '700' : '400';
  btn.innerHTML = `<span>${d}일</span><span style="font-size:11px;">${isSelected ? '✅' : ''}</span>`;
}

async function submitDateSurvey() {
  const memberId = document.getElementById('datesurvey-member-select').value;
  if (!memberId) return alert('이름을 선택해주세요!');
  if (!currentDateSurvey) return alert('날짜 조사를 선택해주세요!');
  if (currentDateSurvey.is_closed) return alert('마감된 조사예요!');

  await fetch('/api/date-survey-responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      survey_id: currentDateSurvey.id,
      member_id: memberId,
      dates: [...selectedDates]
    })
  });

  alert('저장됐어요! ✅');
}

function getDatesInRange(startDate, endDate, excludeWeekends = false) {
  const dates = [];
  // T12:00:00 추가해서 timezone 문제 완전 방지
  const startStr = startDate.split('T')[0];
  const endStr = endDate.split('T')[0];
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
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

function formatDateKo(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
  return `${m}월 ${d}일`;
}

init();