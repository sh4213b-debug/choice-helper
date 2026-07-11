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
      'home.scrollCue': '아래로 내려 자세히 보기',
      'about.h': '선택 도우미란?',
      'about.p1': '선택 도우미는 결정을 내리기 어려울 때 20면체 주사위(d20)를 굴려 답을 제안하는 무료 웹 도구입니다. 점심 메뉴부터 주말 계획까지, 사소하지만 쉽게 정하지 못하는 선택을 가볍고 재미있게 풀어 줍니다.',
      'about.p2': '각 선택지마다 주사위를 한 번씩 독립적으로 굴리고, 나온 숫자를 8단계 등급(‘탁월하다’부터 ‘피해야 한다’까지)으로 바꿔 보여 줍니다. 결과는 순전히 운에 맡기되, 어떤 선택이 더 좋은 ‘운’을 받았는지 한눈에 비교할 수 있습니다.',
      'guide.h': '이렇게 사용하세요',
      'guide.s1t': '선택지 개수를 고르세요',
      'guide.s1d': '한 가지를 평가할지, 최대 네 가지를 비교할지 홈 화면에서 카드를 고릅니다.',
      'guide.s2t': '이름을 붙이거나 건너뛰세요',
      'guide.s2d': '각 선택지에 이름을 적을 수 있고, 비워 두면 A·B·C·D로 표시됩니다.',
      'guide.s3t': '주사위를 굴리고 결과를 확인하세요',
      'guide.s3d': '선택지마다 주사위가 굴러 등급이 매겨집니다. 최고 등급이 겹치면 동점 안내가 뜨고 다시 굴릴 수 있으며, 결과는 이미지로 저장·공유할 수 있습니다.',
      'grades.h': '등급은 이렇게 정해져요',
      'grades.p': '1부터 20까지 모든 숫자가 나올 확률은 같습니다. 아래 표처럼 숫자 구간을 8개 등급으로 나눴어요. 20이 나오면 최고 등급 ‘탁월하다’, 1이 나오면 ‘피해야 한다’가 됩니다.',
      'grades.thRange': '주사위 눈',
      'grades.thGrade': '등급',
      'grades.thProb': '확률',
      'faq.h': '자주 묻는 질문',
      'faq.q1': '결과는 정말 무작위인가요?',
      'faq.a1': '네. 각 선택지마다 브라우저의 표준 난수로 1~20 중 하나를 공정하게 뽑습니다. 미리 정해진 답이나 조작은 없습니다.',
      'faq.q2': '제 데이터는 어디에 저장되나요?',
      'faq.a2': '굴림 기록과 언어 설정은 오직 사용 중인 기기의 브라우저에만 저장됩니다. 서버로 전송되지 않으며, 계정도 필요 없습니다.',
      'faq.q3': '동점이 나오면 어떻게 하나요?',
      'faq.a3': '가장 높은 등급을 받은 선택지가 둘 이상이면 동점으로 안내하고, 원하면 같은 선택지로 다시 굴릴 수 있습니다.',
      'faq.q4': '무료인가요? 설치가 필요한가요?',
      'faq.a4': '설치 없이 웹 브라우저에서 무료로 사용할 수 있습니다.',
      'faq.q5': '중요한 결정에 사용해도 되나요?',
      'faq.a5': '선택 도우미는 재미와 참고를 위한 도구입니다. 인생의 중대한 결정은 충분한 정보와 신중한 판단으로 내려 주세요.',
      'trust.h': '개인정보와 신뢰',
      'trust.p': '이 앱에는 광고, 추적기, 외부 분석 도구, 로그인이 없습니다. 굴림 기록과 설정은 이 기기에만 남고 언제든 직접 삭제할 수 있습니다.',
      'trust.link': '개인정보처리방침 전문 보기 →',
      'footer.tagline': '운에 맡기는 즐거운 선택',
      'footer.about': '소개',
      'footer.guide': '이용 방법',
      'footer.grades': '등급표',
      'footer.faq': '자주 묻는 질문',
      'footer.privacy': '개인정보처리방침',
      'footer.source': '소스 코드',
      'footer.copyright': '© 2026 선택 도우미',
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
      'home.scrollCue': 'Scroll down to learn more',
      'about.h': 'What is Choice Helper?',
      'about.p1': 'Choice Helper is a free web tool that rolls a twenty-sided die (d20) to suggest an answer when a decision is hard to make. From what to eat for lunch to weekend plans, it turns small, hard-to-settle choices into a bit of light fun.',
      'about.p2': 'It rolls the die once, independently, for each option and maps the number to one of eight grades — from “Outstanding” down to “Avoid.” The outcome is left entirely to chance, while letting you compare at a glance which option drew the better luck.',
      'guide.h': 'How to use it',
      'guide.s1t': 'Pick how many options',
      'guide.s1d': 'Choose on the home screen whether to evaluate one option or compare up to four.',
      'guide.s2t': 'Name them, or skip',
      'guide.s2d': 'Give each option a name, or leave it blank to show A·B·C·D.',
      'guide.s3t': 'Roll and read the result',
      'guide.s3d': 'A die rolls for each option and assigns a grade. If the top grade ties, you’ll be prompted to roll again, and you can save or share the result as an image.',
      'grades.h': 'How grades are decided',
      'grades.p': 'Every number from 1 to 20 is equally likely. The ranges below map to eight grades. A 20 gives the top grade “Outstanding,” while a 1 gives “Avoid.”',
      'grades.thRange': 'Roll',
      'grades.thGrade': 'Grade',
      'grades.thProb': 'Chance',
      'faq.h': 'Frequently asked questions',
      'faq.q1': 'Are the results really random?',
      'faq.a1': 'Yes. For each option, one of 1–20 is drawn fairly using your browser’s standard random generator. There is no predetermined answer or manipulation.',
      'faq.q2': 'Where is my data stored?',
      'faq.a2': 'Your roll history and language setting are stored only in the browser on the device you use. Nothing is sent to a server, and no account is required.',
      'faq.q3': 'What happens on a tie?',
      'faq.a3': 'If two or more options share the highest grade, you’ll see a tie notice and can roll again with the same options if you like.',
      'faq.q4': 'Is it free? Do I need to install it?',
      'faq.a4': 'It’s free to use in a web browser, with no installation.',
      'faq.q5': 'Can I use it for important decisions?',
      'faq.a5': 'Choice Helper is meant for fun and light reference. Please make life’s important decisions with proper information and careful judgment.',
      'trust.h': 'Privacy & trust',
      'trust.p': 'This app has no ads, trackers, external analytics, or logins. Your roll history and settings stay on this device, and you can delete them anytime.',
      'trust.link': 'Read the full privacy policy →',
      'footer.tagline': 'Playful decisions, left to chance',
      'footer.about': 'About',
      'footer.guide': 'How to use',
      'footer.grades': 'Grades',
      'footer.faq': 'FAQ',
      'footer.privacy': 'Privacy',
      'footer.source': 'Source',
      'footer.copyright': '© 2026 Choice Helper',
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
