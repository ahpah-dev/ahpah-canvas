import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyProjectChanges, buildProjectPreview, createChangeSet, createProjectZip, createStarterProject, diffProjectFiles, importSourceFiles, inverseProjectChanges, MAX_FILE_BYTES, MAX_PROJECT_FILES, normalizeProjectPath, projectByteSize, shouldImportSourcePath, validateChangeSet, validateEngineeringProject, validateProjectFiles } from '../src/utils/projectFiles.ts';

test('starter is an actual editable project with separate HTML, CSS, and JavaScript files', () => {
  const project = createStarterProject();
  assert.equal(project.schema, 1);
  assert.deepEqual(project.files.map(file => file.path), ['index.html', 'styles.css', 'script.js']);
  assert.match(project.files.find(file => file.path === 'script.js')!.content, /addEventListener/);
  assert.equal(validateEngineeringProject(project).id, project.id);
});

test('relative source paths reject traversal, private files, dependencies, and Windows invalid names', () => {
  assert.equal(normalizeProjectPath('./src\\app.js'), 'src/app.js');
  for (const path of ['../outside.js', '/root.js', 'C:\\a.js', 'src//a.js', 'src/../a.js', '.git/config', 'node_modules/a.js', '.env', '.env.local', 'src/private.key', '.npmrc', '.pypirc', '.yarnrc', '.yarnrc.yml', '.netrc', '.git-credentials', 'credentials.json', '.aws/credentials', '.ssh/id_rsa', 'CON', 'con.js', 'src/NUL.txt', 'file.', 'folder /file.js', 'file?.js', 'file*.js', 'file<name>.js', 'a|b.js', 'bad\nfile.js'])
    assert.throws(() => normalizeProjectPath(path), undefined, path);
  assert.throws(() => validateProjectFiles([{ path: '.env', content: 'SECRET=value' }]));
  for (const name of ['.yarnrc', '.yarnrc.yml', '.netrc', '.git-credentials']) assert.equal(shouldImportSourcePath(`project/${name}`), false);
  for (const path of ['quote"name.js', '.ahpah-projects/source.js', 'src/.AhPaH-cache/file.js', '.ahpah-hidden.js', 'dist/app.js', 'build/app.js', 'coverage/report.json', '.next/cache.js', '.cache/source.js'])
    assert.throws(() => normalizeProjectPath(path), undefined, path);
  for (const path of ['.ahpah-projects/source.js', 'src/.AhPaH-cache/file.js', 'dist/app.js', 'build/app.js', 'coverage/report.json', '.next/cache.js', '.cache/source.js'])
    assert.equal(shouldImportSourcePath(path), false, path);
});

test('source validation rejects duplicate casing, NUL binaries, and oversized source files', () => {
  assert.throws(() => validateProjectFiles([{ path: 'App.js', content: '' }, { path: 'app.js', content: '' }]), /Duplicate/);
  assert.throws(() => validateProjectFiles([{ path: 'file.js', content: 'text\0binary' }]), /binary/);
  assert.throws(() => validateProjectFiles([{ path: 'file.js', content: 'a'.repeat(MAX_FILE_BYTES + 1) }]), /256 KB/);
  assert.throws(() => validateProjectFiles(Array.from({ length: MAX_PROJECT_FILES + 1 }, (_, index) => ({ path: `file-${index}.js`, content: '' }))), /200/);
  assert.equal(projectByteSize([{ path: 'text.txt', content: 'π' }]), 2);
});

test('review applies add, edit, and delete atomically and detects concurrent edits', () => {
  const project = { ...createStarterProject(), files: [{ path: 'app.js', content: 'original' }, { path: 'old.js', content: 'remove' }] };
  const nextFiles = [{ path: 'app.js', content: 'updated' }, { path: 'new.js', content: 'new' }];
  const changes = diffProjectFiles(project.files, nextFiles);
  assert.equal(changes.length, 3);
  const next = applyProjectChanges(project, changes);
  assert.deepEqual(next.files, nextFiles);
  assert.equal(next.revision, project.revision + 1);
  assert.deepEqual(applyProjectChanges(next, inverseProjectChanges(changes)).files, project.files);
  const edited = { ...project, files: [{ path: 'app.js', content: 'manual edit' }, project.files[1]] };
  assert.throws(() => applyProjectChanges(edited, changes), /changed since/);
  assert.deepEqual(edited.files, [{ path: 'app.js', content: 'manual edit' }, project.files[1]]);
});

test('review rejects overwrite of newly created paths and undo refuses newer edits', () => {
  const project = { ...createStarterProject(), files: [] };
  const change = { path: 'new.js', before: null, after: 'agent-created' };
  const accepted = applyProjectChanges(project, [change]);
  assert.throws(() => applyProjectChanges(accepted, [change]), /changed since/);
  const edited = applyProjectChanges(accepted, [{ path: 'new.js', before: 'agent-created', after: 'user update' }]);
  assert.throws(() => applyProjectChanges(edited, inverseProjectChanges([change])), /changed since/);
});

