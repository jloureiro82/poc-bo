/** Saves a value as a pretty-printed JSON file from the browser. */
export function download(fileName: string, value: unknown): void {
  downloadBlob(fileName, new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
