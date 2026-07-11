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

  ctx.font = '600 ' + Math.round(S * 0.52) + 'px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var cx = S / 2, cy = S / 2 + S * 0.02;
  var str = String(n);

  // 은은한 발광 후광
  ctx.shadowColor = 'rgba(240, 168, 130, 0.7)';
  ctx.shadowBlur = S * 0.07;

  // 핑크골드 그라디언트 채움 (#F0A882 계열)
  var grad = ctx.createLinearGradient(0, S * 0.22, 0, S * 0.78);
  grad.addColorStop(0, '#ffd0ab');
  grad.addColorStop(0.5, '#f0a882');
  grad.addColorStop(1, '#e08a6a');
  ctx.fillStyle = grad;
  ctx.fillText(str, cx, cy);

  // 가는 어두운 외곽선 (밝은 면 위에서도 읽히도록)
  ctx.shadowBlur = 0;
  ctx.lineWidth = S * 0.012;
  ctx.strokeStyle = 'rgba(90, 40, 25, 0.85)';
  ctx.strokeText(str, cx, cy);

  // 6/9 구분 밑줄
  if (n === 6 || n === 9) {
    ctx.strokeStyle = '#f0a882';
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

// ── 내부 인클루전용 마블 텍스처 (보라·마젠타·흰색 소용돌이 + 금/오팔 반점) ──
function makeMarbleTexture() {
  var S = 512;
  var c = document.createElement('canvas');
  c.width = c.height = S;
  var ctx = c.getContext('2d');

  // 베이스: 짙은 보라
  ctx.fillStyle = '#2a1147';
  ctx.fillRect(0, 0, S, S);

  // 소용돌이치는 마블: 보라/마젠타/희끗한 흰색 소프트 블롭 다수
  var swirl = ['#7b2fbe', '#c026d3', '#ede9fe', '#4c1d95', '#a21caf'];
  for (var i = 0; i < 46; i++) {
    var x = Math.random() * S, y = Math.random() * S;
    var r = 40 + Math.random() * 150;
    var col = swirl[(Math.random() * swirl.length) | 0];
    var rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.22 + Math.random() * 0.3;
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 금박 + 오팔(청록/핑크) 반점
  var flake = ['#f59e0b', '#fcd34d', '#22d3ee', '#f472b6'];
  for (var j = 0; j < 140; j++) {
    var fx = Math.random() * S, fy = Math.random() * S;
    var fr = 1.5 + Math.random() * 4.5;
    ctx.globalAlpha = 0.5 + Math.random() * 0.5;
    ctx.fillStyle = flake[(Math.random() * flake.length) | 0];
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
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
  var size = DIE_RADIUS * 0.6;
  var geo = new THREE.PlaneGeometry(size, size);
  var mat = new THREE.MeshBasicMaterial({
    map: makeNumberTexture(face.number),
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide, // 앞면만 → 뒤쪽(반전) 숫자는 컬링되어 안 보임
    toneMapped: false
  });
  var plane = new THREE.Mesh(geo, mat);
  plane.renderOrder = 3;

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
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  var scene = new THREE.Scene();

  // 환경맵: RoomEnvironment(절차적) → PMREM. 유리/레진 반사의 핵심.
  var pmrem = new THREE.PMREMGenerator(renderer);
  var roomScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(roomScene, 0.04).texture;
  pmrem.dispose();

  var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 3.7);

  // 조명 (§7): 약한 웜 키 + 뒤쪽 핑크/바이올렛 림
  scene.add(new THREE.AmbientLight(0xffffff, 0.28));
  var key = new THREE.DirectionalLight(0xfff2e0, 1.15);
  key.position.set(3, 4, 5);
  scene.add(key);
  var rimPink = new THREE.PointLight(0xf472b6, 60, 0, 2);
  rimPink.position.set(-4, 1.5, -3.5);
  scene.add(rimPink);
  var rimViolet = new THREE.PointLight(0x8b5cf6, 60, 0, 2);
  rimViolet.position.set(4, -1.5, -3.5);
  scene.add(rimViolet);

  var die = new THREE.Group();

  // (1) 외피 — 투명 레진 셸
  var shellGeom = new THREE.IcosahedronGeometry(DIE_RADIUS, 0);
  var faces = computeFaces(shellGeom); // position 기준, 법선 재계산 전에
  shellGeom.computeVertexNormals();    // 면별 평면 법선 → 각진 면·모서리 하이라이트
  var shellMat = new THREE.MeshPhysicalMaterial({
    color: 0x8b5cf6,
    transmission: 0.92,
    thickness: 1.2,
    ior: 1.5,
    roughness: 0.08,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    attenuationColor: new THREE.Color(0x6d28d9),
    attenuationDistance: 1.5,
    specularIntensity: 1.0,
    iridescence: 0.12,
    iridescenceIOR: 1.3,
    transparent: true,
    side: THREE.FrontSide
  });
  var shell = new THREE.Mesh(shellGeom, shellMat);
  shell.renderOrder = 2;
  die.add(shell);

  // (2) 내부 인클루전 — 마블·금박이 비쳐 보이는 불투명 코어
  var marbleTex = makeMarbleTexture();
  var innerGeom = new THREE.IcosahedronGeometry(DIE_RADIUS * 0.85, 2);
  var innerMat = new THREE.MeshStandardMaterial({
    map: marbleTex,
    emissive: new THREE.Color(0x5a1e8a),
    emissiveMap: marbleTex,
    emissiveIntensity: 0.45,
    roughness: 0.4,
    metalness: 0.0
  });
  var inner = new THREE.Mesh(innerGeom, innerMat);
  inner.renderOrder = 1; // 외피보다 먼저 (투과 대상)
  die.add(inner);

  // (3) 글리터 — 내부 반경에 흩뿌린 반짝이. 2세트로 위상 어긋난 트윙클.
  var glitterTex = makeGlitterSprite();
  var small = Math.min(window.innerWidth, window.innerHeight) < 480;
  var glitters = [];
  var glitColors = [
    new THREE.Color(0xf59e0b), new THREE.Color(0xf472b6), new THREE.Color(0x22d3ee)
  ];
  function buildGlitterSet(count, phase, speed, size) {
    var g = new THREE.BufferGeometry();
    var pos = new Float32Array(count * 3);
    var col = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      // 내부 반경 안 랜덤 (표면 근처에 더 몰리게)
      var u = Math.random();
      var rad = DIE_RADIUS * (0.35 + 0.5 * Math.cbrt(u));
      var th = Math.random() * Math.PI * 2;
      var ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = rad * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = rad * Math.sin(ph) * Math.sin(th);
      pos[i * 3 + 2] = rad * Math.cos(ph);
      var cc = glitColors[(Math.random() * glitColors.length) | 0];
      col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var m = new THREE.PointsMaterial({
      map: glitterTex,
      size: size,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthTest: false, // 레진 안쪽에서도 반짝이가 보이도록
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var pts = new THREE.Points(g, m);
    pts.renderOrder = 4;
    pts.userData = { phase: phase, speed: speed };
    die.add(pts);
    glitters.push(pts);
  }
  var perSet = small ? 90 : 150;
  buildGlitterSet(perSet, 0.0, 2.2, 0.06);
  buildGlitterSet(perSet, Math.PI, 3.1, 0.045);

  // (4) 숫자
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
  var baseEmissive = shellMat.emissiveIntensity || 0; // 셸엔 emissive 없음 → 0
  var baseInnerEmissive = innerMat.emissiveIntensity;

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
  var clock = 0;

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
    clock += dt;

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
        innerMat.emissiveIntensity = baseInnerEmissive + 2.2 * wave;
        flashLight.color.setHex(0xffd27a);
        flashLight.intensity = 6 * wave;
      } else if (natType === 1) {
        innerMat.emissiveIntensity = baseInnerEmissive * (1 - 0.7 * wave);
        flashLight.color.setHex(0xff2b3b);
        flashLight.intensity = 9 * wave;
      } else {
        innerMat.emissiveIntensity = baseInnerEmissive + 0.6 * wave;
      }
      if (sp >= 1) {
        die.scale.setScalar(1);
        innerMat.emissiveIntensity = baseInnerEmissive;
        flashLight.intensity = 0;
        mode = 'done';
        if (onDone) { var d = onDone; onDone = null; d(); }
      }
    }

    // 글리터 트윙클 (모드 무관 상시)
    for (var gi = 0; gi < glitters.length; gi++) {
      var ud = glitters[gi].userData;
      glitters[gi].material.opacity = 0.55 + 0.45 * Math.sin(clock * ud.speed + ud.phase);
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
