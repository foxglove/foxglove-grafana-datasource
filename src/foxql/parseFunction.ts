type ParsedFoxqlFunction = { name: string; operand?: number; operandRaw?: string };
const FUNCTION_WITH_ARG_PATTERN = /^([a-zA-Z0-9_-]+)(?:\((.*)\))?$/;

export function parseFunction(pathFunction: string): ParsedFoxqlFunction | undefined {
  if (pathFunction.length === 0) {
    return undefined;
  }
  const match = FUNCTION_WITH_ARG_PATTERN.exec(pathFunction);
  if (!match) {
    return { name: pathFunction };
  }
  const name = match[1] ?? "";
  if (!name) {
    return undefined;
  }
  const raw = match[2];
  if (raw === undefined || raw.length === 0) {
    return { name };
  }
  const unquoted = raw.replace(/^["'](.*)["']$/s, "$1");
  const asNumber = Number(unquoted);
  return Number.isNaN(asNumber)
    ? { name, operandRaw: unquoted }
    : { name, operand: asNumber, operandRaw: unquoted };
}
