import config from './playwright.config';

process.env.FABLE_SOFTWARE_RENDERING = "1";

/** Reproduce software-rendered WebGL without changing the game's renderer. */
export default {
  ...config,
  timeout: 300000,
  expect: { timeout: 15000 },
  use: {...config.use, deviceScaleFactor: 0.5, launchOptions: {args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
};
