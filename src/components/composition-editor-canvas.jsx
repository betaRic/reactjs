"use client";

import { Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  Grid3X3,
  Image as ImageIcon,
  Redo2,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  duotonePalette,
  layerAppliesTo,
  normalizePhotoEdit,
  normalizeTextLayer,
  resolveLayerText,
} from "@/lib/composition";

const FALLBACK_SIZE = 1080;

export default function CompositionEditorCanvas({
  media,
  template,
  layers,
  campaignTitle,
  eventFields,
  target = "photo",
  duotone = "none",
  focusLayerId = "",
  onMediaEdit,
  onLayersChange,
  onClose,
}) {
  const source = useLoadedImage(media?.src);
  const templateImage = useLoadedImage(template?.image);
  const [localEdit, setLocalEdit] = useState(() => normalizePhotoEdit(media?.edit));
  const [localLayers, setLocalLayers] = useState(() => (layers || []).map(normalizeTextLayer));
  const [selectedId, setSelectedId] = useState(focusLayerId || "photo");
  const filteredSource = usePreparedImage(source, target === "cover" ? duotone : "none", localEdit.rotation);
  const [gridVisible, setGridVisible] = useState(true);
  const historyRef = useRef([]);
  const futureRef = useRef([]);
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });
  const stageRef = useRef(null);
  const editorRef = useRef(null);

  const width = templateImage?.naturalWidth || FALLBACK_SIZE;
  const height = templateImage?.naturalHeight || FALLBACK_SIZE;
  const visibleLayers = useMemo(
    () => localLayers.filter((layer) => layerAppliesTo(layer, target, media?.id)),
    [localLayers, target, media?.id],
  );
  const selectedLayer = localLayers.find((layer) => layer.id === selectedId) || null;
  const imageGeometry = useMemo(
    () => filteredSource ? getImageGeometry(filteredSource, width, height, localEdit) : null,
    [filteredSource, width, height, localEdit],
  );

  function snapshot() {
    return {
      edit: { ...localEdit },
      layers: localLayers.map((item) => ({ ...item })),
    };
  }
  function recordHistory() {
    historyRef.current = [...historyRef.current.slice(-29), snapshot()];
    futureRef.current = [];
    setHistoryState({ undo: historyRef.current.length, redo: 0 });
  }
  function commitEdit(nextValue, { record = true } = {}) {
    if (record) recordHistory();
    const next = normalizePhotoEdit(nextValue);
    setLocalEdit(next);
    onMediaEdit?.(next);
  }
  function commitLayers(nextValue, { record = true } = {}) {
    if (record) recordHistory();
    const next = nextValue.map(normalizeTextLayer);
    setLocalLayers(next);
    onLayersChange?.(next);
  }
  function updateLayer(id, changes, options) {
    commitLayers(localLayers.map((item) => item.id === id ? { ...item, ...changes } : item), options);
  }
  function undo() {
    const previous = historyRef.current.pop();
    if (!previous) return;
    futureRef.current.push(snapshot());
    setLocalEdit(previous.edit);
    setLocalLayers(previous.layers);
    onMediaEdit?.(previous.edit);
    onLayersChange?.(previous.layers);
    setHistoryState({ undo: historyRef.current.length, redo: futureRef.current.length });
  }
  function redo() {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(snapshot());
    setLocalEdit(next.edit);
    setLocalLayers(next.layers);
    onMediaEdit?.(next.edit);
    onLayersChange?.(next.layers);
    setHistoryState({ undo: historyRef.current.length, redo: futureRef.current.length });
  }
  function movePhoto(node) {
    if (!filteredSource || !imageGeometry) return;
    const overflowX = Math.max(0, imageGeometry.drawWidth - width);
    const overflowY = Math.max(0, imageGeometry.drawHeight - height);
    commitEdit({
      ...localEdit,
      positionX: overflowX > 0 ? clamp(-node.x() / overflowX * 100, 0, 100) : 50,
      positionY: overflowY > 0 ? clamp(-node.y() / overflowY * 100, 0, 100) : 50,
    }, { record: false });
  }
  function handleKeyDown(event) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 2 : 0.5;
    const movement = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (selectedLayer) {
      updateLayer(selectedLayer.id, {
        x: clamp(selectedLayer.x + movement[0], 0, 100),
        y: clamp(selectedLayer.y + movement[1], 0, 100),
      });
    } else {
      commitEdit({
        ...localEdit,
        positionX: clamp(localEdit.positionX - movement[0], 0, 100),
        positionY: clamp(localEdit.positionY - movement[1], 0, 100),
      });
    }
  }
  function handleWheel(event) {
    if (selectedId !== "photo") return;
    event.evt.preventDefault();
    commitEdit({ ...localEdit, zoom: clamp(localEdit.zoom * Math.exp(-event.evt.deltaY * 0.001), 1, 3) });
  }

  return (
    <div className="composition-editor-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <section className="composition-editor-dialog" role="dialog" aria-modal="true" aria-label={`Edit ${target === "cover" ? "cover page" : media?.name || "photo"}`}>
        <header className="composition-editor-header">
          <div>
            <span className="section-kicker"><Type size={14} /> Direct design editor</span>
            <h3>{target === "cover" ? "Design the cover page" : "Edit photo and text"}</h3>
            <p>Click the photo or a text layer, then drag it directly. The selected template remains locked.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close design editor"><X size={20} /></button>
        </header>

        <div className="composition-editor-body">
          <div className="composition-stage-column">
            <div
              ref={editorRef}
              className={clsx("composition-stage-wrap", gridVisible && "show-grid")}
              tabIndex={0}
              onKeyDown={handleKeyDown}
              aria-label="Interactive design canvas. Use arrow keys to move the selected item."
            >
              <ResponsiveStage width={width} height={height}>
                {({ displayWidth, displayHeight, scale }) => (
                  <Stage
                    ref={stageRef}
                    width={displayWidth}
                    height={displayHeight}
                    scaleX={scale}
                    scaleY={scale}
                    onMouseDown={(event) => {
                      if (event.target === event.target.getStage()) setSelectedId("");
                    }}
                    onTouchStart={(event) => {
                      if (event.target === event.target.getStage()) setSelectedId("");
                    }}
                    onWheel={handleWheel}
                  >
                    <Layer clipX={0} clipY={0} clipWidth={width} clipHeight={height}>
                      <Rect width={width} height={height} fill="#eef1f7" />
                      {filteredSource && imageGeometry && (
                        <KonvaImage
                          image={filteredSource}
                          x={imageGeometry.drawX}
                          y={imageGeometry.drawY}
                          width={imageGeometry.drawWidth}
                          height={imageGeometry.drawHeight}
                          draggable={selectedId === "photo"}
                          onClick={() => setSelectedId("photo")}
                          onTap={() => setSelectedId("photo")}
                          onDragStart={recordHistory}
                          onDragMove={(event) => movePhoto(event.target)}
                          onDragEnd={(event) => movePhoto(event.target)}
                        />
                      )}
                      {templateImage && <KonvaImage image={templateImage} width={width} height={height} listening={false} />}
                      {gridVisible && (
                        <>
                          <Rect x={width * 0.05} y={height * 0.05} width={width * 0.9} height={height * 0.9} stroke="rgba(255,255,255,.76)" dash={[12, 9]} listening={false} />
                          <Line points={[width / 2, 0, width / 2, height]} stroke="rgba(255,255,255,.35)" dash={[8, 8]} listening={false} />
                          <Line points={[0, height / 2, width, height / 2]} stroke="rgba(255,255,255,.35)" dash={[8, 8]} listening={false} />
                        </>
                      )}
                      {visibleLayers.map((layer) => (
                        <EditableText
                          key={layer.id}
                          layer={layer}
                          canvasWidth={width}
                          canvasHeight={height}
                          text={resolveLayerText(layer, campaignTitle, eventFields)}
                          selected={selectedId === layer.id}
                          onSelect={() => setSelectedId(layer.id)}
                          onHistory={recordHistory}
                          onChange={(changes, options) => updateLayer(layer.id, changes, options)}
                        />
                      ))}
                    </Layer>
                  </Stage>
                )}
              </ResponsiveStage>
            </div>

            <div className="composition-quick-toolbar" role="toolbar" aria-label="Design history and canvas tools">
              <button type="button" onClick={undo} disabled={!historyState.undo} aria-label="Undo"><Undo2 size={18} /><span>Undo</span></button>
              <button type="button" onClick={redo} disabled={!historyState.redo} aria-label="Redo"><Redo2 size={18} /><span>Redo</span></button>
              <button type="button" className={gridVisible ? "active" : ""} aria-pressed={gridVisible} onClick={() => setGridVisible((value) => !value)}><Grid3X3 size={18} /><span>Guides</span></button>
              <button type="button" onClick={() => setSelectedId("photo")} className={selectedId === "photo" ? "active" : ""}><ImageIcon size={18} /><span>Photo</span></button>
            </div>
            <p className="composition-keyboard-help">Drag directly on the canvas · Arrow keys nudge · Hold Shift for larger movement</p>
          </div>

          <aside className="composition-inspector">
            {selectedLayer ? (
              <TextInspector
                layer={selectedLayer}
                target={target}
                mediaId={media?.id}
                onChange={(changes) => updateLayer(selectedLayer.id, changes)}
                onDelete={() => {
                  commitLayers(localLayers.filter((item) => item.id !== selectedLayer.id));
                  setSelectedId("photo");
                }}
              />
            ) : (
              <PhotoInspector
                edit={localEdit}
                onChange={commitEdit}
                onReset={() => commitEdit({ zoom: 1, positionX: 50, positionY: 50, rotation: 0 })}
              />
            )}
          </aside>
        </div>

        <footer className="composition-editor-footer">
          <span>The published image uses this exact photo crop, template, and text placement.</span>
          <button className="primary-button" type="button" onClick={onClose}><Check size={17} /> Done editing</button>
        </footer>
      </section>
    </div>
  );
}

