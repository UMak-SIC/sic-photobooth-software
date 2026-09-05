import { useEffect, useRef, useState } from 'react';
import { assetUrl, templateApi } from './api';
import { layoutPlacements, layoutPresets } from './presets';
import type { Template, TemplateDraft, TemplateOverlay, TemplatePlacement } from './types';
import { dimensionsFor } from './types';

type Props = {
  templateId?: string;
  initialTemplate: Template | null;
  draft: TemplateDraft;
  setDraft: (draft: TemplateDraft) => void;
  onBack: () => void;
  onSaved: (template: Template) => void;
  onLoad: (id: string) => Promise<TemplateDraft>;
};

export function TemplateEditor({
  templateId,
  initialTemplate,
  draft,
  setDraft,
  onBack,
  onSaved,
  onLoad,
}: Props) {
  const [activeTab, setActiveTab] = useState<'all' | 'overlays' | 'placements' | 'background'>('all');
  const [selected, setSelected] = useState<{ type: 'placement' | 'overlay'; index: number }>({
    type: draft.overlays.length > 0 ? 'overlay' : 'placement',
    index: 0,
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(false);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);
  const [overlayFiles, setOverlayFiles] = useState<Record<number, File>>({});
  const [overlayPreviews, setOverlayPreviews] = useState<Record<number, string>>({});
  const canvasRef = useRef<HTMLDivElement>(null);
  const allOverlaysFileInputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<
    | { type: 'placement'; index: number; x: number; y: number }
    | { type: 'overlay'; index: number; x: number; y: number }
    | null
  >(null);

  useEffect(() => {
    if (templateId && (!initialTemplate || initialTemplate.id !== templateId))
      onLoad(templateId)
        .then(setDraft)
        .catch((cause: Error) => setError(cause.message));
  }, [initialTemplate, onLoad, setDraft, templateId]);

  useEffect(() => {
    if (!templateId && draft.placements.length === 0)
      setDraft({ ...draft, placements: layoutPlacements('A') });
  }, [draft, setDraft, templateId]);

  const dimensions = dimensionsFor(draft.orientation);
  const update = (next: Partial<TemplateDraft>) => setDraft({ ...draft, ...next });

  const updatePlacement = (index: number, changes: Partial<TemplatePlacement>) => {
    const placements = draft.placements.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...changes } : item,
    );
    update({ placements });
  };

  const updateOverlay = (index: number, changes: Partial<TemplateOverlay>) =>
    update({
      overlays: draft.overlays.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...changes,
              ...(changes.width !== undefined
                ? { height: changes.width }
                : changes.height !== undefined
                  ? { width: changes.height }
                  : {}),
            }
          : item,
      ),
    });

  const deleteOverlay = (index: number) => {
    const targetLabel = draft.overlays[index]?.label ?? 'Overlay';
    update({ overlays: draft.overlays.filter((_, itemIndex) => itemIndex !== index) });
    setOverlayFiles((files) =>
      Object.fromEntries(
        Object.entries(files)
          .filter(([itemIndex]) => Number(itemIndex) !== index)
          .map(([itemIndex, file]) => [
            Number(itemIndex) > index ? Number(itemIndex) - 1 : Number(itemIndex),
            file,
          ]),
      ),
    );
    setOverlayPreviews((previews) =>
      Object.fromEntries(
        Object.entries(previews)
          .filter(([itemIndex]) => Number(itemIndex) !== index)
          .map(([itemIndex, preview]) => [
            Number(itemIndex) > index ? Number(itemIndex) - 1 : Number(itemIndex),
            preview,
          ]),
      ),
    );
    if (selected.type === 'overlay') {
      const remainingCount = draft.overlays.length - 1;
      if (remainingCount === 0) {
        setSelected({ type: 'placement', index: 0 });
      } else {
        setSelected({
          type: 'overlay',
          index: Math.min(selected.index, remainingCount - 1),
        });
      }
    }
    setMessage(`Deleted "${targetLabel}".`);
  };

  const removeOverlayImage = (index: number) => {
    setOverlayFiles((files) => {
      const next = { ...files };
      delete next[index];
      return next;
    });
    setOverlayPreviews((previews) => {
      const next = { ...previews };
      delete next[index];
      return next;
    });
    updateOverlay(index, { path: null });
    setMessage(`Removed image from "${draft.overlays[index]?.label ?? 'Overlay'}".`);
  };

  const save = async () => {
    setError('');
    setMessage('');
    if (!draft.name.trim()) return setError('Template name is required');
    if (!draft.placements.length) return setError('Add at least one placement');
    try {
      const saved = templateId
        ? await templateApi.update(templateId, draft)
        : await templateApi.create(draft);
      let template = backgroundFile
        ? await templateApi.uploadBackground(saved.id, backgroundFile)
        : saved;
      for (const [index, file] of Object.entries(overlayFiles)) {
        const overlay = template.overlays.find((o) => o.id === draft.overlays[Number(index)]?.id);
        if (overlay?.id) template = await templateApi.uploadOverlay(template.id, overlay.id, file);
      }
      setBackgroundFile(null);
      setBackgroundPreview(null);
      setOverlayFiles({});
      setOverlayPreviews({});
      onSaved(template);
      setMessage('Template Saved');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const backgroundSource =
    backgroundPreview ?? assetUrl(initialTemplate?.backgroundPath ?? null, initialTemplate?.updatedAt);

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const nextX = ((event.clientX - rect.left) / rect.width) * dimensions.width;
    const nextY = ((event.clientY - rect.top) / rect.height) * dimensions.height;
    if (drag.current.type === 'placement') {
      updatePlacement(drag.current.index, {
        x: Math.round(draft.placements[drag.current.index].x + nextX - drag.current.x),
        y: Math.round(draft.placements[drag.current.index].y + nextY - drag.current.y),
      });
    } else {
      updateOverlay(drag.current.index, {
        x: Math.round(draft.overlays[drag.current.index].x + nextX - drag.current.x),
        y: Math.round(draft.overlays[drag.current.index].y + nextY - drag.current.y),
      });
    }
    drag.current = { ...drag.current, x: nextX, y: nextY };
  };

  const addOverlay = () => {
    const newOverlay: TemplateOverlay = {
      id: crypto.randomUUID(),
      label: `Overlay ${draft.overlays.length + 1}`,
      x: Math.round((dimensions.width - 240) / 2),
      y: Math.round((dimensions.height - 240) / 2),
      width: 240,
      height: 240,
      rotation: 0,
      zIndex: 10 + draft.overlays.length,
    };
    update({
      overlays: [...draft.overlays, newOverlay],
    });
    setSelected({ type: 'overlay', index: draft.overlays.length });
    setMessage(`Added ${newOverlay.label}.`);
  };

  const selectedPlacement = selected.type === 'placement' ? draft.placements[selected.index] : null;
  const selectedOverlay = selected.type === 'overlay' ? draft.overlays[selected.index] : null;

  const useSameSizeForAllSlots = () => {
    if (selectedPlacement) {
      update({
        placements: draft.placements.map((placement) => ({
          ...placement,
          width: selectedPlacement.width,
          height: selectedPlacement.height,
        })),
      });
      setMessage(`Set all photo slots to ${selectedPlacement.width}×${selectedPlacement.height}px.`);
    }
  };

  const useSameSizeForAllOverlays = () => {
    const sourceOverlay = selectedOverlay ?? draft.overlays[0];
    if (sourceOverlay) {
      update({
        overlays: draft.overlays.map((overlay) => ({
          ...overlay,
          width: sourceOverlay.width,
          height: sourceOverlay.width,
        })),
      });
      setMessage(`Set all overlays to ${sourceOverlay.width}×${sourceOverlay.width}px.`);
    }
  };

  const centerOverlay = (index: number) => {
    const target = draft.overlays[index];
    if (target) {
      updateOverlay(index, {
        x: Math.round((dimensions.width - target.width) / 2),
        y: Math.round((dimensions.height - target.height) / 2),
      });
    }
  };

  const applyImageToAllOverlays = async (sourceIndex: number) => {
    const sourceOverlay = draft.overlays[sourceIndex];
    if (!sourceOverlay) return;

    const stagedFile = overlayFiles[sourceIndex];
    const sourcePreview = overlayPreviews[sourceIndex];

    if (stagedFile) {
      const nextFiles: Record<number, File> = {};
      const nextPreviews: Record<number, string> = {};
      draft.overlays.forEach((_, idx) => {
        nextFiles[idx] = stagedFile;
        nextPreviews[idx] = sourcePreview || URL.createObjectURL(stagedFile);
      });
      setOverlayFiles(nextFiles);
      setOverlayPreviews(nextPreviews);
      setMessage(`Applied image from "${sourceOverlay.label}" to all ${draft.overlays.length} overlays.`);
      return;
    }

    if (sourceOverlay.path) {
      try {
        const url = assetUrl(sourceOverlay.path);
        if (!url) return;
        const res = await fetch(url);
        const blob = await res.blob();
        const ext = blob.type.split('/')[1] || 'png';
        const file = new File([blob], `${sourceOverlay.label || 'overlay'}.${ext}`, {
          type: blob.type || 'image/png',
        });
        const previewUrl = URL.createObjectURL(file);
        const nextFiles: Record<number, File> = {};
        const nextPreviews: Record<number, string> = {};
        draft.overlays.forEach((_, idx) => {
          nextFiles[idx] = file;
          nextPreviews[idx] = previewUrl;
        });
        setOverlayFiles(nextFiles);
        setOverlayPreviews(nextPreviews);
        setMessage(`Applied image from "${sourceOverlay.label}" to all ${draft.overlays.length} overlays.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to copy overlay image');
      }
      return;
    }

    setError(`"${sourceOverlay.label}" does not have an image yet. Upload an image first.`);
  };

  const handleUseSameImageForAll = () => {
    if (draft.overlays.length === 0) {
      setError('Add at least one overlay first.');
      return;
    }

    if (selected.type === 'overlay') {
      const selectedIndex = selected.index;
      if (overlayFiles[selectedIndex] || draft.overlays[selectedIndex]?.path) {
        applyImageToAllOverlays(selectedIndex);
        return;
      }
    }

    const firstWithImage = draft.overlays.findIndex(
      (o, idx) => Boolean(overlayFiles[idx] || o.path),
    );
    if (firstWithImage !== -1) {
      applyImageToAllOverlays(firstWithImage);
      return;
    }

    allOverlaysFileInputRef.current?.click();
  };

  const handleBatchUploadOverlays = (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    const nextFiles: Record<number, File> = {};
    const nextPreviews: Record<number, string> = {};
    draft.overlays.forEach((_, idx) => {
      nextFiles[idx] = file;
      nextPreviews[idx] = previewUrl;
    });
    setOverlayFiles(nextFiles);
    setOverlayPreviews(nextPreviews);
    setMessage(`Applied "${file.name}" to all ${draft.overlays.length} overlays. It uploads when you save.`);
  };

  return (
    <div className="editor-page">
      <header className="editor-header">
        <div>
          <button className="back-link" onClick={onBack} type="button">
            <span className="back-arrow">←</span> Templates
          </button>
          <p className="admin-eyebrow">{templateId ? 'EDIT TEMPLATE' : 'NEW TEMPLATE'}</p>
          <h1>{templateId ? draft.name || 'Edit template' : 'New photo strip template'}</h1>
        </div>
        <div className="editor-header-actions">
          <button className="secondary-button" onClick={() => setPreview(true)} type="button">
            Preview
          </button>
          <button className="admin-button" onClick={save} type="button">
            Save Template
          </button>
        </div>
      </header>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="admin-success" role="status">
          {message}
        </p>
      )}

      <div className="editor-layout">
        <div className="editor-canvas-column">
          <div className="editor-toolbar">
            <label className="toolbar-field">
              <span className="toolbar-label">Template name</span>
              <input
                aria-label="Template name"
                className="toolbar-input name-input"
                value={draft.name}
                onChange={(event) => update({ name: event.target.value })}
                placeholder="e.g. Pioneers Strip"
              />
            </label>
            <div className="toolbar-field">
              <span className="toolbar-label">Orientation</span>
              <div className="orientation-pills">
                <button
                  type="button"
                  className={`orientation-pill ${draft.orientation === 'portrait' ? 'active' : ''}`}
                  onClick={() => {
                    const size = dimensionsFor('portrait');
                    update({
                      orientation: 'portrait',
                      background: { ...draft.background, width: size.width, height: size.height },
                    });
                  }}
                >
                  Portrait (4×6)
                </button>
                <button
                  type="button"
                  className={`orientation-pill ${draft.orientation === 'landscape' ? 'active' : ''}`}
                  onClick={() => {
                    const size = dimensionsFor('landscape');
                    update({
                      orientation: 'landscape',
                      background: { ...draft.background, width: size.width, height: size.height },
                    });
                  }}
                >
                  Landscape (6×4)
                </button>
              </div>
            </div>
            <div className="preset-group">
              <span className="toolbar-label">Layouts</span>
              <div className="preset-buttons">
                {layoutPresets.map((preset) => (
                  <button
                    aria-label={`${preset.label}, ${preset.captures} photos`}
                    key={preset.id}
                    className="preset-btn"
                    onClick={() => {
                      const size = dimensionsFor(preset.orientation);
                      update({
                        orientation: preset.orientation,
                        background: { ...draft.background, width: size.width, height: size.height },
                        placements: layoutPlacements(preset.id),
                      });
                    }}
                    type="button"
                  >
                    {preset.id}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="canvas-wrapper">
            <div
              className={`editor-canvas-real ${draft.orientation}`}
              ref={canvasRef}
              onPointerMove={onPointerMove}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerLeave={() => {
                drag.current = null;
              }}
            >
              {backgroundSource && (
                <img
                  alt=""
                  className="canvas-background"
                  src={backgroundSource}
                  style={{
                    left: `${(draft.background.x / dimensions.width) * 100}%`,
                    top: `${(draft.background.y / dimensions.height) * 100}%`,
                    width: `${(draft.background.width / dimensions.width) * 100}%`,
                    height: `${(draft.background.height / dimensions.height) * 100}%`,
                  }}
                />
              )}

              {draft.placements
                .slice()
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((placement, index) => {
                  const actualIndex = draft.placements.indexOf(placement);
                  const isSelected = selected.type === 'placement' && selected.index === actualIndex;
                  return (
                    <button
                      className={`canvas-placement ${isSelected ? 'selected' : ''}`}
                      key={placement.id ?? `${placement.captureIndex}-${index}`}
                      onPointerDown={(event) => {
                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        drag.current = {
                          type: 'placement',
                          index: actualIndex,
                          x: ((event.clientX - rect.left) / rect.width) * dimensions.width,
                          y: ((event.clientY - rect.top) / rect.height) * dimensions.height,
                        };
                        setSelected({ type: 'placement', index: actualIndex });
                      }}
                      onClick={() => {
                        setSelected({ type: 'placement', index: actualIndex });
                      }}
                      style={{
                        left: `${(placement.x / dimensions.width) * 100}%`,
                        top: `${(placement.y / dimensions.height) * 100}%`,
                        width: `${(placement.width / dimensions.width) * 100}%`,
                        height: `${(placement.height / dimensions.height) * 100}%`,
                        transform: `rotate(${placement.rotation}deg)`,
                        borderRadius: placement.borderRadius,
                        zIndex: placement.zIndex * 2,
                      }}
                    >
                      <span className="placement-number">{placement.captureIndex}</span>
                      {isSelected && (
                        <div className="canvas-badge placement-badge">
                          Slot {placement.captureIndex} · {placement.width}×{placement.height}
                        </div>
                      )}
                    </button>
                  );
                })}

              {draft.overlays
                .slice()
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((overlay, index) => {
                  const actualIndex = draft.overlays.indexOf(overlay);
                  const source =
                    overlayPreviews[actualIndex] ?? assetUrl(overlay.path ?? null, initialTemplate?.updatedAt);
                  const isSelected = selected.type === 'overlay' && selected.index === actualIndex;
                  return (
                    <div
                      className={`canvas-overlay ${isSelected ? 'selected' : ''} ${source ? 'has-image' : 'no-image'}`}
                      key={overlay.id ?? `${overlay.label}-${index}`}
                      onPointerDown={(event) => {
                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        drag.current = {
                          type: 'overlay',
                          index: actualIndex,
                          x: ((event.clientX - rect.left) / rect.width) * dimensions.width,
                          y: ((event.clientY - rect.top) / rect.height) * dimensions.height,
                        };
                        setSelected({ type: 'overlay', index: actualIndex });
                      }}
                      onClick={() => {
                        setSelected({ type: 'overlay', index: actualIndex });
                      }}
                      style={{
                        left: `${(overlay.x / dimensions.width) * 100}%`,
                        top: `${(overlay.y / dimensions.height) * 100}%`,
                        width: `${(overlay.width / dimensions.width) * 100}%`,
                        height: `${(overlay.height / dimensions.height) * 100}%`,
                        transform: `rotate(${overlay.rotation ?? 0}deg)`,
                        zIndex: overlay.zIndex * 2 + 1,
                      }}
                    >
                      {source ? (
                        <img alt={overlay.label} src={source} />
                      ) : (
                        <div className="canvas-overlay-placeholder">
                          <span className="placeholder-icon">✦</span>
                          <span className="placeholder-label">{overlay.label}</span>
                        </div>
                      )}
                      {isSelected && (
                        <div className="canvas-badge overlay-badge">
                          {overlay.label} · {overlay.width}×{overlay.height}
                        </div>
                      )}
                    </div>
                  );
                })}

              <span className="canvas-meta">
                {dimensions.width} × {dimensions.height} · {draft.orientation.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <aside className="inspector">
          <div className="inspector-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'all'}
              className={`inspector-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              <span className="tab-title">All Sections</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'overlays'}
              className={`inspector-tab ${activeTab === 'overlays' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('overlays');
                if (selected.type !== 'overlay' && draft.overlays.length > 0) {
                  setSelected({ type: 'overlay', index: 0 });
                }
              }}
            >
              <span className="tab-title">Overlays</span>
              <span className="inspector-tab-badge">{draft.overlays.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'placements'}
              className={`inspector-tab ${activeTab === 'placements' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('placements');
                if (selected.type !== 'placement' && draft.placements.length > 0) {
                  setSelected({ type: 'placement', index: 0 });
                }
              }}
            >
              <span className="tab-title">Photo Slots</span>
              <span className="inspector-tab-badge">{draft.placements.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'background'}
              className={`inspector-tab ${activeTab === 'background' ? 'active' : ''}`}
              onClick={() => setActiveTab('background')}
            >
              <span className="tab-title">Background</span>
            </button>
          </div>

          <div className="inspector-body">
            {/* ACTIVE SELECTION PROPERTIES (when in All or Placements) */}
            {(activeTab === 'all' || activeTab === 'placements') && selectedPlacement && (
              <section className="inspector-card">
                <div className="card-heading">
                  <p className="admin-eyebrow">SLOT #{selected.index + 1} PROPERTIES</p>
                </div>
                <NumberField
                  label="Capture index (Camera shot)"
                  value={selectedPlacement.captureIndex}
                  onChange={(value) =>
                    updatePlacement(selected.index, { captureIndex: Math.max(1, value) })
                  }
                />
                <div className="field-grid two">
                  <NumberField
                    label="X Position"
                    unit="px"
                    value={selectedPlacement.x}
                    onChange={(value) => updatePlacement(selected.index, { x: value })}
                  />
                  <NumberField
                    label="Y Position"
                    unit="px"
                    value={selectedPlacement.y}
                    onChange={(value) => updatePlacement(selected.index, { y: value })}
                  />
                  <NumberField
                    label="Width"
                    unit="px"
                    value={selectedPlacement.width}
                    onChange={(value) =>
                      updatePlacement(selected.index, { width: Math.max(10, value) })
                    }
                  />
                  <NumberField
                    label="Height"
                    unit="px"
                    value={selectedPlacement.height}
                    onChange={(value) =>
                      updatePlacement(selected.index, { height: Math.max(10, value) })
                    }
                  />
                  <NumberField
                    label="Corner Radius"
                    unit="px"
                    value={selectedPlacement.borderRadius}
                    onChange={(value) => updatePlacement(selected.index, { borderRadius: value })}
                  />
                  <NumberField
                    label="Rotation"
                    unit="°"
                    value={selectedPlacement.rotation}
                    onChange={(value) => updatePlacement(selected.index, { rotation: value })}
                  />
                </div>
                <div className="card-footer-actions">
                  <button
                    className="secondary-button full"
                    onClick={useSameSizeForAllSlots}
                    type="button"
                  >
                    Use same size for all slots
                  </button>
                  <button
                    className="secondary-button full"
                    onClick={() =>
                      updatePlacement(selected.index, {
                        x: Math.round((dimensions.width - selectedPlacement.width) / 2),
                      })
                    }
                    type="button"
                  >
                    Center horizontally
                  </button>
                </div>
              </section>
            )}

            {/* OVERLAYS SECTION */}
            {(activeTab === 'all' || activeTab === 'overlays') && (
              <section className="inspector-card overlays-panel">
                <div className="panel-header">
                  <div>
                    <h3 className="panel-title">OVERLAYS</h3>
                    <p className="panel-subtitle">Display uploaded overlays with mini icons & batch actions.</p>
                  </div>
                  <button className="primary-pill-btn" onClick={addOverlay} type="button">
                    <span className="plus-icon">+</span> Add Overlay
                  </button>
                </div>

                {draft.overlays.length > 0 && (
                  <div className="overlays-toolbar">
                    <div className="toolbar-actions-row">
                      <button
                        type="button"
                        className="action-pill-btn highlight"
                        onClick={handleUseSameImageForAll}
                        title="Copy image from active/first overlay to all overlays"
                      >
                        <span className="btn-icon">❐</span>
                        Use same image for all overlays
                      </button>
                      <label className="action-pill-btn" title="Choose an image file to apply to all overlays">
                        <span className="btn-icon">↑</span>
                        Upload for all
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) handleBatchUploadOverlays(file);
                          }}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </div>
                  </div>
                )}

                <input
                  type="file"
                  ref={allOverlaysFileInputRef}
                  accept="image/png,image/jpeg,image/svg+xml"
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleBatchUploadOverlays(file);
                  }}
                />

                {draft.overlays.length === 0 ? (
                  <div className="empty-overlays">
                    <div className="empty-icon">❖</div>
                    <h4>No overlays added yet</h4>
                    <p>Add logos, badges, frames, or decorative stickers layered on top of captures.</p>
                    <button className="admin-button" onClick={addOverlay} type="button">
                      + Add First Overlay
                    </button>
                  </div>
                ) : (
                  <div className="overlays-list">
                    {draft.overlays.map((overlay, index) => {
                      const isSelected = selected.type === 'overlay' && selected.index === index;
                      const source =
                        overlayPreviews[index] ?? assetUrl(overlay.path ?? null, initialTemplate?.updatedAt);
                      const isStaged = Boolean(overlayFiles[index]);
                      const hasImage = Boolean(source);

                      return (
                        <div
                          className={`overlay-card ${isSelected ? 'selected' : ''}`}
                          key={overlay.id ?? index}
                          onClick={() => setSelected({ type: 'overlay', index })}
                        >
                          <div className="overlay-card-header">
                            {/* MINI ICON OF UPLOADED OVERLAY */}
                            <label
                              className="overlay-mini-icon-wrapper"
                              onClick={(e) => e.stopPropagation()}
                              title={hasImage ? `Uploaded overlay: ${overlay.label} (Click to change)` : `Click to upload image for ${overlay.label}`}
                            >
                              <div className="overlay-mini-icon checkerboard">
                                {source ? (
                                  <img alt={overlay.label} className="mini-icon-img" src={source} />
                                ) : (
                                  <div className="mini-icon-empty">
                                    <span className="mini-icon-plus">+</span>
                                  </div>
                                )}
                              </div>
                              <input
                                accept="image/png,image/jpeg,image/svg+xml"
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file) {
                                    setOverlayFiles((files) => ({ ...files, [index]: file }));
                                    setOverlayPreviews((previews) => ({
                                      ...previews,
                                      [index]: URL.createObjectURL(file),
                                    }));
                                    setMessage(`${overlay.label} ready. It uploads when you save.`);
                                  }
                                }}
                                style={{ display: 'none' }}
                                type="file"
                              />
                            </label>

                            <div className="overlay-card-info">
                              <div className="overlay-card-title-row">
                                <span className="overlay-card-title">{overlay.label}</span>
                                {isStaged ? (
                                  <span className="overlay-status staged">Ready to save</span>
                                ) : overlay.path ? (
                                  <span className="overlay-status saved">Uploaded</span>
                                ) : (
                                  <span className="overlay-status empty">No image</span>
                                )}
                              </div>
                              <div className="overlay-card-meta">
                                <span>{overlay.width}×{overlay.height}px</span>
                                <span>·</span>
                                <span>Layer {overlay.zIndex}</span>
                              </div>
                            </div>

                            <div className="overlay-card-actions" onClick={(e) => e.stopPropagation()}>
                              {hasImage && (
                                <button
                                  type="button"
                                  className="card-quick-btn"
                                  onClick={() => applyImageToAllOverlays(index)}
                                  title="Apply this overlay's image to all overlays"
                                >
                                  <span>❐</span> Use for all
                                </button>
                              )}
                              <button
                                type="button"
                                className="card-icon-btn danger"
                                onClick={() => deleteOverlay(index)}
                                title="Delete overlay"
                                aria-label={`Delete ${overlay.label}`}
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {isSelected && (
                            <div className="overlay-card-body" onClick={(e) => e.stopPropagation()}>
                              <TextField
                                label="Overlay Label"
                                value={overlay.label}
                                onChange={(value) => updateOverlay(index, { label: value })}
                              />

                              <div className="overlay-image-zone">
                                <div className="image-zone-header">
                                  <span className="field-label">Overlay Graphic</span>
                                  {isStaged && (
                                    <small className="admin-muted">File: {overlayFiles[index].name}</small>
                                  )}
                                </div>

                                <div className="image-preview-and-actions">
                                  <div className="large-preview-thumb checkerboard">
                                    {source ? (
                                      <img alt={overlay.label} src={source} />
                                    ) : (
                                      <div className="preview-thumb-empty">No image uploaded</div>
                                    )}
                                  </div>

                                  <div className="image-actions-row">
                                    <label className="upload-button compact">
                                      {hasImage ? 'Change image' : 'Upload image'}
                                      <input
                                        accept="image/png,image/jpeg,image/svg+xml"
                                        onChange={(event) => {
                                          const file = event.target.files?.[0];
                                          if (file) {
                                            setOverlayFiles((files) => ({ ...files, [index]: file }));
                                            setOverlayPreviews((previews) => ({
                                              ...previews,
                                              [index]: URL.createObjectURL(file),
                                            }));
                                            setMessage(`${overlay.label} ready. It uploads when you save.`);
                                          }
                                        }}
                                        type="file"
                                      />
                                    </label>

                                    {hasImage && (
                                      <>
                                        <button
                                          type="button"
                                          className="secondary-button compact highlight"
                                          onClick={() => applyImageToAllOverlays(index)}
                                          title="Copy this image to all overlays"
                                        >
                                          Use same image for all overlays
                                        </button>
                                        <button
                                          type="button"
                                          className="danger-text-btn"
                                          onClick={() => removeOverlayImage(index)}
                                        >
                                          Remove
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="field-grid two">
                                <NumberField
                                  label="X Position"
                                  unit="px"
                                  value={overlay.x}
                                  onChange={(value) => updateOverlay(index, { x: value })}
                                />
                                <NumberField
                                  label="Y Position"
                                  unit="px"
                                  value={overlay.y}
                                  onChange={(value) => updateOverlay(index, { y: value })}
                                />
                                <NumberField
                                  label="Size (Width)"
                                  unit="px"
                                  value={overlay.width}
                                  onChange={(value) =>
                                    updateOverlay(index, { width: Math.max(10, value) })
                                  }
                                />
                                <NumberField
                                  label="Height"
                                  unit="px"
                                  value={overlay.height}
                                  onChange={(value) =>
                                    updateOverlay(index, { height: Math.max(10, value) })
                                  }
                                />
                                <NumberField
                                  label="Rotation"
                                  unit="°"
                                  value={overlay.rotation ?? 0}
                                  onChange={(value) => updateOverlay(index, { rotation: value })}
                                />
                                <NumberField
                                  label="Z-Index (Layer)"
                                  value={overlay.zIndex}
                                  onChange={(value) => updateOverlay(index, { zIndex: value })}
                                />
                              </div>

                              <div className="card-footer-actions">
                                <button
                                  type="button"
                                  className="secondary-button small full"
                                  onClick={useSameSizeForAllOverlays}
                                >
                                  Use same size for all overlays
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button small full"
                                  onClick={() => centerOverlay(index)}
                                >
                                  Center on canvas
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* BACKGROUND SECTION */}
            {(activeTab === 'all' || activeTab === 'background') && (
              <section className="inspector-card background-panel">
                <div className="panel-header">
                  <div>
                    <h3 className="panel-title">BACKGROUND IMAGE</h3>
                    <p className="panel-subtitle">Base template artwork, frame borders, or event branding.</p>
                  </div>
                </div>

                <div className="background-upload-card">
                  <div className="bg-preview-row">
                    <div className="bg-thumbnail checkerboard">
                      {backgroundSource ? (
                        <img alt="Background preview" src={backgroundSource} />
                      ) : (
                        <span className="empty-thumb-placeholder">❖</span>
                      )}
                    </div>
                    <div className="bg-actions">
                      <label className="upload-button compact">
                        {backgroundSource ? 'Change background' : 'Upload background'}
                        <input
                          accept="image/png,image/jpeg,image/svg+xml"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              setBackgroundFile(file);
                              setBackgroundPreview(URL.createObjectURL(file));
                              setMessage('Background ready. It uploads when you save.');
                            }
                          }}
                          type="file"
                        />
                      </label>
                      {backgroundSource && (
                        <button
                          type="button"
                          className="danger-text-btn"
                          onClick={() => {
                            setBackgroundFile(null);
                            setBackgroundPreview(null);
                            if (initialTemplate) initialTemplate.backgroundPath = null;
                            setMessage('Background removed.');
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  {backgroundFile && (
                    <small className="admin-muted bg-filename">Ready to save: {backgroundFile.name}</small>
                  )}
                </div>

                <p className="admin-eyebrow">BACKGROUND GEOMETRY</p>
                <div className="field-grid two">
                  <NumberField
                    label="X Offset"
                    unit="px"
                    value={draft.background.x}
                    onChange={(value) =>
                      update({ background: { ...draft.background, x: value } })
                    }
                  />
                  <NumberField
                    label="Y Offset"
                    unit="px"
                    value={draft.background.y}
                    onChange={(value) =>
                      update({ background: { ...draft.background, y: value } })
                    }
                  />
                  <NumberField
                    label="Width"
                    unit="px"
                    value={draft.background.width}
                    onChange={(value) =>
                      update({ background: { ...draft.background, width: Math.max(1, value) } })
                    }
                  />
                  <NumberField
                    label="Height"
                    unit="px"
                    value={draft.background.height}
                    onChange={(value) =>
                      update({ background: { ...draft.background, height: Math.max(1, value) } })
                    }
                  />
                </div>

                <button
                  type="button"
                  className="secondary-button full"
                  onClick={() =>
                    update({
                      background: {
                        x: 0,
                        y: 0,
                        width: dimensions.width,
                        height: dimensions.height,
                      },
                    })
                  }
                >
                  Reset to full canvas ({dimensions.width}×{dimensions.height})
                </button>
              </section>
            )}
          </div>
        </aside>
      </div>

      {preview && (
        <div className="modal-backdrop" role="presentation" onClick={() => setPreview(false)}>
          <div
            className="preview-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-title"
          >
            <div className="card-heading">
              <h2 id="preview-title">{draft.name || 'Untitled template'}</h2>
              <button className="back-link" onClick={() => setPreview(false)} type="button">
                Close ✕
              </button>
            </div>
            <div className={`preview-canvas ${draft.orientation}`}>
              {backgroundSource && (
                <img
                  alt=""
                  className="preview-background"
                  src={backgroundSource}
                  style={{
                    left: `${(draft.background.x / dimensions.width) * 100}%`,
                    top: `${(draft.background.y / dimensions.height) * 100}%`,
                    width: `${(draft.background.width / dimensions.width) * 100}%`,
                    height: `${(draft.background.height / dimensions.height) * 100}%`,
                  }}
                />
              )}
              {draft.placements.map((placement) => (
                <span
                  key={placement.id ?? `${placement.captureIndex}-${placement.x}`}
                  style={{
                    left: `${(placement.x / dimensions.width) * 100}%`,
                    top: `${(placement.y / dimensions.height) * 100}%`,
                    width: `${(placement.width / dimensions.width) * 100}%`,
                    height: `${(placement.height / dimensions.height) * 100}%`,
                    transform: `rotate(${placement.rotation}deg)`,
                    borderRadius: placement.borderRadius,
                    zIndex: placement.zIndex * 2,
                  }}
                >
                  {placement.captureIndex}
                </span>
              ))}
              {draft.overlays.map((overlay, index) => {
                const source =
                  overlayPreviews[index] ?? assetUrl(overlay.path ?? null, initialTemplate?.updatedAt);
                return (
                  <i
                    key={overlay.id ?? `${overlay.label}-${index}`}
                    style={{
                      left: `${(overlay.x / dimensions.width) * 100}%`,
                      top: `${(overlay.y / dimensions.height) * 100}%`,
                      width: `${(overlay.width / dimensions.width) * 100}%`,
                      height: `${(overlay.height / dimensions.height) * 100}%`,
                      transform: `rotate(${overlay.rotation ?? 0}deg)`,
                      zIndex: overlay.zIndex * 2 + 1,
                    }}
                  >
                    {source && <img alt={overlay.label} src={source} />}
                  </i>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
}) {
  return (
    <label className="number-field">
      <div className="number-field-header">
        <span>{label}</span>
        {unit && <span className="field-unit">{unit}</span>}
      </div>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="number-field text-field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
