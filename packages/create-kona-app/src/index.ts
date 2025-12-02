#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import prompts from 'prompts';

const VERSION = '1.0.0';

// Colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(msg: string) {
  console.log(msg);
}

function success(msg: string) {
  console.log(`${c.green}✓${c.reset} ${msg}`);
}

function info(msg: string) {
  console.log(`${c.cyan}ℹ${c.reset} ${msg}`);
}

function error(msg: string) {
  console.error(`${c.red}✗${c.reset} ${msg}`);
}

// Templates
const templates = {
  react: {
    name: 'React',
    description: 'React 19 with TypeScript and Fast Refresh',
    color: c.cyan,
  },
  vanilla: {
    name: 'Vanilla',
    description: 'Plain TypeScript, no framework',
    color: c.yellow,
  },
};

type TemplateName = keyof typeof templates;

// File contents
function getPackageJson(name: string, template: TemplateName) {
  const deps: Record<string, string> = {};
  const devDeps: Record<string, string> = {
    kona: '^4.1.0',
    typescript: '^5.7.0',
  };

  if (template === 'react') {
    deps['react'] = '^19.0.0';
    deps['react-dom'] = '^19.0.0';
    devDeps['@types/react'] = '^19.0.0';
    devDeps['@types/react-dom'] = '^19.0.0';
  }

  return JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'kona dev',
        build: 'kona build',
        preview: 'kona preview',
      },
      dependencies: deps,
      devDependencies: devDeps,
    },
    null,
    2
  );
}

function getKonaConfig(template: TemplateName) {
  if (template === 'react') {
    return `import { kona, pluginReact } from 'kona';

export default kona({
  target: 'browser',
  entry: 'src/index.tsx',
  devServer: true,
  plugins: [
    pluginReact({ fastRefresh: true }),
  ],
});
`;
  }

  return `import { kona } from 'kona';

export default kona({
  target: 'browser',
  entry: 'src/index.ts',
  devServer: true,
});
`;
}

function getTsConfig(template: TemplateName) {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        jsx: template === 'react' ? 'react-jsx' : undefined,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
      },
      include: ['src'],
    },
    null,
    2
  );
}

function getIndexHtml(name: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  $bundles
</body>
</html>
`;
}

function getReactIndex() {
  return `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
}

function getReactApp() {
  return `import React, { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="app">
      <header>
        <h1>⚡ Kona + React</h1>
        <p>Edit <code>src/App.tsx</code> and save to see HMR in action</p>
      </header>
      
      <main>
        <button onClick={() => setCount(c => c + 1)}>
          Count: {count}
        </button>
      </main>
      
      <footer>
        <a href="https://github.com/ruidosujeira/kona" target="_blank" rel="noopener">
          Documentation
        </a>
      </footer>
    </div>
  );
}
`;
}

function getVanillaIndex() {
  return `import './styles.css';

const app = document.getElementById('root')!;

app.innerHTML = \`
  <div class="app">
    <header>
      <h1>⚡ Kona</h1>
      <p>Edit <code>src/index.ts</code> and save to see HMR in action</p>
    </header>
    
    <main>
      <button id="counter">Count: 0</button>
    </main>
    
    <footer>
      <a href="https://github.com/ruidosujeira/kona" target="_blank" rel="noopener">
        Documentation
      </a>
    </footer>
  </div>
\`;

let count = 0;
const button = document.getElementById('counter')!;
button.addEventListener('click', () => {
  count++;
  button.textContent = \`Count: \${count}\`;
});

console.log('⚡ Kona is ready!');
`;
}

function getStyles() {
  return `:root {
  --bg: #0a0a0a;
  --fg: #ededed;
  --accent: #00d4ff;
  --accent-hover: #00b8e6;
}

body {
  background: var(--bg);
  color: var(--fg);
  min-height: 100vh;
}

.app {
  max-width: 600px;
  margin: 0 auto;
  padding: 4rem 2rem;
  text-align: center;
}

header h1 {
  font-size: 3rem;
  margin-bottom: 1rem;
}

header p {
  color: #888;
  margin-bottom: 2rem;
}

header code {
  background: #1a1a1a;
  padding: 0.2em 0.5em;
  border-radius: 4px;
  font-size: 0.9em;
}

main {
  margin: 3rem 0;
}

button {
  background: var(--accent);
  color: var(--bg);
  border: none;
  padding: 1rem 2rem;
  font-size: 1.2rem;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}

button:hover {
  background: var(--accent-hover);
}

button:active {
  transform: scale(0.98);
}

footer {
  margin-top: 3rem;
}

footer a {
  color: var(--accent);
  text-decoration: none;
}

footer a:hover {
  text-decoration: underline;
}
`;
}

