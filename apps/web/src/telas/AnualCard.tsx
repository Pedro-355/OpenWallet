import { dataExtenso, pct } from '../format';
import { mvp } from '../mvpApi';
import { Money, OQueE } from '../ds/componentes';
import { anoCorrente, useCarregar } from './comum';

/** "Até 6 de março você trabalhou só para pagar impostos": consumo + IR + INSS + IPVA/IPTU no ano. */
export function AnualCard({ versao = 0 }: { versao?: number }) {
  const ano = anoCorrente();
  const { dados } = useCarregar(() => mvp.impostometroAnual(ano), [ano, versao]);
  if (!dados || dados.totalCents === 0) return null;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Seu ano em impostos</h2>
        <OQueE termo="ano em impostos">
          Somamos o imposto embutido no que você compra com o Imposto de Renda, o INSS, o IPVA, o IPTU e o DAS do ano. Depois dividimos pela sua renda
          para ver quantos dias de trabalho isso representa.
        </OQueE>
      </div>
      <Money cents={dados.totalCents} size="lg" />
      {dados.diasTrabalhados !== null && dados.liberdadeEm && (
        <p className="body-sm">
          São <strong>{dados.diasTrabalhados} dias</strong> de trabalho, ou {pct(dados.pctDaRenda ?? 0)} da renda. Até {dataExtenso(dados.liberdadeEm)}, o que você
          ganhou foi para impostos.
        </p>
      )}
      <ul className="lista">
        {dados.partes.map((p) => (
          <li key={p.chave}>
            <span className="item-texto">{p.rotulo}</span>
            <Money cents={p.cents} />
          </li>
        ))}
      </ul>
      {dados.estimado && <p className="caption">IR e INSS estimados pela renda do perfil. Com os rendimentos lançados na aba IR, a conta fica exata.</p>}
    </section>
  );
}
