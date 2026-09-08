import { useEffect, useState } from 'react';
import { templateApi } from './templates/api';
import { TemplateEditor } from './templates/template-editor';
import { TemplateLibrary } from './templates/template-library';
import { flipbookPlacements, layoutPlacements } from './templates/presets';
import { useTemplateStore } from './templates/template-store';
import { draftFromTemplate, emptyDraft, type Template } from './templates/types';
import { PublicationDashboard } from './publications/publication-dashboard';
import { AdminEventsPage } from '../pages/AdminEventsPage';


export function AdminRouter() {
  const [path, setPath] = useState(window.location.pathname);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [flipbooks, setFlipbooks] = useState<Template[]>([]);
  const [error, setError] = useState('');
  const store = useTemplateStore();

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (path === '/admin/templates')
      templateApi.list('photo_strip').then(setTemplates).catch((cause: Error) => setError(cause.message));
    if (path === '/admin/frames')
      templateApi.list('flipbook').then(setFlipbooks).catch((cause: Error) => setError(cause.message));
  }, [path]);

  const navigate = (nextPath: string) => {
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
    setError('');
  };

  if (path === '/admin/templates')
    return (
      <AdminFrame onNavigate={navigate}>
        <TemplateLibrary
          templates={templates}
          error={error}
          onCreate={() => {
            store.reset();
            store.setDraft({ ...emptyDraft(), placements: layoutPlacements('A') });
            navigate('/admin/templates/new');
          }}
          onEdit={(template) => {
            store.setSaved(template);
            navigate(`/admin/templates/${template.id}`);
          }}
          onActive={async (template) => {
            try {
              const updated = await templateApi.setActive(template.id, !template.active);
              setTemplates((items) => items.map((item) => (item.id === updated.id ? updated : item)));
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          }}
          onMove={async (template, direction) => {
            const index = templates.findIndex((item) => item.id === template.id);
            const target = direction === 'up' ? index - 1 : index + 1;
            if (index < 0 || target < 0 || target >= templates.length) return;
            try {
              const reordered = [...templates];
              [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
              setTemplates(reordered);
              setTemplates(await templateApi.reorder(reordered.map((item) => item.id)));
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          }}
          onDuplicate={async (template) => {
            try {
              await templateApi.duplicate(template.id);
              setTemplates(await templateApi.list());
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          }}
          onDelete={async (template) => {
            if (!window.confirm(`Delete “${template.name}”?`)) return;
            try {
              await templateApi.remove(template.id);
              setTemplates((items) => items.filter((item) => item.id !== template.id));
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          }}
          onImport={async (file) => {
            try {
              setTemplates(await templateApi.importArchive(file, 'photo_strip'));
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          }}
          type="photo_strip"
        />
      </AdminFrame>
    );

  if (path === '/admin/events') return <AdminFrame onNavigate={navigate}><AdminEventsPage /></AdminFrame>;
  if (path === '/admin/frames')
    return (
      <AdminFrame onNavigate={navigate}>
        <TemplateLibrary
          templates={flipbooks}
          error={error}
          onCreate={() => {
            store.reset();
            store.setDraft({ ...emptyDraft(), type: 'flipbook', placements: flipbookPlacements() });
            navigate('/admin/frames/new');
          }}
          onEdit={(template) => {
            store.setSaved(template);
            navigate(`/admin/frames/${template.id}`);
          }}
          onActive={async (template) => {
            try {
              await templateApi.setActive(template.id, !template.active);
              setFlipbooks(await templateApi.list('flipbook'));
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          }}
          onMove={() => {}}
          onDuplicate={async (template) => {
            try {
              await templateApi.duplicate(template.id);
              setFlipbooks(await templateApi.list('flipbook'));
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          }}
          onDelete={async (template) => {
            if (window.confirm(`Delete “${template.name}”?`)) {
              try {
                await templateApi.remove(template.id);
                setFlipbooks(await templateApi.list('flipbook'));
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
              }
            }
          }}
          onImport={async (file) => {
            try {
              await templateApi.importArchive(file, 'flipbook');
              setFlipbooks(await templateApi.list('flipbook'));
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          }}
          type="flipbook"
        />
      </AdminFrame>
    );
  if (path === '/admin/publications') return <AdminFrame onNavigate={navigate}><PublicationDashboard /></AdminFrame>;

  const isFlipbookRoute = path.startsWith('/admin/frames/');
  const id = (path.startsWith('/admin/templates/') || isFlipbookRoute) ? path.split('/').at(-1) : undefined;
  return (
    <AdminFrame onNavigate={navigate}>
      <TemplateEditor
        templateId={id === 'new' ? undefined : id}
        initialTemplate={store.saved}
        onBack={() => navigate(store.draft.type === 'flipbook' ? '/admin/frames' : '/admin/templates')}
        onSaved={(template) => {
          store.setSaved(template);
          navigate(`${template.type === 'flipbook' ? '/admin/frames' : '/admin/templates'}/${template.id}`);
        }}
        onLoad={async (templateId) => {
          const template = await templateApi.get(templateId);
          store.setSaved(template);
          return draftFromTemplate(template);
        }}
        draft={store.draft}
        setDraft={store.setDraft}
      />
    </AdminFrame>
  );
}

function AdminFrame({ children, onNavigate }: { children: React.ReactNode; onNavigate: (path: string) => void }) {
  return (
    <main className="admin-app">
      <aside className="admin-sidebar">
        <div className="admin-brand"><span className="admin-mark">SIC</span><strong>SIC BOOTH</strong></div>
        <p className="admin-eyebrow">OPERATIONS</p>
        <nav aria-label="Administration">
          {[
            ['/admin/events', 'Events'],
            ['/admin/templates', 'Templates'],
            ['/admin/frames', 'Flipbook frames'],
            ['/admin/publications', 'Publications'],
          ].map(([path, label]) => (
            <a href={path} key={path} onClick={(event) => { event.preventDefault(); onNavigate(path); }}>{label}</a>
          ))}
        </nav>
        <p className="admin-operator">Mika Santos<br /><span>Operator</span></p>
      </aside>
      <section className="admin-content">{children}</section>
    </main>
  );
}
