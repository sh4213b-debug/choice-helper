# 선택 도우미 · Choice Helper

d20 주사위를 굴려 선택을 도와주는 웹앱. 1~4개의 선택지에 각각 주사위를 굴려 8단계 등급을 부여한다.

순수 HTML/CSS/JavaScript 정적 사이트. 서버·백엔드·DB 없음. 데이터는 로컬에만 저장한다(트래킹·외부 전송 없음).

## 실행

3D 주사위가 ES 모듈이라 `file://` 더블클릭이 아니라 **로컬 서버**로 열어야 한다:

```bash
python3 -m http.server 8000    # → http://127.0.0.1:8000
```

## 구조

```
index.html          진입점 / 뷰 마크업
css/styles.css      스타일 (오라클 테마: 금색·상아 + 딥 자수정, 모바일 우선)
fonts/              나눔명조 서브셋 woff2 (OFL, 로컬 번들)
js/dice.js          순수 로직: d20 굴림 + 8단계 등급 매핑 (DOM 비의존)
js/i18n.js          다국어(ko/en) 자동감지 + 토글 (localStorage)
js/history.js       최근 10개 결과 (localStorage)
js/share.js         결과 카드 Canvas 생성 + Web Share/다운로드
js/dice3d.js        3D d20 렌더러 (Three.js, ES 모듈)
js/vendor/          Three.js r160 + RoomEnvironment (로컬 번들, 버전 고정)
js/app.js           뷰/컨트롤러: 화면 전환·입력·결과·히스토리
_headers            Cloudflare Pages 캐시/보안 헤더
```

순수 로직(`dice`/`i18n`/`history`)과 뷰(`app`)를 분리해 추후 Capacitor 패키징에 대비한다.
외부 라이브러리는 Three.js 1개만 허용(로컬 번들). 광고·트래킹·외부 전송 없음.

## 배포 (Cloudflare Pages)

빌드 과정이 없는 정적 사이트라 저장소를 그대로 연결하면 된다.

1. Cloudflare 대시보드 → Workers & Pages → Create → Pages → **Connect to Git**
2. 이 저장소(`choice-helper`) 선택
3. **Framework preset: None**, **Build command: (비움)**, **Build output directory: `/`**
4. Deploy — `main`에 push할 때마다 자동 재배포

`_headers`가 폰트·벤더 파일에 장기 캐시를, 전체에 보안 헤더를 적용한다.
결과 공유 카드의 URL 워터마크는 배포된 도메인을 자동으로 사용한다.

> CLI 배포도 가능: `npx wrangler pages deploy . --project-name choice-helper`
> (Cloudflare 계정 로그인/토큰 필요)

## 등급표 (d20 매핑)

| d20 | 등급 | 한국어 | 영어 | 확률 |
|---|---|---|---|---|
| 20 | 8 | 탁월하다 | Outstanding | 5% |
| 17–19 | 7 | 매우 좋다 | Excellent | 15% |
| 14–16 | 6 | 좋다 | Good | 15% |
| 11–13 | 5 | 괜찮다 | Fairly Good | 15% |
| 8–10 | 4 | 보통이다 | Average | 15% |
| 5–7 | 3 | 아쉽다 | Disappointing | 15% |
| 2–4 | 2 | 매우 별로다 | Very Poor | 15% |
| 1 | 1 | 피해야 한다 | Avoid | 5% |

## 개발 로드맵

- **v0.1** — 핵심 로직: 메인 4버튼, 라벨 입력/스킵, d20 굴림·등급 매핑, 결과 표시(애니메이션 없음), 동점 재굴리기
- **v0.2** — 주사위 애니메이션(1.5~2초, 탭 스킵), 내추럴 20/1 연출
- **v0.3** — 히스토리 10개(localStorage, 개별 삭제), 결과 카드 이미지 공유
- **v0.4** — i18n: 기기 언어 자동 감지 + KO/EN 토글
- **v0.5** — 마무리: 반응형 점검, GitHub 푸시, Cloudflare Pages 배포 ← 현재
