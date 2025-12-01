import { env } from '../../env';
import { KonaLogAdapter } from '../../log/KonaLogAdapter';
import { pluginAssumption } from '../../plugins/core/plugin_assumption';
import { pluginCSS } from '../../plugins/core/plugin_css';
import { pluginSass } from '../../plugins/core/plugin_sass';
import { parseVersion } from '../../utils/utils';
import { Context } from '../context';
import ts = require('typescript');
import { WatcherReaction } from '../../watcher/watcher';
import { finalizeKona } from './finalizeKona';

export function preflightKona(ctx: Context) {
  const log = ctx.log;

  checkVersion(log);

  log.konaHeader({
    entry: ctx.config.entries[0],
    mode: ctx.config.isProduction ? 'production' : 'development',
    version: env.VERSION,
  });

  const plugins = [...ctx.config.plugins, pluginAssumption(), pluginCSS(), pluginSass()];
  plugins.forEach(plugin => plugin && plugin(ctx));

  ctx.ict.on('complete', () => finalizeKona(ctx));
  ctx.ict.on('rebundle', () => finalizeKona(ctx));

  setTimeout(() => {
    // push this one down the stack to it's triggered the last one
    // letting other handlers to do their job (clearing the cache for example)
    const ExitableReactions = [WatcherReaction.TS_CONFIG_CHANGED, WatcherReaction.FUSE_CONFIG_CHANGED];
    ctx.ict.on('watcher_reaction', ({ reactionStack }) => {
      for (const item of reactionStack) {
        if (ExitableReactions.includes(item.reaction)) {
          log.stopStreaming();
          log.line();
          log.echo(' <yellow><bold> @warning Your configuration has changed.</bold> </yellow>');
          log.echo(' <yellow><bold> @warning Cache has been cleared</bold> </yellow>');
          log.echo(' <yellow><bold> @warning Exiting the process</bold> </yellow>');

          process.exit(0);
        }
      }
    });
  }, 0);
}

function checkVersion(log: KonaLogAdapter) {
  const nodeVersion = parseVersion(process.version)[0];
  if (nodeVersion < 20) {
    log.warn(
      'You are using an older version of Node.js $version. Upgrade to at least Node.js v20 for best performance with Kona',
      { version: process.version },
    );
  }
  const tsVersion = parseVersion(ts.version);
  if (tsVersion[0] < 5) {
    log.warn('You are using an older version of TypeScript $version. Kona works best with TypeScript 5+', {
      version: tsVersion,
    });
  }
}
