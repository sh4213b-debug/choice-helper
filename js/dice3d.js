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

// ── 은은한 그라디언트 환경맵 (반사·투과 색감용) ─────────────
function buildEnvironment(renderer) {
  var c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  var ctx = c.getContext('2d');
  var g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.0, '#4a2f7a'); // 상단: 보라 하이라이트
  g.addColorStop(0.5, '#1a1030');
  g.addColorStop(1.0, '#2a1240'); // 하단: 핑크빛 보라
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 128);

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

  // 면마다 미묘한 농담 차이(마블링): 정점 색으로 살짝 흔든다
  var vcount = geometry.attributes.position.count;
  var colors = new Float32Array(vcount * 3);
  var base = new THREE.Color(AMETHYST);
  for (var fi = 0; fi < vcount / 3; fi++) {
    var jitter = 0.82 + ((fi * 2654435761) % 1000) / 1000 * 0.32; // 결정적 의사난수
    var col = base.clone().multiplyScalar(jitter);
    for (var v = 0; v < 3; v++) {
      colors[(fi * 3 + v) * 3 + 0] = col.r;
      colors[(fi * 3 + v) * 3 + 1] = col.g;
      colors[(fi * 3 + v) * 3 + 2] = col.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  var material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    metalness: 0.0,
    roughness: 0.14,
    transmission: 0.45,
    thickness: 1.3,
    ior: 1.5,
    clearcoat: 1.0,
    clearcoatRoughness: 0.16,
    emissive: new THREE.Color(0x35104f),
    emissiveIntensity: 0.55,
    attenuationColor: new THREE.Color(0x9b45e0),
    attenuationDistance: 1.6,
    envMapIntensity: 1.15,
    transparent: true
  });

  var die = new THREE.Group();
  var body = new THREE.Mesh(geometry, material);
  die.add(body);

  var faces = computeFaces(geometry);
  for (var i = 0; i < faces.length; i++) {
    die.add(makeNumberPlane(faces[i]));
  }
  scene.add(die);

  // ── 렌더 루프 ──
  var running = true;
  var idle = true; // v0.2.3에서 굴리는 동안 false
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
    if (idle) {
      die.rotation.y += dt * 0.6;
      die.rotation.x += dt * 0.25;
    }
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }

  var rafId = requestAnimationFrame(frame);
  var onResize = function () { resize(); };
  window.addEventListener('resize', onResize);
  resize();

  // 컨트롤러: v0.2.3에서 setIdle/rollTo 등을 사용
  return {
    THREE: THREE,
    scene: scene,
    camera: camera,
    renderer: renderer,
    die: die,
    body: body,
    material: material,
    faces: faces,
    setIdle: function (v) { idle = v; },
    render: function () { renderer.render(scene, camera); },
    dispose: function () {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
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
