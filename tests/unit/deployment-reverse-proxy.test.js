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

  it('sets security headers that keep camera and microphone usable on same origin', () => {
    expect(nginxConfig).toMatch(/add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self';/);
    expect(nginxConfig).toMatch(/connect-src 'self' wss:/);
    expect(nginxConfig).toMatch(/media-src 'self' blob:/);
    expect(nginxConfig).toMatch(/frame-ancestors 'none'/);
    expect(nginxConfig).toMatch(/add_header Permissions-Policy "camera=\(self\), microphone=\(self\),/);
    expect(nginxConfig).toMatch(/add_header Referrer-Policy "no-referrer" always;/);
    expect(deploymentDoc).toMatch(/camera` and `microphone` for `self` only/);
  });

  it('redacts room URLs in access logs and keeps request bodies out of the log format', () => {
    const safeLogFormat = /log_format video_chat_safe[\s\S]*?;/m.exec(nginxConfig)?.[0] ?? '';

    expect(nginxConfig).toMatch(/map \$uri \$video_chat_sanitized_uri \{\s*~\^\/room\/ \/room\/\[room-id-redacted\];/s);
    expect(safeLogFormat).toMatch(/log_format video_chat_safe/);
    expect(safeLogFormat).toMatch(/"\$request_method \$video_chat_sanitized_uri \$server_protocol"/);
    expect(safeLogFormat).not.toMatch(/\$request_uri|\$args|\$request_body/);
    expect(deploymentDoc).toMatch(/\/room\/\[room-id-redacted\]/);
  });

  it('keeps html fresh while caching hashed static assets', () => {
    expect(nginxConfig).toMatch(/map \$uri \$video_chat_cache_control \{/);
    expect(nginxConfig).toMatch(/~\^\/assets\/ "public, max-age=31536000, immutable";/);
    expect(nginxConfig).toMatch(/default "no-cache";/);
    expect(nginxConfig).toMatch(/add_header Cache-Control \$video_chat_cache_control always;/);
    expect(deploymentDoc).toMatch(/`index\.html` and direct `\/room\/<id>` SPA routes, gets `no-cache`/);
  });
});
