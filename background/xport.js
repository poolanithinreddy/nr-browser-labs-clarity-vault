// Export helpers

/**
 * @param {import('../common/storage.js').Clip[]} clips
 */
export function toMarkdown(clips) {
  const lines = ['# Clarity Vault Export', '', `Exported: ${new Date().toISOString()}`, ''];
  for (const c of clips) {
    lines.push(`## ${escapeMd(c.sourceTitle || c.domain)} — ${new Date(c.createdAt).toLocaleString()}`);
    lines.push('');
    if (c.sourceUrl) lines.push(`Source: ${c.sourceUrl}`);
    if (c.tags?.length) lines.push(`Tags: ${c.tags.map(t=>`#${t}`).join(' ')}`);
    lines.push('');
    lines.push(c.text);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

function escapeMd(str) {
  return (str || '').replace(/[\\`*_{}\[\]()#+\-.!]/g, '\\$&');
}
