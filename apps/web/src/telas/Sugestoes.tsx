import { useState } from 'react';
import { mvp, type ItemAgenda } from '../mvpApi';
import { SuggestionCard, formatarReais, type Tom } from '../ds/componentes';
import { todayISO } from '../format';
import type { Aba } from './Navegacao';
import { anoCorrente, useCarregar } from './comum';

export interface Sugestao {
  id: string;
  tag: string;
  tone: Tom;
  title: string;
  body: string;
  why: string;
  cta: string;
  destino: Aba;
}

const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

/**
 * Até três sugestões do dia, a partir dos dados da pessoa (design system: SuggestionCard).
 * Sempre um convite, nunca uma ordem, e sempre com "Por que essa sugestão?".
 */
export function montarSugestoes(
  dados: { agenda: ItemAgenda[] | null; perdidoSemCpfCents: number | null; perfilPreenchido: boolean | null },
  hoje = todayISO(),
): Sugestao[] {
  const out: Sugestao[] = [];

  const proximo = (dados.agenda ?? [])
    .filter((i) => !i.pago && diasEntre(hoje, i.vencimento) <= 7)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
  if (proximo) {
    const dias = diasEntre(hoje, proximo.vencimento);
    const quando = dias < 0 ? 'já venceu' : dias === 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence em ${dias} dias`;
    out.push({
      id: `agenda-${proximo.tipo}-${proximo.competencia ?? proximo.id}`,
      tag: 'Prazo',
      tone: 'attention',
      title: `${proximo.titulo} ${quando}`,
      body: proximo.valorCents
        ? `Que tal deixar pago agora? São ${formatarReais(proximo.valorCents / 100)}.`
        : 'Que tal resolver agora e tirar isso da cabeça?',
      why: 'Vimos na sua agenda fiscal, montada a partir do seu perfil. Pagar no prazo evita multa e juros.',
      cta: 'Ver agenda',
      destino: 'agenda',
    });
  }

  if (dados.perdidoSemCpfCents && dados.perdidoSemCpfCents >= 100) {
    out.push({
      id: 'cpf-na-nota',
      tag: 'Economia',
      tone: 'positive',
      title: `${formatarReais(dados.perdidoSemCpfCents / 100)} de cashback ficariam para trás`,
      body: 'Que tal pedir o CPF na nota nas próximas compras? É o que garante a devolução a partir de 2027.',
      why: 'Calculamos com as notas e os gastos deste ano que não têm CPF. É uma estimativa: a alíquota oficial da CBS ainda não saiu.',
      cta: 'Ler uma nota',
      destino: 'notas',
    });
  }

  if (dados.perfilPreenchido === false) {
    out.push({
      id: 'perfil',
      tag: 'Perfil',
      tone: 'primary',
      title: 'Seu perfil ainda está vazio',
      body: 'Com ele, o app lembra do DAS, do carnê-leão e do Imposto de Renda na hora certa.',
      why: 'Sem saber como você ganha dinheiro, não dá para montar a sua agenda nem calcular o cashback.',
      cta: 'Preencher perfil',
      destino: 'ajuda',
    });
  }

  return out.slice(0, 3);
}

const CHAVE = 'openwallet.sugestoes-adiadas';

function adiadasHoje(hoje: string): string[] {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as { dia?: string; ids?: string[] };
    return salvo.dia === hoje ? (salvo.ids ?? []) : [];
  } catch {
    return [];
  }
}

export function Sugestoes({ irPara }: { irPara: (a: Aba) => void }) {
  const hoje = todayISO();
  const ano = anoCorrente();
  const { dados } = useCarregar(async () => {
    const [agenda, cashback] = await Promise.all([mvp.agenda().catch(() => null), mvp.cashback(ano).catch(() => null)]);
    return montarSugestoes({
      agenda: agenda?.itens ?? null,
      perdidoSemCpfCents: cashback?.estimativa.perdidoSemCpfCents ?? null,
      perfilPreenchido: cashback ? cashback.perfilPreenchido : null,
    });
  }, [ano]);
  // Quem tocou em "Agora não" hoje não vê a sugestão de novo até amanhã (na hora, o cartão mostra o "Desfazer").
  const [jaAdiadas] = useState(() => adiadasHoje(hoje));
  const visiveis = (dados ?? []).filter((s) => !jaAdiadas.includes(s.id));
  if (!dados || dados.length === 0) return null;

  function marcar(id: string, adiada: boolean) {
    const ids = adiadasHoje(hoje).filter((x) => x !== id).concat(adiada ? [id] : []);
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ dia: hoje, ids }));
    } catch {
      /* ok */
    }
  }

  return (
    <section className="secao" aria-label="Para hoje">
      <h2>Para hoje</h2>
      {visiveis.map((s) => (
        <SuggestionCard
          key={s.id}
          tag={s.tag}
          tone={s.tone}
          title={s.title}
          why={s.why}
          cta={s.cta}
          onStatusChange={(st) => {
            if (st === 'done') irPara(s.destino);
            marcar(s.id, st === 'later');
          }}
        >
          {s.body}
        </SuggestionCard>
      ))}
      {visiveis.length === 0 && <p className="caption">Tudo bem. A gente lembra você amanhã.</p>}
      <p className="caption">Sugestões educativas, feitas com os dados que você lançou. A decisão é sempre sua.</p>
    </section>
  );
}
