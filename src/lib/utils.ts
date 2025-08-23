import clipboardy from 'clipboardy';

export function copyToClipboard(text: string, disableMessage = false): void {
  try {
    clipboardy.writeSync(text);
    if (!disableMessage) {
      console.log('✅ Copied to clipboard!');
    }
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}
