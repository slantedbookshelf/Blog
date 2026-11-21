export type GoImport = string | [alias: string, path: string];

export function importsBlock(imports: GoImport[]): string {
  if (!imports.length) return '';
  const lines = imports.map(item => typeof item === 'string'
    ? '\t"' + item + '"'
    : '\t' + item[0] + ' "' + item[1] + '"');
  return 'import (\n' + lines.join('\n') + '\n)\n\n';
}
