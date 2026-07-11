# CLAUDE.md — 선택 도우미 / Choice Helper

프로젝트 작업 지침과 현재 상태. 새 세션은 이 파일을 먼저 읽고 이어서 작업한다.
(사용자 전역 지침 `~/.claude/CLAUDE.md`와 함께 적용하며, 충돌 시 이 프로젝트 규칙을 우선한다.)

---

## 1. 프로젝트 개요

**선택 도우미 / Choice Helper** — d20(20면체) 주사위를 굴려 선택을 도와주는 웹앱.
사용자가 1~4개의 선택지를 고르면 각 선택지에 **독립적인 d20을 굴려** 8단계 등급을 부여한다.

- 순수 **HTML/CSS/바닐라 JS 정적 사이트**. 빌드 도구·프레임워크 없음.
- 흐름: 정적 사이트 → GitHub → Cloudflare Pages. (최종 목표: Capacitor 앱스토어 패키징 — 현재 범위 밖)
- 저장소: https://github.com/sh4213b-debug/choice-helper (`main`)

### 등급표 (d20 매핑) — `js/dice.js`의 `GRADES`가 유일 출처(SSOT)
| d20 | 등급 | 한국어 | 영어 | tier | 확률 |
|---|---|---|---|---|---|
| 20 | 8 | 탁월하다 | Outstanding | nat20 | 5% |
| 17–19 | 7 | 매우 좋다 | Excellent | t7 | 15% |
| 14–16 | 6 | 좋다 | Good | t6 | 15% |
| 11–13 | 5 | 괜찮다 | Fairly Good | t5 | 15% |
| 8–10 | 4 | 보통이다 | Average | t4 | 15% |
| 5–7 | 3 | 아쉽다 | Disappointing | t3 | 15% |
| 2–4 | 2 | 매우 별로다 | Very Poor | t2 | 15% |
| 1 | 1 | 피해야 한다 | Avoid | nat1 | 5% |

---

## 2. 하드 제약 (반드시 유지 — 변경하려면 사용자 확인 필수)

- **광고·트래킹·외부 API 호출·서버 저장 금지.** 모든 데이터는 로컬(localStorage)에만 저장, 서버 전송 없음.
- **외부 이미지/텍스처/HDRI 파일 다운로드·CDN·외부 URL 로드 금지** — 배경·텍스처는 전부 CSS/캔버스 절차 생성.
- **Three.js 외 추가 라이브러리 금지** (로컬 번들, 버전 고정).
- **확정 기획 임의 변경 금지.**
- **커밋 메시지는 영어**, **사용자 보고는 한국어**.
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- 사용자 지시: **"물어보지 말고 계속 진행"** — 사소·명확한 판단은 확인 없이 진행하되, 제약과 충돌하는 결정(예: 실제 광고 삽입)은 반드시 짚고 넘어간다.

---

## 3. 파일 구조

```
index.html      진입점. SPA 4화면(home/labels/result/history) + 홈 소개 콘텐츠 + 사이트 푸터
privacy.html    개인정보처리방침 (한/영, 독립 정적 페이지)
css/styles.css  전체 스타일 (우주·신비 테마)
fonts/          나눔명조 서브셋 woff2 (OFL, 로컬 번들)
js/dice.js      순수 로직: d20 굴림 + 8단계 등급 매핑 (DOM 비의존, SSOT)
js/i18n.js      다국어(ko/en) 자동감지 + 토글 (localStorage), [data-i18n] 자동 갱신
js/history.js   최근 10개 결과 (localStorage)
js/share.js     결과 카드 Canvas 생성 + Web Share/다운로드
js/dice3d.js    3D d20 렌더러 (Three.js, ES 모듈)
js/vendor/      three.module.js r160 + RoomEnvironment (로컬 번들, import 경로 './three.module.js'로 패치)
js/app.js       뷰/컨트롤러: 화면 전환·입력·결과·히스토리·등급표 렌더
_headers        Cloudflare Pages 캐시/보안 헤더
README.md       실행·구조·배포 문서
```

순수 로직(`dice`/`i18n`/`history`)과 뷰(`app`)를 분리 — 추후 Capacitor 대비.
전역 네임스페이스는 `window.ChoiceHelper`.

---

## 4. 아키텍처 메모

