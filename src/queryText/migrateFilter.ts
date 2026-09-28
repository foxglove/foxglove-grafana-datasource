import type { FilterLeaf, FilterNode, FilterOp } from '../types';

import { wireFieldToText } from './entityFields';
import { lex } from './lexer';
import { OPERATOR_TO_TEXT } from './operators';

/**
 * Render a condition tree from the previous filter editor as filter text.
 * Leaves with an empty value are omitted. An empty tree renders as no filter.
 */
export function filterNodeToText(node: FilterNode | undefined): string {
  return nodeToText(node) ?? '';
}

function nodeToText(node: FilterNode | undefined, parent?: 'and' | 'or'): string | undefined {
  if (node === undefined || node === null) {
    return undefined;
  }
  if (node.kind === 'leaf') {
    return leafToText(node);
  }
  const parts: string[] = [];
  for (const child of node.children) {
    const text = nodeToText(child, node.operator);
    if (text !== undefined) {
      parts.push(text);
    }
  }
  if (parts.length === 0) {
    return undefined;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  const joiner = node.operator === 'or' ? ' OR ' : ' AND ';
  const text = parts.join(joiner);
  if (parent !== undefined && parent !== node.operator) {
    return `(${text})`;
  }
  return text;
}

function leafToText(leaf: FilterLeaf): string | undefined {
  if (leaf.value === '') {
    return undefined;
  }
  const field =
    leaf.predicateType === 'message' ? leaf.messagePath : wireFieldToText(`${leaf.predicateType}.${leaf.field}`);
  return `${formatToken(field)} ${OPERATOR_TO_TEXT[leaf.op]} ${formatValue(leaf.op, leaf.value)}`;
}

function formatValue(op: FilterOp, value: string): string {
  if (op === 'in') {
    const parts = value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '');
    return formatToken(parts.join(','));
  }
  return formatToken(value);
}

function formatToken(value: string): string {
  if (value === '' || !lexesAsSingleWord(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

function lexesAsSingleWord(value: string): boolean {
  try {
    const tokens = lex(value);
    return tokens.length === 1 && tokens[0]!.type === 'word' && tokens[0]!.text === value;
  } catch {
    return false;
  }
}
