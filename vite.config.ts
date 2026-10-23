import { defineConfig } from "vite";
/** 引擎单独缓存，所有字体和游戏代码仍由本站静态目录提供。 */
export default defineConfig({
  build: {
    rollupOptions: { output: { manualChunks: { three: ["three"] } } },
    chunkSizeWarningLimit: 650,
  },
});
