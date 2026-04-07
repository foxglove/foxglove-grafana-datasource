import React, { ChangeEvent } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { Button, IconButton, Input, Select, Stack, useStyles2 } from '@grafana/ui';

import {
  FilterNode,
  FilterLeaf,
  FilterGroup,
  FilterOp,
  LeafPredicateType,
  ensureGroup,
  newFilterLeaf,
  newFilterGroup,
} from '../types';

const MAX_DEPTH = 2;

const PREDICATE_TYPE_OPTIONS: Array<SelectableValue<LeafPredicateType>> = [
  { label: 'Device', value: 'device' },
  { label: 'Device Property', value: 'device-property' },
  { label: 'Message', value: 'message' },
  { label: 'Event', value: 'event' },
  { label: 'Recording', value: 'recording' },
];

const OP_OPTIONS: Array<SelectableValue<FilterOp>> = [
  { label: '=', value: 'eq' },
  { label: '≠', value: 'neq' },
  { label: '>', value: 'gt' },
  { label: '≥', value: 'gte' },
  { label: '<', value: 'lt' },
  { label: '≤', value: 'lte' },
  { label: 'like', value: 'like' },
];

const OPERATOR_OPTIONS: Array<SelectableValue<'and' | 'or'>> = [
  { label: 'AND', value: 'and' },
  { label: 'OR', value: 'or' },
];

// ---------------------------------------------------------------------------
// FilterEditor — top-level entry point
// ---------------------------------------------------------------------------

interface FilterEditorProps {
  filter: FilterNode;
  onChange: (filter: FilterNode) => void;
}

export function FilterEditor({ filter, onChange }: FilterEditorProps) {
  const group = ensureGroup(filter);
  return <FilterGroupEditor group={group} depth={0} onChange={onChange} />;
}

// ---------------------------------------------------------------------------
// FilterGroupEditor — AND/OR group with N children
// ---------------------------------------------------------------------------

interface FilterGroupEditorProps {
  group: FilterGroup;
  depth: number;
  onChange: (node: FilterNode) => void;
  onRemove?: () => void;
}

function FilterGroupEditor({ group, depth, onChange, onRemove }: FilterGroupEditorProps) {
  const styles = useStyles2(getStyles);
  const isNested = depth > 0;
  const canNest = depth < MAX_DEPTH;

  const updateChild = (index: number, child: FilterNode) => {
    const next = [...group.children];
    next[index] = child;
    onChange({ ...group, children: next });
  };

  const removeChild = (index: number) => {
    const next = group.children.filter((_, i) => i !== index);
    if (next.length === 0) {
      if (onRemove) {
        onRemove();
      } else {
        onChange({ ...group, children: [newFilterLeaf()] });
      }
    } else {
      onChange({ ...group, children: next });
    }
  };

  const addLeaf = () => {
    onChange({ ...group, children: [...group.children, newFilterLeaf()] });
  };

  const addGroup = () => {
    onChange({ ...group, children: [...group.children, newFilterGroup()] });
  };

  const onOperatorChange = (opt: SelectableValue<'and' | 'or'>) => {
    if (opt.value) {
      onChange({ ...group, operator: opt.value });
    }
  };

  return (
    <div className={isNested ? styles.nestedGroup : styles.rootGroup}>
      <Stack direction="row" gap={1} alignItems="center">
        <Select
          options={OPERATOR_OPTIONS}
          value={group.operator}
          onChange={onOperatorChange}
          width={10}
        />
        {onRemove && (
          <IconButton name="times" size="sm" tooltip="Remove group" onClick={onRemove} />
        )}
      </Stack>

      <div className={styles.children}>
        {group.children.map((child, i) => (
          <FilterNodeEditor
            key={i}
            node={child}
            depth={depth}
            onChange={(n) => updateChild(i, n)}
            onRemove={() => removeChild(i)}
          />
        ))}
      </div>

      <Stack direction="row" gap={1}>
        <Button variant="secondary" size="sm" icon="plus" onClick={addLeaf}>
          Condition
        </Button>
        {canNest && (
          <Button variant="secondary" size="sm" icon="plus" onClick={addGroup}>
            Group
          </Button>
        )}
      </Stack>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterNodeEditor — dispatches to group or leaf
// ---------------------------------------------------------------------------

interface FilterNodeEditorProps {
  node: FilterNode;
  depth: number;
  onChange: (node: FilterNode) => void;
  onRemove: () => void;
}

function FilterNodeEditor({ node, depth, onChange, onRemove }: FilterNodeEditorProps) {
  if (node.kind === 'group') {
    return (
      <FilterGroupEditor
        group={node}
        depth={depth + 1}
        onChange={onChange}
        onRemove={onRemove}
      />
    );
  }
  return <FilterLeafEditor leaf={node} onChange={onChange} onRemove={onRemove} />;
}

// ---------------------------------------------------------------------------
// FilterLeafEditor — single predicate row
// ---------------------------------------------------------------------------

interface FilterLeafEditorProps {
  leaf: FilterLeaf;
  onChange: (node: FilterNode) => void;
  onRemove: () => void;
}

function FilterLeafEditor({ leaf, onChange, onRemove }: FilterLeafEditorProps) {
  const styles = useStyles2(getStyles);

  const onTypeChange = (opt: SelectableValue<LeafPredicateType>) => {
    if (opt.value) {
      onChange({
        ...leaf,
        predicateType: opt.value,
        topic: opt.value === 'message' ? leaf.topic : '',
      });
    }
  };

  const onOpChange = (opt: SelectableValue<FilterOp>) => {
    if (opt.value) {
      onChange({ ...leaf, op: opt.value });
    }
  };

  const onFieldChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...leaf, field: e.target.value });
  };

  const onTopicChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...leaf, topic: e.target.value });
  };

  const onValueChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...leaf, value: e.target.value });
  };

  return (
    <div className={styles.leafRow}>
      <Select
        options={PREDICATE_TYPE_OPTIONS}
        value={leaf.predicateType}
        onChange={onTypeChange}
        width={18}
      />
      {leaf.predicateType === 'message' && (
        <Input
          value={leaf.topic}
          onChange={onTopicChange}
          placeholder="/topic"
          width={14}
        />
      )}
      <Input
        value={leaf.field}
        onChange={onFieldChange}
        placeholder="field"
        width={14}
      />
      <Select
        options={OP_OPTIONS}
        value={leaf.op}
        onChange={onOpChange}
        width={10}
      />
      <Input
        value={leaf.value}
        onChange={onValueChange}
        placeholder="value"
        width={16}
      />
      <IconButton name="times" size="sm" tooltip="Remove condition" onClick={onRemove} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const getStyles = (theme: GrafanaTheme2) => ({
  rootGroup: css({
    display: 'flex',
    flexDirection: 'column' as const,
    gap: theme.spacing(0.5),
  }),
  nestedGroup: css({
    display: 'flex',
    flexDirection: 'column' as const,
    gap: theme.spacing(0.5),
    borderLeft: `2px solid ${theme.colors.primary.border}`,
    background: theme.colors.background.secondary,
    borderRadius: theme.shape.radius.default,
    padding: theme.spacing(1),
    marginTop: theme.spacing(0.25),
    marginBottom: theme.spacing(0.25),
  }),
  children: css({
    display: 'flex',
    flexDirection: 'column' as const,
    gap: theme.spacing(0.5),
  }),
  leafRow: css({
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: theme.spacing(0.5),
    flexWrap: 'wrap' as const,
  }),
});
