// One command from a Mac: fetch the original data, convert it, build and deploy.
//
//   npm run release
//
// The private data repo is looked for next to this repo and in the home folder, and cloned
// next to this repo when it is in neither place. Later runs just pull it.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NAME = 'taebo-games-fortress2blue-assets';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

const candidates = [path.resolve(root, '..', NAME), path.join(os.homedir(), NAME)];
let assets = candidates.find((dir) => fs.existsSync(path.join(dir, '.git')));
if (assets) {
  console.log(`\n▶ 원본 데이터 최신으로 받기: ${assets}`);
  run('git pull --ff-only origin main', assets);
} else {
  assets = candidates[0];
  console.log(`\n▶ 원본 데이터 받기: ${assets}`);
  run(`git clone https://github.com/ceaser501/${NAME}.git "${assets}"`);
}

console.log('\n▶ 변환');
run(`node fortress/tools/convert-assets.mjs "${assets}"`);
console.log('\n▶ 빌드');
run('npx webpack --config webpack.config.prod.js');
console.log('\n▶ 배포');
run('npm run deploy');
