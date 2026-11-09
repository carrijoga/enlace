import {
  ceremonyProjectSchema,
  projectDocumentSchema,
  type CeremonyProject,
} from '@enlace/contracts';
import { createMapSvg } from './pure-svg.js';

function slug(value: string): string {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return (
    normalized
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'projeto'
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportProjectJson(projectInput: CeremonyProject): string {
  const project = ceremonyProjectSchema.parse(projectInput);
  return JSON.stringify(
    projectDocumentSchema.parse({
      format: 'enlace-project',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      project,
    }),
    null,
    2,
  );
}

export function downloadProjectJson(project: CeremonyProject): void {
  triggerDownload(
    new Blob([exportProjectJson(project)], { type: 'application/json;charset=utf-8' }),
    `${slug(project.title)}.enlace.json`,
  );
}

export function downloadRawDraft(raw: string): void {
  triggerDownload(
    new Blob([raw], { type: 'application/json;charset=utf-8' }),
    'rascunho-corrompido.json',
  );
}

export async function downloadMapPng(
  project: CeremonyProject,
  personalGuestId?: string,
): Promise<void> {
  const svg = createMapSvg(project, personalGuestId);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.decoding = 'async';
    const imageLoaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Não foi possível preparar a imagem da planta.'));
    });
    image.src = svgUrl;
    await imageLoaded;
    const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    if (!viewBox) throw new Error('Dimensões da planta inválidas.');
    const width = Number(viewBox[1]);
    const height = Number(viewBox[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
      throw new Error('Dimensões da planta inválidas.');
    const scale = Math.min(
      2,
      3200 / Math.max(width, height),
      Math.sqrt(10_000_000 / (width * height)),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Não foi possível renderizar a planta.');
    context.fillStyle = '#faf9f5';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar o PNG.'))),
        'image/png',
      );
    });
    const filename = personalGuestId
      ? `${slug(project.title)}-planta-individual.png`
      : `${slug(project.title)}-planta.png`;
    triggerDownload(png, filename);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
