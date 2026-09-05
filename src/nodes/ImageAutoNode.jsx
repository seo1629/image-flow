import { Handle, Position } from '@xyflow/react';
import { Image, Wand2, Crop, Combine, Expand, FileText, MonitorCheck, X, Sparkles, Globe, Download } from 'lucide-react';
import { useFlowStore } from '../lib/store.js';
import { NANO_BANANA_ASPECT_RATIOS, NANO_BANANA_RESOLUTIONS } from '../nodeConfig.js';
import { downloadDataUrl } from '../lib/imageUtils.js';

function heightForRatio(width, ratio) {
  if (!ratio || ratio === 'free') return null;
  const [w, h] = ratio.split(':').map(Number);
  if (!w || !h) return null;
  return Math.round((width * h) / w);
}

function formatHandleLabel(name) {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

const ICONS = {
  image: Image,
  imagine: Wand2,
  crop: Crop,
  merge: Combine,
  upscale: Expand,
  designPrompt: FileText,
  result: MonitorCheck,
  vworld: Globe
};

function Field({ label, children }) {
  return (
    <label className="field nodrag">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function ImageAutoNode({ id, data, selected }) {
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const deleteNode = useFlowStore((state) => state.deleteNode);
  const generateImagine = useFlowStore((state) => state.generateImagine);
  const openVWorldMap = useFlowStore((state) => state.openVWorldMap);
  const edges = useFlowStore((state) => state.edges);
  const nodes = useFlowStore((state) => state.nodes);
  const Icon = ICONS[data.nodeType] ?? Image;
  const hasInput = data.inputs?.length > 0;
  const hasOutput = data.outputs?.length > 0;

  const connectionBadges = hasOutput
    ? edges
        .filter((edge) => edge.source === id && edge.targetHandle)
        .map((edge) => {
          const targetNode = nodes.find((n) => n.id === edge.target);
          return `${targetNode?.data.title || edge.target} · ${formatHandleLabel(edge.targetHandle)}`;
        })
    : [];

  const update = (key, value) => updateNodeData(id, { [key]: value });

  const handleImageUpload = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update('imageUrl', reader.result);
    reader.readAsDataURL(file);
  };

  const updateCropRatio = (ratio) => {
    const height = heightForRatio(data.width ?? 512, ratio);
    updateNodeData(id, height === null ? { ratio } : { ratio, height });
  };

  const updateCropWidth = (width) => {
    const height = heightForRatio(width, data.ratio);
    updateNodeData(id, height === null ? { width } : { width, height });
  };

  const multiInput = hasInput && data.inputs.length > 1;

  const inputPreviews = multiInput
    ? data.inputs.reduce((acc, name) => {
        const edge = edges.find((e) => e.target === id && e.targetHandle === name);
        const sourceNode = edge ? nodes.find((n) => n.id === edge.source) : null;
        acc[name] = sourceNode?.data.imageUrl || null;
        return acc;
      }, {})
    : {};

  return (
    <div className={`auto-node ${selected ? 'selected' : ''}`}>
      {hasInput && data.inputs.map((name, index) => (
        <Handle
          key={name}
          type="target"
          position={Position.Left}
          id={multiInput ? name : undefined}
          className="node-handle input"
          style={multiInput ? { top: `${((index + 1) / (data.inputs.length + 1)) * 100}%` } : undefined}
        />
      ))}
      <div className="node-head">
        <div className="node-icon"><Icon size={16} /></div>
        <div>
          <strong>{data.title}</strong>
          <small>{data.nodeType}</small>
        </div>
        <button
          type="button"
          className="node-delete-btn nodrag"
          onClick={(event) => {
            event.stopPropagation();
            deleteNode(id);
          }}
          title="노드 삭제"
        >
          <X size={14} />
        </button>
      </div>

      <div className="node-body">
        {connectionBadges.length > 0 && (
          <div className="connection-badges">
            {connectionBadges.map((label, index) => (
              <span key={index} className="connection-badge">{label}</span>
            ))}
          </div>
        )}

        {multiInput && (
          <div className="port-legend">
            {data.inputs.map((name) => (
              <div key={name} className="port-tag-row">
                <span className="port-tag">
                  <i className="port-dot" />
                  {formatHandleLabel(name)}
                </span>
                {inputPreviews[name] && (
                  <img className="port-thumb" src={inputPreviews[name]} alt={formatHandleLabel(name)} />
                )}
              </div>
            ))}
          </div>
        )}

        {data.nodeType === 'image' && (
          <>
            <Field label="Image URL">
              <input value={data.imageUrl || ''} placeholder="/assets/source.png" onChange={(e) => update('imageUrl', e.target.value)} />
            </Field>
            <Field label="파일 업로드">
              <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e.target.files?.[0])} />
            </Field>
            {data.imageUrl && (
              <div className="image-preview">
                <img src={data.imageUrl} alt={data.title || 'preview'} />
              </div>
            )}
          </>
        )}

        {data.nodeType === 'vworld' && (
          <>
            <button type="button" className="vworld-open-btn nodrag" onClick={() => openVWorldMap(id)}>
              <Globe size={14} />
              3D 지도 열기
            </button>
            {data.imageUrl ? (
              <>
                <div className="image-preview">
                  <img src={data.imageUrl} alt="VWorld capture" />
                </div>
                <button
                  type="button"
                  className="vworld-download-btn nodrag"
                  onClick={() => downloadDataUrl(data.imageUrl, `vworld-${id}.png`)}
                >
                  <Download size={14} />
                  다운로드
                </button>
              </>
            ) : (
              <p className="empty-text">아직 캡처한 화면이 없습니다.</p>
            )}
          </>
        )}

        {data.nodeType === 'designPrompt' && (
          <>
            <Field label="Program">
              <textarea value={data.program || ''} onChange={(e) => update('program', e.target.value)} />
            </Field>
            <Field label="Style">
              <input value={data.style || ''} onChange={(e) => update('style', e.target.value)} />
            </Field>
          </>
        )}

        {data.nodeType === 'imagine' && (
          <>
            <Field label="Prompt">
              <textarea value={data.prompt || ''} onChange={(e) => update('prompt', e.target.value)} />
            </Field>
            <div className="grid-two">
              <Field label="Ratio">
                <select value={data.ratio || '16:9'} onChange={(e) => update('ratio', e.target.value)}>
                  {NANO_BANANA_ASPECT_RATIOS.map((ratio) => (
                    <option key={ratio} value={ratio}>{ratio}</option>
                  ))}
                </select>
              </Field>
              <Field label="Resolution">
                <select value={data.resolution || '1K'} onChange={(e) => update('resolution', e.target.value)}>
                  {NANO_BANANA_RESOLUTIONS.map((resolution) => (
                    <option key={resolution} value={resolution}>{resolution}</option>
                  ))}
                </select>
              </Field>
            </div>
            <button
              type="button"
              className="generate-btn nodrag"
              disabled={data.generating}
              onClick={() => generateImagine(id)}
            >
              <Sparkles size={14} />
              {data.generating ? '생성 중...' : 'Generate'}
            </button>
            {data.error && <p className="node-error">{data.error}</p>}
            {data.generatedImage && (
              <div className="generated-preview">
                <img src={data.generatedImage} alt="Nano Banana 생성 결과" />
              </div>
            )}
          </>
        )}

        {data.nodeType === 'crop' && (
          <>
            <Field label="Aspect Ratio">
              <select value={data.ratio || 'free'} onChange={(e) => updateCropRatio(e.target.value)}>
                <option value="free">Free</option>
                {NANO_BANANA_ASPECT_RATIOS.map((ratio) => (
                  <option key={ratio} value={ratio}>{ratio}</option>
                ))}
              </select>
            </Field>
            <div className="grid-two">
              <Field label="X">
                <input type="number" value={data.x ?? 0} onChange={(e) => update('x', Number(e.target.value))} />
              </Field>
              <Field label="Y">
                <input type="number" value={data.y ?? 0} onChange={(e) => update('y', Number(e.target.value))} />
              </Field>
              <Field label="WIDTH">
                <input type="number" value={data.width ?? 0} onChange={(e) => updateCropWidth(Number(e.target.value))} />
              </Field>
              <Field label="HEIGHT">
                <input
                  type="number"
                  value={data.height ?? 0}
                  readOnly={Boolean(data.ratio) && data.ratio !== 'free'}
                  onChange={(e) => update('height', Number(e.target.value))}
                />
              </Field>
            </div>
          </>
        )}

        {data.nodeType === 'merge' && (
          <>
            <Field label="Mode">
              <select value={data.mode || 'overlay'} onChange={(e) => update('mode', e.target.value)}>
                <option>overlay</option>
                <option>multiply</option>
                <option>screen</option>
                <option>difference</option>
              </select>
            </Field>
            <Field label="Opacity">
              <input type="range" min="0" max="100" value={data.opacity ?? 70} onChange={(e) => update('opacity', Number(e.target.value))} />
            </Field>
          </>
        )}

        {data.nodeType === 'upscale' && (
          <Field label="Scale">
            <select value={data.scale || 2} onChange={(e) => update('scale', Number(e.target.value))}>
              <option value="2">2x</option>
              <option value="4">4x</option>
              <option value="8">8x</option>
            </select>
          </Field>
        )}

        <div className="output-box">
          <span>Output</span>
          <p>{data.output || 'Run 버튼을 누르면 결과가 표시됩니다.'}</p>
        </div>
      </div>
      {hasOutput && <Handle type="source" position={Position.Right} className="node-handle output" />}
    </div>
  );
}
