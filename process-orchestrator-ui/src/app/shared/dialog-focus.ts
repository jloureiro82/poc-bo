/** Keyboard handling shared by the modal dialogs: Tab stays inside the dialog. */

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]'),
  );
}

/** On Tab, wraps focus from the last control to the first and back. */
export function trapTab(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== 'Tab') {
    return;
  }
  const items = focusableIn(root);
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next = event.shiftKey ? (index <= 0 ? items.length - 1 : null) : index === items.length - 1 || index < 0 ? 0 : null;
  if (next !== null && items.length) {
    event.preventDefault();
    items[next].focus();
  }
}
