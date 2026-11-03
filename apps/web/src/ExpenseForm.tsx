import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { UFS, calculateTax, isUF, type TaxRatesTable } from '@openwallet/tax';
import { api, ApiError } from './api';
import { lastDay, parseReais, pct, todayISO } from './format';
import { Button, Money } from './ds/componentes';
import { CampoDinheiro } from './ux/campos';

/** Formulário de novo gasto, com prévia do imposto calculada no próprio aparelho. */
export function ExpenseForm({ rates, defaultUf, month, onSaved }: { rates: TaxRatesTable; defaultUf: string; month: string; onSaved: () => Promise<void> }) {
  const today = todayISO();
  const defaultDate = today.startsWith(month) ? today : lastDay(month);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(rates.fallbackCategory);
  const [description, setDescription] = useState('');
  const [uf, setUf] = useState(defaultUf);
  const [spentOn, setSpentOn] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Mesma chave enquanto o formulário não for salvo com sucesso → reenvio não duplica.
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());

  useEffect(() => setUf(defaultUf), [defaultUf]);
  useEffect(() => setSpentOn(defaultDate), [defaultDate]);

  const cents = parseReais(amount);
  // Prévia calculada no próprio aparelho: instantânea e sem carga no servidor.
  const preview = useMemo(
    () => (cents && isUF(uf) ? calculateTax(rates, { amountCents: cents, category, uf }) : null),
    [cents, category, uf, rates],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cents) return setError('Informe um valor válido.');
    setBusy(true);
    setError('');
    try {
      await api.createExpense({ amountCents: cents, category, description, uf, spentOn }, idemKey);
      setAmount('');
      setDescription('');
      setIdemKey(crypto.randomUUID());
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sem conexão. Tente de novo — não vai duplicar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="two">
        <CampoDinheiro rotulo="Valor" value={amount} onChange={setAmount} required />
        <label>
          Data
          <input type="date" value={spentOn} max={today} onChange={(e) => setSpentOn(e.target.value)} required />
        </label>
      </div>
      <div className="two">
        <label>
          Categoria
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(rates.categories).map(([key, c]) => (
              <option key={key} value={key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          UF da compra
          <select value={uf} onChange={(e) => setUf(e.target.value)}>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Descrição (opcional)
        <input maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: posto da esquina" enterKeyHint="done" autoCapitalize="sentences" />
      </label>
      <p className="ow-note" aria-live="polite">
        {preview ? (
          <>
            Cerca de <Money cents={preview.totalCents} size="sm" hidden={false} /> deste valor são impostos ({pct(preview.ratePct)}).
          </>
        ) : (
          'Digite um valor para ver o imposto embutido.'
        )}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <Button variant="ink" size="lg" block type="submit" disabled={busy}>
        {busy ? 'Salvando…' : 'Adicionar gasto'}
      </Button>
    </form>
  );
}
