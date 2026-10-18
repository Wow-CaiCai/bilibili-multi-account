import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';

const root = fileURLToPath(new URL('../', import.meta.url));

// Parse Markdown so examples in code blocks stay untouched and reference-style
// images, escaped characters, tables and HTML images are handled intentionally.
export function renderReadme(markdown, { repository, ref, onLocalImage = () => {} }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid GitHub repository');
  if (!ref) throw new Error('A GitHub ref is required');
  const repoUrl = `https://github.com/${repository}`;
  const rawUrl = `https://raw.githubusercontent.com/${repository}/${encodeURIComponent(ref)}`;
  const webUrl = `${repoUrl}/blob/${encodeURIComponent(ref)}`;

  function convert(url, image) {
    if (/^(?:[a-z]:[\\/]|file:|\\\\)/i.test(url)) {
      throw new Error(`Replace local filesystem path with a repository-relative path: ${url}`);
    }
    if (!url || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) return url;
    const match = /^([^?#]*)([\s\S]*)$/.exec(url);
    const decoded = decodeURIComponent(match[1]).replace(/\\/g, '/');
    // Treat /docs/... as repository-root paths as well as ./docs/... .
    const relative = decoded.replace(/^\/+/, '');
    const normalized = path.posix.normalize(relative);
    if (normalized === '..' || normalized.startsWith('../')) {
      throw new Error(`README path escapes the repository: ${url}`);
    }
    if (image) onLocalImage(normalized);
    const encoded = normalized.split('/').map(encodeURIComponent).join('/');
    return `${image ? rawUrl : webUrl}/${encoded}${match[2]}`;
  }

  const processor = remark()
    .use(remarkGfm)
    .use(() => (tree) => {
      const imageReferences = new Set();
      const linkReferences = new Set();
      function walk(node, callback) {
        callback(node);
        for (const child of node.children || []) walk(child, callback);
      }
      walk(tree, (node) => {
        if (node.type === 'imageReference') imageReferences.add(node.identifier);
        if (node.type === 'linkReference') linkReferences.add(node.identifier);
      });
      walk(tree, (node) => {
        if (node.type === 'image') node.url = convert(node.url, true);
        if (node.type === 'link') node.url = convert(node.url, false);
        if (node.type === 'definition') {
          if (imageReferences.has(node.identifier)) node.url = convert(node.url, true);
          else if (linkReferences.has(node.identifier)) node.url = convert(node.url, false);
        }
        if (node.type === 'html') {
          node.value = node.value.replace(
            /(<img\b[^>]*?\bsrc\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi,
            (_match, prefix, double, single, bare) =>
              `${prefix}"${convert(double ?? single ?? bare, true)}"`,
          );
        }
      });
    });
  return processor.processSync(markdown).toString();
}

export async function buildReadme() {
  const source = await readFile(path.join(root, 'README.md'), 'utf8');
  const images = new Set();
  const content = renderReadme(source, {
    repository: process.env.GITHUB_REPOSITORY || 'Wow-CaiCai/bilibili-multi-account',
    ref: process.env.README_REF || process.env.GITHUB_SHA || 'main',
    onLocalImage: (image) => images.add(image),
  });
  for (const image of images) {
    const filename = path.resolve(root, image);
    const relative = path.relative(root, filename);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Image path escapes the repository: ${image}`);
    }
    if (!(await stat(filename)).isFile()) throw new Error(`Image is not a file: ${image}`);
  }
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist/README.md'), content);
  console.log('Built dist/README.md with public image URLs');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await buildReadme();
}
