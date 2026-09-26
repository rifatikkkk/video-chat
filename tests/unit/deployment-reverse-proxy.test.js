import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const nginxConfig = readFileSync(new URL('../../deploy/nginx/video-chat.conf', import.meta.url), 'utf8');
const deploymentDoc = readFileSync(new URL('../../docs/deployment-reverse-proxy.md', import.meta.url), 'utf8');

describe('HTTPS reverse proxy deployment config', () => {
  it('keeps Socket.IO and operational endpoints out of the SPA fallback', () => {
    expect(nginxConfig).toMatch(/location \/socket\.io\/\s*\{/);
    expect(nginxConfig).toMatch(/proxy_set_header Upgrade \$http_upgrade;/);
    expect(nginxConfig).toMatch(/proxy_read_timeout 60s;/);
    expect(nginxConfig).toMatch(/location = \/healthz\s*\{/);
    expect(nginxConfig).toMatch(/location = \/readyz\s*\{/);
    expect(nginxConfig).toMatch(/location = \/metrics\s*\{/);
    expect(nginxConfig).toMatch(/location \/\s*\{\s*try_files \$uri \$uri\/ \/index\.html;/s);
  });

  it('documents same-origin HTTPS deployment with exactly one Node.js process', () => {
    expect(deploymentDoc).toMatch(/one HTTPS reverse proxy/i);
    expect(deploymentDoc).toMatch(/exactly one Node\.js process/i);
    expect(deploymentDoc).toMatch(/Do not run a second replica/i);
    expect(deploymentDoc).toMatch(/PUBLIC_ORIGIN/);
    expect(deploymentDoc).toMatch(/\/room\/abc123/);
  });
});
