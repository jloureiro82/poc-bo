import { MAX_SAVED_DRAFTS, forgetDraft, keepDraft, listSavedDrafts } from './drafts';

describe('saved drafts', () => {
  beforeEach(() => localStorage.clear());

  it('keeps drafts newest first, with their name', () => {
    keepDraft('workflow', { label: 'a' });
    keepDraft('workflow', { label: 'b' });
    expect(listSavedDrafts('workflow').map(d => d.name)).toEqual(['b', 'a']);
  });

  it('does not keep an identical document twice, and moves it to the top', () => {
    keepDraft('workflow', { label: 'a', tasks: [] });
    keepDraft('workflow', { label: 'b' });
    keepDraft('workflow', { label: 'a', tasks: [] });
    expect(listSavedDrafts('workflow').map(d => d.name)).toEqual(['a', 'b']);
  });

  it('keeps two different documents with the same name', () => {
    keepDraft('workflow', { label: 'a', tasks: [] });
    keepDraft('workflow', { label: 'a', tasks: [{ label: 'x' }] });
    expect(listSavedDrafts('workflow')).toHaveLength(2);
  });

  it(`keeps at most ${MAX_SAVED_DRAFTS}`, () => {
    for (let i = 0; i < MAX_SAVED_DRAFTS + 5; i++) {
      keepDraft('workflow', { label: `w${i}` });
    }
    const list = listSavedDrafts('workflow');
    expect(list).toHaveLength(MAX_SAVED_DRAFTS);
    expect(list[0].name).toBe(`w${MAX_SAVED_DRAFTS + 4}`);
  });

  it('forgets one draft', () => {
    const [b] = keepDraft('workflow', { label: 'b' });
    keepDraft('workflow', { label: 'a' });
    expect(forgetDraft('workflow', b.id).map(d => d.name)).toEqual(['a']);
  });

  it('keeps a list per editor', () => {
    keepDraft('workflow', { label: 'w' });
    keepDraft('orchestrator', { label: 'o', stepList: [] });
    expect(listSavedDrafts('orchestrator').map(d => d.name)).toEqual(['o']);
    expect(listSavedDrafts('workflow').map(d => d.name)).toEqual(['w']);
  });

  it('reads a damaged list as empty', () => {
    localStorage.setItem('po-ui.drafts.workflow', '{oops');
    expect(listSavedDrafts('workflow')).toEqual([]);
  });
});