function EditableText({ layer, text, canvasWidth, canvasHeight, selected, onSelect, onHistory, onChange }) {
  const textRef = useRef(null);
  const transformerRef = useRef(null);
  useEffect(() => {
    if (selected && textRef.current && transformerRef.current) {
      transformerRef.current.nodes([textRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);
  if (!text) return null;
  const x = canvasWidth * layer.x / 100;
  const y = canvasHeight * layer.y / 100;
  const width = canvasWidth * layer.width / 100;
  const fontSize = canvasWidth * layer.fontSize / 100;
  return (
    <>
      <Text
        ref={textRef}
        text={text}
        x={x}
        y={y}
        width={width}
        rotation={layer.rotation}
        fontFamily={layer.fontFamily}
        fontSize={fontSize}
        fontStyle={layer.fontWeight >= 700 ? "bold" : "normal"}
        fill={layer.color}
        align={layer.align}
        lineHeight={layer.lineHeight}
        letterSpacing={layer.letterSpacing}
        stroke={layer.outline ? "rgba(0,0,0,.58)" : undefined}
        strokeWidth={layer.outline ? Math.max(1, canvasWidth * 0.0026) : 0}
        shadowColor="rgba(0,0,0,.28)"
        shadowBlur={layer.outline ? canvasWidth * 0.005 : 0}
        shadowOffsetY={layer.outline ? canvasWidth * 0.002 : 0}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={onHistory}
        onDragEnd={(event) => {
          const node = event.target;
          let nextX = clamp(node.x() / canvasWidth * 100, 0, 100);
          let nextY = clamp(node.y() / canvasHeight * 100, 0, 100);
          const nextWidth = layer.width;
          if (Math.abs((nextX + nextWidth / 2) - 50) < 1.8) nextX = 50 - nextWidth / 2;
          const nextHeight = node.height() / canvasHeight * 100;
          if (Math.abs((nextY + nextHeight / 2) - 50) < 1.8) nextY = 50 - nextHeight / 2;
          onChange({
            x: nextX,
            y: nextY,
          }, { record: false });
        }}
        onTransformStart={onHistory}
        onTransformEnd={() => {
          const node = textRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: clamp(node.x() / canvasWidth * 100, 0, 100),
            y: clamp(node.y() / canvasHeight * 100, 0, 100),
            width: clamp(node.width() * scaleX / canvasWidth * 100, 8, 100),
            fontSize: clamp(layer.fontSize * scaleY, 1.4, 18),
            rotation: node.rotation(),
          }, { record: false });
        }}
      />
      {selected && (
        <Transformer
          ref={transformerRef}
          rotateEnabled
          flipEnabled={false}
          borderStroke="#5a55e8"
          borderStrokeWidth={2}
          anchorFill="#ffffff"
          anchorStroke="#5a55e8"
          anchorSize={16}
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]}
          boundBoxFunc={(oldBox, newBox) => Math.abs(newBox.width) < 80 || Math.abs(newBox.height) < 18 ? oldBox : newBox}
        />
      )}
    </>
  );
}

