export function mediaErrorMessage(errorName, kind) {
  if (!errorName) return '';
  if (errorName === 'NotAllowedError') return `Разрешите доступ к ${kind === 'audio' ? 'микрофону' : 'камере'} в настройках браузера.`;
  if (errorName === 'NotFoundError') return `${kind === 'audio' ? 'Микрофон' : 'Камера'} не найдены. Подключите устройство и включите его вручную.`;
  if (errorName === 'NotReadableError') return `Не удалось использовать ${kind === 'audio' ? 'микрофон' : 'камеру'}. Проверьте другие приложения и настройки ОС.`;
  if (errorName === 'DEVICE_ENDED') return `${kind === 'audio' ? 'Микрофон' : 'Камера'} отключены. Включите устройство вручную.`;
  return `Не удалось включить ${kind === 'audio' ? 'микрофон' : 'камеру'}. Попробуйте ещё раз вручную.`;
}
