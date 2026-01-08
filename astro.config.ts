import { defineConfig } from 'astro/config';

export default defineConfig({
  // Point to public assets
  publicDir: './public',
  
  // Output configuration for static build
  output: 'static',
  
  // Base path if needed
  base: '/',
  
  // Integrate with Tailwind (already in your HTML)
  integrations: [],
  
  // Vite configuration for any additional needs
  vite: {
    ssr: {
      external: ['deno']
    }
  }
});
