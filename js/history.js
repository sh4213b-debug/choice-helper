/*
 * history.js — 최근 결과 히스토리 (localStorage, 최대 10개)
 * 서버 전송 없음. 모든 데이터는 로컬에만 저장한다 (§2.5).
 * DOM 비의존 로직. Capacitor 패키징 대비 뷰와 분리.
 */
(function (global) {
  'use strict';

  var KEY = 'choicehelper.history.v1';
  var MAX = 10;

  function load() {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(KEY) : null;
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function persist(list) {
    try {
      if (global.localStorage) global.localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      /* 용량 초과·프라이빗 모드 등은 조용히 무시 */
    }
  }

  // entry = { id, ts, count, tie, items:[{label, grade, ko, en, roll}] }
  function add(entry) {
    var list = load();
    list.unshift(entry);
    if (list.length > MAX) list = list.slice(0, MAX);
    persist(list);
    return list;
  }

  function remove(id) {
    var list = load().filter(function (e) { return e.id !== id; });
    persist(list);
    return list;
  }

  function clear() {
    persist([]);
    return [];
  }

  global.ChoiceHelper = global.ChoiceHelper || {};
  global.ChoiceHelper.history = {
    MAX: MAX,
    load: load,
    add: add,
    remove: remove,
    clear: clear
  };
})(typeof window !== 'undefined' ? window : this);
