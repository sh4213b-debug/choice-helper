/*
 * dice3d.js — 반투명 레진 d20 렌더러 (Three.js)
 * 3겹 구조: 외피(투명 레진 셸) ▶ 내부 인클루전(마블·금박) ▶ 글리터 파티클.
 * 환경 반사는 RoomEnvironment(절차적, 오프라인) 기반 PMREM 환경맵으로 만든다.
 * 지오메트리·굴림/결과 면 정렬 로직은 이전과 동일하게 유지한다.
 *
 * ES 모듈. 로드 성공 시 window.ChoiceHelper.dice3d 노출. 실패 시 app.js가 CSS fallback.
 */
import * as THREE from './vendor/three.module.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

var NS = (window.ChoiceHelper = window.ChoiceHelper || {});

var DIE_RADIUS = 1.15;

// ── WebGL 지원 여부 ─────────────────────────────────────────
function isWebGLAvailable() {
  try {
    var c = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl'))
    );
  } catch (e) {
    return false;
  }
}

// ── 숫자 텍스처 (핑크골드 + 가는 외곽선, 세리프) ────────────
function makeNumberTexture(n) {
  var S = 200;
  var c = document.createElement('canvas');
  c.width = c.height = S;
  var ctx = c.getContext('2d');

  var cx = S / 2, cy = S / 2 + S * 0.02;
  var str = String(n);

  // 배경은 완전 투명(깨끗한 누끼) — 글리프만 남겨 레진 질감이 끊기지 않게 한다
  ctx.font = '700 ' + Math.round(S * 0.56) + 'px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 은은한 금빛 발광 후광
  ctx.shadowColor = 'rgba(255, 214, 140, 0.85)';
  ctx.shadowBlur = S * 0.06;

  // 골드 그라디언트 채움 (보라 레진과 대비되는 금색 숫자 — 참고: Moon Dice)
  var grad = ctx.createLinearGradient(0, S * 0.2, 0, S * 0.8);
  grad.addColorStop(0, '#fff2cf');
  grad.addColorStop(0.5, '#f0c36a');
  grad.addColorStop(1, '#c9932f');
  ctx.fillStyle = grad;
  ctx.fillText(str, cx, cy);

  // 가는 어두운 외곽선 (글리프 자체 윤곽만)
  ctx.shadowBlur = 0;
  ctx.lineWidth = S * 0.018;
  ctx.strokeStyle = 'rgba(60, 40, 12, 0.85)';
  ctx.strokeText(str, cx, cy);

  // 6/9 구분 밑줄
  if (n === 6 || n === 9) {
    ctx.strokeStyle = '#f0c36a';
    ctx.lineWidth = S * 0.03;
    ctx.beginPath();
    ctx.moveTo(S * 0.36, S * 0.74);
    ctx.lineTo(S * 0.64, S * 0.74);
    ctx.stroke();
  }

  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ── 글리터 스프라이트 (부드러운 원형 점) ────────────────────
function makeGlitterSprite() {
  var S = 64;
  var c = document.createElement('canvas');
  c.width = c.height = S;
  var ctx = c.getContext('2d');
  var rg = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, S, S);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── 레진 속 금박 인클루전 (Points, 주사위 내부에 부유) ──────
// 보라 레진 안에 금 조각이 박힌 룩(참고: purple & gold resin "Moon Dice").
function makeGoldFlecks(glitterTex) {
  var N = 46;
  var g = new THREE.BufferGeometry();
  var positions = new Float32Array(N * 3);
  var sizes = new Float32Array(N);
  var R = DIE_RADIUS * 0.82;
  for (var i = 0; i < N; i++) {
    // 구 내부 균일 분포 (표면 아닌 부피)
    var u = Math.random();
    var r = R * Math.cbrt(u);
    var theta = Math.random() * Math.PI * 2;
    var phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    sizes[i] = 0.04 + Math.random() * 0.07;
  }
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  var m = new THREE.PointsMaterial({
    map: glitterTex,
    color: 0xf3c775,       // 금박
    size: 0.09,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  var pts = new THREE.Points(g, m);
  pts.renderOrder = 3; // 셸(2) 위, 숫자(6) 아래
  return pts;
}

// ── 정이십면체 면 데이터 (중심·법선) + 숫자 1~20 배정 ───────
function computeFaces(geometry) {
  var pos = geometry.attributes.position;
  var faceCount = pos.count / 3; // PolyhedronGeometry 는 non-indexed
  var faces = [];
  for (var f = 0; f < faceCount; f++) {
    var a = new THREE.Vector3().fromBufferAttribute(pos, f * 3 + 0);
    var b = new THREE.Vector3().fromBufferAttribute(pos, f * 3 + 1);
    var c = new THREE.Vector3().fromBufferAttribute(pos, f * 3 + 2);
    var center = new THREE.Vector3().addVectors(a, b).add(c).divideScalar(3);
    faces.push({
      center: center,
      normal: center.clone().normalize(),
      number: f + 1
    });
  }
  return faces;
}

// 숫자 평면을 면 바깥쪽에 얹는다. 평면 앞면(+Z)이 면 법선(바깥) 방향을 향하므로
// 바깥에서 보는 카메라 기준으로 좌우반전 없이 정방향으로 읽힌다.
function makeNumberPlane(face) {
  var size = DIE_RADIUS * 0.66;
  var geo = new THREE.PlaneGeometry(size, size);
  var mat = new THREE.MeshBasicMaterial({
    map: makeNumberTexture(face.number),
    transparent: true,
    depthWrite: false,
    depthTest: false, // 삼각 면 경계에서 잘리지 않도록 항상 위에 렌더
    side: THREE.FrontSide, // 앞면만 → 뒤쪽(반전) 숫자는 컬링되어 안 보임
    toneMapped: false
  });
  var plane = new THREE.Mesh(geo, mat);
  plane.renderOrder = 6; // 글리터(4)·연출(5)보다 위에 그려 숫자가 가려지지 않게

  var n = face.normal;
  var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  plane.quaternion.copy(q);

  // 글자 위쪽을 월드 up 투영 방향에 맞춤 (순수 회전, 반전 없음)
  var worldUp = new THREE.Vector3(0, 1, 0);
  var projUp = worldUp.clone().sub(n.clone().multiplyScalar(worldUp.dot(n)));
  if (projUp.lengthSq() > 1e-4) {
    projUp.normalize();
    var planeUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    var ang = Math.atan2(
      new THREE.Vector3().crossVectors(planeUp, projUp).dot(n),
      planeUp.dot(projUp)
    );
    plane.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(n, ang));
  }

  plane.position.copy(face.center).multiplyScalar(1.02);
  return plane;
}

// ── 주사위 스테이지 생성 ────────────────────────────────────
function createStage(canvas) {
  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // 상한 2
  renderer.setClearAlpha(0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  var scene = new THREE.Scene();

  // 환경맵: RoomEnvironment(절차적) → PMREM. 유리/레진 반사의 핵심.
  var pmrem = new THREE.PMREMGenerator(renderer);
  var roomScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(roomScene, 0.04).texture;
  pmrem.dispose();

  var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 3.7);

  // 조명: 약한 웜 키 + 뒤쪽 금색/퍼플 림 (배경 오라클 테마와 연결)
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  var key = new THREE.DirectionalLight(0xfff2e0, 1.15);
  key.position.set(3, 4, 5);
  scene.add(key);
  var rimGold = new THREE.PointLight(0xf0c36a, 65, 0, 2); // 금색 림 (기존 핑크 교체)
  rimGold.position.set(-4, 1.5, -3.5);
  scene.add(rimGold);
  var rimViolet = new THREE.PointLight(0x6b3fa0, 55, 0, 2); // 로브 퍼플
  rimViolet.position.set(4, -1.5, -3.5);
  scene.add(rimViolet);

  var die = new THREE.Group();

  // (1) 반투명 보라 레진 셸 — 위는 맑고 아래로 갈수록 진해지는 세로 그라데이션(참고 이미지)
  var shellGeom = new THREE.IcosahedronGeometry(DIE_RADIUS, 0);
  var faces = computeFaces(shellGeom); // position 기준, 법선 재계산 전에
  shellGeom.computeVertexNormals();    // 면별 평면 법선 → 각진 면·모서리 하이라이트

  // 세로 그라데이션 정점색: 위쪽 맑은 라벤더 → 아래쪽 진한 보라
  (function applyVerticalGradient(geom, topHex, botHex) {
    var pos = geom.attributes.position;
    var top = new THREE.Color(topHex), bot = new THREE.Color(botHex), tmp = new THREE.Color();
    var minY = Infinity, maxY = -Infinity, i;
    for (i = 0; i < pos.count; i++) {
      var y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    var span = (maxY - minY) || 1;
    var colors = new Float32Array(pos.count * 3);
    for (i = 0; i < pos.count; i++) {
      tmp.copy(bot).lerp(top, (pos.getY(i) - minY) / span);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  })(shellGeom, 0xdccbf3, 0x3a1066);

  var shellMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    transmission: 0.9,
    thickness: 1.3,
    ior: 1.52,
    roughness: 0.05,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    attenuationColor: new THREE.Color(0x7a2fb0),
    attenuationDistance: 1.8,
    specularIntensity: 1.0,
    sheen: 0.5,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(0xe8c690), // 금빛 sheen(퍼플+골드 조합)
    emissive: new THREE.Color(0x1a0733),
    emissiveIntensity: 0.12,
    envMapIntensity: 1.7,
    transparent: true,
    side: THREE.FrontSide
  });
  var shell = new THREE.Mesh(shellGeom, shellMat);
  shell.renderOrder = 2;
  die.add(shell);

  // 내추럴 20 골드 파티클용 스프라이트
  var glitterTex = makeGlitterSprite();

  // (2) 레진 속 금박 인클루전 — 주사위와 함께 회전
  die.add(makeGoldFlecks(glitterTex));

  // (3) 숫자
  for (var i = 0; i < faces.length; i++) {
    die.add(makeNumberPlane(faces[i]));
  }

  scene.add(die);

  // 내추럴 1/20 연출용 플래시 라이트
  var flashLight = new THREE.PointLight(0xff2b3b, 0, 14);
  flashLight.position.set(0, 0, 3.2);
  scene.add(flashLight);

  // ── 굴림 애니메이션 상태 (동일 로직) ────────────────────────
  var ROLL_MS = 1750;
  var SETTLE_MS = 240;
  var mode = 'idle';     // idle | roll | settle | done
  var startT = 0;
  var finalQ = null;
  var onDone = null;
  var natType = 0;
  var forceFinish = false;
  var baseInnerEmissive = shellMat.emissiveIntensity; // 내추럴 연출용 기준 발광

  var axis1 = new THREE.Vector3(0.5, 1, 0.35).normalize();
  var axis2 = new THREE.Vector3(1, 0.2, -0.6).normalize();
  var totalA1 = Math.PI * 2 * 5;
  var totalA2 = Math.PI * 2 * 3;
  var tmpQ1 = new THREE.Quaternion();
  var tmpQ2 = new THREE.Quaternion();
  var camDir = new THREE.Vector3(0, 0, 1);

  var natParticles = null;

  function easeOutQuart(x) { return 1 - Math.pow(1 - x, 4); }

  function computeFinalQ(number) {
    var face = faces[number - 1];
    return new THREE.Quaternion().setFromUnitVectors(face.normal, camDir);
  }

  function spawnGoldBurst() {
    var N = 150;
    var g = new THREE.BufferGeometry();
    var positions = new Float32Array(N * 3);
    var vel = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.acos(2 * Math.random() - 1);
      var sp = 1.8 + Math.random() * 2.2;
      vel[i * 3 + 0] = Math.sin(phi) * Math.cos(theta) * sp;
      vel[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * sp;
      vel[i * 3 + 2] = Math.cos(phi) * sp;
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var m = new THREE.PointsMaterial({
      map: glitterTex,
      color: 0xffd27a,
      size: 0.1,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    natParticles = new THREE.Points(g, m);
    natParticles.renderOrder = 5;
    natParticles.userData = { vel: vel, age: 0 };
    scene.add(natParticles);
  }

  function disposeParticles() {
    if (!natParticles) return;
    scene.remove(natParticles);
    natParticles.geometry.dispose();
    natParticles.material.dispose();
    natParticles = null;
  }

  function triggerNat() {
    if (natType === 20) spawnGoldBurst();
  }

  function updateParticles(dt) {
    if (!natParticles) return;
    var ud = natParticles.userData;
    ud.age += dt;
    var pos = natParticles.geometry.attributes.position.array;
    for (var i = 0; i < pos.length; i++) pos[i] += ud.vel[i] * dt;
    natParticles.geometry.attributes.position.needsUpdate = true;
    natParticles.material.opacity = Math.max(0, 1 - ud.age / 0.85);
    if (ud.age > 0.85) disposeParticles();
  }

  var running = true;
  var idle = true;
  var lastT = 0;

  function resize() {
    var w = canvas.clientWidth || 1;
    var h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function frame(t) {
    if (!running) return;
    var dt = lastT ? (t - lastT) / 1000 : 0;
    lastT = t;

    if (mode === 'idle') {
      die.rotation.y += dt * 0.6;
      die.rotation.x += dt * 0.25;
    } else if (mode === 'roll') {
      if (!startT) startT = t;
      var p = Math.min((t - startT) / ROLL_MS, 1);
      if (forceFinish) p = 1;
      var k = 1 - easeOutQuart(p);
      tmpQ1.setFromAxisAngle(axis1, totalA1 * k);
      tmpQ2.setFromAxisAngle(axis2, totalA2 * k);
      die.quaternion.copy(finalQ).multiply(tmpQ1).multiply(tmpQ2);
      if (p >= 1) {
        mode = 'settle';
        startT = t;
        forceFinish = false;
        triggerNat();
      }
    } else if (mode === 'settle') {
      var sp = Math.min((t - startT) / SETTLE_MS, 1);
      var wave = Math.sin(sp * Math.PI);
      die.quaternion.copy(finalQ);
      die.scale.setScalar(1 + 0.06 * wave);
      if (natType === 20) {
        shellMat.emissiveIntensity = baseInnerEmissive + 2.2 * wave;
        flashLight.color.setHex(0xffd27a);
        flashLight.intensity = 6 * wave;
      } else if (natType === 1) {
        shellMat.emissiveIntensity = baseInnerEmissive * (1 - 0.7 * wave);
        flashLight.color.setHex(0xff2b3b);
        flashLight.intensity = 9 * wave;
      } else {
        shellMat.emissiveIntensity = baseInnerEmissive + 0.6 * wave;
      }
      if (sp >= 1) {
        die.scale.setScalar(1);
        shellMat.emissiveIntensity = baseInnerEmissive;
        flashLight.intensity = 0;
        mode = 'done';
        if (onDone) { var d = onDone; onDone = null; d(); }
      }
    }

    updateParticles(dt);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }

  var rafId = requestAnimationFrame(frame);
  var onResize = function () { resize(); };
  window.addEventListener('resize', onResize);
  resize();

  return {
    faces: faces,
    rollTo: function (number, opts) {
      opts = opts || {};
      finalQ = computeFinalQ(number);
      natType = number === 20 ? 20 : number === 1 ? 1 : 0;
      onDone = opts.onComplete || null;
      startT = 0;
      forceFinish = false;
      idle = false;
      disposeParticles();
      mode = 'roll';
    },
    skip: function () {
      if (mode === 'roll') forceFinish = true;
    },
    isAnimating: function () { return mode === 'roll' || mode === 'settle'; },
    setIdle: function (v) { idle = !!v; mode = v ? 'idle' : mode; },
    dispose: function () {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      disposeParticles();
      scene.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          var m = obj.material;
          if (m.map) m.map.dispose();
          if (m.emissiveMap && m.emissiveMap !== m.map) m.emissiveMap.dispose();
          m.dispose();
        }
      });
      // RoomEnvironment 리소스 정리
      roomScene.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      if (scene.environment) scene.environment.dispose();
      renderer.dispose();
    }
  };
}

NS.dice3d = {
  supported: isWebGLAvailable,
  create: function (canvas) {
    if (!isWebGLAvailable()) return null;
    try {
      return createStage(canvas);
    } catch (e) {
      if (window.console) console.warn('[dice3d] init failed:', e);
      return null;
    }
  }
};
