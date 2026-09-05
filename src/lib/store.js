import { create } from 'zustand';
import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import { getNodeTemplate } from '../nodeConfig.js';

let nextId = 6;
const makeId = (type) => `${type}-${nextId++}`;

const NANO_BANANA_MODEL = 'gemini-2.5-flash-image';

function dataUrlToInlineData(dataUrl) {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

const initialNodes = [
  {
    id: 'image-1',
    type: 'imageAutoNode',
    position: { x: 160, y: 120 },
    data: { ...getNodeTemplate('image').defaultData, nodeType: 'image' }
  },
  {
    id: 'imagine-2',
    type: 'imageAutoNode',
    position: { x: 430, y: 120 },
    data: { ...getNodeTemplate('imagine').defaultData, nodeType: 'imagine' }
  },
  {
    id: 'result-3',
    type: 'imageAutoNode',
    position: { x: 720, y: 120 },
    data: { ...getNodeTemplate('result').defaultData, nodeType: 'result' }
  }
];

const initialEdges = [
  { id: 'edge-1-2', source: 'image-1', target: 'imagine-2', targetHandle: 'base', type: 'deletable' },
  { id: 'edge-2-3', source: 'imagine-2', target: 'result-3', type: 'deletable' }
];

function executeNode(node, incomingOutputs, incomingByHandle = {}) {
  const data = node.data;
  const inputText = incomingOutputs.filter(Boolean).join(' → ');
  switch (data.nodeType) {
    case 'image':
      if (!data.imageUrl) return 'IMAGE(sample modular building source)';
      return data.imageUrl.startsWith('data:') ? 'IMAGE(uploaded file)' : `IMAGE(${data.imageUrl})`;
    case 'vworld':
      return data.imageUrl ? 'IMAGE(vworld capture)' : 'IMAGE(no vworld capture yet)';
    case 'designPrompt':
      return `PROMPT(${data.program}, ${data.style})`;
    case 'imagine': {
      const { base, reference } = incomingByHandle;
      const parts = [];
      if (base) parts.push(`base: ${base}`);
      if (reference) parts.push(`reference: ${reference}`);
      const inputSummary = parts.length ? parts.join(', ') : inputText || 'no image';
      return `GENERATED(${inputSummary} + prompt: ${data.prompt}, ratio: ${data.ratio})`;
    }
    case 'crop':
      return `CROP(${inputText}, ratio:${data.ratio || 'free'}, x:${data.x}, y:${data.y}, w:${data.width}, h:${data.height})`;
    case 'merge':
      return `MERGE(${inputText}, mode:${data.mode}, opacity:${data.opacity}%)`;
    case 'upscale':
      return `UPSCALE(${inputText}, ${data.scale}x)`;
    case 'result':
      return inputText || '결과 없음';
    default:
      return inputText;
  }
}

function topologicalOrder(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const dependents = new Map(nodes.map((node) => [node.id, []]));
  const remainingInDegree = new Map(nodes.map((node) => [node.id, 0]));

  edges.forEach((edge) => {
    if (!byId.has(edge.target) || !byId.has(edge.source)) return;
    remainingInDegree.set(edge.target, remainingInDegree.get(edge.target) + 1);
    dependents.get(edge.source).push(edge.target);
  });

  const byXPosition = (a, b) => a.position.x - b.position.x;
  const queue = nodes.filter((node) => remainingInDegree.get(node.id) === 0);
  const order = [];

  while (queue.length) {
    queue.sort(byXPosition);
    const node = queue.shift();
    order.push(node);
    dependents.get(node.id).forEach((depId) => {
      const next = remainingInDegree.get(depId) - 1;
      remainingInDegree.set(depId, next);
      if (next === 0) queue.push(byId.get(depId));
    });
  }

  if (order.length < nodes.length) {
    const seen = new Set(order.map((node) => node.id));
    const rest = nodes.filter((node) => !seen.has(node.id)).sort(byXPosition);
    order.push(...rest);
  }

  return order;
}

const API_KEY_STORAGE_KEY = 'image-flow-nanobanana-api-key';
const VWORLD_API_KEY_STORAGE_KEY = 'image-flow-vworld-api-key';

function loadStoredValue(storageKey) {
  try {
    return localStorage.getItem(storageKey) || '';
  } catch {
    return '';
  }
}

function saveStoredValue(storageKey, value) {
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    // localStorage unavailable (private mode, disabled storage) — key stays in-memory only
  }
}

