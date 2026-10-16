import { activeTab, closeTab, isEdited, markPublished, openTab, selectTab, singleTab, updateActive, validTabs } from './editor-tabs';

const doc = (name: string) => ({ name, tasks: [] as unknown[] });

describe('editor tabs', () => {
  it('opens a document in a new tab right after the active one and shows it', () => {
    const one = singleTab(doc('a'), 'a');
    const two = openTab(one, doc('b'), { id: 'b' });
    const three = openTab(selectTab(two, 'a'), doc('c'), { id: 'c' });
    expect(three.tabs.map(t => t.id)).toEqual(['a', 'c', 'b']);
    expect(three.active).toBe('c');
  });

  it('opens the same document twice as two tabs, unless asked to reuse an open one', () => {
    const one = singleTab(doc('a'), 'a');
    expect(openTab(one, doc('a'), { id: 'x' }).tabs).toHaveLength(2);
    const reused = openTab(openTab(one, doc('b'), { id: 'b' }), doc('a'), { reuse: true });
    expect(reused.tabs).toHaveLength(2);
    expect(reused.active).toBe('a');
  });

  it('shows the right-hand neighbour when the shown tab is closed, or the left one when it was last', () => {
    let s = openTab(openTab(singleTab(doc('a'), 'a'), doc('b'), { id: 'b' }), doc('c'), { id: 'c' });
    s = selectTab(s, 'b');
    expect(closeTab(s, 'b', () => doc('new')).active).toBe('c');
    s = selectTab(s, 'c');
    expect(closeTab(s, 'c', () => doc('new')).active).toBe('b');
  });

  it('keeps the shown tab when another one is closed', () => {
    const s = selectTab(openTab(singleTab(doc('a'), 'a'), doc('b'), { id: 'b' }), 'a');
    const closed = closeTab(s, 'b', () => doc('new'));
    expect(closed.active).toBe('a');
    expect(closed.tabs.map(t => t.id)).toEqual(['a']);
  });

  it('leaves a fresh document when the only tab is closed', () => {
    const closed = closeTab(singleTab(doc('a'), 'a'), 'a', () => doc('new'));
    expect(closed.tabs).toHaveLength(1);
    expect(activeTab(closed).body).toEqual(doc('new'));
  });

  it('writes edits into the active tab only, and keeps the state when nothing changed', () => {
    const s = selectTab(openTab(singleTab(doc('a'), 'a'), doc('b'), { id: 'b' }), 'a');
    const edited = updateActive(s, doc('a2'));
    expect(edited.tabs.map(t => (t.body as { name: string }).name)).toEqual(['a2', 'b']);
    expect(updateActive(edited, activeTab(edited).body)).toBe(edited);
  });

  it('ignores a selection or a close of a tab that does not exist', () => {
    const s = singleTab(doc('a'), 'a');
    expect(selectTab(s, 'nope')).toBe(s);
    expect(closeTab(s, 'nope', () => doc('new'))).toBe(s);
  });

  it('shows a tab as edited once its document differs from the one it opened with, until it is published', () => {
    const opened = openTab(singleTab(doc('a'), 'a'), doc('b'), { id: 'b' });
    expect(opened.tabs.map(isEdited)).toEqual([false, false]);
    const edited = updateActive(opened, doc('b2'));
    expect(edited.tabs.map(isEdited)).toEqual([false, true]);
    expect(updateActive(edited, doc('b')).tabs.map(isEdited)).toEqual([false, false]);
    const published = markPublished(edited);
    expect(published.tabs.map(isEdited)).toEqual([false, false]);
    expect(activeTab(published).base).toEqual(doc('b2'));
  });

  it('gives tabs stored without a base their document as the base', () => {
    const stored = validTabs<{ name: string }>({ tabs: [{ id: 'a', body: doc('a') }], active: 'a' })!;
    expect(stored.tabs[0].base).toEqual(doc('a'));
    expect(isEdited(stored.tabs[0])).toBe(false);
  });

  it('accepts only well-formed stored tabs', () => {
    expect(validTabs(null)).toBeNull();
    expect(validTabs({ tabs: [], active: 'a' })).toBeNull();
    expect(validTabs({ tabs: [{ id: 'a', body: 'text' }], active: 'a' })).toBeNull();
    expect(validTabs({ tabs: [{ id: 'a', body: {} }, { id: 'a', body: {} }], active: 'a' })).toBeNull();
    expect(validTabs({ tabs: [{ id: 'a', body: {} }], active: 'gone' })?.active).toBe('a');
  });
});
