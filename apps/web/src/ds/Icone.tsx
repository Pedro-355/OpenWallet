/**
 * Ícones de traço do OpenWallet: grade de 24px, traço 1.8, pontas arredondadas,
 * fill none e stroke currentColor (herdam a cor do texto). Sem emoji.
 */
const CAMINHOS = {
  inicio: 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z',
  notas: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  ir: 'M5 4h10l4 4v12H5zM15 4v4h4M8 13h8M8 17h5',
  agenda: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2',
  mei: 'M4 8h16v12H4zM9 8V5h6v3M4 13h16',
  ajuda: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17.2v.1',
  olho: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  olhoFechado: 'M3 3l18 18M10.6 5.6A9.5 9.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.6M6.2 7.2A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2',
  fechar: 'M6 6l12 12M18 6 6 18',
  voltar: 'M15 5l-7 7 7 7',
  avancar: 'M9 5l7 7-7 7',
  mais: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  sair: 'M10 5H5v14h5M14 8l4 4-4 4M18 12H9',
  calendario: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M12 13v4M10 15h4',
  lixeira: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  enviar: 'M4 12l16-8-6 16-2.5-6.5z',
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({ nome, tamanho = 20, titulo }: { nome: NomeIcone; tamanho?: number; titulo?: string }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={titulo ? undefined : true}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      focusable="false"
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}
