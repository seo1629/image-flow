export const NODE_GROUPS = [
  {
    title: 'IMAGE PIPELINE',
    items: [
      {
        type: 'image',
        label: 'Image',
        description: '원본 이미지 입력',
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
        color: '#a78bfa',
        defaultData: {
          title: 'Imagine',
          prompt: 'modular housing facade, clean architectural render',
          ratio: '16:9',
          output: null,
          inputs: ['image'],
          outputs: ['image']
        }
      },
      {
        type: 'crop',
        label: 'Crop',
        description: '이미지 영역 자르기',
        color: '#f59e0b',
        defaultData: {
          title: 'Crop',
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
    title: 'DESIGN AUTOMATION',
    items: [
      {
        type: 'designPrompt',
        label: 'Design Prompt',
        description: '설계 조건 텍스트 입력',
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
