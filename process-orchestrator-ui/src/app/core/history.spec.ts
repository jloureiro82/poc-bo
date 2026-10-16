import { History } from './history';

describe('History', () => {
  it('undoes and redoes edits in order', () => {
    const h = new History<string>();
    h.record('a');
    h.record('b');
    expect(h.undo('c')).toBe('b');
    expect(h.undo('b')).toBe('a');
    expect(h.undo('a')).toBeNull();
    expect(h.redo('a')).toBe('b');
    expect(h.redo('b')).toBe('c');
    expect(h.redo('c')).toBeNull();
  });

  it('merges quick edits of the same field into one step', () => {
    const h = new History<string>();
    h.record('', 'label', 0);
    h.record('l', 'label', 300);
    h.record('la', 'label', 600);
    expect(h.undo('lab')).toBe('');
    expect(h.canUndo).toBe(false);
  });

  it('does not merge edits of another field, slow edits, or edits after an undo', () => {
    const h = new History<number>();
    h.record(0, 'a', 0);
    h.record(1, 'b', 100);
    h.record(2, 'b', 5000);
    expect(h.undo(3)).toBe(2);
    h.record(2, 'b', 5100);
    expect(h.undo(4)).toBe(2);
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBe(0);
  });

  it('drops the redo steps when a new edit is made', () => {
    const h = new History<number>();
    h.record(0);
    h.undo(1);
    h.record(0);
    expect(h.canRedo).toBe(false);
  });

  it('keeps at most `limit` steps', () => {
    const h = new History<number>(2);
    h.record(0);
    h.record(1);
    h.record(2);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBeNull();
  });
});
