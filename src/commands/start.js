/**
 * Copyright 2017-present, Callstack.
 * All rights reserved.
 *
 * @flow
 */
const webpack = require('webpack');
const path = require('path');
const fs = require('fs');
const clear = require('clear');
const chalk = require('chalk');

const logger = require('../logger');
const createServer = require('../server');
const messages = require('../messages');
const exec = require('../utils/exec');
const { MessageError } = require('../errors');

const makeReactNativeConfig = require('../utils/makeReactNativeConfig');

/**
 * Starts development server
 */
async function start(opts: *) {
  const directory = process.cwd();
  const configPath = path.join(directory, 'webpack.haul.js');

  if (!fs.existsSync(configPath)) {
    throw new MessageError(
      messages.webpackConfigNotFound({
        directory,
      }),
    );
  }

  // eslint-disable-next-line prefer-const
  let [config, platforms] = makeReactNativeConfig(
    // $FlowFixMe: Dynamic require
    require(configPath),
    {
      root: directory,
      dev: opts.dev,
      minify: opts.minify,
    },
  );

  if (opts.platform !== 'all' && platforms.includes(opts.platform)) {
    config = config[platforms.indexOf(opts.platform)];
  }

  clear();

  const compiler = webpack(config);

  const app = createServer(
    compiler,
    didHaveIssues => {
      clear();
      if (didHaveIssues) {
        logger.warn(messages.bundleBuilding(didHaveIssues));
      } else {
        logger.info(messages.bundleBuilding(didHaveIssues));
      }
    },
    stats => {
      clear();
      if (stats.hasErrors()) {
        logger.error(messages.bundleFailed());
      } else {
        logger.done(
          messages.bundleBuilt({
            stats,
            platform: opts.platform,
          }),
        );
      }
    },
  );

  // Run `adb reverse` on Android
  if (opts.platform === 'android') {
    const args = `reverse tcp:${opts.port} tcp:${opts.port}`;
    const adb = process.env.ANDROID_HOME
      ? `${process.env.ANDROID_HOME}/platform-tools/adb`
      : 'adb';

    try {
      await exec(`${adb} ${args}`);
      logger.info(
        messages.commandSuccess({
          command: `${path.basename(adb)} ${args}`,
        }),
      );
    } catch (error) {
      logger.warn(
        messages.commandFailed({
          command: `${path.basename(adb)} ${args}`,
          error,
        }),
      );
    }
  }

  app.listen(opts.port, opts.host, () => {
    logger.info(
      messages.initialStartInformation({
        entries: Array.isArray(config)
          ? config.map(c => c.entry)
          : [config.entry],
        host: opts.host,
        port: opts.port,
      }),
    );
  });
}

module.exports = {
  name: 'start',
  description: 'Starts a new webpack server',
  action: start,
  options: [
    {
      name: 'host',
      description: 'Host to run your webpack server',
      default: '127.0.0.1',
      parse: String,
    },
    {
      name: 'port',
      description: 'Port to run your webpack server',
      default: '8081',
      parse: Number,
    },
    {
      name: 'dev',
      description: 'Whether to build in development mode',
      default: 'true',
      parse: (val: string) => val !== 'false',
      choices: [
        {
          value: 'true',
          description: 'Builds in development mode',
        },
        {
          value: 'false',
          description: 'Builds in production mode',
        },
      ],
    },
    {
      name: 'minify',
      description: `Whether to minify the bundle, 'true' by default when dev=false`,
      default: ({ dev }: *) => String(!dev),
      parse: (val: string) => val !== 'false',
      choices: [
        {
          value: 'true',
          description: 'Enables minification for the bundle',
        },
        {
          value: 'false',
          description: 'Disables minification for the bundle',
        },
      ],
    },
    {
      name: 'platform',
      description: 'Platform to bundle for',
      example: 'haul start --platform ios',
      note: `${chalk.bold('--platform=all')} is similar to how React Native packager works - you can run iOS and Android versions of your app at the same time. It will become the default value in future after we fix the performance issues.`,
      required: true,
      choices: [
        {
          value: 'ios',
          description: 'Servers iOS bundle',
        },
        {
          value: 'android',
          description: 'Serves Android bundle',
        },
        {
          value: 'all',
          description: 'Serves both platforms',
        },
      ],
    },
  ],
};
