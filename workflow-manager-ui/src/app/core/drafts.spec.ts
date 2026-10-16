import { MAX_SAVED_DRAFTS, forgetDraft, keepDraft, listSavedDrafts, loadTabs, saveTabs } from './drafts';
import { activeTab, openTab, singleTab } from './editor-tabs';

describe('saved drafts', () => {
  beforeEach(() => localStorage.clear());

  it('keeps drafts newest first, with their name', () => {
    keepDraft('workflow', { name: 'a' });
    keepDraft('workflow', { name: 'b' });
    expect(listSavedDrafts('workflow').map(d => d.name)).toEqual(['b', 'a']);
  });

  it('does not keep an identical document twice, and moves it to the top', () => {
    keepDraft('workflow', { name: 'a', tasks: [] });
    keepDraft('workflow', { name: 'b' });
    keepDraft('workflow', { name: 'a', tasks: [] });
    expect(listSavedDrafts('workflow').map(d => d.name)).toEqual(['a', 'b']);
  });

  it('keeps two different documents with the same name', () => {
    keepDraft('workflow', { name: 'a', tasks: [] });
    keepDraft('workflow', { name: 'a', tasks: [{ label: 'x' }] });
    expect(listSavedDrafts('workflow')).toHaveLength(2);
  });

  it(`keeps at most ${MAX_SAVED_DRAFTS}`, () => {
    for (let i = 0; i < MAX_SAVED_DRAFTS + 5; i++) {
      keepDraft('workflow', { name: `w${i}` });
    }
    const list = listSavedDrafts('workflow');
    expect(list).toHaveLength(MAX_SAVED_DRAFTS);
    expect(list[0].name).toBe(`w${MAX_SAVED_DRAFTS + 4}`);
  });

  it('forgets one draft', () => {
    const [b] = keepDraft('workflow', { name: 'b' });
    keepDraft('workflow', { name: 'a' });
    expect(forgetDraft('workflow', b.id).map(d => d.name)).toEqual(['a']);
  });

  it('reads a damaged list as empty', () => {
    localStorage.setItem('wm-ui.drafts.workflow', '{oops');
    expect(listSavedDrafts('workflow')).toEqual([]);
  });
});

describe('open tabs', () => {
  beforeEach(() => localStorage.clear());

  it('reopens the tabs saved last, with the same one shown', () => {
    const state = openTab(singleTab({ name: 'a' }, 'a'), { name: 'b' }, { id: 'b' });
    saveTabs('workflow', state);
    expect(loadTabs('workflow', () => ({ name: 'starter' }))).toEqual(state);
  });

  it('turns the single draft kept before tabs into the first tab, once', () => {
    localStorage.setItem('wm-ui.draft.workflow', JSON.stringify({ name: 'old' }));
    const state = loadTabs('workflow', () => ({ name: 'starter' }));
    expect(state.tabs.map(t => t.body)).toEqual([{ name: 'old' }]);
    saveTabs('workflow', state);
    expect(localStorage.getItem('wm-ui.draft.workflow')).toBeNull();
  });

  it('starts with the starter when nothing is stored or the stored tabs are damaged', () => {
    expect(activeTab(loadTabs('workflow', () => ({ name: 'starter' }))).body).toEqual({ name: 'starter' });
    localStorage.setItem('wm-ui.tabs.workflow', '{oops');
    expect(activeTab(loadTabs('workflow', () => ({ name: 'starter' }))).body).toEqual({ name: 'starter' });
  });
});
