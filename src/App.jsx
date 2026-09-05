import '@xyflow/react/dist/style.css';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow
} from '@xyflow/react';
import { Download, Play, RotateCcw, Save, Settings as SettingsIcon, Eye, EyeOff, X } from 'lucide-react';
import ImageAutoNode from './nodes/ImageAutoNode.jsx';
import DeletableEdge from './edges/DeletableEdge.jsx';
import FloatingPanel from './components/FloatingPanel.jsx';
import VWorldMapModal from './components/VWorldMapModal.jsx';
import { NODE_GROUPS, getNodeTemplate } from './nodeConfig.js';
import { useFlowStore } from './lib/store.js';

const nodeTypes = { imageAutoNode: ImageAutoNode };
const edgeTypes = { deletable: DeletableEdge };

function NodePalette() {
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="palette-body">
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
    </div>
  );
}

function PropertiesPanel() {
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);
  const nodes = useFlowStore((state) => state.nodes);
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const selected = nodes.find((node) => node.id === selectedNodeId);

  return (
    <div className="properties-body">
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
    </div>
  );
}

function GuidePanel() {
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);
  const nodes = useFlowStore((state) => state.nodes);
  const selected = nodes.find((node) => node.id === selectedNodeId);
  const template = selected ? getNodeTemplate(selected.data.nodeType) : null;

  return (
    <div className="guide-body">
      {!template ? (
        <p className="empty-text">캔버스에서 노드를 선택하면 해당 기능에 대한 설명이 여기에 표시됩니다.</p>
      ) : (
        <div className="guide-card">
          <div className="guide-head">
            <span className="node-dot" style={{ background: template.color }} />
            <strong>{template.label}</strong>
          </div>
          <p>{template.help || template.description}</p>
        </div>
      )}
    </div>
  );
}

function PreviewPanel() {
  const nodes = useFlowStore((state) => state.nodes);
  const result = [...nodes].reverse().find((node) => node.data.nodeType === 'result')?.data.output;
  return (
    <div className="preview-body">
      <strong>Image Auto Design Result</strong>
      <div className="preview-screen">
        {result || '아직 실행 결과가 없습니다. 노드를 연결한 뒤 Run Flow를 누르세요.'}
      </div>
    </div>
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

function ApiKeyField({ label, value, onChange, placeholder }) {
  const [reveal, setReveal] = useState(false);
  return (
    <label className="field">
      <span>{label}</span>
      <div className="api-key-row">
        <input
          type={reveal ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        <button
          type="button"
          className="api-key-toggle"
          onClick={() => setReveal((r) => !r)}
          title={reveal ? '값 숨기기' : '값 보기'}
        >
          {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </label>
  );
}

function SettingsWidget() {
  const apiKey = useFlowStore((state) => state.apiKey);
  const setApiKey = useFlowStore((state) => state.setApiKey);
  const vworldApiKey = useFlowStore((state) => state.vworldApiKey);
  const setVworldApiKey = useFlowStore((state) => state.setVworldApiKey);
  const [open, setOpen] = useState(false);

  return (
    <div className="settings-widget">
      {open && (
        <div className="settings-card">
          <div className="settings-card-head">
            <span>Settings</span>
            <button type="button" className="settings-close" onClick={() => setOpen(false)} title="닫기">
              <X size={14} />
            </button>
          </div>
          <div className="settings-card-body">
            <ApiKeyField
              label="Nano Banana API Key"
              value={apiKey}
              onChange={setApiKey}
              placeholder="AIzaSy..."
            />
            <p className="settings-hint">
              Imagine 노드의 이미지 합성은 Google AI Studio의 Nano Banana(Gemini 2.5 Flash Image) API를 사용합니다.
            </p>
            <ApiKeyField
              label="VWorld API Key"
              value={vworldApiKey}
              onChange={setVworldApiKey}
              placeholder="VWorld API Key"
            />
            <p className="settings-hint">
              지도/3D 위치 데이터를 불러올 때 사용하는 VWorld Open API 키입니다.
            </p>
          </div>
        </div>
      )}
      <button type="button" className="settings-toggle" onClick={() => setOpen((o) => !o)}>
        <SettingsIcon size={16} />
        Settings
      </button>
    </div>
  );
}

const PANEL_IDS = ['palette', 'properties', 'guide', 'preview'];
const TOPBAR_HEIGHT = 78;
const MARGIN = 18;

function AppShell() {
  const runFlow = useFlowStore((state) => state.runFlow);
  const resetFlow = useFlowStore((state) => state.resetFlow);
  const [panelOrder, setPanelOrder] = useState(PANEL_IDS);

  const bringToFront = useCallback((id) => {
    setPanelOrder((order) => (order[order.length - 1] === id ? order : [...order.filter((p) => p !== id), id]));
  }, []);

  const layout = useMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight - TOPBAR_HEIGHT;
    const paletteSize = { width: 260, height: Math.min(0.6 * vh, 460) };
    const propertiesSize = { width: 300, height: Math.min(0.5 * vh, 260) };
    const guideSize = { width: 280, height: 200 };
    const previewSize = { width: 420, height: 240 };
    return {
      palette: { position: { x: MARGIN, y: MARGIN }, size: paletteSize },
      properties: { position: { x: vw - propertiesSize.width - MARGIN, y: MARGIN }, size: propertiesSize },
      guide: {
        position: { x: vw - previewSize.width - guideSize.width - MARGIN * 2, y: vh - guideSize.height - MARGIN },
        size: guideSize
      },
      preview: { position: { x: vw - previewSize.width - MARGIN, y: vh - previewSize.height - MARGIN }, size: previewSize }
    };
  }, []);

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
        <FlowCanvas />
        <FloatingPanel
          id="palette"
          title="Node Palette"
          className="panel-palette"
          zIndex={10 + panelOrder.indexOf('palette')}
          onFocus={bringToFront}
          defaultPosition={layout.palette.position}
          defaultSize={layout.palette.size}
        >
          <NodePalette />
        </FloatingPanel>
        <FloatingPanel
          id="properties"
          title="Properties"
          className="panel-properties"
          zIndex={10 + panelOrder.indexOf('properties')}
          onFocus={bringToFront}
          defaultPosition={layout.properties.position}
          defaultSize={layout.properties.size}
        >
          <PropertiesPanel />
        </FloatingPanel>
        <FloatingPanel
          id="guide"
          title="기능 설명"
          className="panel-guide"
          zIndex={10 + panelOrder.indexOf('guide')}
          onFocus={bringToFront}
          defaultPosition={layout.guide.position}
          defaultSize={layout.guide.size}
          minSize={{ width: 220, height: 140 }}
        >
          <GuidePanel />
        </FloatingPanel>
        <FloatingPanel
          id="preview"
          title="Preview"
          className="panel-preview"
          zIndex={10 + panelOrder.indexOf('preview')}
          onFocus={bringToFront}
          defaultPosition={layout.preview.position}
          defaultSize={layout.preview.size}
        >
          <PreviewPanel />
        </FloatingPanel>
        <SettingsWidget />
        <VWorldMapModal />
      </div>
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
