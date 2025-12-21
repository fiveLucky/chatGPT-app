import { build } from 'esbuild';
import { readdirSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, 'src');
const assetsDir = join(__dirname, 'assets');

// Widgets to build
const widgets = ['add', 'subtract', 'multiply', 'divide', 'super-calculator'];

// Clean assets directory
if (existsSync(assetsDir)) {
  rmSync(assetsDir, { recursive: true, force: true });
}
mkdirSync(assetsDir, { recursive: true });

// Get widget domain from environment or use default
const widgetDomain = process.env.WIDGET_DOMAIN || 'https://calculate-sum.zeabur.app';

async function buildWidget(widgetName: string) {
  const entryFile = join(srcDir, `${widgetName}.tsx`);

  if (!existsSync(entryFile)) {
    console.error(`Entry file not found: ${entryFile}`);
    return;
  }

  const outputFile = join(assetsDir, `${widgetName}.js`);

  console.log(`Building ${widgetName}...`);

  await build({
    entryPoints: [entryFile],
    bundle: true,
    format: 'esm',
    outfile: outputFile,
    minify: true,
    sourcemap: false,
    external: ['react', 'react-dom'],
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    jsx: 'automatic',
  });

  // Generate HTML file
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
  </style>
</head>
<body>
  <div id="${widgetName}-root"></div>
  <script type="module" src="${widgetDomain}/assets/${widgetName}.js"></script>
</body>
</html>`;

  const htmlFile = join(assetsDir, `${widgetName}.html`);
  writeFileSync(htmlFile, htmlContent);

  console.log(`✓ Built ${widgetName} -> ${outputFile}`);
}

// Build all widgets
async function buildAll() {
  console.log('Building all widgets...\n');

  for (const widget of widgets) {
    await buildWidget(widget);
  }

  console.log(`\n✓ All widgets built successfully in ${assetsDir}`);
}

buildAll().catch(console.error);