function PhotoInspector({ edit, onChange, onReset }) {
  return (
    <div className="inspector-stack">
      <div className="inspector-heading"><ImageIcon size={18} /><div><strong>Photo</strong><span>Move and crop the background image</span></div></div>
      <div className="inspector-tool-row">
        <button type="button" onClick={() => onChange({ ...edit, zoom: clamp(edit.zoom - 0.1, 1, 3) })} disabled={edit.zoom <= 1}><ZoomOut size={18} /> Zoom out</button>
        <output>{Math.round(edit.zoom * 100)}%</output>
        <button type="button" onClick={() => onChange({ ...edit, zoom: clamp(edit.zoom + 0.1, 1, 3) })} disabled={edit.zoom >= 3}><ZoomIn size={18} /> Zoom in</button>
      </div>
      <label className="inspector-field"><span>Zoom</span><input type="range" min="1" max="3" step=".01" value={edit.zoom} onChange={(event) => onChange({ ...edit, zoom: Number(event.target.value) })} /></label>
      <div className="inspector-two-columns">
        <label className="inspector-field"><span>Horizontal position</span><input type="number" min="0" max="100" step=".5" value={edit.positionX} onChange={(event) => onChange({ ...edit, positionX: Number(event.target.value) })} /></label>
        <label className="inspector-field"><span>Vertical position</span><input type="number" min="0" max="100" step=".5" value={edit.positionY} onChange={(event) => onChange({ ...edit, positionY: Number(event.target.value) })} /></label>
      </div>
      <div className="inspector-button-grid">
        <button type="button" onClick={() => onChange({ ...edit, rotation: (edit.rotation + 270) % 360 })}><RotateCcw size={17} /> Rotate left</button>
        <button type="button" onClick={() => onChange({ ...edit, rotation: (edit.rotation + 90) % 360 })}><RotateCw size={17} /> Rotate right</button>
      </div>
      <button className="secondary-button inspector-reset" type="button" onClick={onReset}><RefreshCcw size={17} /> Reset photo</button>
    </div>
  );
}