- **화면 전환**: `app.js`의 `show(name)`가 `.is-hidden`을 토글. 홈 소개 콘텐츠는 `#screen-home` 안에 있어 함께 숨겨짐. 푸터는 `<main>` 밖이라 항상 노출.
- **i18n**: `apply()`가 `[data-i18n]` 요소의 `textContent`를 교체(=HTML 불가, 텍스트 노드 단위로 키 분리). 동적 화면은 `i18n.onChange()`로 다시 그림. ko/en 키는 **완전 대응 유지**.
- **등급표**: `renderGrades()`가 `dice.GRADES`에서 표를 생성(하드코딩 금지, 언어 토글 반영). 색은 tier별 `.grade-dot--<tier>`.
- **3D 주사위** (`dice3d.js`):
  - IcosahedronGeometry(비인덱스) + `computeVertexNormals`로 각진 면. `MeshPhysicalMaterial`(transmission/clearcoat/sheen) + `RoomEnvironment`→PMREM 환경맵.
  - 결과 면 정렬: `setFromUnitVectors(faceNormal, camDir(0,0,1))` → 감속 텀블. 탭하면 스킵.
  - **현재 룩("Moon Dice" 참고)**: 반투명 보라 레진(세로 그라데이션 정점색) + **금박 인클루전(내부 부유 Points)** + **금색 숫자** + 금빛 sheen. nat20 골드 버스트/nat1 냉각 연출.
  - WebGL 미지원 시 `app.js`가 CSS fallback 큐브로 자동 대체.
- **테마 (우주·신비, 참고 핀터레스트 이미지 기반)**: `body`에 절차적 코스믹 배경 — 심우주 그라디언트 + 성운 radial-gradient + 금빛 천체광 + 별먼지, `body::before`(별 트윙클)/`body::after`(성운 드리프트). 외부 이미지 0개. `prefers-reduced-motion` 존중.
- **홈 레이아웃**: `.home-hero`(첫 화면, 도구 정중앙) + `.home-content`(소개·이용법·등급표·FAQ·신뢰). 선택 카드는 **2×2 그리드 `minmax(0,1fr)`로 네 칸 동일 폭** 고정.

---

## 5. 개발 로드맵 (v0.1~v0.5 전부 완료)

- **v0.1** 핵심 로직 · **v0.2** 주사위 애니메이션 + nat20/1 연출 · **v0.3** 히스토리 + 공유 · **v0.4** i18n · **v0.5** 반응형 + 배포 준비. (태그 v0.1~v0.5)

### v0.5 이후 추가 작업
1. **테마/주사위 개편**: 우주·신비 배경(절차적), 선택 카드 동일 폭 2×2 정중앙, 주사위를 보라+금 "Moon Dice"로. (커밋 `d603397`)
2. **홈페이지 고품질 콘텐츠 개편** (AdSense 고품질 사이트 가이드 반영): 소개/이용법/등급표/FAQ/신뢰 콘텐츠 + 사이트 푸터 + `privacy.html`(한/영) + SEO 메타. **실제 광고·추적 코드는 넣지 않음**(제약 유지). (커밋 `0b4ac05`)

---

## 6. 검증 방법

- **문법**: `node --check js/*.js` (ESM은 `node --input-type=module --check < js/dice3d.js`).
- **CSS 중괄호 균형**: `{`/`}` 개수 일치 확인.
- **i18n**: HTML의 `data-i18n` 키가 전부 사전에 존재하는지, ko/en 키가 대응되는지 스크립트로 확인.
- **로컬 서버**: `python3 -m http.server 8000` → `http://127.0.0.1:8000` (3D 주사위가 ES 모듈이라 `file://` 더블클릭 불가).
- ⚠️ **한계**: 이 환경에는 브라우저/Playwright가 없어 **3D 주사위·배경의 실제 렌더 스크린샷 확인 불가**. 시각 관련 변경은 코드 검증 후 "육안 확인 못 함"을 보고에 명시하고, 사용자에게 로컬 확인을 요청한다.

---

## 7. 남은/보류 항목 (사용자 입력·계정 필요 — 자동화 불가)

- **Cloudflare Pages 실제 배포** — 계정 로그인 필요. README에 절차 문서화됨(Framework None, output `/`).
- **실제 AdSense 광고 게재** — 하드 제약(광고 금지)과 충돌. 원하면 별도 확인 후: AdSense 스니펫 + `ads.txt` + 개인정보처리방침 "광고" 조항 갱신.
- **Capacitor 앱스토어 패키징** — 다음 큰 목표.
