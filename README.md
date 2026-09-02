# Image Auto Design Studio

이미지 자동 생성 화면정의서를 기준으로 만든 React Flow 노드 타입 웹페이지 초안입니다.

## 실행 방법

```bash
npm install
npm run dev
```

## 핵심 구조

- `@xyflow/react`: 노드 캔버스, 연결선, 미니맵, 줌/팬
- `zustand`: 노드/엣지/선택 노드/실행 상태 관리
- `src/nodeConfig.js`: 노드 팔레트 정의
- `src/nodes/ImageAutoNode.jsx`: 공통 커스텀 노드 UI
- `src/lib/store.js`: 노드 추가, 연결, 실행 로직

## 현재 포함된 노드

- Image
- Imagine
- Crop
- Merge
- Upscale
- Design Prompt
- Result
