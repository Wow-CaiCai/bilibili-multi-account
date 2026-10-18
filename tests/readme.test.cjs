const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const renderer = import('../scripts/build-readme.mjs');
const options = { repository: 'owner/project', ref: 'abc123' };

test('publication README converts inline, reference and HTML image URLs', async () => {
  const { renderReadme } = await renderer;
  const images = [];
  const output = renderReadme(
    [
      '![Panel](./docs/images/panel.png "Panel screenshot")',
      '![Phone][phone]',
      '',
      '[phone]: docs/images/phone.png',
      '',
      '<img src="docs/images/small.png" width="300" alt="Small">',
    ].join('\n'),
    { ...options, onLocalImage: (value) => images.push(value) },
  );
  for (const image of ['panel', 'phone', 'small']) {
    assert.ok(
      output.includes(
        `https://raw.githubusercontent.com/owner/project/abc123/docs/images/${image}.png`,
      ),
    );
  }
  assert.deepEqual(images.sort(), [
    'docs/images/panel.png',
    'docs/images/phone.png',
    'docs/images/small.png',
  ]);
  assert.match(output, /width="300"/);
});

test('publication README preserves code examples, remote images and GFM tables', async () => {
  const { renderReadme } = await renderer;
  const source = [
    '```markdown',
    '![Example](docs/images/local.png)',
    '```',
    '',
    '`![Inline example](docs/images/local.png)`',
    '',
    '![Remote](https://example.com/image.png)',
    '',
    '| Feature | Status |',
    '| --- | --- |',
    '| Preview | Ready |',
  ].join('\n');
  const output = renderReadme(source, {
    ...options,
    onLocalImage: () => assert.fail('Code is not an image dependency'),
  });
  assert.ok(output.includes('![Example](docs/images/local.png)'));
  assert.ok(output.includes('![Inline example](docs/images/local.png)'));
  assert.ok(output.includes('https://example.com/image.png'));
  assert.match(output, /\| Feature\s+\| Status/);
});

test('publication README converts repository links while retaining page anchors', async () => {
  const { renderReadme } = await renderer;
  const output = renderReadme('[Guide](./docs/guide.md#install) [Top](#top)', options);
  assert.ok(output.includes('https://github.com/owner/project/blob/abc123/docs/guide.md#install'));
  assert.ok(output.includes('[Top](#top)'));
});

test('publication README encodes filenames and branch names in public URLs', async () => {
  const { renderReadme } = await renderer;
  const output = renderReadme('![Panel](<docs/images/账号 界面.png>)', {
    ...options,
    ref: 'docs/screenshots',
  });
  assert.ok(
    output.includes('/docs%2Fscreenshots/docs/images/%E8%B4%A6%E5%8F%B7%20%E7%95%8C%E9%9D%A2.png'),
  );
});

test('publication README rejects computer paths and repository traversal', async () => {
  const { renderReadme } = await renderer;
  assert.throws(
    () => renderReadme('![Bad](file:///C:/Users/image.png)', options),
    /filesystem path/,
  );
  assert.throws(() => renderReadme('![Bad](C:/Users/image.png)', options), /filesystem path/);
  assert.throws(() => renderReadme('![Bad](../outside.png)', options), /escapes the repository/);
});

test('real project README can be published without altering the maintained document', async () => {
  const { renderReadme } = await renderer;
  const filename = path.resolve(__dirname, '../README.md');
  const source = fs.readFileSync(filename, 'utf8');
  const images = [];
  const output = renderReadme(source, {
    ...options,
    onLocalImage: (image) => images.push(image),
  });
  assert.match(output, /^# Bilibili Multi-Account/);
  assert.ok(images.length > 0, 'Project README includes screenshots');
  for (const image of images) {
    assert.ok(fs.statSync(path.resolve(__dirname, '..', image)).isFile());
    assert.ok(output.includes(`https://raw.githubusercontent.com/owner/project/abc123/${image}`));
  }
  assert.equal(fs.readFileSync(filename, 'utf8'), source);
});
