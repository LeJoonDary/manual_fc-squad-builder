import { toBlob } from 'html-to-image';

// Capture the rendered pitch, including the effective custom card fields and badges.
export async function createSquadPng(pitch) {
  await document.fonts?.ready;
  const blob = await toBlob(pitch, {
    pixelRatio: 2, backgroundColor: '#10251f',
    filter: node => !node.classList?.contains('slot-card-actions'),
  });
  if (!blob) throw new Error('Unable to create squad image');
  return blob;
}
export async function downloadSquadPng(pitch, formation) {
  const blob = await createSquadPng(pitch);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `metaxi-${formation}.png`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
