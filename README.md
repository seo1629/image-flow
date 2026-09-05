# Image Auto Design Studio

이미지 자동 생성 화면정의서를 기준으로 만든 React Flow 노드 타입 웹페이지 초안입니다.

## 실행 방법

```bash
npm install
npm run dev
```

`npm install`은 `postinstall`을 통해 `server/` 의존성도 함께 설치합니다. `npm run dev`는 Vite 클라이언트(`dev:client`)와 VWorld 주소 검색 프록시 서버(`dev:server`, 기본 포트 4001)를 `concurrently`로 동시에 실행합니다.

Nano Banana(Google AI Studio) API 키와 VWorld API 키는 화면 우측 하단 **Settings** 창에서 입력합니다 (브라우저 localStorage에 저장). VWorld 키를 새로 입력/변경한 뒤에는 SDK 스크립트가 `index.html` 파싱 시점에만 주입되므로 **페이지 새로고침**이 필요합니다.

## 핵심 구조

- `@xyflow/react`: 노드 캔버스, 연결선, 미니맵, 줌/팬
- `zustand`: 노드/엣지/선택 노드/실행 상태 관리
- `src/nodeConfig.js`: 노드 팔레트 정의
- `src/nodes/ImageAutoNode.jsx`: 공통 커스텀 노드 UI
- `src/lib/store.js`: 노드 추가, 연결, 실행 로직, Nano Banana/VWorld 연동 상태
- `src/components/VWorldMapModal.jsx`: 앱 전역에 한 번만 마운트되는 VWorld 3D 지도 싱글턴 모달 (모델 배치·기즈모 조작·건물 토글·비율 프레이밍 스크린샷)
- `server/`: VWorld 주소 검색 API용 최소 Express 프록시 (CORS 우회 목적, 키 자체는 클라이언트 Settings에서 전달)

## 현재 포함된 노드

- Image
- Imagine (Nano Banana API로 실제 이미지 생성)
- Crop
- Merge
- Upscale
- VWorld (3D 지도 캡처)
- Design Prompt
- Result
