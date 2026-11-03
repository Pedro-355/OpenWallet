import { Icone, type NomeIcone } from '../ds/Icone';

export type Aba = 'inicio' | 'notas' | 'ir' | 'agenda' | 'mei' | 'ajuda';

export const ABAS: { id: Aba; rotulo: string; icone: NomeIcone }[] = [
  { id: 'inicio', rotulo: 'Início', icone: 'inicio' },
  { id: 'notas', rotulo: 'Notas', icone: 'notas' },
  { id: 'ir', rotulo: 'IR', icone: 'ir' },
  { id: 'agenda', rotulo: 'Agenda', icone: 'agenda' },
  { id: 'mei', rotulo: 'MEI', icone: 'mei' },
  { id: 'ajuda', rotulo: 'Ajuda', icone: 'ajuda' },
];

/** Abas fixas no rodapé. A aba ativa usa primary (a única cor de marca da tela). */
export function Navegacao({ atual, onTrocar }: { atual: Aba; onTrocar: (a: Aba) => void }) {
  return (
    <nav className="abas" aria-label="Seções">
      {ABAS.map((a) => (
        <button key={a.id} type="button" aria-current={a.id === atual ? 'page' : undefined} onClick={() => onTrocar(a.id)}>
          <Icone nome={a.icone} tamanho={22} />
          {a.rotulo}
        </button>
      ))}
    </nav>
  );
}
