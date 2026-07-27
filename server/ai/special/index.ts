import { COMMANDCODE_GO_PROVIDER } from './commandCodeGo.js';

export const SPECIAL_PROVIDERS = [COMMANDCODE_GO_PROVIDER].map(provider => ({ ...provider, kind: 'special' as const }));
