export function checkBrowserEnvironment(browser = globalThis) {
  if (!browser.isSecureContext) return { ok: false, message: 'Для звонка требуется защищённое соединение HTTPS.' };
  if (typeof browser.RTCPeerConnection !== 'function') return { ok: false, message: 'Этот браузер не поддерживает WebRTC.' };
  if (typeof browser.navigator?.mediaDevices?.getUserMedia !== 'function') return { ok: false, message: 'Этот браузер не поддерживает доступ к камере и микрофону.' };
  if (typeof browser.crypto?.randomUUID !== 'function') return { ok: false, message: 'Этот браузер не поддерживает необходимую криптографию.' };
  return { ok: true };
}
