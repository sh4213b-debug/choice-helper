/*
 * dice3d.js — 사실적인 3D d20 렌더러 (Three.js, v0.2.2)
 * 정이십면체 + 반투명 레진 재질 + 면별 숫자 텍스처 + 조명.
 * 굴림 애니메이션/연출은 v0.2.3에서 이 컨트롤러 위에 추가한다.
 *
 * ES 모듈. 로드에 성공하면 window.ChoiceHelper.dice3d 를 노출한다.
 * 로드/생성 실패 시 app.js가 CSS fallback으로 대체한다.
 */
import * as THREE from './vendor/three.module.js';

var NS = (window.ChoiceHelper = window.ChoiceHelper || {});

var DIE_RADIUS = 1.15;
var AMETHYST = 0x7b2fbe; // 자수정 보라 (기준색, §3.3)

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

// ── 숫자 텍스처 (캔버스, 금~핑크골드) ───────────────────────
function makeNumberTexture(n) {
  var S = 160;
  var c = document.createElement('canvas');
  c.width = c.height = S;
  var ctx = c.getContext('2d');

  // 금~핑크골드 그라디언트 숫자 (#E8A87C ~ #F0B27A 계열)
  var grad = ctx.createLinearGradient(0, S * 0.2, 0, S * 0.8);
  grad.addColorStop(0, '#ffd9a0');
  grad.addColorStop(0.5, '#f0b27a');
  grad.addColorStop(1, '#e8a87c');

  ctx.fillStyle = grad;
  ctx.font = '700 ' + Math.round(S * 0.5) + 'px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255, 180, 120, 0.55)';
  ctx.shadowBlur = S * 0.06;
  ctx.fillText(String(n), S / 2, S / 2 + S * 0.02);

  // 6/9 구분용 밑줄
  if (n === 6 || n === 9) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#f0b27a';
    ctx.lineWidth = S * 0.03;
    ctx.beginPath();
    ctx.moveTo(S * 0.36, S * 0.72);
    ctx.lineTo(S * 0.64, S * 0.72);
    ctx.stroke();
  }

  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ── 스튜디오풍 환경맵 (레진 표면의 부드러운 하이라이트 반사) ──
// 어두운 보라 베이스 위에 소프트박스 같은 밝은 반사광 몇 개를 얹어
// 클리어코트/투과 표면이 사진처럼 빛을 물게 한다.
function buildEnvironment(renderer) {
  var W = 512, H = 256;
  var c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  var ctx = c.getContext('2d');

  // 베이스: 위(하늘)는 보라, 아래(바닥)는 짙은 자수정
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.0, '#2a1b52');
  g.addColorStop(0.45, '#150d2c');
  g.addColorStop(1.0, '#241041');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 소프트박스형 밝은 하이라이트 (반사로 잡히는 광원)
  function softLight(x, y, rx, ry, color, alpha) {
    var rg = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.translate(-x, -y);
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  softLight(W * 0.30, H * 0.28, 150, 90, '#ffffff', 0.95); // 주 키라이트
  softLight(W * 0.72, H * 0.35, 110, 70, '#ffe6c0', 0.7);  // 따뜻한 보조광
  softLight(W * 0.55, H * 0.80, 130, 60, '#c77bff', 0.55); // 하단 보라 바운스
  softLight(W * 0.88, H * 0.68, 90, 55, '#ff7ac2', 0.4);   // 핑크 림

  var tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  var pmrem = new THREE.PMREMGenerator(renderer);
  var envRT = pmrem.fromEquirectangular(tex);
  tex.dispose();
  pmrem.dispose();
  return envRT.texture;
}

// ── 정이십면체 면 데이터 (중심·법선) + 숫자 1~20 배정 ───────
// 반환: faces[i] = { normal: Vector3(단위), center: Vector3, number: i+1 }
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
      normal: center.clone().normalize(), // 이십면체는 면 법선이 방사 방향과 일치
      number: f + 1
    });
  }
  return faces;
}

