import { brl, pct } from '../format';
import { mvp } from '../mvpApi';
import { anoCorrente, dataBR, useCarregar } from './comum';

/** "Você trabalhou até X só para pagar impostos": consumo + IR + INSS + IPVA/IPTU no ano. */
export function AnualCard({ versao = 0 }: { versao?: number }) {
  const ano = anoCorrente();
  const { dados } = useCarregar(() => mvp.impostometroAnual(ano), [ano, versao]);
  if (!dados || dados.totalCents === 0) return null;
  return (
    <section className="card anual">
      <h2>Seu ano em impostos</h2>
      <p className="big-sm">{brl(dados.totalCents)}</p>
      {dados.diasTrabalhados !== null && dados.liberdadeEm && (
        <p>
          Equivale a <strong className="accent">{dados.diasTrabalhados} dias</strong> de trabalho ({pct(dados.pctDaRenda ?? 0)} da renda): até{' '}
          {dataBR(dados.liberdadeEm).slice(0, 5)} você trabalhou só para pagar impostos.
        </p>
      )}
      <ul className="legend">
        {dados.partes.map((p) => (
          <li key={p.chave}>
            {p.rotulo} <strong>{brl(p.cents)}</strong>
          </li>
        ))}
      </ul>
      {dados.estimado && <p className="muted small">IR e INSS estimados pela renda do perfil. Lance seus rendimentos na aba IR para ficar exato.</p>}
    </section>
  );
}
