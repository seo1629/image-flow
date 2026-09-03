import '@xyflow/react/dist/style.css';
import { useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap, 
  ReactFlowProvider, 
  useReactFlow 
} from '@xyflow/react';
import { Download, Play, RotateCcw, Save } from 'lucide-react';
import ImageAutoNode from './nodes/ImageAutoNode.jsx';
import DeletableEdge from './edges/DeletableEdge.jsx';
import { NODE_GROUPS } from './nodeConfig.js';
import { useFlowStore } from './lib/store.js';

const nodeTypes = { imageAutoNode: ImageAutoNode };
const edgeTypes = { deletable: DeletableEdge };

function NodePalette() {
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="palette">
      <div className="panel-title">Node Palette</div>
      {NODE_GROUPS.map((group) => (
        <section key={group.title} className="palette-group">
          <h3>{group.title}</h3>
          {group.items.map((item) => (
            <button
              key={item.type}
              className="palette-item"
              draggable
              onDragStart={(event) => onDragStart(event, item.type)}
            >
              <span className="node-dot" style={{ background: item.color }} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          ))}
        </section>
      ))}
    </aside>
  );
}

function PropertiesPanel() {
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);
  const nodes = useFlowStore((state) => state.nodes);
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const selected = nodes.find((node) => node.id === selectedNodeId);

  return (
    <aside className="properties">
      <div className="panel-title">Properties</div>
      {!selected ? (
        <p className="empty-text">노드를 선택하면 세부 속성이 표시됩니다.</p>
      ) : (
        <div className="property-card">
          <label>
            Node Name
            <input value={selected.data.title || ''} onChange={(e) => updateNodeData(selected.id, { title: e.target.value })} />
          </label>
          <label>
            Node Type
            <input value={selected.data.nodeType} readOnly />
          </label>
          <label>
            Last Output
            <textarea value={selected.data.output || ''} readOnly />
          </label>
        </div>
      )}
    </aside>
  );
}

function PreviewPanel() {
  const nodes = useFlowStore((state) => state.nodes);
  const result = [...nodes].reverse().find((node) => node.data.nodeType === 'result')?.data.output;
  return (
    <section className="preview">
      <div>
        <span className="preview-label">Preview</span>
        <strong>Image Auto Design Result</strong>
      </div>
      <div className="preview-screen">
        {result || '아직 실행 결과가 없습니다. 노드를 연결한 뒤 Run Flow를 누르세요.'}
      </div>
    </section>
  );
}

function FlowCanvas() {
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition } = useReactFlow();
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const addNode = useFlowStore((state) => state.addNode);
  const onNodesChange = useFlowStore((state) => state.onNodesChange);
  const onEdgesChange = useFlowStore((state) => state.onEdgesChange);
  const onConnect = useFlowStore((state) => state.onConnect);
  const selectNode = useFlowStore((state) => state.selectNode);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow');
    if (!type) return;
    addNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }, [addNode, screenToFlowPosition]);

  return (
    <main className="canvas" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => selectNode(node.id)}
        onPaneClick={() => selectNode(null)}
        onDrop={onDrop}
        onDragOver={onDragOver}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
      >
        <Background gap={24} size={1} color="#0f3a4a" />
        <MiniMap pannable zoomable nodeStrokeWidth={3} />
        <Controls />
      </ReactFlow>
    </main>
  );
}

function AppShell() {
  const runFlow = useFlowStore((state) => state.runFlow);
  const resetFlow = useFlowStore((state) => state.resetFlow);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <span className="eyebrow">Node Type Workflow</span>
          <h1>Image Auto Design Studio</h1>
        </div>
        <div className="toolbar">
          <button><Save size={16} /> Save</button>
          <button onClick={runFlow} className="primary"><Play size={16} /> Run Flow</button>
          <button onClick={resetFlow}><RotateCcw size={16} /> Reset</button>
          <button><Download size={16} /> Export</button>
        </div>
      </header>
      <div className="workspace">
        <NodePalette />
        <FlowCanvas />
        <PropertiesPanel />
      </div>
      <PreviewPanel />
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppShell />
    </ReactFlowProvider>
  );
}