test('saved reviews whitelist fields, validate full content, and keep recoverable proposals', () => {
  const project = { ...createStarterProject(), files: [{ path: 'app.js', content: 'before' }] };
  const changes = createChangeSet(project, [{ path: 'app.js', content: 'after' }], 'Build the project');
  const parsed = validateChangeSet({ ...changes, apiKey: 'private', arbitrary: true });
  assert.equal(parsed.changes[0].before, 'before');
  assert.equal('apiKey' in parsed, false);
  assert.throws(() => validateChangeSet({ ...changes, changes: [{ path: '.env', before: null, after: 'secret' }] }));
});

test('folder import strips the root, skips binaries/private/generated files, and reports every skip', async () => {
  const source = (name: string, path: string, content: BlobPart) => {
    const file = new File([content], name);
    Object.defineProperty(file, 'webkitRelativePath', { value: path });
    return file;
  };
  let skipped: { path: string; reason: string }[] = [];
  const files = await importSourceFiles([
    source('app.js', 'project/src/app.js', 'console.log("real source");'),
    source('icon.svg', 'project/public/icon.svg', '<svg></svg>'),
    source('icon.png', 'project/public/icon.png', new Uint8Array([137, 80, 78, 71])),
    source('private.bin', 'project/public/private.bin', new Uint8Array([0xff, 0xfe, 0])),
    source('.env', 'project/.env', 'SECRET=private'),
    source('dependency.js', 'project/node_modules/dependency.js', 'dependency'),
  ], true, report => { skipped = report; });
  assert.deepEqual(files.map(file => file.path), ['public/icon.svg', 'src/app.js']);
  assert.equal(skipped.length, 4);
  assert.ok(skipped.some(file => file.reason.includes('non-UTF-8')));
  assert.equal(shouldImportSourcePath('src/favicon.ico'), false);
  assert.equal(shouldImportSourcePath('public/icon.svg'), true);
  assert.equal(shouldImportSourcePath('src/app.tsx'), true);
});

test('ZIP export includes valid STORE local and central records with UTF-8 file names', () => {
  const files = [{ path: 'src/hello.js', content: 'hello' }, { path: 'π.txt', content: 'π' }];
  const zip = createProjectZip(files);
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(6, true), 0x800);
  const nameLength = view.getUint16(26, true);
  const dataLength = view.getUint32(18, true);
  assert.equal(new TextDecoder().decode(zip.slice(30, 30 + nameLength)), 'src/hello.js');
  assert.equal(new TextDecoder().decode(zip.slice(30 + nameLength, 30 + nameLength + dataLength)), 'hello');
  const footer = zip.byteLength - 22;
  assert.equal(view.getUint32(footer, true), 0x06054b50);
  assert.equal(view.getUint16(footer + 10, true), 2);
  assert.equal(view.getUint32(view.getUint32(footer + 16, true), true), 0x02014b50);
});

test('HTML preview inlines nested CSS and classic JavaScript without exposing the parent origin', () => {
  const preview = buildProjectPreview([
    { path: 'pages/index.html', content: '<html><head><link rel="stylesheet" href="../styles/main.css"></head><body><script src="../scripts/app.js"></script></body></html>' },
    { path: 'styles/main.css', content: '@import "./colors.css"; body { background: var(--color); }' },
    { path: 'styles/colors.css', content: ':root { --color: red; }' },
    { path: 'scripts/app.js', content: 'document.body.dataset.loaded="real";' },
  ], 'pages/index.html', 'test-channel');
  assert.deepEqual(preview.issues, []);
  assert.match(preview.html, /--color: red/);
  assert.match(preview.html, /document.body.dataset.loaded/);
  assert.match(preview.html, /test-channel/);
  assert.match(preview.html, /unhandledrejection/);
  assert.match(preview.html, /base-uri/);
  assert.doesNotMatch(preview.html, /allow-same-origin/);
});

test('HTML module preview resolves relative JavaScript imports through project data URLs', () => {
  const preview = buildProjectPreview([
    { path: 'index.html', content: '<script type="module" src="./src/app.js"></script>' },
    { path: 'src/app.js', content: 'import { answer } from "./value.js"; document.body.textContent=answer;' },
    { path: 'src/value.js', content: 'export const answer=42;' },
  ]);
  assert.deepEqual(preview.issues, []);
  assert.match(preview.html, /type="importmap"/);
  assert.match(preview.html, /ahpah-project\/src\/app.js/);
  assert.ok(preview.html.includes(encodeURIComponent('ahpah-project/src/value.js')));
});

test('preview reports missing dependencies and circular CSS imports', () => {
  const preview = buildProjectPreview([
    { path: 'index.html', content: '<head><link rel="stylesheet" href="loop.css"></head><script src="missing.js"></script>' },
    { path: 'loop.css', content: '@import "loop.css";' },
  ]);
  assert.ok(preview.issues.some(issue => issue.includes('Circular')));
  assert.ok(preview.issues.some(issue => issue.includes('Missing script')));
  assert.equal(buildProjectPreview([], 'index.html').html, '');
});
