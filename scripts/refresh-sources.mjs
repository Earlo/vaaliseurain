import { refreshDumaSources } from '../lib/source-refresh.mjs';

const result = await refreshDumaSources();
for (const source of result.sources) {
  console.log(`${source.ok ? 'ok' : 'failed'}\t${source.id}${source.error ? `\t${source.error}` : ''}`);
}

if (!result.sources.some((source) => source.ok)) process.exitCode = 1;
