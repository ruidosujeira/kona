import { kona, pluginReact } from '../src';

export default kona({
  target: 'browser',
  entry: 'src/index.tsx',
  devServer: {
    port: 3000,
    open: false,
  },
  plugins: [
    pluginReact({ fastRefresh: true }),
  ],
});
