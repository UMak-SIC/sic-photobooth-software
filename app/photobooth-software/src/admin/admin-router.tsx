import { useEffect, useState } from 'react';
import { templateApi } from './templates/api';
import { TemplateEditor } from './templates/template-editor';
import { TemplateLibrary } from './templates/template-library';
import { layoutPlacements } from './templates/presets';
import { useTemplateStore } from './templates/template-store';
import { draftFromTemplate, emptyDraft, type Template } from './templates/types';

export function AdminRouter() {
  const [path, setPath] = useState(window.location.pathname);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState('');
  const store = useTemplateStore();

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (path === '/admin/templates')
      templateApi.list().then(setTemplates).catch((cause: Error) => setError(cause.message));
  }, [path]);

  const navigate = (nextPath: string) => {
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
    setError('');
  };

  if (path === '/admin/templates')
    return (
      <AdminFrame>
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
              setTemplates(await templateApi.importArchive(file));
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          }}
        />
      </AdminFrame>
    );

  const id = path.startsWith('/admin/templates/') ? path.split('/').at(-1) : undefined;
  return (
    <AdminFrame>
      <TemplateEditor
        templateId={id === 'new' ? undefined : id}
        initialTemplate={store.saved}
        onBack={() => navigate('/admin/templates')}
        onSaved={(template) => {
          store.setSaved(template);
          navigate(`/admin/templates/${template.id}`);
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

function AdminFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="admin-app">
      <aside className="admin-sidebar">
        <div className="admin-brand"><span className="admin-mark">SIC</span><strong>SIC BOOTH</strong></div>
        <p className="admin-eyebrow">OPERATIONS</p>
        <nav aria-label="Administration"><a href="/admin/templates">Templates</a><span>Events</span><span>Flipbook frames</span><span>Publications</span></nav>
        <p className="admin-operator">Mika Santos<br /><span>Operator</span></p>
      </aside>
      <section className="admin-content">{children}</section>
    </main>
  );
}
