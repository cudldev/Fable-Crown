import config from './playwright.config';

/** Reproduce software-rendered WebGL without changing the game's renderer. */
export default {
  ...config,
  expect: { timeout: 15000 },
  use: {...config.use, deviceScaleFactor: 0.5, launchOptions: {args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
};
