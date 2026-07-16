const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');

const pngToIco = pngToIcoModule.default || pngToIcoModule;
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'assets', 'icon.svg');
const pngPath = path.join(root, 'assets', 'icon.png');
const icoPath = path.join(root, 'assets', 'icon.ico');

async function generate() {
  const svg = await fs.readFile(source);
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await Promise.all(sizes.map((size) => sharp(svg)
    .resize(size, size)
    .png()
    .toBuffer()));
  // icon.png 供 electron-builder 生成 macOS 的 icns，至少需要 512px。
  await fs.writeFile(pngPath, await sharp(svg).resize(1024, 1024).png().toBuffer());
  await fs.writeFile(icoPath, await pngToIco(images));
  process.stdout.write(`Generated ${path.relative(root, icoPath)}\n`);
}

generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
