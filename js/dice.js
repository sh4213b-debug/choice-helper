/*
 * dice.js — Choice Helper 순수 로직 (뷰 의존성 없음)
 * d20 굴림과 8단계 등급 매핑을 담당한다.
 * Capacitor 패키징 및 테스트를 고려해 DOM에 의존하지 않는다.
 */
(function (global) {
  'use strict';

  // 8단계 등급 정의. d20 범위(min~max, 포함)와 ko/en 라벨을 함께 보관한다.
  // grade: 등급 숫자(1~8), tier: 스타일 구분용 키.
  var GRADES = [
    { grade: 8, min: 20, max: 20, ko: '탁월하다',    en: 'Outstanding',   tier: 'nat20' },
    { grade: 7, min: 17, max: 19, ko: '매우 좋다',   en: 'Excellent',     tier: 't7' },
    { grade: 6, min: 14, max: 16, ko: '좋다',        en: 'Good',          tier: 't6' },
    { grade: 5, min: 11, max: 13, ko: '괜찮다',      en: 'Fairly Good',   tier: 't5' },
    { grade: 4, min: 8,  max: 10, ko: '보통이다',    en: 'Average',       tier: 't4' },
    { grade: 3, min: 5,  max: 7,  ko: '아쉽다',      en: 'Disappointing', tier: 't3' },
    { grade: 2, min: 2,  max: 4,  ko: '매우 별로다', en: 'Very Poor',     tier: 't2' },
    { grade: 1, min: 1,  max: 1,  ko: '피해야 한다', en: 'Avoid',         tier: 'nat1' }
  ];

  // 1~20 정수 하나를 공정하게 뽑는다.
  function rollD20() {
    return Math.floor(Math.random() * 20) + 1;
  }

  // d20 값(1~20)을 등급 객체로 매핑한다. 범위를 벗어나면 null.
  function gradeForRoll(roll) {
    for (var i = 0; i < GRADES.length; i++) {
      if (roll >= GRADES[i].min && roll <= GRADES[i].max) {
        return GRADES[i];
      }
    }
    return null;
  }

  // 한 선택지의 굴림 결과. { roll, grade(객체) } 형태.
  function rollChoice() {
    var roll = rollD20();
    return { roll: roll, grade: gradeForRoll(roll) };
  }

  // 선택지 개수만큼 독립적으로 굴린다. results[i] = { roll, grade }.
  function rollAll(count) {
    var results = [];
    for (var i = 0; i < count; i++) {
      results.push(rollChoice());
    }
    return results;
  }

  // 같은 '등급 숫자'가 둘 이상 있으면 동점으로 본다(선택지 2개 이상일 때만 의미).
  function hasTie(results) {
    if (!results || results.length < 2) return false;
    var seen = {};
    for (var i = 0; i < results.length; i++) {
      var g = results[i].grade.grade;
      if (seen[g]) return true;
      seen[g] = true;
    }
    return false;
  }

  global.ChoiceHelper = global.ChoiceHelper || {};
  global.ChoiceHelper.dice = {
    GRADES: GRADES,
    rollD20: rollD20,
    gradeForRoll: gradeForRoll,
    rollChoice: rollChoice,
    rollAll: rollAll,
    hasTie: hasTie
  };
})(typeof window !== 'undefined' ? window : this);
