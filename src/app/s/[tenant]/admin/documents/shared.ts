export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(1)} GB`;
}

export function fileLabel(contentType: string) {
  if (contentType === 'application/pdf') return 'PDF';
  if (contentType.startsWith('image/')) return contentType.slice(6).toUpperCase().replace('JPEG', 'JPG');
  if (contentType.includes('word')) return 'Word';
  if (contentType.includes('sheet') || contentType.includes('excel')) return 'Excel';
  if (contentType.includes('presentation') || contentType.includes('powerpoint')) return 'PowerPoint';
  if (contentType.startsWith('text/csv')) return 'CSV';
  return 'Text';
}