function getGitignore() {
  return `node_modules
dist
.kona-cache
*.log
.DS_Store
`;
}

// Main
async function main() {
  const args = process.argv.slice(2);
  
  // Show version
  if (args.includes('--version') || args.includes('-v')) {
    log(`create-kona-app v${VERSION}`);
    process.exit(0);
  }

  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    log(`
${c.bold}create-kona-app${c.reset} - Create a new Kona app in seconds

${c.bold}Usage:${c.reset}
  npx create-kona-app [project-name] [options]

${c.bold}Options:${c.reset}
  --template <name>  Template to use (react, vanilla)
  --help, -h         Show this help
  --version, -v      Show version

${c.bold}Examples:${c.reset}
  npx create-kona-app my-app
  npx create-kona-app my-app --template react
`);
    process.exit(0);
  }

  // Banner
  log('');
  log(`${c.bold}${c.cyan}⚡ create-kona-app${c.reset}`);
  log(`${c.dim}The fastest way to start a new project${c.reset}`);
  log('');

  // Get project name
  let projectName = args.find(arg => !arg.startsWith('-'));
  let templateArg = args.find((arg, i) => args[i - 1] === '--template');

  if (!projectName) {
    const response = await prompts({
      type: 'text',
      name: 'projectName',
      message: 'Project name:',
      initial: 'my-kona-app',
    });
    projectName = response.projectName;
  }

  if (!projectName) {
    error('Project name is required');
    process.exit(1);
  }

  // Get template
  let template: TemplateName = 'react';
  
  if (templateArg && templateArg in templates) {
    template = templateArg as TemplateName;
  } else if (!templateArg) {
    const response = await prompts({
      type: 'select',
      name: 'template',
      message: 'Select a template:',
      choices: Object.entries(templates).map(([key, value]) => ({
        title: `${value.color}${value.name}${c.reset}`,
        description: value.description,
        value: key,
      })),
      initial: 0,
    });
    template = response.template || 'react';
  }

  const projectDir = path.resolve(process.cwd(), projectName);

  // Check if directory exists
  if (fs.existsSync(projectDir)) {
    const files = fs.readdirSync(projectDir);
    if (files.length > 0) {
      const response = await prompts({
        type: 'confirm',
        name: 'overwrite',
        message: `Directory ${projectName} is not empty. Continue anyway?`,
        initial: false,
      });
      if (!response.overwrite) {
        log('Cancelled.');
        process.exit(0);
      }
    }
  }

  // Create project
  log('');
  info(`Creating ${c.bold}${projectName}${c.reset} with ${templates[template].color}${templates[template].name}${c.reset} template...`);
  log('');

  // Create directories
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });

  // Write files
  fs.writeFileSync(path.join(projectDir, 'package.json'), getPackageJson(projectName, template));
  fs.writeFileSync(path.join(projectDir, 'kona.ts'), getKonaConfig(template));
  fs.writeFileSync(path.join(projectDir, 'tsconfig.json'), getTsConfig(template));
  fs.writeFileSync(path.join(projectDir, 'src/index.html'), getIndexHtml(projectName));
  fs.writeFileSync(path.join(projectDir, 'src/styles.css'), getStyles());
  fs.writeFileSync(path.join(projectDir, '.gitignore'), getGitignore());

  if (template === 'react') {
    fs.writeFileSync(path.join(projectDir, 'src/index.tsx'), getReactIndex());
    fs.writeFileSync(path.join(projectDir, 'src/App.tsx'), getReactApp());
  } else {
    fs.writeFileSync(path.join(projectDir, 'src/index.ts'), getVanillaIndex());
  }

  success('Project created!');
  log('');

  // Install dependencies
  info('Installing dependencies...');
  log('');

  try {
    execSync('npm install', { cwd: projectDir, stdio: 'inherit' });
    log('');
    success('Dependencies installed!');
  } catch {
    log('');
    info('Run `npm install` to install dependencies');
  }

  // Done
  log('');
  log(`${c.green}${c.bold}Done!${c.reset} Your project is ready.`);
  log('');
  log(`${c.dim}Next steps:${c.reset}`);
  log('');
  log(`  ${c.cyan}cd${c.reset} ${projectName}`);
  log(`  ${c.cyan}npm run dev${c.reset}`);
  log('');
  log(`${c.dim}Then open ${c.cyan}http://localhost:4444${c.reset}${c.dim} in your browser.${c.reset}`);
  log('');
}

main().catch(err => {
  error(err.message);
  process.exit(1);
});
