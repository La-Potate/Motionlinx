// Kept in sync with src/services/ga4.js on the backend. If you add an engine
// here, mirror it in the server module so the GA4 dimension filter picks up
// the new hostnames.
export type AiEngine = {
  id: string;
  name: string;
  color: string;
  hostnames: string[];
};

export const AI_ENGINES: AiEngine[] = [
  { id: 'chatgpt', name: 'ChatGPT', color: '#10A37F', hostnames: ['chatgpt.com', 'chat.openai.com'] },
  { id: 'perplexity', name: 'Perplexity', color: '#1FB8CD', hostnames: ['perplexity.ai', 'www.perplexity.ai'] },
  { id: 'gemini', name: 'Gemini', color: '#4796E5', hostnames: ['gemini.google.com', 'bard.google.com'] },
  { id: 'copilot', name: 'Copilot', color: '#0078D4', hostnames: ['copilot.microsoft.com'] },
  { id: 'claude', name: 'Claude', color: '#CC785C', hostnames: ['claude.ai'] },
  { id: 'meta-ai', name: 'Meta AI', color: '#0866FF', hostnames: ['meta.ai', 'www.meta.ai'] },
  { id: 'you', name: 'You.com', color: '#7B61FF', hostnames: ['you.com'] },
  { id: 'poe', name: 'Poe', color: '#5436DA', hostnames: ['poe.com'] },
  { id: 'phind', name: 'Phind', color: '#1D8FE1', hostnames: ['www.phind.com', 'phind.com'] },
  { id: 'deepseek', name: 'DeepSeek', color: '#4D6BFE', hostnames: ['chat.deepseek.com'] },
  { id: 'mistral', name: 'Le Chat', color: '#FA500F', hostnames: ['chat.mistral.ai'] },
  { id: 'huggingchat', name: 'HuggingChat', color: '#FF9D00', hostnames: ['huggingface.co'] },
];

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}
