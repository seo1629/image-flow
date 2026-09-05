import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, Crosshair, Trash2, RotateCw } from 'lucide-react';
import { waitForVWorldSdk } from '../lib/vworld.js';
import { cropImage } from '../lib/imageUtils.js';
import { NANO_BANANA_ASPECT_RATIOS } from '../nodeConfig.js';
import { useFlowStore } from '../lib/store.js';

function ratioToValue(label) {
  const [w, h] = label.split(':').map(Number);
  return w / h;
}
const RATIO_OPTIONS = [{ label: 'AUTO (전체 화면)', value: null }, ...NANO_BANANA_ASPECT_RATIOS.map((label) => ({ label, value: ratioToValue(label) }))];

// Default view: roughly Gangnam, Seoul.
const DEFAULT_LON = 127.027619;
const DEFAULT_LAT = 37.497926;
const DEFAULT_ALT = 1500;

const toDeg = (rad) => (rad * 180) / Math.PI;
const toRad = (deg) => (deg * Math.PI) / 180;

function fitBoxForRatio(ratio, containerW, containerH) {
  if (!ratio) return { xPct: 0, yPct: 0, wPct: 1, hPct: 1 };
  let w = containerH * ratio;
  let h = containerH;
  if (w > containerW) {
    w = containerW;
    h = containerW / ratio;
  }
  return {
    xPct: (containerW - w) / 2 / containerW,
    yPct: (containerH - h) / 2 / containerH,
    wPct: w / containerW,
    hPct: h / containerH
  };
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

const CAPTURE_CORNERS = ['nw', 'ne', 'sw', 'se'];

function composeMatrix(Cesium, position, heading, pitch, roll) {
  return Cesium.Transforms.headingPitchRollToFixedFrame(position, new Cesium.HeadingPitchRoll(heading, pitch, roll));
}

let modelCounter = 1;
let hiddenBuildingCounter = 1;

// --- Gumball gizmo geometry/math ------------------------------------------
// Rhino-style gumball: a translate arrow + rotation ring per axis, world
// East/North/Up aligned (not re-oriented to the model's current rotation —
// simpler, and lets you always nudge heading/pitch/roll independently).
const GIZMO_SEGMENTS = 64;
const GIZMO_AXIS_COLOR = { east: '#ff4d4d', north: '#3ddc63', up: '#3d8bff' };
const GIZMO_RING_AXIS = {
  heading: { normal: 'up', a: 'east', b: 'north' },
  pitch: { normal: 'east', a: 'north', b: 'up' },
  roll: { normal: 'north', a: 'east', b: 'up' }
};

function enuBasis(Cesium, center) {
  const m = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  const col = (i) => {
    const c = Cesium.Matrix4.getColumn(m, i, new Cesium.Cartesian4());
    return new Cesium.Cartesian3(c.x, c.y, c.z);
  };
  return { east: col(0), north: col(1), up: col(2) };
}

// model.boundingSphere is a getter that can throw (not just return
// undefined) if accessed before VWorld's bundled Cesium considers the model
// fully ready — fall back to the placement point when that happens.
function modelCenterAndRadius(Cesium, model) {
  try {
    if (model.primitive.ready) {
      const bs = model.primitive.boundingSphere;
      if (bs) return { center: Cesium.Cartesian3.clone(bs.center), radius: bs.radius || 30 };
    }
  } catch {
    // not ready yet — use the placement point below
  }
  return { center: Cesium.Cartesian3.clone(model.position), radius: 30 };
}

function addScaled(Cesium, base, dir, scalar) {
  return Cesium.Cartesian3.add(base, Cesium.Cartesian3.multiplyByScalar(dir, scalar, new Cesium.Cartesian3()), new Cesium.Cartesian3());
}

function circlePoints(Cesium, center, basisA, basisB, radius) {
  const pts = [];
  for (let i = 0; i <= GIZMO_SEGMENTS; i++) {
    const t = (i / GIZMO_SEGMENTS) * Math.PI * 2;
    const offset = Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(basisA, radius * Math.cos(t), new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(basisB, radius * Math.sin(t), new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    pts.push(Cesium.Cartesian3.add(center, offset, new Cesium.Cartesian3()));
  }
  return pts;
}

function closestTOnAxis(Cesium, axisOrigin, axisDir, rayOrigin, rayDir) {
  const r = Cesium.Cartesian3.subtract(axisOrigin, rayOrigin, new Cesium.Cartesian3());
  const a = Cesium.Cartesian3.dot(axisDir, axisDir);
  const b = Cesium.Cartesian3.dot(axisDir, rayDir);
  const c = Cesium.Cartesian3.dot(rayDir, rayDir);
  const d = Cesium.Cartesian3.dot(axisDir, r);
  const e = Cesium.Cartesian3.dot(rayDir, r);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-9) return 0;
  return (b * e - c * d) / denom;
}

function angleOnPlane(Cesium, center, normal, basisA, basisB, rayOrigin, rayDir) {
  const denom = Cesium.Cartesian3.dot(rayDir, normal);
  if (Math.abs(denom) < 1e-9) return null;
  const t = Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(center, rayOrigin, new Cesium.Cartesian3()), normal) / denom;
  if (t < 0) return null;
  const hit = addScaled(Cesium, rayOrigin, rayDir, t);
  const v = Cesium.Cartesian3.subtract(hit, center, new Cesium.Cartesian3());
  const x = Cesium.Cartesian3.dot(v, basisA);
  const y = Cesium.Cartesian3.dot(v, basisB);
  return Math.atan2(y, x);
}

// This modal is mounted exactly once at the App level and never unmounted —
// VWorld's SDK defines window.ws3d.viewer as a non-redefinable property, so
// re-running new vw.Map()/start() after a React unmount+remount throws
// "Cannot redefine property: viewer". Instead, "closing" this modal just
// hides it with CSS so the underlying map/canvas stays alive across opens.
export default function VWorldMapModal() {
  const open = useFlowStore((state) => state.vworldOpen);
  const targetNodeId = useFlowStore((state) => state.vworldTargetNodeId);
  const closeVWorldMap = useFlowStore((state) => state.closeVWorldMap);
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const vworldApiKey = useFlowStore((state) => state.vworldApiKey);

  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]); // { id, name, primitive, position, heading, pitch, roll, scale }
  const [selectedModelId, setSelectedModelId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null); // { type: 'place', name, url } | { type: 'move', modelId } | { type: 'hideBuilding' }
  const [fov, setFov] = useState(60);
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [ratioLabel, setRatioLabel] = useState('16:9');
  const [captureRect, setCaptureRect] = useState(null); // { xPct, yPct, wPct, hPct }, stage-relative
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showBuildingNames, setShowBuildingNames] = useState(true);
  const [hiddenBuildings, setHiddenBuildings] = useState([]); // { id, name, key, feature }

  const mapContainerRef = useRef(null);
  const stageRef = useRef(null);
  const viewerRef = useRef(null);
  const mapRef = useRef(null);
  const cesiumRef = useRef(null);
  const clickHandlerRef = useRef(null);
  const fileInputRef = useRef(null);
  const outlineStageRef = useRef(null);
  const allEdgesStageRef = useRef(null);
  const gizmoRef = useRef(null);
  const gizmoHandlerRef = useRef(null);
  const dragRef = useRef(null);
  const captureDragRef = useRef(null);
  const modelsRef = useRef(models);
  const selectedModelIdRef = useRef(selectedModelId);
  const pendingActionRef = useRef(pendingAction);
  const hiddenBuildingKeysRef = useRef(new Set());

  const ratioOption = RATIO_OPTIONS.find((r) => r.label === ratioLabel) || RATIO_OPTIONS[0];
  const selectedModel = models.find((m) => m.id === selectedModelId) || null;

  useEffect(() => {
    modelsRef.current = models;
    if (allEdgesStageRef.current) {
      allEdgesStageRef.current.selected = models.map((m) => m.primitive);
      viewerRef.current?.scene.requestRender();
    }
  }, [models]);
  useEffect(() => {
    selectedModelIdRef.current = selectedModelId;
  }, [selectedModelId]);
  useEffect(() => {
    pendingActionRef.current = pendingAction;
  }, [pendingAction]);

  // Runs exactly once for the lifetime of the app.
  useEffect(() => {
    let cancelled = false;

    waitForVWorldSdk()
      .then((vw) => {
        if (cancelled) return;

        if (!window.ws3d?.viewer) {
          const map = new vw.Map();
          map.setOption({
            mapId: 'vworld-map-canvas',
            initPosition: new vw.CameraPosition(new vw.CoordZ(DEFAULT_LON, DEFAULT_LAT, DEFAULT_ALT), new vw.Direction(0, -90, 0)),
            logo: false,
            navigation: false
          });
          map.start();
          window.__vworldMapInstance = map;
        }

        const waitForViewer = (attempts = 0) => {
          if (cancelled) return;
          if (window.ws3d?.viewer && window.Cesium) {
            viewerRef.current = window.ws3d.viewer;
            mapRef.current = window.__vworldMapInstance || null;
            cesiumRef.current = window.Cesium;

            const Cesium = window.Cesium;
            const viewer = window.ws3d.viewer;

            try {
              if (!window.__vworldAllEdges) {
                const allEdges = Cesium.PostProcessStageLibrary.createEdgeDetectionStage();
                allEdges.uniforms.color = Cesium.Color.BLACK;
                allEdges.uniforms.length = 0.02;
                allEdges.selected = [];
                viewer.scene.postProcessStages.add(Cesium.PostProcessStageLibrary.createSilhouetteStage([allEdges]));
                window.__vworldAllEdges = allEdges;
              }
              allEdgesStageRef.current = window.__vworldAllEdges;

              if (!window.__vworldOutline) {
                const edgeDetection = Cesium.PostProcessStageLibrary.createEdgeDetectionStage();
                edgeDetection.uniforms.color = Cesium.Color.fromCssColorString('#df9c84');
                edgeDetection.uniforms.length = 0.02;
                edgeDetection.selected = [];
                const silhouette = Cesium.PostProcessStageLibrary.createSilhouetteStage([edgeDetection]);
                viewer.scene.postProcessStages.add(silhouette);
                window.__vworldOutline = edgeDetection;
              }
              outlineStageRef.current = window.__vworldOutline;
            } catch (e) {
              console.warn('VWorld: silhouette outline unavailable', e);
            }

            if (!window.__vworldTileHideHook) {
              const reapplyHiddenOnLoad = (tile) => {
                try {
                  const content = tile.content;
                  if (!content || typeof content.featuresLength !== 'number') return;
                  for (let i = 0; i < content.featuresLength; i++) {
                    const feature = content.getFeature(i);
                    const key = feature.getProperty('TD_ID') || feature.getProperty('MODEL_NAME');
                    if (key && hiddenBuildingKeysRef.current.has(key)) {
                      feature.show = false;
                    }
                  }
                } catch (e) {
                  console.warn('VWorld: re-applying hidden building on tile load failed', e);
                }
              };
              const hookTileset = (primitive) => {
                try {
                  if (!(primitive instanceof Cesium.Cesium3DTileset) || primitive.__vworldHideHooked || !primitive.tileLoad) return;
                  primitive.__vworldHideHooked = true;
                  primitive.tileLoad.addEventListener(reapplyHiddenOnLoad);
                } catch (e) {
                  console.warn('VWorld: hooking tileset for hidden-building persistence failed', e);
                }
              };
              try {
                const scanForNewTilesets = () => {
                  for (let i = 0; i < viewer.scene.primitives.length; i++) {
                    hookTileset(viewer.scene.primitives.get(i));
                  }
                };
                scanForNewTilesets();
                viewer.scene.postRender.addEventListener(scanForNewTilesets);
              } catch (e) {
                console.warn('VWorld: tile-reload hide hook unavailable', e);
              }
              window.__vworldTileHideHook = true;
            }

            setStatus('ready');
          } else if (attempts < 100) {
            setTimeout(() => waitForViewer(attempts + 1), 100);
          } else {
            setError('VWorld map failed to initialize (viewer not ready).');
            setStatus('error');
          }
        };
        waitForViewer();
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Click-to-place a new model, or click-to-reposition an existing one.
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;

    if (clickHandlerRef.current) {
      clickHandlerRef.current.destroy();
      clickHandlerRef.current = null;
    }
    if (!pendingAction) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement) => {
      if (pendingAction.type === 'hideBuilding') {
        const picked = viewer.scene.pick(movement.position);
        if (picked && typeof picked.show === 'boolean' && typeof picked.getProperty === 'function') {
          picked.show = false;
          const key = picked.getProperty('TD_ID') || picked.getProperty('MODEL_NAME') || null;
          if (key) hiddenBuildingKeysRef.current.add(key);
          const name = picked.getProperty('MODEL_NAME') || picked.getProperty('TD_ID') || 'Building';
          setHiddenBuildings((prev) => [...prev, { id: `hb-${hiddenBuildingCounter++}`, name, key, feature: picked }]);
          viewer.scene.requestRender();
        }
        return;
      }

      const cartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
      if (!cartesian) return;

      if (pendingAction.type === 'place') {
        const modelMatrix = composeMatrix(Cesium, cartesian, 0, 0, 0);
        const addModel = (model) => {
          model.modelMatrix = modelMatrix;
          model.scale = 1;
          viewer.scene.primitives.add(model);
          const id = `model-${modelCounter++}`;
          setModels((prev) => [
            ...prev,
            { id, name: pendingAction.name, primitive: model, position: cartesian, heading: 0, pitch: 0, roll: 0, scale: 1 }
          ]);
          setSelectedModelId(id);
          setPendingAction(null);

          const waitReady = (attempts = 0) => {
            try {
              if (model.ready && model.boundingSphere) {
                setModels((prev) => prev.map((m) => (m.id === id ? { ...m } : m)));
                return;
              }
            } catch {
              // not ready yet
            }
            if (attempts < 50) setTimeout(() => waitReady(attempts + 1), 100);
          };
          waitReady();
        };
        if (Cesium.Model.fromGltfAsync) {
          Cesium.Model.fromGltfAsync({ url: pendingAction.url, modelMatrix }).then(addModel);
        } else {
          addModel(Cesium.Model.fromGltf({ url: pendingAction.url, modelMatrix }));
        }
      } else if (pendingAction.type === 'move') {
        setModels((prev) =>
          prev.map((m) => {
            if (m.id !== pendingAction.modelId) return m;
            m.primitive.modelMatrix = composeMatrix(Cesium, cartesian, m.heading, m.pitch, m.roll);
            return { ...m, position: cartesian };
          })
        );
        setPendingAction(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    clickHandlerRef.current = handler;
    return () => {
      handler.destroy();
    };
  }, [pendingAction]);

  // Builds (or repositions) the gumball arrows/rings for the selected model.
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;

    const model = models.find((m) => m.id === selectedModelId);

    if (!model) {
      if (gizmoRef.current) {
        Object.values(gizmoRef.current.entities).forEach((e) => viewer.entities.remove(e));
        gizmoRef.current = null;
      }
      if (outlineStageRef.current) outlineStageRef.current.selected = [];
      return;
    }

    const { center, radius } = modelCenterAndRadius(Cesium, model);
    const armLength = radius * 1.8;
    const basis = enuBasis(Cesium, center);
    const dirs = { east: basis.east, north: basis.north, up: basis.up };

    const arrowGeom = {};
    for (const axis of ['east', 'north', 'up']) {
      arrowGeom[axis] = { shaft: [center, addScaled(Cesium, center, dirs[axis], armLength)], tip: addScaled(Cesium, center, dirs[axis], armLength) };
    }
    const ringGeom = {};
    for (const key of Object.keys(GIZMO_RING_AXIS)) {
      const { a, b } = GIZMO_RING_AXIS[key];
      ringGeom[key] = circlePoints(Cesium, center, dirs[a], dirs[b], armLength * 0.8);
    }

    if (!gizmoRef.current || gizmoRef.current.modelId !== model.id) {
      if (gizmoRef.current) {
        Object.values(gizmoRef.current.entities).forEach((e) => viewer.entities.remove(e));
      }
      const entities = {};
      for (const axis of ['east', 'north', 'up']) {
        const color = Cesium.Color.fromCssColorString(GIZMO_AXIS_COLOR[axis]);
        const shaft = viewer.entities.add({ polyline: { positions: arrowGeom[axis].shaft, width: 6, material: color, clampToGround: false } });
        shaft.gizmoPart = { type: 'translate', axis };
        const tip = viewer.entities.add({
          position: arrowGeom[axis].tip,
          point: { pixelSize: 14, color, outlineColor: Cesium.Color.WHITE, outlineWidth: 1, disableDepthTestDistance: Number.POSITIVE_INFINITY }
        });
        tip.gizmoPart = { type: 'translate', axis };
        entities[`arrow_${axis}_shaft`] = shaft;
        entities[`arrow_${axis}_tip`] = tip;
      }
      for (const key of Object.keys(GIZMO_RING_AXIS)) {
        const color = Cesium.Color.fromCssColorString(GIZMO_AXIS_COLOR[GIZMO_RING_AXIS[key].normal]);
        const ring = viewer.entities.add({ polyline: { positions: ringGeom[key], width: 4, material: color, clampToGround: false } });
        ring.gizmoPart = { type: 'rotate', axis: key };
        entities[`ring_${key}`] = ring;
      }
      gizmoRef.current = { modelId: model.id, entities };
    } else {
      const e = gizmoRef.current.entities;
      for (const axis of ['east', 'north', 'up']) {
        e[`arrow_${axis}_shaft`].polyline.positions = arrowGeom[axis].shaft;
        e[`arrow_${axis}_tip`].position = arrowGeom[axis].tip;
      }
      for (const key of Object.keys(GIZMO_RING_AXIS)) {
        e[`ring_${key}`].polyline.positions = ringGeom[key];
      }
    }

    if (outlineStageRef.current) outlineStageRef.current.selected = [model.primitive];
  }, [selectedModelId, models]);

  // Drag-to-translate (arrows) / drag-to-rotate (rings) on the gumball.
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;

    if (gizmoHandlerRef.current) {
      gizmoHandlerRef.current.destroy();
      gizmoHandlerRef.current = null;
    }
    if (!selectedModelId) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    const controller = viewer.scene.screenSpaceCameraController;

    handler.setInputAction((movement) => {
      const picked = viewer.scene.pick(movement.position);
      const part = picked?.id?.gizmoPart;
      if (!part) return;

      const model = modelsRef.current.find((m) => m.id === selectedModelIdRef.current);
      if (!model) return;

      const { center } = modelCenterAndRadius(Cesium, model);
      const basis = enuBasis(Cesium, center);
      const ray = viewer.camera.getPickRay(movement.position);
      if (!ray) return;

      controller.enableInputs = false;

      if (part.type === 'translate') {
        const axisDir = basis[part.axis];
        const startT = closestTOnAxis(Cesium, center, axisDir, ray.origin, ray.direction);
        dragRef.current = { type: 'translate', axisDir, center, startT, startPosition: Cesium.Cartesian3.clone(model.position) };
      } else {
        const { normal, a, b } = GIZMO_RING_AXIS[part.axis];
        const startAngle = angleOnPlane(Cesium, center, basis[normal], basis[a], basis[b], ray.origin, ray.direction);
        if (startAngle == null) return;
        dragRef.current = {
          type: 'rotate',
          axis: part.axis,
          center,
          normal: basis[normal],
          a: basis[a],
          b: basis[b],
          startAngle,
          startHeading: model.heading,
          startPitch: model.pitch,
          startRoll: model.roll
        };
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction((movement) => {
      const drag = dragRef.current;
      if (!drag) return;
      const model = modelsRef.current.find((m) => m.id === selectedModelIdRef.current);
      if (!model) return;
      const ray = viewer.camera.getPickRay(movement.endPosition);
      if (!ray) return;

      if (drag.type === 'translate') {
        const t = closestTOnAxis(Cesium, drag.center, drag.axisDir, ray.origin, ray.direction);
        const newPosition = addScaled(Cesium, drag.startPosition, drag.axisDir, t - drag.startT);
        model.primitive.modelMatrix = composeMatrix(Cesium, newPosition, model.heading, model.pitch, model.roll);
        setModels((prev) => prev.map((m) => (m.id === model.id ? { ...m, position: newPosition } : m)));
      } else {
        const angle = angleOnPlane(Cesium, drag.center, drag.normal, drag.a, drag.b, ray.origin, ray.direction);
        if (angle == null) return;
        const delta = angle - drag.startAngle;
        const patch = {};
        if (drag.axis === 'heading') patch.heading = drag.startHeading + delta;
        if (drag.axis === 'pitch') patch.pitch = drag.startPitch + delta;
        if (drag.axis === 'roll') patch.roll = drag.startRoll + delta;
        const next = { ...model, ...patch };
        model.primitive.modelMatrix = composeMatrix(Cesium, next.position, next.heading, next.pitch, next.roll);
        setModels((prev) => prev.map((m) => (m.id === model.id ? next : m)));
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction(() => {
      if (dragRef.current) {
        dragRef.current = null;
        controller.enableInputs = true;
      }
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    handler.setInputAction((movement) => {
      if (pendingActionRef.current) return;
      const picked = viewer.scene.pick(movement.position);
      if (!picked?.id?.gizmoPart) {
        setSelectedModelId(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    gizmoHandlerRef.current = handler;
    return () => {
      handler.destroy();
      if (controller) controller.enableInputs = true;
    };
  }, [selectedModelId]);

  // Cesium sizes its canvas off window 'resize' events, which don't fire
  // when this modal's container goes from display:none back to visible.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setScreenshotMode(false);
      setPendingAction(null);
    }
  }, [open]);

  useEffect(() => {
    if (!screenshotMode || !ratioOption.value) {
      setCaptureRect(null);
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    setCaptureRect(fitBoxForRatio(ratioOption.value, box.width, box.height));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenshotMode, ratioLabel]);

  function capturePointFromEvent(e) {
    const box = stageRef.current.getBoundingClientRect();
    return { x: clamp((e.clientX - box.left) / box.width, 0, 1), y: clamp((e.clientY - box.top) / box.height, 0, 1) };
  }

  function startCaptureMove(e) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    captureDragRef.current = { mode: 'move', startPointer: capturePointFromEvent(e), startRect: captureRect };
  }

  function startCaptureResize(corner) {
    return (e) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const anchor = {
        x: corner.includes('w') ? captureRect.xPct + captureRect.wPct : captureRect.xPct,
        y: corner.includes('n') ? captureRect.yPct + captureRect.hPct : captureRect.yPct
      };
      captureDragRef.current = { mode: 'resize', corner, anchor };
    };
  }

  function handleCaptureDragMove(e) {
    const drag = captureDragRef.current;
    if (!drag || !captureRect) return;
    const box = stageRef.current.getBoundingClientRect();
    const p = capturePointFromEvent(e);

    if (drag.mode === 'move') {
      const dx = p.x - drag.startPointer.x;
      const dy = p.y - drag.startPointer.y;
      setCaptureRect({
        ...drag.startRect,
        xPct: clamp(drag.startRect.xPct + dx, 0, 1 - drag.startRect.wPct),
        yPct: clamp(drag.startRect.yPct + dy, 0, 1 - drag.startRect.hPct)
      });
      return;
    }

    const { anchor, corner } = drag;
    const dirX = corner.includes('w') ? -1 : 1;
    const dirY = corner.includes('n') ? -1 : 1;
    const ratio = ratioOption.value;

    const maxWidthPx = (dirX > 0 ? 1 - anchor.x : anchor.x) * box.width;
    const maxHeightPx = (dirY > 0 ? 1 - anchor.y : anchor.y) * box.height;

    let widthPx = Math.abs(p.x - anchor.x) * box.width;
    let heightPx = widthPx / ratio;

    if (heightPx > maxHeightPx) {
      heightPx = maxHeightPx;
      widthPx = heightPx * ratio;
    }
    if (widthPx > maxWidthPx) {
      widthPx = maxWidthPx;
      heightPx = widthPx / ratio;
    }
    if (widthPx < box.width * 0.05) return;

    const wPct = widthPx / box.width;
    const hPct = heightPx / box.height;

    setCaptureRect({ wPct, hPct, xPct: dirX > 0 ? anchor.x : anchor.x - wPct, yPct: dirY > 0 ? anchor.y : anchor.y - hPct });
  }

  function endCaptureDrag() {
    captureDragRef.current = null;
  }

  function handleAddModelFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPendingAction({ type: 'place', name: file.name, url });
  }

  function focusModel(m) {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || !m.position) return;
    const carto = Cesium.Cartographic.fromCartesian(m.position);
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + 400) });
  }

  function removeModel(m) {
    const viewer = viewerRef.current;
    if (viewer) viewer.scene.primitives.remove(m.primitive);
    setModels((prev) => prev.filter((x) => x.id !== m.id));
    if (selectedModelId === m.id) setSelectedModelId(null);
  }

  function updateTransform(modelId, patch) {
    const Cesium = cesiumRef.current;
    setModels((prev) =>
      prev.map((m) => {
        if (m.id !== modelId) return m;
        const next = { ...m, ...patch };
        m.primitive.modelMatrix = composeMatrix(Cesium, next.position, next.heading, next.pitch, next.roll);
        m.primitive.scale = next.scale;
        return next;
      })
    );
  }

  function applyFov(deg) {
    setFov(deg);
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (viewer?.camera?.frustum && Cesium) {
      viewer.camera.frustum.fov = Cesium.Math.toRadians(deg);
    }
  }

  function toggleBuildings(next) {
    setShowBuildings(next);
    const map = mapRef.current;
    const viewer = viewerRef.current;
    if (!map || !viewer) return;
    try {
      const layer = map.getLayerElement('facility_build');
      if (layer) next ? layer.show() : layer.hide();
    } catch (e) {
      console.warn('VWorld: facility_build layer unavailable', e);
    }
    viewer.scene.requestRender();
  }

  function restoreBuilding(id) {
    setHiddenBuildings((prev) => {
      const entry = prev.find((b) => b.id === id);
      if (entry) {
        entry.feature.show = true;
        if (entry.key) hiddenBuildingKeysRef.current.delete(entry.key);
      }
      return prev.filter((b) => b.id !== id);
    });
    viewerRef.current?.scene.requestRender();
  }

  function restoreAllBuildings() {
    setHiddenBuildings((prev) => {
      prev.forEach((b) => {
        b.feature.show = true;
        if (b.key) hiddenBuildingKeysRef.current.delete(b.key);
      });
      return [];
    });
    viewerRef.current?.scene.requestRender();
  }

  const BUILDING_NAME_LAYERS = ['poi_base', 'poi_bound', 'facility_build_text', 'facility_build_label', 'label'];
  function toggleBuildingNames(next) {
    setShowBuildingNames(next);
    const map = mapRef.current;
    const viewer = viewerRef.current;
    if (!map || !viewer) return;
    for (const name of BUILDING_NAME_LAYERS) {
      try {
        const layer = map.getLayerElement(name);
        if (layer) next ? layer.show() : layer.hide();
      } catch {
        // not present in this SDK build — skip
      }
    }
    viewer.scene.requestRender();
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const params = new URLSearchParams({ query: searchQuery, apiKey: vworldApiKey || '' });
      const res = await fetch(`/api/vworld/search?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'VWorld 검색에 실패했습니다.');
      const items = json?.response?.result?.items || [];
      setSearchResults(items);
      if (!items.length) setError('검색 결과가 없습니다.');
      else setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  function goToResult(item) {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    const x = Number(item?.point?.x);
    const y = Number(item?.point?.y);
    if (!viewer || !Cesium || Number.isNaN(x) || Number.isNaN(y)) return;
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(x, y, 800) });
    setSearchResults([]);
  }

  async function handleCapture() {
    const viewer = viewerRef.current;
    if (!viewer || !targetNodeId) return;
    setCapturing(true);
    try {
      const canvas = mapContainerRef.current?.querySelector('canvas') || viewer.scene.canvas;
      viewer.render();
      const fullDataUrl = canvas.toDataURL('image/png');

      let result = fullDataUrl;
      if (ratioOption.value && captureRect) {
        result = await cropImage(fullDataUrl, captureRect);
      }
      updateNodeData(targetNodeId, { imageUrl: result, output: 'IMAGE(vworld capture)' });
      setScreenshotMode(false);
      closeVWorldMap();
    } catch (err) {
      setError(err.message);
    } finally {
      setCapturing(false);
    }
  }

  return createPortal(
    <div className="vworld-overlay" hidden={!open}>
      <div className="vworld-modal">
        <div className="vworld-header">
          <span>VWorld — 3D 지도</span>
          <button type="button" className="vworld-close" onClick={closeVWorldMap} title="닫기">
            <X size={16} />
          </button>
        </div>

        <div className="vworld-body">
          <div className="vworld-side">
            {screenshotMode ? (
              <>
                <div className="vworld-side-title">스크린샷 모드</div>
                <p className="vworld-side-hint">아래에서 비율을 고르고 지도를 움직여 프레임을 잡은 뒤 캡처하세요.</p>
              </>
            ) : (
              <>
                <div className="vworld-side-title">모델 배치 ({models.length})</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".glb,.gltf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    handleAddModelFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button type="button" className="vworld-side-btn" onClick={() => fileInputRef.current?.click()} disabled={status !== 'ready'}>
                  + .glb 모델 추가
                </button>
                {pendingAction?.type === 'place' && <p className="vworld-side-hint">지도를 클릭해 "{pendingAction.name}"를 배치하세요...</p>}
                {pendingAction?.type === 'move' && <p className="vworld-side-hint">지도를 클릭해 모델을 이동하세요...</p>}

                {models.map((m) => (
                  <div
                    key={m.id}
                    className={`vworld-layer-row${m.id === selectedModelId ? ' selected' : ''}`}
                    onClick={() => setSelectedModelId((prev) => (prev === m.id ? null : m.id))}
                  >
                    <span className="vworld-layer-name">{m.name}</span>
                    <button type="button" className="vworld-layer-btn" onClick={(e) => { e.stopPropagation(); focusModel(m); }} title="포커스">
                      <Crosshair size={13} />
                    </button>
                    <button type="button" className="vworld-layer-btn" onClick={(e) => { e.stopPropagation(); removeModel(m); }} title="삭제">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}

                {selectedModel && (
                  <div className="vworld-transform">
                    <div className="vworld-side-title">변형: {selectedModel.name}</div>
                    <button type="button" className="vworld-side-btn" onClick={() => setPendingAction({ type: 'move', modelId: selectedModel.id })}>
                      {pendingAction?.type === 'move' && pendingAction.modelId === selectedModel.id ? '지도를 클릭해 배치...' : '📍 이동 (지도 클릭)'}
                    </button>

                    <label className="vworld-slider-label">Heading {Math.round(toDeg(selectedModel.heading))}°</label>
                    <input type="range" min="0" max="360" value={toDeg(selectedModel.heading)} onChange={(e) => updateTransform(selectedModel.id, { heading: toRad(Number(e.target.value)) })} />

                    <label className="vworld-slider-label">Pitch {Math.round(toDeg(selectedModel.pitch))}°</label>
                    <input type="range" min="-90" max="90" value={toDeg(selectedModel.pitch)} onChange={(e) => updateTransform(selectedModel.id, { pitch: toRad(Number(e.target.value)) })} />

                    <label className="vworld-slider-label">Roll {Math.round(toDeg(selectedModel.roll))}°</label>
                    <input type="range" min="-180" max="180" value={toDeg(selectedModel.roll)} onChange={(e) => updateTransform(selectedModel.id, { roll: toRad(Number(e.target.value)) })} />

                    <label className="vworld-slider-label">Scale {selectedModel.scale.toFixed(2)}×</label>
                    <input type="range" min="0.1" max="10" step="0.1" value={selectedModel.scale} onChange={(e) => updateTransform(selectedModel.id, { scale: Number(e.target.value) })} />

                    <button type="button" className="vworld-side-btn" onClick={() => updateTransform(selectedModel.id, { heading: 0, pitch: 0, roll: 0, scale: 1 })}>
                      <RotateCw size={13} /> 변형 초기화
                    </button>
                  </div>
                )}

                <div className="vworld-side-title">주소 검색</div>
                <input
                  className="vworld-search-input"
                  placeholder="예: 테헤란로 152"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button type="button" className="vworld-side-btn" onClick={handleSearch} disabled={searching || status !== 'ready'}>
                  {searching ? '검색 중...' : '검색'}
                </button>
                {searchResults.map((item, i) => (
                  <div className="vworld-layer-row" key={i} style={{ cursor: 'pointer' }} onClick={() => goToResult(item)}>
                    <span className="vworld-layer-name">{item?.address?.road || item?.address?.parcel || item?.title}</span>
                  </div>
                ))}

                <div className="vworld-side-title">지도 레이어</div>
                <label className="vworld-toggle">
                  <input type="checkbox" checked={showBuildings} onChange={(e) => toggleBuildings(e.target.checked)} disabled={status !== 'ready'} />
                  3D 건물
                </label>
                <label className="vworld-toggle">
                  <input type="checkbox" checked={showBuildingNames} onChange={(e) => toggleBuildingNames(e.target.checked)} disabled={status !== 'ready'} />
                  건물 이름
                </label>

                <div className="vworld-side-title">건물 숨기기 ({hiddenBuildings.length})</div>
                <button
                  type="button"
                  className="vworld-side-btn"
                  onClick={() => setPendingAction((prev) => (prev?.type === 'hideBuilding' ? null : { type: 'hideBuilding' }))}
                  disabled={status !== 'ready'}
                >
                  {pendingAction?.type === 'hideBuilding' ? '건물 클릭해 숨기기 (다시 누르면 중지)' : '🏢 건물 숨기기 (지도 클릭)'}
                </button>
                {hiddenBuildings.map((b) => (
                  <div className="vworld-layer-row" key={b.id}>
                    <span className="vworld-layer-name">{b.name}</span>
                    <button type="button" className="vworld-layer-btn" onClick={() => restoreBuilding(b.id)} title="복원">
                      <RotateCw size={13} />
                    </button>
                  </div>
                ))}
                {hiddenBuildings.length > 1 && (
                  <button type="button" className="vworld-side-btn" onClick={restoreAllBuildings}>
                    전체 복원
                  </button>
                )}
              </>
            )}

            {error && <div className="vworld-error-text">{error}</div>}
          </div>

          <div className="vworld-stage-wrap">
            {status === 'loading' && <div className="vworld-status">VWorld 지도를 불러오는 중...</div>}
            {status === 'error' && <div className="vworld-status vworld-status-error">{error}</div>}
            <div id="vworld-map-canvas" ref={mapContainerRef} className="vworld-canvas" />
            <div className="vworld-capture-guide" ref={stageRef}>
              {captureRect && (
                <div
                  className="vworld-crop-rect"
                  onPointerDown={startCaptureMove}
                  onPointerMove={handleCaptureDragMove}
                  onPointerUp={endCaptureDrag}
                  style={{
                    left: `${captureRect.xPct * 100}%`,
                    top: `${captureRect.yPct * 100}%`,
                    width: `${captureRect.wPct * 100}%`,
                    height: `${captureRect.hPct * 100}%`
                  }}
                >
                  {CAPTURE_CORNERS.map((c) => (
                    <span
                      key={c}
                      className={`vworld-crop-handle vworld-crop-handle-${c}`}
                      onPointerDown={startCaptureResize(c)}
                      onPointerMove={handleCaptureDragMove}
                      onPointerUp={endCaptureDrag}
                    />
                  ))}
                </div>
              )}
            </div>
            {screenshotMode && (
              <button type="button" className="vworld-screenshot-exit" onClick={() => setScreenshotMode(false)} disabled={capturing} title="스크린샷 모드 종료">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="vworld-footer">
          <div className="vworld-fov">
            <label>FOV</label>
            <input type="range" min="10" max="120" value={fov} onChange={(e) => applyFov(Number(e.target.value))} />
            <span>{fov}°</span>
          </div>

          {screenshotMode ? (
            <>
              <div className="vworld-ratio">
                <label>캡처 비율</label>
                <select value={ratioLabel} onChange={(e) => setRatioLabel(e.target.value)}>
                  {RATIO_OPTIONS.map((r) => (
                    <option key={r.label} value={r.label}>{r.label}</option>
                  ))}
                </select>
              </div>
              <button type="button" className="vworld-close-mode-btn" onClick={() => setScreenshotMode(false)} disabled={capturing}>
                취소
              </button>
              <button type="button" className="vworld-capture-btn" onClick={handleCapture} disabled={status !== 'ready' || capturing}>
                <Camera size={16} />
                {capturing ? '캡처 중...' : '캡처 확정'}
              </button>
            </>
          ) : (
            <button type="button" className="vworld-capture-btn" onClick={() => setScreenshotMode(true)} disabled={status !== 'ready'}>
              <Camera size={16} />
              스크린샷
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