export const useFlowStore = create((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  selectedNodeId: null,
  apiKey: loadStoredValue(API_KEY_STORAGE_KEY),
  vworldApiKey: loadStoredValue(VWORLD_API_KEY_STORAGE_KEY),

  setApiKey: (apiKey) => {
    set({ apiKey });
    saveStoredValue(API_KEY_STORAGE_KEY, apiKey);
  },

  setVworldApiKey: (vworldApiKey) => {
    set({ vworldApiKey });
    saveStoredValue(VWORLD_API_KEY_STORAGE_KEY, vworldApiKey);
  },

  // The VWorld 3D map is a page-wide singleton (its SDK can't tear down and
  // reinitialize cleanly), so only one modal instance is ever mounted; this
  // just tracks which node it's currently capturing for.
  vworldOpen: false,
  vworldTargetNodeId: null,
  openVWorldMap: (nodeId) => set({ vworldOpen: true, vworldTargetNodeId: nodeId }),
  closeVWorldMap: () => set({ vworldOpen: false }),

  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (connection) => set({
    edges: addEdge({ ...connection, type: 'deletable' }, get().edges)
  }),

  addNode: (type, position) => {
    const template = getNodeTemplate(type);
    if (!template) return;
    const id = makeId(type);
    set({
      nodes: [
        ...get().nodes,
        {
          id,
          type: 'imageAutoNode',
          position,
          data: { ...template.defaultData, nodeType: type }
        }
      ],
      selectedNodeId: id
    });
  },

  updateNodeData: (nodeId, patch) => set({
    nodes: get().nodes.map((node) =>
      node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node
    )
  }),

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  deleteNode: (nodeId) => set({
    nodes: get().nodes.filter((node) => node.id !== nodeId),
    edges: get().edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId
  }),

  deleteEdge: (edgeId) => set({
    edges: get().edges.filter((edge) => edge.id !== edgeId)
  }),

  generateImagine: async (nodeId) => {
    const { apiKey, nodes, edges, updateNodeData } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.data.nodeType !== 'imagine') return;

    if (!apiKey) {
      updateNodeData(nodeId, { error: 'Settings에서 Nano Banana API 키를 먼저 연결해주세요.' });
      return;
    }

    updateNodeData(nodeId, { generating: true, error: null });

    const findInputImage = (handle) => {
      const edge = edges.find((e) => e.target === nodeId && e.targetHandle === handle);
      const sourceNode = edge ? nodes.find((n) => n.id === edge.source) : null;
      return sourceNode?.data.imageUrl || null;
    };

    const parts = [{ text: node.data.prompt || '' }];
    [findInputImage('base'), findInputImage('reference')].forEach((url) => {
      const inline = dataUrlToInlineData(url);
      if (inline) parts.push({ inlineData: inline });
    });

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${NANO_BANANA_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseModalities: ['IMAGE'],
              imageConfig: {
                aspectRatio: node.data.ratio || '16:9',
                imageSize: node.data.resolution || '1K'
              }
            }
          })
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Nano Banana API 오류 (${response.status}): ${errorBody.slice(0, 200)}`);
      }

      const json = await response.json();
      const imagePart = json.candidates?.[0]?.content?.parts?.find((part) => part.inlineData);
      if (!imagePart) throw new Error('응답에 이미지 데이터가 없습니다.');

      updateNodeData(nodeId, {
        generating: false,
        error: null,
        generatedImage: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
        output: `GENERATED_IMAGE(nanobanana, ratio:${node.data.ratio}, resolution:${node.data.resolution || '1K'})`
      });
    } catch (err) {
      updateNodeData(nodeId, { generating: false, error: err.message || '이미지 생성에 실패했습니다.' });
    }
  },

  runFlow: () => {
    const { nodes, edges } = get();
    const outputMap = new Map();

    const sorted = topologicalOrder(nodes, edges);
    const nextNodes = sorted.map((node) => {
      const incomingEdges = edges.filter((edge) => edge.target === node.id);
      const incoming = incomingEdges.map((edge) => outputMap.get(edge.source));
      const incomingByHandle = {};
      incomingEdges.forEach((edge) => {
        if (edge.targetHandle) incomingByHandle[edge.targetHandle] = outputMap.get(edge.source);
      });
      const output = executeNode(node, incoming, incomingByHandle);
      outputMap.set(node.id, output);
      return { ...node, data: { ...node.data, output } };
    });

    const order = new Map(nextNodes.map((node, index) => [node.id, index]));
    const restoredOrder = [...nodes].map((node) => nextNodes[order.get(node.id)]);
    set({ nodes: restoredOrder });
  },

  resetFlow: () => set({ nodes: initialNodes, edges: initialEdges, selectedNodeId: null })
}));
