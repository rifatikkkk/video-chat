export async function copyInvitation(clipboard, url) {
  if (!clipboard?.writeText) throw new Error('Clipboard API is unavailable.');
  await clipboard.writeText(url);
}