// 숫자 평면을 해당 면에 얹고, 텍스트가 대략 위를 향하도록 정렬
function makeNumberPlane(face) {
  var size = DIE_RADIUS * 0.62;
  var geo = new THREE.PlaneGeometry(size, size);
  var mat = new THREE.MeshBasicMaterial({
    map: makeNumberTexture(face.number),
    transparent: true,
    depthWrite: false,
    toneMapped: false
  });
  var plane = new THREE.Mesh(geo, mat);
  plane.renderOrder = 2;

  var n = face.normal;
  // 평면 기본 법선(+Z)을 면 법선으로 회전
  var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  plane.quaternion.copy(q);

  // 글자 위쪽을 월드 up 투영 방향에 맞춤 (읽기 좋게)
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

  plane.position.copy(face.center).multiplyScalar(1.015);
  return plane;
}

// ── 주사위 스테이지 생성 ────────────────────────────────────
// canvas 하나에 렌더러/씬/주사위를 구성하고 컨트롤러를 반환한다.
function createStage(canvas) {
  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // 상한 2 (§3.3)
  renderer.setClearAlpha(0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  var scene = new THREE.Scene();
  scene.environment = buildEnvironment(renderer);

  var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 3.7);

  // 조명: 주광 + 보라/핑크 림라이트 (내부가 빛나는 느낌, §3.3)
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  var key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(4, 5, 6);
  scene.add(key);
  var rimPurple = new THREE.DirectionalLight(0x8b5cf6, 1.8);
  rimPurple.position.set(-5, 1, -4);
  scene.add(rimPurple);
  var rimPink = new THREE.DirectionalLight(0xff7ac2, 1.3);
  rimPink.position.set(3, -4, -3);
  scene.add(rimPink);

  // 주사위 지오메트리·재질
  var geometry = new THREE.IcosahedronGeometry(DIE_RADIUS, 0);

  // 면 데이터는 position 기준이므로 법선 재계산 전에 뽑아둔다
  var faces = computeFaces(geometry);

  // ★ 각진 d20 룩의 핵심: 면 단위 평평한 법선(flat shading).
  // IcosahedronGeometry 기본 법선은 구처럼 매끈해 둥글게 보이므로,
  // non-indexed 지오메트리에 삼각형별 법선을 재계산해 또렷한 면을 만든다.
  geometry.computeVertexNormals();

  // 면마다 아주 미묘한 농담 차이(레진 마블링): 정점 색으로 살짝 흔든다
  var vcount = geometry.attributes.position.count;
  var colors = new Float32Array(vcount * 3);
  var base = new THREE.Color(AMETHYST);
  for (var fi = 0; fi < vcount / 3; fi++) {
    var jitter = 0.9 + ((fi * 2654435761) % 1000) / 1000 * 0.22; // 0.90~1.12
    var col = base.clone().multiplyScalar(jitter);
    for (var v = 0; v < 3; v++) {
      colors[(fi * 3 + v) * 3 + 0] = col.r;
      colors[(fi * 3 + v) * 3 + 1] = col.g;
      colors[(fi * 3 + v) * 3 + 2] = col.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // 반투명 자수정 레진: 높은 투과 + 보라 감쇠 + 클리어코트 광택
  var material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    metalness: 0.0,
    roughness: 0.07,
    transmission: 0.82,
    thickness: 1.6,
    ior: 1.55,
    clearcoat: 1.0,
    clearcoatRoughness: 0.07,
    specularIntensity: 1.0,
    iridescence: 0.14,
    iridescenceIOR: 1.3,
    emissive: new THREE.Color(0x2a0d44),
    emissiveIntensity: 0.35,
    attenuationColor: new THREE.Color(0x8a35d0),
    attenuationDistance: 0.9,
    envMapIntensity: 1.6,
    transparent: true
  });

  var die = new THREE.Group();
  var body = new THREE.Mesh(geometry, material);
  die.add(body);

  for (var i = 0; i < faces.length; i++) {
    die.add(makeNumberPlane(faces[i]));
  }
  scene.add(die);

  // ── 렌더 루프 ──
  // 내추럴 1 연출용 붉은 플래시 라이트 (평소 꺼둠)
  var flashLight = new THREE.PointLight(0xff2b3b, 0, 14);
  flashLight.position.set(0, 0, 3.2);
  scene.add(flashLight);

  // ── 굴림 애니메이션 상태 (§3.3) ─────────────────────────────
  var ROLL_MS = 1750;    // 총 텀블링 시간 (1.5~2초)
  var SETTLE_MS = 240;   // 정지 순간 settle 모션
  var mode = 'idle';     // idle | roll | settle | done
  var startT = 0;
  var finalQ = null;
  var onDone = null;
  var natType = 0;       // 20 | 1 | 0
  var forceFinish = false;
  var baseEmissive = material.emissiveIntensity;

  // 텀블링 축 2개 (둘 다 각도가 0으로 수렴 → 정확히 finalQ에 착지)
  var axis1 = new THREE.Vector3(0.5, 1, 0.35).normalize();
  var axis2 = new THREE.Vector3(1, 0.2, -0.6).normalize();
  var totalA1 = Math.PI * 2 * 5; // 5회전
  var totalA2 = Math.PI * 2 * 3; // 3회전
  var tmpQ1 = new THREE.Quaternion();
  var tmpQ2 = new THREE.Quaternion();
  var camDir = new THREE.Vector3(0, 0, 1);

  var natParticles = null; // 내추럴 20 골드 파티클

  function easeOutQuart(x) { return 1 - Math.pow(1 - x, 4); }

  // 결과 숫자 면이 카메라(+Z)를 향하도록 하는 최종 쿼터니언
  function computeFinalQ(number) {
    var face = faces[number - 1]; // number = index+1
    return new THREE.Quaternion().setFromUnitVectors(face.normal, camDir);
  }

  function spawnGoldBurst() {
    var N = 150;
    var g = new THREE.BufferGeometry();
    var positions = new Float32Array(N * 3);
    var vel = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      // 구면 방향 무작위 + 속도
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.acos(2 * Math.random() - 1);
      var sp = 1.8 + Math.random() * 2.2;
      vel[i * 3 + 0] = Math.sin(phi) * Math.cos(theta) * sp;
      vel[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * sp;
      vel[i * 3 + 2] = Math.cos(phi) * sp;
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var m = new THREE.PointsMaterial({
      color: 0xffd27a,
      size: 0.08,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    natParticles = new THREE.Points(g, m);
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
    // 내추럴 1은 settle 단계에서 flashLight 로 붉은 플래시
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
      if (forceFinish) p = 1; // 탭 스킵
      var k = 1 - easeOutQuart(p); // 감속하며 0으로
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
      var wave = Math.sin(sp * Math.PI); // 0→1→0
      die.quaternion.copy(finalQ);
      die.scale.setScalar(1 + 0.06 * wave); // 살짝 튕김
      if (natType === 20) {
        material.emissiveIntensity = baseEmissive + 2.4 * wave; // 골드 글로우 펄스
        flashLight.color.setHex(0xffd27a);
        flashLight.intensity = 6 * wave;
      } else if (natType === 1) {
        material.emissiveIntensity = baseEmissive * (1 - 0.7 * wave); // 어두워짐
        flashLight.color.setHex(0xff2b3b);
        flashLight.intensity = 9 * wave; // 붉은 플래시
      } else {
        material.emissiveIntensity = baseEmissive + 0.8 * wave; // 일반 글로우
      }
      if (sp >= 1) {
        die.scale.setScalar(1);
        material.emissiveIntensity = baseEmissive;
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
    // 결과 숫자로 굴림 시작. done() 콜백은 정지·연출 완료 후 호출.
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
    // 탭 스킵: 진행 중이면 즉시 최종 자세로 스냅
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
          m.dispose();
        }
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
      /* WebGL 컨텍스트 생성 실패 등 → fallback */
      if (window.console) console.warn('[dice3d] init failed:', e);
      return null;
    }
  }
};
