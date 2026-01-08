# Astro Migration Guide

## Project Structure

The frontend has been migrated to **Astro** for better component organization and maintainability.

```
deno-mcp-gateway/
├── src/
│   ├── pages/              # Astro pages (auto-routed)
│   │   ├── index.astro     # Home page
│   │   └── dashboard.astro # Dashboard page
│   ├── components/         # Reusable Astro components
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── QuickActions.astro
│   │   ├── ResourcesReader.astro
│   │   └── Services.astro
│   └── layouts/            # Layout templates
│       └── Base.astro      # Base layout with styling
├── dist/                   # Built output (git-ignored)
├── package.json            # Node dependencies (Astro only)
├── astro.config.ts         # Astro configuration
├── tsconfig.json           # TypeScript configuration
└── (Deno backend unchanged)
```

## Development

### 1. Install Astro dependencies
```bash
npm install
```

### 2. Run development server
```bash
# Terminal 1: Astro dev server (rebuilds on changes, serves pages)
npm run dev

# Terminal 2: Deno backend (API routes)
deno task dev
```

The Astro dev server runs on `http://localhost:3000` and proxies API requests to your Deno backend on `http://localhost:8888`.

### 3. Build for production
```bash
npm run build
```

This generates static HTML in `dist/` that can be served with your Deno backend.

## Key Features

### Zero JavaScript by Default
- Pages are pure HTML/CSS unless you explicitly add interactivity
- Load JavaScript only where needed (Islands Architecture)

### Type-Safe Components
- All components use TypeScript
- Full IDE autocomplete and type checking

### Component Examples

#### Simple Static Component
```astro
---
// src/components/Header.astro
interface Props {
  title: string;
}
const { title } = Astro.props;
---

<header>
  <h1>{title}</h1>
</header>

<style>
  header { /* scoped CSS */ }
</style>
```

#### Interactive Component with Client-Side JS
```astro
---
// src/components/ResourcesReader.astro
---

<section id="resources">
  <!-- HTML markup -->
</section>

<script>
  // Client-side JavaScript (scoped to this component)
  async function initResources() {
    // ...
  }
  initResources();
</script>
```

## Benefits Over Vanilla HTML/JS

1. **Component Organization** - Each component is self-contained with HTML, CSS, and JS
2. **No Brittle Selectors** - Less reliance on IDs and classes across the codebase
3. **CSS Isolation** - Styles automatically scoped to components
4. **Reusability** - Easy to reuse components across pages
5. **Type Safety** - TypeScript for props and component interfaces
6. **Build Optimization** - Automatic minification and optimization
7. **File-based Routing** - No router configuration needed

## Migration Path

The old `public/` files are still served for backward compatibility, but you should gradually move to Astro components:

- `public/index.html` → `src/pages/index.astro`
- `public/dashboard.html` → `src/pages/dashboard.astro`
- `public/styles.css` → Inline in `src/layouts/Base.astro`
- `public/app.js` → Inline `<script>` in components

## Deployment

### Build and serve with Deno
1. Build Astro: `npm run build`
2. The `dist/` folder contains static files
3. Update your Deno server to serve `dist/` for non-API routes:

```typescript
// In dev.ts or main.ts
const file = await Deno.open('./dist' + pathname);
return new Response(file.readable, { headers: { 'content-type': 'text/html' } });
```

Or deploy to a CDN and keep Deno as API-only backend.

## Learn More

- [Astro Documentation](https://docs.astro.build)
- [Astro Components](https://docs.astro.build/en/basics/astro-components/)
- [Astro Islands Architecture](https://docs.astro.build/en/concepts/islands/)
