/*
 * share.js — 결과 카드 이미지 생성 + 공유 (§2.6)
 * Canvas로 결과 카드를 그리고, 모바일은 Web Share API, 데스크톱은 다운로드 fallback.
 * 카드에 앱 이름 + URL 워터마크 포함. 외부 전송·수집 없음(공유는 사용자 액션).
 */
(function (global) {
  'use strict';

  var APP_NAME = '선택 도우미';
  var FONT = '"Nanum Myeongjo", "Apple SD Gothic Neo", serif';

  // 등급(1~8) → 카드 색
  var GRADE_COLOR = {
    8: '#ffd166', 7: '#f4b088', 6: '#e6b3ff', 5: '#c79bff',
    4: '#a78bfa', 3: '#9a8fb0', 2: '#7f77a0', 1: '#6b6a86'
  };

  function watermarkUrl() {
    try {
      var h = global.location && global.location.hostname;
      if (h && h !== 'localhost' && h !== '127.0.0.1') return global.location.host;
    } catch (e) {}
    return 'Choice Helper';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // data = { tie, items:[{label, ko, grade}] }
  function buildCanvas(data) {
    var W = 1080, H = 1350;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    // 배경 그라데이션 (딥 바이올렛)
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1c1533');
    bg.addColorStop(1, '#100c1d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 금색 테두리 프레임
    ctx.strokeStyle = 'rgba(240,195,106,0.55)';
    ctx.lineWidth = 3;
    roundRect(ctx, 40, 40, W - 80, H - 80, 36);
    ctx.stroke();

    // 오브 글로우 (상단 장식)
    var orb = ctx.createRadialGradient(W / 2, 250, 0, W / 2, 250, 220);
    orb.addColorStop(0, 'rgba(240,195,106,0.35)');
    orb.addColorStop(1, 'rgba(240,195,106,0)');
    ctx.fillStyle = orb;
    ctx.fillRect(0, 0, W, 500);

    ctx.textAlign = 'center';

    // 타이틀
    ctx.fillStyle = '#f0c36a';
    ctx.font = '72px ' + FONT;
    ctx.fillText(APP_NAME, W / 2, 250);

    ctx.fillStyle = '#cdbfa0';
    ctx.font = '34px ' + FONT;
    ctx.fillText('운명의 주사위 결과', W / 2, 315);

    // 결과 항목
    var items = data.items || [];
    var top = 430;
    var rowH = Math.min(150, (H - top - 180) / Math.max(items.length, 1));
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var cy = top + rowH * i + rowH / 2;

      // 카드 배경
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      roundRect(ctx, 120, cy - rowH / 2 + 12, W - 240, rowH - 24, 20);
      ctx.fill();
      ctx.strokeStyle = 'rgba(240,195,106,0.18)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, 120, cy - rowH / 2 + 12, W - 240, rowH - 24, 20);
      ctx.stroke();

      // 라벨 (좌)
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f5eedc';
      ctx.font = '40px ' + FONT;
      ctx.fillText(clip(it.label, 14), 160, cy + 14);

      // 등급 (우)
      ctx.textAlign = 'right';
      ctx.fillStyle = GRADE_COLOR[it.grade] || '#cdbfa0';
      ctx.font = '52px ' + FONT;
      ctx.fillText(it.ko, W - 160, cy + 18);
    }

    // 동점 표시
    if (data.tie) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff9ad8';
      ctx.font = '34px ' + FONT;
      ctx.fillText('동점!', W / 2, top + rowH * items.length + 46);
    }

    // 워터마크 (앱 이름 + URL)
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(240,195,106,0.7)';
    ctx.font = '30px ' + FONT;
    ctx.fillText(APP_NAME + '  ·  ' + watermarkUrl(), W / 2, H - 90);

    return canvas;
  }

  function clip(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function toBlob(canvas) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (b) { resolve(b); }, 'image/png');
    });
  }

  // 카드 생성 후 공유(모바일) 또는 다운로드(데스크톱)
  function shareResult(data) {
    var ready = (document.fonts && document.fonts.ready)
      ? document.fonts.ready : Promise.resolve();
    return ready.then(function () {
      var canvas = buildCanvas(data);
      return toBlob(canvas);
    }).then(function (blob) {
      if (!blob) return;
      var file = new File([blob], 'choice-helper.png', { type: 'image/png' });
      var canShareFiles = navigator.canShare && navigator.canShare({ files: [file] });
      if (canShareFiles && navigator.share) {
        return navigator.share({
          files: [file],
          title: APP_NAME,
          text: '운명의 주사위 결과'
        }).catch(function () { /* 사용자가 취소 */ });
      }
      // 데스크톱 fallback: 다운로드
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'choice-helper.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  global.ChoiceHelper = global.ChoiceHelper || {};
  global.ChoiceHelper.share = { buildCanvas: buildCanvas, shareResult: shareResult };
})(typeof window !== 'undefined' ? window : this);
