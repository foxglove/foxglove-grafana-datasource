import type { FilterTextOp } from './operators';

export type ComparisonNode = {
  type: 'comparison';
  field: string;
  operator: FilterTextOp;
  value?: string;
};

export type SemanticNode = {
  type: 'semantic';
  text: string;
};

export type LogicNode = {
  type: 'and' | 'or';
  left: QueryNode;
  right: QueryNode;
};

export type QueryNode = ComparisonNode | SemanticNode | LogicNode;

export function isLogicNode(node: QueryNode): node is LogicNode {
  return node.type === 'and' || node.type === 'or';
}
