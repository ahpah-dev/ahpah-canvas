import type { GatewayModel } from './gateways.ts';
import { currentModelRecommendations, isAutomaticModel, isFreeModel, sortModelCatalog } from './modelCatalog.ts';

const aliases: Record<string, string> = { oc: 'opencode', opencode: 'opencode' };
export const canonicalOmniProvider = (provider: string) => {
  const normalized = provider.trim().toLowerCase().replace(/[.,;:]+$/, '');
  return aliases[normalized] || normalized;
};

export function omniModelProvider(model: GatewayModel): string {
  // Routing prefixes identify the gateway provider, not the model's publisher.
  const prefix = model.id.includes('/') ? model.id.split('/')[0] : '';
  return canonicalOmniProvider(prefix || model.owned_by || model.id);
}

export function freeModelCandidates(models: GatewayModel[], preferred = ''): GatewayModel[] {
  const routes = sortModelCatalog(models).filter(model => isFreeModel(model) && !isAutomaticModel(model));
  const recommendations = new Map(currentModelRecommendations(routes).map((model, index) => [model.id, index]));
  routes.sort((a, b) => (b.created || 0) - (a.created || 0)
    || (recommendations.get(a.id) ?? 100) - (recommendations.get(b.id) ?? 100)
    || Number(b.id === preferred) - Number(a.id === preferred));
  const providers = new Set<string>();
  const diverse = routes.filter(model => {
    const provider = omniModelProvider(model);
    if (providers.has(provider)) return false;
    providers.add(provider);
    return true;
  });
  const firstIds = new Set(diverse.map(model => model.id));
  return [...diverse, ...routes.filter(model => !firstIds.has(model.id))].slice(0, 6);
}

export function unavailableOmniProvider(message: string): string | undefined {
  const match = message.match(/no active credentials for provider:\s*["']?([a-z0-9_-]+(?:\.[a-z0-9_-]+)*)/i);
  return match ? canonicalOmniProvider(match[1]) : undefined;
}

export function omniGatewayAuthFailure(message: string): boolean {
  if (unavailableOmniProvider(message) || /from provider|upstream|only be used from within OpenCode/i.test(message)) return false;
  return /invalid (?:api |gateway )?key|(?:api|gateway) key (?:is )?(?:required|missing)|invalid bearer|unauthorized gateway/i.test(message);
}

export function omniProviderHelp(provider: string): string {
  return canonicalOmniProvider(provider) === 'opencode'
    ? 'OpenCode Free does not require an account key. Its free routes can reject tool-less requests or be temporarily unavailable after an upstream rejection. Canvas sends coding tools; check OpenCode’s connection status and cooldown in OmniRoute, then retry or use another free provider.'
    : `${provider}: check its connection status, account credentials, prerequisites and quota in OmniRoute → Providers.`;
}

export function omniRouteErrorMessage(message: string): string {
  const provider = unavailableOmniProvider(message);
  if (provider) return `${message.replace(/[.\s]+$/, '')}. ${omniProviderHelp(provider)}`;
  if (/only be used from within OpenCode/i.test(message)) return `${message} ${omniProviderHelp('opencode')}`;
  return message;
}