function TextInspector({ layer, target, mediaId, onChange, onDelete }) {
  return (
    <div className="inspector-stack">
      <div className="inspector-heading"><Type size={18} /><div><strong>{layerLabel(layer.source)}</strong><span>Plain text layer</span></div></div>
      {layer.source === "custom" && (
        <label className="inspector-field"><span>Text</span><textarea rows={3} value={layer.text} onChange={(event) => onChange({ text: event.target.value.slice(0, 240) })} /></label>
      )}
      <label className="inspector-field">
        <span>Show on</span>
        <select value={layer.scope} onChange={(event) => onChange({ scope: event.target.value, photoId: event.target.value === "selected_photo" ? mediaId : "" })}>
          <option value="cover">Cover only</option>
          <option value="all_photos">All event photos</option>
          {target === "photo" && <option value="selected_photo">This photo only</option>}
        </select>
      </label>
      <div className="inspector-two-columns">
        <label className="inspector-field"><span>Font</span><select value={layer.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value })}>{["Arial", "Inter", "Georgia", "Montserrat", "Poppins"].map((font) => <option key={font}>{font}</option>)}</select></label>
        <label className="inspector-field"><span>Weight</span><select value={layer.fontWeight} onChange={(event) => onChange({ fontWeight: Number(event.target.value) })}>{[400, 500, 600, 700, 800, 900].map((weight) => <option key={weight} value={weight}>{weight}</option>)}</select></label>
      </div>
      <div className="inspector-two-columns">
        <label className="inspector-field"><span>Size</span><input type="number" min="1.4" max="18" step=".1" value={layer.fontSize} onChange={(event) => onChange({ fontSize: Number(event.target.value) })} /></label>
        <label className="inspector-field"><span>Color</span><input className="color-input" type="color" value={layer.color} onChange={(event) => onChange({ color: event.target.value })} /></label>
      </div>
      <div className="inspector-two-columns">
        <label className="inspector-field"><span>X position</span><input type="number" min="0" max="100" step=".1" value={layer.x} onChange={(event) => onChange({ x: Number(event.target.value) })} /></label>
        <label className="inspector-field"><span>Y position</span><input type="number" min="0" max="100" step=".1" value={layer.y} onChange={(event) => onChange({ y: Number(event.target.value) })} /></label>
      </div>
      <div className="inspector-two-columns">
        <label className="inspector-field"><span>Text width</span><input type="number" min="8" max="100" step=".1" value={layer.width} onChange={(event) => onChange({ width: Number(event.target.value) })} /></label>
        <label className="inspector-field"><span>Rotation</span><input type="number" min="0" max="359" step="1" value={layer.rotation} onChange={(event) => onChange({ rotation: Number(event.target.value) })} /></label>
      </div>
      <div className="text-align-buttons" role="group" aria-label="Text alignment">
        <button type="button" className={layer.align === "left" ? "active" : ""} onClick={() => onChange({ align: "left" })} aria-label="Align left"><AlignLeft size={18} /></button>
        <button type="button" className={layer.align === "center" ? "active" : ""} onClick={() => onChange({ align: "center" })} aria-label="Align center"><AlignCenter size={18} /></button>
        <button type="button" className={layer.align === "right" ? "active" : ""} onClick={() => onChange({ align: "right" })} aria-label="Align right"><AlignRight size={18} /></button>
      </div>
      <label className="inspector-check"><input type="checkbox" checked={layer.outline} onChange={(event) => onChange({ outline: event.target.checked })} /><span>Add a subtle outline for readability</span></label>
      <button className="danger-button inspector-delete" type="button" onClick={onDelete}>Delete text layer</button>
    </div>
  );
}

