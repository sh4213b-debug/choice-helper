/*
 * app.js — Choice Helper 뷰/컨트롤러 (v0.1)
 * 화면 전환, 라벨 입력, 굴림 요청, 결과 렌더링을 담당한다.
 * 순수 로직은 dice.js(ChoiceHelper.dice)에 위임한다.
 */
(function () {
  'use strict';

  var dice = window.ChoiceHelper.dice;

  // A, B, C, D — 라벨 미입력 시 사용하는 기본 이름
  var DEFAULT_LABELS = ['A', 'B', 'C', 'D'];

  // 현재 세션 상태 (v0.1은 메모리에만 보관, 저장 기능은 v0.3)
  var state = {
    count: 0,        // 선택지 개수 (1~4)
    labels: []       // 확정된 라벨 배열
  };

  // ── DOM 참조 ────────────────────────────────────────────────
  var screens = {
    home: document.getElementById('screen-home'),
    labels: document.getElementById('screen-labels'),
    result: document.getElementById('screen-result')
  };
  var el = {
    modeList: document.getElementById('mode-list'),
    labelsTitle: document.getElementById('labels-title'),
    labelForm: document.getElementById('label-form'),
    labelInputs: document.getElementById('label-inputs'),
    skipBtn: document.getElementById('skip-btn'),
    labelsBack: document.getElementById('labels-back'),
    tieBanner: document.getElementById('tie-banner'),
    resultList: document.getElementById('result-list'),
    rerollBtn: document.getElementById('reroll-btn'),
    resultHome: document.getElementById('result-home')
  };

  // ── 화면 전환 ───────────────────────────────────────────────
  function show(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle('is-hidden', key !== name);
    });
  }

  // ── 라벨 입력 화면 구성 ─────────────────────────────────────
  function buildLabelInputs(count) {
    el.labelInputs.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var wrap = document.createElement('div');
      wrap.className = 'label-input';

      var badge = document.createElement('span');
      badge.className = 'label-input__badge';
      badge.textContent = DEFAULT_LABELS[i];

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'label-input__field';
      input.setAttribute('maxlength', '20');
      input.setAttribute('autocomplete', 'off');
      input.placeholder = '예: ' + ['짜장면', '짬뽕', '볶음밥', '탕수육'][i];
      input.dataset.index = String(i);

      wrap.appendChild(badge);
      wrap.appendChild(input);
      el.labelInputs.appendChild(wrap);
    }
    el.labelsTitle.textContent =
      count === 1 ? '무엇을 물어볼까요?' : '선택지 이름 붙이기';
  }

  // 입력값을 읽어 라벨 확정. 빈 칸은 A/B/C/D로 대체.
  function readLabels(count) {
    var fields = el.labelInputs.querySelectorAll('.label-input__field');
    var labels = [];
    for (var i = 0; i < count; i++) {
      var val = fields[i] ? fields[i].value.trim() : '';
      labels.push(val || DEFAULT_LABELS[i]);
    }
    return labels;
  }

  // ── 결과 렌더링 ─────────────────────────────────────────────
  function renderResults() {
    var results = dice.rollAll(state.count);

    el.resultList.innerHTML = '';
    for (var i = 0; i < results.length; i++) {
      el.resultList.appendChild(buildResultCard(state.labels[i], results[i]));
    }

    // 동점 배너 (선택지 2개 이상일 때만 의미)
    el.tieBanner.classList.toggle('is-hidden', !dice.hasTie(results));

    show('result');
  }

  function buildResultCard(label, result) {
    var g = result.grade;

    var card = document.createElement('div');
    card.className = 'result-card result-card--' + g.tier;

    var name = document.createElement('div');
    name.className = 'result-card__name';
    name.textContent = label;

    var gradeText = document.createElement('div');
    gradeText.className = 'result-card__grade';
    gradeText.textContent = g.ko;

    var meta = document.createElement('div');
    meta.className = 'result-card__meta';
    meta.textContent = '등급 ' + g.grade + ' · d20: ' + result.roll;

    card.appendChild(name);
    card.appendChild(gradeText);
    card.appendChild(meta);
    return card;
  }

  // ── 이벤트 핸들러 ───────────────────────────────────────────
  // 모드 선택 → 라벨 화면
  el.modeList.addEventListener('click', function (e) {
    var btn = e.target.closest('.type-card');
    if (!btn) return;
    state.count = parseInt(btn.dataset.count, 10);
    buildLabelInputs(state.count);
    show('labels');
  });

  // 라벨 입력 후 굴리기
  el.labelForm.addEventListener('submit', function (e) {
    e.preventDefault();
    state.labels = readLabels(state.count);
    renderResults();
  });

  // 건너뛰기 → 기본 라벨로 즉시 굴리기
  el.skipBtn.addEventListener('click', function () {
    state.labels = DEFAULT_LABELS.slice(0, state.count);
    renderResults();
  });

  // 다시 굴리기 (같은 라벨 유지)
  el.rerollBtn.addEventListener('click', function () {
    renderResults();
  });

  // 처음으로
  function goHome() {
    show('home');
  }
  el.labelsBack.addEventListener('click', goHome);
  el.resultHome.addEventListener('click', goHome);

  // 초기 화면
  show('home');
})();
