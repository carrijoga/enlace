/**
 * Downloads da visualização pública (`/ver`). Carregado sob demanda: só quem toca em "Baixar"
 * busca o desenho dos cartões. Usa apenas o que a projeção do link já mostra na tela: no modo
 * "Só a planta" nenhum nome entra na imagem, porque o servidor nem os envia.
 */
import type { SharedView } from '@enlace/contracts';
import { createMapSvg } from '../editor/files/pure-svg.js';
import { createSharedReceptionSvg } from '../editor/files/reception-svg.js';
import { downloadSvgAsPng, slug } from '../editor/files/exports.js';
import { coupleTitle, toViewProject } from './client.js';

export type SharedDownload = 'ceremony' | 'reception' | 'reception-plan' | 'seat';

export async function downloadSharedPng(
  view: SharedView,
  kind: SharedDownload,
  seatId?: string,
): Promise<void> {
  const title = coupleTitle(view.couple);
  const base = slug(title);
  if (kind === 'reception' || kind === 'reception-plan') {
    const withNames = kind === 'reception' && view.mode === 'names';
    const suffix = withNames ? '' : '-sem-nomes';
    await downloadSvgAsPng(
      createSharedReceptionSvg(
        view,
        title.startsWith('Cerimônia') ? title.replace('Cerimônia', 'Festa') : 'Planta da festa',
        { withNames },
      ),
      `${base}-planta-festa${suffix}.png`,
    );
    return;
  }
  const project = { ...toViewProject(view), reception: null };
  if (kind === 'seat') {
    if (view.mode !== 'names' || !seatId) throw new Error('Escolha uma pessoa na busca.');
    // Na projeção, cada pessoa tem o id da própria cadeira.
    await downloadSvgAsPng(createMapSvg(project, seatId), `${base}-meu-lugar.png`);
    return;
  }
  await downloadSvgAsPng(
    createMapSvg(project, undefined, { anonymous: view.mode === 'plan' }),
    `${base}-planta${view.mode === 'plan' ? '-sem-nomes' : ''}.png`,
  );
}
