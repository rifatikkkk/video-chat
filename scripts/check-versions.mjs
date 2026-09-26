import { readFileSync } from 'node:fs';

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

const root = readJson('../package.json');
const client = readJson('../client/package.json');
const server = readJson('../server/package.json');
const shared = readJson('../shared/package.json');
const expectedVersion = root.version;
const packages = { root, client, server, shared };

for (const [name, packageJson] of Object.entries(packages)) {
  if (packageJson.version !== expectedVersion) {
    throw new Error(`${name} version ${packageJson.version} does not match root version ${expectedVersion}.`);
  }
}

for (const [name, packageJson] of Object.entries({ client, server })) {
  const sharedVersion = packageJson.dependencies?.['@video-chat/shared'];
  if (sharedVersion !== shared.version) {
    throw new Error(`${name} depends on @video-chat/shared ${sharedVersion}, expected ${shared.version}.`);
  }
}

console.log(`Workspace versions are aligned at ${expectedVersion}.`);
