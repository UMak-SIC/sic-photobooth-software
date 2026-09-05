import { useRef } from 'react';
import type { Template } from './types';
import { assetUrl } from './api';

type Props = {
  templates: Template[];
  error: string;
  onCreate: () => void;
  onEdit: (template: Template) => void;
  onActive: (template: Template) => void;
  onMove: (template: Template, direction: 'up' | 'down') => void;
  onDuplicate: (template: Template) => void;
  onDelete: (template: Template) => void;
  onImport: (file: File) => void;
};

export function TemplateLibrary({
  templates,
  error,
  onCreate,
  onEdit,
  onActive,
  onMove,
  onDuplicate,
  onDelete,
  onImport,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">TEMPLATE LIBRARY</p>
          <h1>Photo strip templates</h1>
          <p className="admin-muted">Saved layouts are copied into a session when selected.</p>
        </div>
        <div className="editor-header-actions">
          <a className="secondary-button" href={assetUrl('/templates/export')!}>Export all</a>
          <button className="secondary-button" onClick={() => fileInput.current?.click()} type="button">Import templates</button>
          <input ref={fileInput} hidden type="file" accept=".zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ''; }} />
          <button className="admin-button" onClick={onCreate} type="button">Create template</button>
        </div>
      </header>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {templates.length === 0 ? (
        <div className="admin-empty">
          <strong>No templates yet.</strong>
          <span>Start with a portrait 4R canvas and shape it for the event.</span>
          <button className="admin-button" onClick={onCreate} type="button">Create template</button>
        </div>
      ) : (
        <div className="template-grid">
          {templates.map((template, index) => (
            <article className="template-card" key={template.id}>
              <div className={`mini-canvas ${template.orientation}`}>
                {assetUrl(template.backgroundPath) && <img alt="" src={assetUrl(template.backgroundPath)!} style={{ left: `${template.background.x / template.width * 100}%`, top: `${template.background.y / template.height * 100}%`, width: `${template.background.width / template.width * 100}%`, height: `${template.background.height / template.height * 100}%` }} />}
                {template.placements.map((placement) => (
                  <span key={placement.id ?? `${placement.captureIndex}-${placement.x}`} style={{ left: `${placement.x / template.width * 100}%`, top: `${placement.y / template.height * 100}%`, width: `${placement.width / template.width * 100}%`, height: `${placement.height / template.height * 100}%`, transform: `rotate(${placement.rotation}deg)`, borderRadius: placement.borderRadius, zIndex: placement.zIndex }}>
                    {placement.captureIndex}
                  </span>
                ))}
                {template.overlays.map((overlay, overlayIndex) => {
                  const source = assetUrl(overlay.path ?? null, template.updatedAt);
                  return source && <img className="mini-canvas-overlay" alt={overlay.label} key={overlay.id ?? `${overlay.label}-${overlayIndex}`} src={source} style={{ left: `${overlay.x / template.width * 100}%`, top: `${overlay.y / template.height * 100}%`, width: `${overlay.width / template.width * 100}%`, height: `${overlay.width / template.height * 100}%`, transform: `rotate(${overlay.rotation}deg)`, zIndex: overlay.zIndex }} />;
                })}
              </div>
              <div className="template-card-body"><div><h2>{template.name}</h2><p>{template.orientation} · {template.requiredCaptureCount} capture{template.requiredCaptureCount === 1 ? '' : 's'}</p></div><span className={template.active ? 'status active' : 'status'}>{template.active ? 'Active' : 'Inactive'}</span></div>
              <div className="template-actions"><button className="sort-button" onClick={() => onMove(template, 'up')} disabled={index === 0} type="button" title="Move up">↑</button><button className="sort-button" onClick={() => onMove(template, 'down')} disabled={index === templates.length - 1} type="button" title="Move down">↓</button><button onClick={() => onEdit(template)} type="button">Edit</button><button onClick={() => onDuplicate(template)} type="button">Duplicate</button><button onClick={() => onActive(template)} type="button">{template.active ? 'Deactivate' : 'Activate'}</button><button className="danger-link" onClick={() => onDelete(template)} type="button">Delete</button></div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
