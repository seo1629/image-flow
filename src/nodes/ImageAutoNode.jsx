import { Handle, Position } from '@xyflow/react';
import { Image, Wand2, Crop, Combine, Expand, FileText, MonitorCheck, X } from 'lucide-react';
import { useFlowStore } from '../lib/store.js';
import { NANO_BANANA_ASPECT_RATIOS } from '../nodeConfig.js';

function heightForRatio(width, ratio) {
  if (!ratio || ratio === 'free') return null;
  const [w, h] = ratio.split(':').map(Number);
  if (!w || !h) return null;
  return Math.round((width * h) / w);
}

const ICONS = {
  image: Image,
  imagine: Wand2,
  crop: Crop,
  merge: Combine,
  upscale: Expand,
  designPrompt: FileText,
  result: MonitorCheck
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
  const Icon = ICONS[data.nodeType] ?? Image;
  const hasInput = data.inputs?.length > 0;
  const hasOutput = data.outputs?.length > 0;

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

  return (
    <div className={`auto-node ${selected ? 'selected' : ''}`}>
      {hasInput && <Handle type="target" position={Position.Left} className="node-handle input" />}
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
            <Field label="Ratio">
              <select value={data.ratio || '16:9'} onChange={(e) => update('ratio', e.target.value)}>
                <option>1:1</option>
                <option>4:3</option>
                <option>16:9</option>
                <option>9:16</option>
              </select>
            </Field>
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
