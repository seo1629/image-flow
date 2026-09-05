// Google AI Studio의 Nano Banana(Gemini 2.5 Flash Image)가 지원하는 출력 해상도
export const NANO_BANANA_RESOLUTIONS = ['1K', '2K'];

// Nano Banana(Gemini 2.5 Flash Image)가 지원하는 종횡비 프리셋
export const NANO_BANANA_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9'
];

export const NODE_GROUPS = [
  {
    title: 'IMAGE PIPELINE',
    items: [
      {
        type: 'image',
        label: 'Image',
        description: '원본 이미지 입력',
        help: '원본 이미지를 URL로 불러와 파이프라인의 시작점으로 사용합니다.',
        color: '#38bdf8',
        defaultData: {
          title: 'Image',
          imageUrl: '',
          output: null,
          inputs: [],
          outputs: ['image']
        }
      },
      {
        type: 'imagine',
        label: 'Imagine',
        description: '프롬프트 기반 이미지 생성',
        help: 'Base 이미지와 Reference 이미지를 각각 Image 노드에서 연결하고, 프롬프트와 함께 지정한 비율의 새 이미지를 생성합니다.',
        color: '#a78bfa',
        defaultData: {
          title: 'Imagine',
          prompt: 'modular housing facade, clean architectural render',
          ratio: '16:9',
          resolution: '1K',
          output: null,
          generatedImage: null,
          generating: false,
          error: null,
          inputs: ['base', 'reference'],
          outputs: ['image']
        }
      },
      {
        type: 'crop',
        label: 'Crop',
        description: '이미지 영역 자르기',
        help: '좌표와 크기(또는 나노바나나 Aspect Ratio)를 지정해 이미지의 특정 영역을 잘라냅니다.',
        color: '#f59e0b',
        defaultData: {
          title: 'Crop',
          ratio: '1:1',
          x: 0,
          y: 0,
          width: 512,
          height: 512,
          output: null,
          inputs: ['image'],
          outputs: ['image']
        }
      },
      {
        type: 'merge',
        label: 'Merge',
        description: '두 이미지 합성',
        help: '두 이미지를 선택한 블렌드 모드와 불투명도로 합성합니다.',
        color: '#22c55e',
        defaultData: {
          title: 'Merge',
          mode: 'overlay',
          opacity: 70,
          output: null,
          inputs: ['imageA', 'imageB'],
          outputs: ['image']
        }
      },
      {
        type: 'upscale',
        label: 'Upscale',
        description: '해상도 확대',
        help: '이미지 해상도를 선택한 배율만큼 확대합니다.',
        color: '#ef4444',
        defaultData: {
          title: 'Upscale',
          scale: 2,
          output: null,
          inputs: ['image'],
          outputs: ['image']
        }
      }
    ]
  },
  {
    title: 'CONTEXT',
    items: [
      {
        type: 'vworld',
        label: 'VWorld',
        description: '3D 지도 캡처',
        help: 'VWorld 3D 지도를 열어 원하는 위치로 이동한 뒤 화면을 캡처해 파이프라인의 이미지 소스로 사용합니다.',
        color: '#0ea5e9',
        defaultData: {
          title: 'VWorld',
          imageUrl: null,
          output: null,
          inputs: [],
          outputs: ['image']
        }
      }
    ]
  },
  {
    title: 'DESIGN AUTOMATION',
    items: [
      {
        type: 'designPrompt',
        label: 'Design Prompt',
        description: '설계 조건 텍스트 입력',
        help: '건축 프로그램과 스타일 조건을 텍스트로 입력해 다음 단계 프롬프트에 활용합니다.',
        color: '#14b8a6',
        defaultData: {
          title: 'Design Prompt',
          program: 'modular hotel, 5 floors, compact core',
          style: 'minimal modern',
          output: null,
          inputs: [],
          outputs: ['prompt']
        }
      },
      {
        type: 'result',
        label: 'Result',
        description: '최종 결과 확인',
        help: '연결된 모든 노드를 거쳐 만들어진 파이프라인의 최종 결과 이미지를 확인합니다.',
        color: '#eab308',
        defaultData: {
          title: 'Result',
          output: null,
          inputs: ['image'],
          outputs: []
        }
      }
    ]
  }
];

export const getNodeTemplate = (type) => {
  for (const group of NODE_GROUPS) {
    const found = group.items.find((item) => item.type === type);
    if (found) return found;
  }
  return null;
};
