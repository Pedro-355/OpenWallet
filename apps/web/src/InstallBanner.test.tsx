import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Simula o navegador: modo "app instalado" e o agente do usuário. */
function browser({ standalone = false, userAgent = 'Mozilla/5.0 (Linux; Android 14) Chrome/130' } = {}) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: standalone && q.includes('standalone'), addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

async function renderBanner() {
  vi.resetModules();
  const install = await import('./install');
  install.setupPwa();
  const { InstallBanner } = await import('./InstallBanner');
  render(<InstallBanner />);
  return install;
}

function fireInstallPrompt() {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return { prompt, event };
}

describe('InstallBanner', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('no Android, aparece quando o Chrome oferece a instalação e abre o instalador', async () => {
    browser();
    await renderBanner();
    expect(screen.queryByText(/instale o openwallet/i)).not.toBeInTheDocument();

    const { prompt, event } = fireInstallPrompt();

    expect(event.defaultPrevented).toBe(true); // guardamos o convite para o nosso botão
    await userEvent.click(screen.getByRole('button', { name: 'Instalar' }));
    expect(prompt).toHaveBeenCalledOnce();
    expect(screen.queryByText(/instale o openwallet/i)).not.toBeInTheDocument();
  });

  it('no iPhone, explica o caminho pelo Compartilhar', async () => {
    browser({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1' });
    await renderBanner();
    expect(screen.getByText(/adicionar à tela de início/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Instalar' })).not.toBeInTheDocument();
  });

  it('não aparece quando o app já está instalado', async () => {
    browser({ standalone: true });
    await renderBanner();
    fireInstallPrompt();
    expect(screen.queryByText(/instale o openwallet/i)).not.toBeInTheDocument();
  });

  it('fechar o aviso é lembrado', async () => {
    browser({ userAgent: 'iPhone' });
    await renderBanner();
    await userEvent.click(screen.getByRole('button', { name: /fechar/i }));
    expect(screen.queryByText(/instale o openwallet/i)).not.toBeInTheDocument();
    expect(localStorage.getItem('openwallet.install-dismissed')).toBe('1');
  });
});
