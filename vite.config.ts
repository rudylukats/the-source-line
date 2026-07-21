import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "path";

// The served file is index.html at the repo root (see wrangler.jsonc assets.directory).
// So the Vite *template* lives at app/index.html to avoid overwriting the built
// output, and the workflow copies the build result to the repo root.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    rollupOptions: { input: resolve(__dirname, "app/index.html") },
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
});
