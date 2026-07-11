/*
 * app.js — Choice Helper 뷰/컨트롤러 (v0.1)
 * 화면 전환, 라벨 입력, 굴림 요청, 결과 렌더링을 담당한다.
 * 순수 로직은 dice.js(ChoiceHelper.dice)에 위임한다.
 */
(function () {
  'use strict';

  var dice = window.ChoiceHelper.dice;
  var i18n = window.ChoiceHelper.i18n;

  // 현재 언어의 등급 텍스트
  function gText(g) { return i18n.getLang() === 'en' ? g.en : g.ko; }

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
    result: document.getElementById('screen-result'),
    history: document.getElementById('screen-history')
  };
  var el = {
    orb: document.getElementById('orb'),
    orbGlyph: document.getElementById('orb-glyph'),
    orbDesc: document.getElementById('orb-desc'),
    orbDots: document.getElementById('orb-dots'),
    orbGo: document.getElementById('orb-go'),
    labelsTitle: document.getElementById('labels-title'),
    labelForm: document.getElementById('label-form'),
    labelInputs: document.getElementById('label-inputs'),
    skipBtn: document.getElementById('skip-btn'),
    labelsBack: document.getElementById('labels-back'),
    tieBanner: document.getElementById('tie-banner'),
    resultList: document.getElementById('result-list'),
    rerollBtn: document.getElementById('reroll-btn'),
    shareBtn: document.getElementById('share-btn'),
    resultHome: document.getElementById('result-home'),
    diceStage: document.getElementById('dice-stage'),
    diceCanvas: document.getElementById('dice-canvas'),
    diceFallback: document.getElementById('dice-fallback'),
    diceFallbackNum: document.getElementById('dice-fallback-num'),
    diceCaption: document.getElementById('dice-caption'),
    diceHint: document.getElementById('dice-hint'),
    resultActions: document.querySelector('.result-actions'),
    openHistory: document.getElementById('open-history'),
    historyList: document.getElementById('history-list'),
    historyEmpty: document.getElementById('history-empty'),
    historyBack: document.getElementById('history-back'),
    gradeScale: document.getElementById('grade-scale')
  };

  // ── 시그니처: 운명의 눈금 (dice.js GRADES 기반, 언어 반영) ──
  // 20(정상)→1(바닥) 수직 눈금. 각 칸 높이 ∝ 확률(구간 길이).
  function renderGrades() {
    if (!el.gradeScale) return;
    var g = dice.GRADES; // 이미 8→1(20→1) 순서
    el.gradeScale.innerHTML = '';
    for (var i = 0; i < g.length; i++) {
      var row = g[i];
      var span = row.max - row.min + 1;        // 확률 가중치 (1 또는 3)
      var range = row.min === row.max ? String(row.min) : row.min + '–' + row.max;
      var prob = span * 5 + '%';

      var rung = document.createElement('div');
      rung.className = 'fate-rung fate-rung--' + row.tier;
      rung.style.flexGrow = String(span);       // 높이 비례
      rung.setAttribute('aria-label', range + ' · ' + gText(row) + ' · ' + prob);

      var mark = document.createElement('span');
      mark.className = 'fate-rung__mark';
      mark.setAttribute('aria-hidden', 'true');

      var rRange = document.createElement('span');
      rRange.className = 'fate-rung__range';
      rRange.textContent = range;

      var rName = document.createElement('span');
      rName.className = 'fate-rung__name';
      rName.textContent = gText(row);

      var rProb = document.createElement('span');
      rProb.className = 'fate-rung__prob';
      rProb.textContent = prob;

      rung.appendChild(mark);
      rung.appendChild(rRange);
      rung.appendChild(rName);
      rung.appendChild(rProb);
      el.gradeScale.appendChild(rung);
    }
  }

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
      input.placeholder = i18n.ph(i);
      input.dataset.index = String(i);

      wrap.appendChild(badge);
      wrap.appendChild(input);
      el.labelInputs.appendChild(wrap);
    }
    el.labelsTitle.textContent =
      count === 1 ? i18n.t('labels.titleSingle') : i18n.t('labels.titleMulti');
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
  var lastResults = null;  // 언어 변경 시 카드 다시 그리기용
  var lastLabels = null;

  function setActionsVisible(v) {
    el.resultActions.style.visibility = v ? 'visible' : 'hidden';
  }

  function renderResults() {
    if (seqTimer) { clearTimeout(seqTimer); seqTimer = null; }
    var results = dice.rollAll(state.count);
    var labels = state.labels;
    lastResults = results;
    lastLabels = labels;

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
        results.length > 1 ? i18n.t('result.rolling', { label: labels[idx] }) : '';
      activeRoller.roll(results[idx].roll, function () {
        el.resultList.appendChild(buildResultCard(labels[idx], results[idx]));
        i++;
        if (i < results.length) seqTimer = setTimeout(next, 420);
        else finishSequence(results);
      });
    }
    next();
  }

  var lastEntry = null; // 마지막 결과 (공유용)

  function buildEntry(results, labels) {
    var items = results.map(function (r, i) {
      return {
        label: labels[i],
        grade: r.grade.grade,
        ko: r.grade.ko,
        en: r.grade.en,
        roll: r.roll
      };
    });
    return {
      id: String(Date.now()) + '-' + Math.floor(Math.random() * 1e6),
      ts: Date.now(),
      count: results.length,
      tie: dice.hasTie(results),
      items: items
    };
  }

  function finishSequence(results) {
    el.diceHint.classList.add('is-hidden');
    el.diceCaption.textContent = '';
    el.tieBanner.classList.toggle('is-hidden', !dice.hasTie(results));
    setActionsVisible(true);

    // 히스토리 저장 (§2.5) + 공유용으로 보관
    lastEntry = buildEntry(results, state.labels);
    window.ChoiceHelper.history.add(lastEntry);
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

    var grade = document.createElement('div');
    grade.className = 'result-card__grade';
    grade.textContent = gText(g);

    card.appendChild(name);
    card.appendChild(grade);
    return card;
  }

  // ── 수정구슬 선택기 (스크롤/스와이프/키보드로 선택지 개수 1~4) ──
  var GLYPHS = ['A', 'A / B', 'A / B / C', 'A / B / C / D'];
  var sel = 1;                 // 현재 선택지 개수
  var WHEEL_STEP = 40;         // 휠 누적 임계값
  var SWIPE_STEP = 34;         // 스와이프 임계값(px)
  var wheelAcc = 0;

  function paintOrb() {
    el.orbGlyph.textContent = GLYPHS[sel - 1];
    el.orbDesc.textContent = i18n.t('card.' + sel);
    el.orb.setAttribute('aria-valuenow', String(sel));
    el.orb.setAttribute('aria-valuetext', GLYPHS[sel - 1]);
    var dots = el.orbDots.children;
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('is-on', i < sel);
    // 글리프 교체 시 짧은 "환영이 맺히는" 연출
    el.orbGlyph.classList.remove('is-shift');
    void el.orbGlyph.offsetWidth; // 리플로우로 애니메이션 재시작
    el.orbGlyph.classList.add('is-shift');
  }

  function setSel(next) {
    next = Math.max(1, Math.min(4, next));
    if (next === sel) return;
    sel = next;
    paintOrb();
  }

  function proceed() {
    state.count = sel;
    buildLabelInputs(state.count);
    show('labels');
  }

  // 데스크톱: 구슬 위에서 휠 → 선택 변경. 구슬 위에서는 페이지 스크롤을 항상 고정.
  el.orb.addEventListener('wheel', function (e) {
    e.preventDefault();
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) >= WHEEL_STEP) {
      setSel(sel + (wheelAcc > 0 ? 1 : -1)); // 끝에 닿으면 clamp만 되고 페이지는 그대로
      wheelAcc = 0;
    }
  }, { passive: false });

  // 모바일: 구슬 위 세로 스와이프 → 선택 변경 (위로=증가). 구슬 위에선 페이지 스크롤 고정.
  var touchY = 0;
  el.orb.addEventListener('touchstart', function (e) {
    touchY = e.touches[0].clientY;
  }, { passive: true });
  el.orb.addEventListener('touchmove', function (e) {
    e.preventDefault();
    var dy = e.touches[0].clientY - touchY;
    if (Math.abs(dy) >= SWIPE_STEP) {
      setSel(sel + (dy < 0 ? 1 : -1)); // 위로 쓸면 증가
      touchY = e.touches[0].clientY;
    }
  }, { passive: false });

  // 키보드 접근성: 위/오른쪽=증가, 아래/왼쪽=감소, Enter/Space=시작
  el.orb.addEventListener('keydown', function (e) {
    switch (e.key) {
      case 'ArrowUp': case 'ArrowRight': e.preventDefault(); setSel(sel + 1); break;
      case 'ArrowDown': case 'ArrowLeft': e.preventDefault(); setSel(sel - 1); break;
      case 'Enter': case ' ': e.preventDefault(); proceed(); break;
    }
  });

  el.orbGo.addEventListener('click', proceed);

  paintOrb(); // 초기 표시

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

  // 결과 공유 (§2.6) — 캔버스 카드 생성 → Web Share / 다운로드
  el.shareBtn.addEventListener('click', function () {
    if (!lastEntry) return;
    window.ChoiceHelper.share.shareResult({ tie: lastEntry.tie, items: lastEntry.items });
  });

  // 화면 탭으로 애니메이션 스킵 (§2.4)
  el.diceStage.addEventListener('click', function () {
    if (activeRoller) activeRoller.skip();
  });

  // ── 히스토리 (§2.5) ─────────────────────────────────────────
  function timeAgo(ts) {
    var sec = Math.max(0, (Date.now() - ts) / 1000);
    if (sec < 60) return i18n.t('time.now');
    var min = Math.floor(sec / 60);
    if (min < 60) return i18n.t('time.min', { n: min });
    var hr = Math.floor(min / 60);
    if (hr < 24) return i18n.t('time.hour', { n: hr });
    return i18n.t('time.day', { n: Math.floor(hr / 24) });
  }

  function renderHistory() {
    var list = window.ChoiceHelper.history.load();
    el.historyList.innerHTML = '';
    el.historyEmpty.classList.toggle('is-hidden', list.length > 0);

    list.forEach(function (entry) {
      var row = document.createElement('div');
      row.className = 'history-item';

      var main = document.createElement('div');
      main.className = 'history-item__main';

      var en = i18n.getLang() === 'en';
      var summary = entry.items.map(function (it) {
        return it.label + ' — ' + (en ? it.en : it.ko);
      }).join(' · ');
      var line = document.createElement('div');
      line.className = 'history-item__summary';
      line.textContent = summary + (entry.tie ? '  (' + i18n.t('tie.short') + ')' : '');

      var time = document.createElement('div');
      time.className = 'history-item__time';
      time.textContent = timeAgo(entry.ts);

      main.appendChild(line);
      main.appendChild(time);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'history-item__del';
      del.setAttribute('aria-label', '삭제');
      del.dataset.id = entry.id;
      del.textContent = '×';

      row.appendChild(main);
      row.appendChild(del);
      el.historyList.appendChild(row);
    });
  }

  el.openHistory.addEventListener('click', function () {
    renderHistory();
    show('history');
  });

  // 개별 삭제 (이벤트 위임)
  el.historyList.addEventListener('click', function (e) {
    var del = e.target.closest('.history-item__del');
    if (!del) return;
    window.ChoiceHelper.history.remove(del.dataset.id);
    renderHistory();
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
  el.historyBack.addEventListener('click', goHome);

  // ── 언어 (§2.7) ─────────────────────────────────────────────
  document.getElementById('lang-toggle').addEventListener('click', function () {
    i18n.toggle();
  });

  // 언어 변경 시 정적 텍스트는 i18n이 갱신하고, 여기서 동적 화면을 다시 그린다
  i18n.onChange(function () {
    // 결과 카드(굴림 완료 상태일 때만 다시 그림)
    var resultVisible = !screens.result.classList.contains('is-hidden');
    if (resultVisible && lastResults && el.resultActions.style.visibility !== 'hidden') {
      el.resultList.innerHTML = '';
      for (var i = 0; i < lastResults.length; i++) {
        el.resultList.appendChild(buildResultCard(lastLabels[i], lastResults[i]));
      }
    }
    renderGrades(); // 소개 등급표(항상 홈에 존재) 언어 반영
    if (el.orbDesc) el.orbDesc.textContent = i18n.t('card.' + sel); // 구슬 설명 언어 반영
    if (!screens.history.classList.contains('is-hidden')) renderHistory();
    if (!screens.labels.classList.contains('is-hidden')) {
      el.labelsTitle.textContent =
        state.count === 1 ? i18n.t('labels.titleSingle') : i18n.t('labels.titleMulti');
      var fields = el.labelInputs.querySelectorAll('.label-input__field');
      for (var j = 0; j < fields.length; j++) fields[j].placeholder = i18n.ph(j);
    }
  });

  i18n.init(); // 기기 언어 감지 + 저장된 선택 적용
  renderGrades(); // 소개 등급표 초기 렌더

  // 초기 화면
  show('home');
})();
