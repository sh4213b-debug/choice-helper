/*
 * i18n.js — 다국어 (ko/en). 기기 언어 자동 감지 + 수동 토글, 선택은 localStorage 저장 (§2.7).
 * DOM의 [data-i18n] 요소를 자동 갱신하고, 동적 텍스트는 t()/onChange 로 처리한다.
 */
(function (global) {
  'use strict';

  var KEY = 'choicehelper.lang.v1';

  var STR = {
    ko: {
      'app.title': '선택 도우미',
      'home.subtitle': '운명의 주사위에게 묻다',
      'home.history': '지난 기록 보기',
      'card.1': '단독 평가 (A)',
      'card.2': '양자택일 (A/B)',
      'card.3': '삼자택일 (A/B/C)',
      'card.4': '다중선택 (A/B/C/D)',
      'labels.titleSingle': '무엇을 물어볼까요?',
      'labels.titleMulti': '선택지 이름 붙이기',
      'labels.subtitle': '비워두면 A·B·C·D로 표시돼요',
      'labels.roll': '주사위 굴리기',
      'labels.skip': '건너뛰기',
      'nav.homeArrow': '← 처음으로',
      'nav.home': '처음으로',
      'result.title': '결과',
      'result.tie': '동점이에요! 다시 굴려볼까요?',
      'result.hint': '화면을 탭하면 건너뛰기',
      'result.rolling': '굴리는 중 · {label}',
      'result.reroll': '다시 굴리기',
      'result.share': '결과 공유',
      'history.title': '지난 기록',
      'history.subtitle': '최근 10개 · 이 기기에만 저장됩니다',
      'history.empty': '아직 기록이 없어요.',
      'tie.short': '동점!',
      'time.now': '방금 전',
      'time.min': '{n}분 전',
      'time.hour': '{n}시간 전',
      'time.day': '{n}일 전',
      'share.subtitle': '운명의 주사위 결과',
      ph: ['예: 짜장면', '예: 짬뽕', '예: 볶음밥', '예: 탕수육']
    },
    en: {
      'app.title': 'Choice Helper',
      'home.subtitle': 'Ask the dice of fate',
      'home.history': 'View history',
      'card.1': 'One (A)',
      'card.2': 'Two (A/B)',
      'card.3': 'Three (A/B/C)',
      'card.4': 'Four (A/B/C/D)',
      'labels.titleSingle': 'What are you asking?',
      'labels.titleMulti': 'Name your choices',
      'labels.subtitle': 'Leave blank for A·B·C·D',
      'labels.roll': 'Roll the dice',
      'labels.skip': 'Skip',
      'nav.homeArrow': '← Home',
      'nav.home': 'Home',
      'result.title': 'Result',
      'result.tie': "It's a tie! Roll again?",
      'result.hint': 'Tap to skip',
      'result.rolling': 'Rolling · {label}',
      'result.reroll': 'Roll again',
      'result.share': 'Share result',
      'history.title': 'History',
      'history.subtitle': 'Last 10 · saved on this device only',
      'history.empty': 'No history yet.',
      'tie.short': 'Tie!',
      'time.now': 'just now',
      'time.min': '{n} min ago',
      'time.hour': '{n} h ago',
      'time.day': '{n} d ago',
      'share.subtitle': 'Dice of fate',
      ph: ['e.g. Pizza', 'e.g. Sushi', 'e.g. Tacos', 'e.g. Salad']
    }
  };

  var lang = 'ko';
  var listeners = [];

  function detect() {
    try {
      var stored = global.localStorage && global.localStorage.getItem(KEY);
      if (stored === 'ko' || stored === 'en') return stored;
    } catch (e) {}
    var nav = ((global.navigator && global.navigator.language) || '').toLowerCase();
    return nav.indexOf('ko') === 0 ? 'ko' : 'en';
  }

  function t(key, params) {
    var s = STR[lang][key];
    if (s == null) s = STR.ko[key] != null ? STR.ko[key] : key;
    if (params) {
      for (var k in params) {
        if (params.hasOwnProperty(k)) s = s.replace('{' + k + '}', params[k]);
      }
    }
    return s;
  }

  function apply() {
    if (!global.document) return;
    document.documentElement.setAttribute('lang', lang);
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    }
    var toggle = document.getElementById('lang-toggle');
    if (toggle) toggle.textContent = lang === 'ko' ? 'EN' : '한';
  }

  function set(next) {
    lang = next === 'en' ? 'en' : 'ko';
    try { if (global.localStorage) global.localStorage.setItem(KEY, lang); } catch (e) {}
    apply();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](lang); } catch (e) {}
    }
  }

  global.ChoiceHelper = global.ChoiceHelper || {};
  global.ChoiceHelper.i18n = {
    t: t,
    apply: apply,
    set: set,
    toggle: function () { set(lang === 'ko' ? 'en' : 'ko'); },
    init: function () { lang = detect(); apply(); },
    getLang: function () { return lang; },
    ph: function (i) { return STR[lang].ph[i]; },
    onChange: function (cb) { listeners.push(cb); }
  };
})(typeof window !== 'undefined' ? window : this);
