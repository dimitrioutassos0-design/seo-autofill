#!/usr/bin/env node
import { loadConfig, redactSecrets } from './config.js';
import { runAll } from './runner.js';
import { startDashboard } from './dashboard.js';

interface CliFlags {
  command: 'run' | 'dashboard' | 'help' | 'version';
  configPath: string;
  store?: string;
  limit?: number;
  dryRunOverride?: boolean;
  port: number;
}

function parseArgs(argv: string[]): CliFlags {
  const args = argv.slice(2);
  const cmd = args[0] ?? 'help';
  const flags: CliFlags = {
    command: cmd === 'run' || cmd === 'dashboard' || cmd === 'version' ? cmd : 'help',
    configPath: './config.json',
    port: 3000,
  };
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--config' && args[i + 1]) flags.configPath = args[++i]!;
    else if (a === '--store' && args[i + 1]) flags.store = args[++i]!;
    else if (a === '--limit' && args[i + 1]) flags.limit = Number(args[++i]);
    else if (a === '--port' && args[i + 1]) flags.port = Number(args[++i]);
    else if (a === '--dry-run') flags.dryRunOverride = true;
    else if (a === '--no-dry-run') flags.dryRunOverride = false;
  }
  return flags;
}

function printHelp() {
  process.stdout.write(
    [
      'seo-autofill — multi-store SEO autofill agent',
      '',
      'Usage:',
      '  seo-autofill run       [--config <path>] [--store <id>] [--limit <n>] [--dry-run | --no-dry-run]',
      '  seo-autofill dashboard [--config <path>] [--port <n>]',
      '  seo-autofill version',
      '',
      'Defaults to --config ./config.json. dryRun in config wins unless overridden by a CLI flag.',
      '',
    ].join('\n'),
  );
}

async function main() {
  const flags = parseArgs(process.argv);
  if (flags.command === 'help') {
    printHelp();
    return;
  }
  if (flags.command === 'version') {
    process.stdout.write('0.1.0\n');
    return;
  }

  const cfg = await loadConfig(flags.configPath);
  if (flags.dryRunOverride !== undefined) cfg.dryRun = flags.dryRunOverride;

  if (flags.command === 'dashboard') {
    startDashboard({ cfg, port: flags.port });
    return;
  }

  process.stdout.write(`Loaded config: ${JSON.stringify(redactSecrets(cfg), null, 2)}\n`);
  process.stdout.write(`Starting run (dryRun=${cfg.dryRun}) across ${cfg.stores.length} store(s)...\n`);

  const opts: { storeFilter?: string; productLimit?: number } = {};
  if (flags.store) opts.storeFilter = flags.store;
  if (flags.limit) opts.productLimit = flags.limit;
  const { runId, perStore } = await runAll(cfg, opts);

  process.stdout.write(`\nRun ${runId} complete.\n`);
  for (const [storeId, summary] of Object.entries(perStore)) {
    process.stdout.write(`  ${storeId}: total=${summary.total} ${JSON.stringify(summary.byStatus)}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