function ResponsiveStage({ width, height, children }) {
  const hostRef = useRef(null);
  const [hostWidth, setHostWidth] = useState(760);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const observer = new ResizeObserver(([entry]) => setHostWidth(Math.max(260, entry.contentRect.width)));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, hostWidth / width);
  return <div ref={hostRef} className="responsive-stage-host">{children({ displayWidth: width * scale, displayHeight: height * scale, scale })}</div>;
}

function useLoadedImage(source) {
  const [loaded, setLoaded] = useState({ source: "", image: null });
  useEffect(() => {
    let active = true;
    if (!source) return undefined;
    const next = new window.Image();
    next.onload = () => active && setLoaded({ source, image: next });
    next.onerror = () => active && setLoaded({ source, image: null });
    next.src = source;
    return () => {
      active = false;
    };
  }, [source]);
  return loaded.source === source ? loaded.image : null;
}

function usePreparedImage(source, mode, rotation) {
  const [prepared, setPrepared] = useState({ source: null, mode: "", rotation: 0, image: null });
  const needsPreparation = Boolean(source && (mode !== "none" || rotation));
  useEffect(() => {
    if (!needsPreparation) return undefined;
    let active = true;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1400 / Math.max(source.naturalWidth, source.naturalHeight));
    const sourceWidth = Math.max(1, Math.round(source.naturalWidth * scale));
    const sourceHeight = Math.max(1, Math.round(source.naturalHeight * scale));
    const rotated = rotation % 180 !== 0;
    canvas.width = rotated ? sourceHeight : sourceWidth;
    canvas.height = rotated ? sourceWidth : sourceHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(rotation * Math.PI / 180);
    context.drawImage(source, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
    context.restore();
    if (mode === "none") {
      const next = new window.Image();
      next.onload = () => active && setPrepared({ source, mode, rotation, image: next });
      next.src = canvas.toDataURL("image/jpeg", 0.92);
      return () => { active = false; };
    }
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    const samples = [];
    const stride = Math.max(4, Math.floor(data.data.length / 2000 / 4) * 4);
    for (let index = 0; index < data.data.length; index += stride) samples.push([data.data[index], data.data[index + 1], data.data[index + 2]]);
    const palette = duotonePalette(mode, samples);
    const shadow = hexToRgb(palette.shadow);
    const highlight = hexToRgb(palette.highlight);
    for (let index = 0; index < data.data.length; index += 4) {
      const luminance = (data.data[index] * 0.2126 + data.data[index + 1] * 0.7152 + data.data[index + 2] * 0.0722) / 255;
      data.data[index] = shadow[0] + (highlight[0] - shadow[0]) * luminance;
      data.data[index + 1] = shadow[1] + (highlight[1] - shadow[1]) * luminance;
      data.data[index + 2] = shadow[2] + (highlight[2] - shadow[2]) * luminance;
    }
    context.putImageData(data, 0, 0);
    const next = new window.Image();
    next.onload = () => active && setPrepared({ source, mode, rotation, image: next });
    next.src = canvas.toDataURL("image/jpeg", 0.9);
    return () => { active = false; };
  }, [source, mode, rotation, needsPreparation]);
  if (!needsPreparation) return source;
  return prepared.source === source && prepared.mode === mode && prepared.rotation === rotation ? prepared.image : null;
}

function getImageGeometry(image, width, height, editValue) {
  const edit = normalizePhotoEdit(editValue);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const scale = Math.max(width / sourceWidth, height / sourceHeight) * edit.zoom;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  return {
    drawWidth,
    drawHeight,
    drawX: (width - drawWidth) * edit.positionX / 100,
    drawY: (height - drawHeight) * edit.positionY / 100,
  };
}

function layerLabel(source) {
  return {
    campaign_title: "Campaign title",
    date: "Event date",
    venue: "Venue",
    subtitle: "Subtitle",
    custom: "Custom text",
  }[source] || "Text";
}

function hexToRgb(value) {
  const hex = String(value || "#000000").replace("#", "");
  return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) || 0);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
