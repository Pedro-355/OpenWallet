export type Aba = 'inicio' | 'notas' | 'ir' | 'agenda' | 'mei' | 'ajuda';

export const ABAS: { id: Aba; rotulo: string; icone: string }[] = [
  { id: 'inicio', rotulo: 'Início', icone: '◎' },
  { id: 'notas', rotulo: 'Notas', icone: '▦' },
  { id: 'ir', rotulo: 'IR', icone: '§' },
  { id: 'agenda', rotulo: 'Agenda', icone: '◷' },
  { id: 'mei', rotulo: 'MEI', icone: '▲' },
  { id: 'ajuda', rotulo: 'Ajuda', icone: '?' },
];

/** Barra de abas fixa no rodapé (no celular) para navegar entre as funções do app. */
export function Navegacao({ atual, onTrocar }: { atual: Aba; onTrocar: (a: Aba) => void }) {
  return (
    <nav className="abas" aria-label="Seções">
      {ABAS.map((a) => (
        <button key={a.id} className={a.id === atual ? 'ativa' : ''} aria-current={a.id === atual ? 'page' : undefined} onClick={() => onTrocar(a.id)}>
          <span aria-hidden="true">{a.icone}</span>
          {a.rotulo}
        </button>
      ))}
    </nav>
  );
}
