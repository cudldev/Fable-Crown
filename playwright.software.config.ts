import config from './playwright.config';

/** Reproduce software-rendered WebGL without changing the game's renderer. */
export default {
  ...config,
  use: {...config.use, launchOptions: {args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
};
