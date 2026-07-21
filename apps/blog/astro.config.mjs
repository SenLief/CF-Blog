import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: cloudflare({
    imageService: "compile"
  }),
  compressHTML: true,
  vite: {
    build: {
      sourcemap: true
    }
  }
});
