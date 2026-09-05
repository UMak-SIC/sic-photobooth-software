import { create } from 'zustand';
import { draftFromTemplate, emptyDraft, type Template, type TemplateDraft } from './types';

type TemplateStore = {
  draft: TemplateDraft;
  saved: Template | null;
  setDraft: (draft: TemplateDraft) => void;
  setSaved: (template: Template) => void;
  reset: () => void;
};

export const useTemplateStore = create<TemplateStore>((set) => ({
  draft: emptyDraft(),
  saved: null,
  setDraft: (draft) => set({ draft }),
  setSaved: (saved) => set({ saved, draft: draftFromTemplate(saved) }),
  reset: () => set({ draft: emptyDraft(), saved: null }),
}));
