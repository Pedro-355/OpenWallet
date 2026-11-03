import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { AuthScreen } from './AuthScreen';
import { server, useMswServer } from './test/server';
import { aUser } from './test/factories';

useMswServer();

describe('AuthScreen', () => {
  it('mostra a mensagem do servidor quando o login falha', async () => {
    server.use(
      http.post('/api/v1/auth/login', () => HttpResponse.json({ error: 'unauthorized', message: 'E-mail ou senha incorretos' }, { status: 401 })),
    );
    render(<AuthScreen />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/e-mail/i), 'a@b.com');
    await user.type(screen.getByLabelText(/senha/i), 'errada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('E-mail ou senha incorretos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('sem conexão, avisa em vez de travar', async () => {
    server.use(http.post('/api/v1/auth/login', () => HttpResponse.error()));
    render(<AuthScreen />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/e-mail/i), 'a@b.com');
    await user.type(screen.getByLabelText(/senha/i), 'x');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText(/sem conexão/i)).toBeInTheDocument();
  });

  it('cadastro pede o estado e envia a UF escolhida', async () => {
    let body: any;
    server.use(
      http.post('/api/v1/auth/register', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ accessToken: 'a', refreshToken: 'r', user: aUser({ uf: 'MG' }) }, { status: 201 });
      }),
    );
    render(<AuthScreen />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /cadastre-se/i }));
    await user.type(screen.getByLabelText(/e-mail/i), 'novo@b.com');
    await user.type(screen.getByLabelText(/senha/i), 'senha-forte-1');
    await user.selectOptions(screen.getByLabelText(/seu estado/i), 'MG');
    await user.click(screen.getByRole('button', { name: /criar conta/i }));

    await vi.waitFor(() => expect(body).toEqual({ email: 'novo@b.com', password: 'senha-forte-1', uf: 'MG' }));
  });
});
