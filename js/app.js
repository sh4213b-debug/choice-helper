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
    resultHome: document.getElementById('result-home'),
    diceStage: document.getElementById('dice-stage'),
    diceCanvas: document.getElementById('dice-canvas'),
    diceFallback: document.getElementById('dice-fallback'),
    diceFallbackNum: document.getElementById('dice-fallback-num'),
    diceCaption: document.getElementById('dice-caption'),
    diceHint: document.getElementById('dice-hint'),
    resultActions: document.querySelector('.result-actions')
  };

  // ── 3D 주사위 스테이지 수명 관리 ────────────────────────────
  // 결과 화면 진입 시 생성, 이탈 시 dispose (§3.3 성능).
  var diceStage = null; // dice3d 컨트롤러 (WebGL 가능 시)

  function mountDice() {
    var dice3d = window.ChoiceHelper.dice3d;
    if (diceStage) return;                       // 이미 마운트됨
    if (dice3d && dice3d.supported()) {
      diceStage = dice3d.create(el.diceCanvas);
    }
    if (diceStage) {
      el.diceCanvas.classList.remove('is-hidden');
      el.diceFallback.classList.add('is-hidden');
    } else {
      // WebGL 미지원/실패 → CSS fallback (연출 상세는 v0.2.3)
      el.diceCanvas.classList.add('is-hidden');
      el.diceFallback.classList.remove('is-hidden');
    }
  }

  function unmountDice() {
    if (diceStage) {
      diceStage.dispose();
      diceStage = null;
    }
  }

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

  // ── 결과 렌더링 (v0.2.3: 선택지별 순차 굴림 → 정지 후 카드 공개) ──
  var activeRoller = null; // 현재 굴리는 주사위 (탭 스킵 대상)
  var seqTimer = null;     // 선택지 간 간격 타이머

  function setActionsVisible(v) {
    el.resultActions.style.visibility = v ? 'visible' : 'hidden';
  }

  function renderResults() {
    if (seqTimer) { clearTimeout(seqTimer); seqTimer = null; }
    var results = dice.rollAll(state.count);
    var labels = state.labels;

    // 초기화: 카드·배너·액션 숨기고 스테이지 준비
    el.resultList.innerHTML = '';
    el.tieBanner.classList.add('is-hidden');
    setActionsVisible(false);

    show('result');
    mountDice();
    el.diceHint.classList.remove('is-hidden');

    // WebGL 가능 시 3D, 아니면 CSS fallback 로 동일 인터페이스(roll/skip)
    activeRoller = diceStage ? make3DRoller() : makeFallbackRoller();

    var i = 0;
    function next() {
      if (i >= results.length) { finishSequence(results); return; }
      var idx = i;
      el.diceCaption.textContent =
        results.length > 1 ? '굴리는 중 · ' + labels[idx] : '';
      activeRoller.roll(results[idx].roll, function () {
        el.resultList.appendChild(buildResultCard(labels[idx], results[idx]));
        i++;
        if (i < results.length) seqTimer = setTimeout(next, 420);
        else finishSequence(results);
      });
    }
    next();
  }

  function finishSequence(results) {
    el.diceHint.classList.add('is-hidden');
    el.diceCaption.textContent = '';
    el.tieBanner.classList.toggle('is-hidden', !dice.hasTie(results));
    setActionsVisible(true);
  }

  // 3D 주사위 롤러 (dice3d 컨트롤러 래핑)
  function make3DRoller() {
    return {
      roll: function (n, done) { diceStage.rollTo(n, { onComplete: done }); },
      skip: function () { diceStage.skip(); }
    };
  }

  // CSS fallback 롤러 (WebGL 미지원): 숫자를 감속하며 셔플 후 정지
  function makeFallbackRoller() {
    var cube = el.diceFallback.querySelector('.dice-fallback__cube');
    var DUR = 1500, timer = null, finalVal = 0, doneCb = null, startAt = 0, done = true;

    function settle() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.diceFallbackNum.textContent = finalVal;
      cube.classList.remove('is-rolling');
      cube.classList.toggle('is-nat20', finalVal === 20);
      cube.classList.toggle('is-nat1', finalVal === 1);
      cube.classList.add('is-settle');
      setTimeout(function () { cube.classList.remove('is-settle'); }, 240);
      if (doneCb) { var d = doneCb; doneCb = null; d(); }
    }
    function tick() {
      var p = Math.min((Date.now() - startAt) / DUR, 1);
      if (p < 1) {
        el.diceFallbackNum.textContent = 1 + Math.floor(Math.random() * 20);
        timer = setTimeout(tick, 40 + p * p * 170); // 감속
      } else {
        settle();
      }
    }
    return {
      roll: function (n, cb) {
        done = false; finalVal = n; doneCb = cb; startAt = Date.now();
        cube.classList.remove('is-nat20', 'is-nat1', 'is-settle');
        cube.classList.add('is-rolling');
        tick();
      },
      skip: function () { settle(); }
    };
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

    card.appendChild(name);
    card.appendChild(gradeText);
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

  // 화면 탭으로 애니메이션 스킵 (§2.4)
  el.diceStage.addEventListener('click', function () {
    if (activeRoller) activeRoller.skip();
  });

  // 처음으로
  function goHome() {
    if (seqTimer) { clearTimeout(seqTimer); seqTimer = null; }
    activeRoller = null;
    unmountDice(); // 결과 화면 이탈 시 renderer dispose
    show('home');
  }
  el.labelsBack.addEventListener('click', goHome);
  el.resultHome.addEventListener('click', goHome);

  // 초기 화면
  show('home');
})();
