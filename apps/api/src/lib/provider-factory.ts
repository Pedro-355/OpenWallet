import type { Config } from '../config.js';
import { SandboxOpenFinanceClient, type OpenFinanceProvider } from './openfinance-client.js';

/** Escolhe o provedor Open Finance pela configuração. Para um agregador real, adicione um case aqui. */
export function createProvider(config: Config): OpenFinanceProvider | null {
  if (!config.OPENFINANCE_BASE_URL) return null;
  switch (config.OPENFINANCE_PROVIDER) {
    case 'sandbox':
      return new SandboxOpenFinanceClient(config.OPENFINANCE_BASE_URL, config.OPENFINANCE_API_KEY);
    default:
      throw new Error(`Provedor Open Finance desconhecido: ${config.OPENFINANCE_PROVIDER}`);
  }
}
