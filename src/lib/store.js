import { create } from 'zustand';
import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import { getNodeTemplate } from '../nodeConfig.js';

let nextId = 6;
const makeId = (type) => `${type}-${nextId++}`;

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
  { id: 'edge-1-2', source: 'image-1', target: 'imagine-2', type: 'deletable' },
  { id: 'edge-2-3', source: 'imagine-2', target: 'result-3', type: 'deletable' }
];

function executeNode(node, incomingOutputs) {
  const data = node.data;
  const inputText = incomingOutputs.filter(Boolean).join(' → ');
  switch (data.nodeType) {
    case 'image':
      if (!data.imageUrl) return 'IMAGE(sample modular building source)';
      return data.imageUrl.startsWith('data:') ? 'IMAGE(uploaded file)' : `IMAGE(${data.imageUrl})`;
    case 'designPrompt':
      return `PROMPT(${data.program}, ${data.style})`;
    case 'imagine':
      return `GENERATED(${inputText || 'no image'} + prompt: ${data.prompt}, ratio: ${data.ratio})`;
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

export const useFlowStore = create((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  selectedNodeId: null,

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

  runFlow: () => {
    const { nodes, edges } = get();
    const outputMap = new Map();

    const sorted = [...nodes].sort((a, b) => a.position.x - b.position.x);
    const nextNodes = sorted.map((node) => {
      const incoming = edges
        .filter((edge) => edge.target === node.id)
        .map((edge) => outputMap.get(edge.source));
      const output = executeNode(node, incoming);
      outputMap.set(node.id, output);
      return { ...node, data: { ...node.data, output } };
    });

    const order = new Map(nextNodes.map((node, index) => [node.id, index]));
    const restoredOrder = [...nodes].map((node) => nextNodes[order.get(node.id)]);
    set({ nodes: restoredOrder });
  },

  resetFlow: () => set({ nodes: initialNodes, edges: initialEdges, selectedNodeId: null })
}));
