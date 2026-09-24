import React, { useMemo, useRef, useState } from 'react';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { IconButton, useStyles2 } from '@grafana/ui';

import { errorTokenRange, type ParseError } from '../queryText/parser';
import { highlightQuery } from '../queryText/highlight';
import { analyzeParens, groupBandParts, matchParenAt } from '../queryText/structure';

const PLACEHOLDER = '@device.name == husky and /imu.x > 1';

type Insert = {
  label: string;
  insertText: string;
  example: string;
  description: string;
};

const FIELD_INSERTS: Insert[] = [
  {
    label: 'Device',
    insertText: '@device.',
    example: '@device.name like husky',
    description: 'Filter by device fields',
  },
  {
    label: 'Event',
    insertText: '@event.',
    example: '@event.eventTypeId == collision',
    description: 'Filter by event fields',
  },
  {
    label: 'Recording',
    insertText: '@recording.',
    example: '@recording.path like /field',
    description: 'Filter by recording fields',
  },
  {
    label: 'Episode',
    insertText: '@episode.',
    example: '@episode.metadata.label == dock',
    description: 'Filter by episode ID or metadata',
  },
  {
    label: 'Session',
    insertText: '@session.',
    example: '@session.key == abc123',
    description: 'Filter by session fields',
  },
];

const MODE_ROWS: Array<Omit<Insert, 'insertText'>> = [
  {
    label: 'Message',
    example: '/diagnostics.level > 1',
    description: 'Match a value along an expression',
  },
  {
    label: 'Topic',
    example: '/camera/image exists',
    description: 'Match data from recordings that contain a topic',
  },
];

interface FilterTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: ParseError;
}

export function FilterTextEditor({ value, onChange, onBlur, error }: FilterTextEditorProps) {
  const styles = useStyles2(getStyles);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState(0);

  const segments = useMemo(() => highlightQuery(value), [value]);
  const parens = useMemo(() => analyzeParens(value), [value]);
  const bands = useMemo(() => groupBandParts(value, parens.groups), [value, parens.groups]);
  const unbalanced = useMemo(() => new Set(parens.unbalanced), [parens.unbalanced]);
  const matched = useMemo(() => {
    if (!focused) {
      return undefined;
    }
    const pair = matchParenAt(parens.groups, caret);
    return pair === undefined ? undefined : new Set(pair);
  }, [focused, parens.groups, caret]);
  const segmentOffsets = useMemo(() => {
    const offsets: number[] = [];
    let cursor = 0;
    for (const segment of segments) {
      offsets.push(cursor);
      cursor += segment.text.length;
    }
    return offsets;
  }, [segments]);
  const errorRange = error === undefined ? undefined : errorTokenRange(value, error.index);

  const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollLeft, scrollTop } = event.currentTarget;
    for (const overlay of [bandRef.current, colorRef.current, errorRef.current]) {
      if (overlay) {
        overlay.scrollLeft = scrollLeft;
        overlay.scrollTop = scrollTop;
      }
    }
  };

  const syncCaret = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCaret(event.currentTarget.selectionStart ?? 0);
  };

  const insert = (insertText: string) => {
    const caretAt = inputRef.current?.selectionStart ?? value.length;
    const next = insertAt(value, caretAt, insertText);
    onChange(next.value);
    setHelpOpen(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  return (
    <div className={styles.root}>
      <div className={cx(styles.field, error && styles.fieldInvalid)}>
        <div className={styles.editor}>
          {bands && (
            <div ref={bandRef} className={styles.overlay} aria-hidden>
              {bands.map((part, index) => {
                if (part.depth === 0) {
                  return <span key={index}>{part.text}</span>;
                }
                const previous = bands[index - 1];
                const next = bands[index + 1];
                const isStart = previous === undefined || previous.depth === 0;
                const isEnd = next === undefined || next.depth === 0;
                return (
                  <span
                    key={index}
                    className={cx(
                      styles.band,
                      (part.depth - 1) % 2 === 0 ? styles.bandA : styles.bandB,
                      isStart && styles.bandStart,
                      isEnd && styles.bandEnd
                    )}
                  >
                    {part.text}
                  </span>
                );
              })}
            </div>
          )}
          {value !== '' && (
            <div ref={colorRef} className={cx(styles.overlay, styles.syntax)} aria-hidden>
              {segments.map((segment, index) => {
                const start = segmentOffsets[index] ?? 0;
                const isParen = segment.kind === 'paren';
                return (
                  <span
                    key={index}
                    className={cx(
                      segment.kind === 'operator' && styles.tokenOperator,
                      segment.kind === 'logic' && styles.tokenLogic,
                      segment.kind === 'paren' && styles.tokenParen,
                      isParen && unbalanced.has(start) && styles.tokenParenUnmatched,
                      isParen && matched?.has(start) === true && styles.tokenParenMatch
                    )}
                  >
                    {segment.text}
                  </span>
                );
              })}
            </div>
          )}
          {errorRange && errorRange.end > errorRange.start && (
            <div ref={errorRef} className={styles.overlay} aria-hidden>
              <span>{value.slice(0, errorRange.start)}</span>
              <span className={styles.squiggle}>{value.slice(errorRange.start, errorRange.end)}</span>
              <span>{value.slice(errorRange.end)}</span>
            </div>
          )}
          <textarea
            ref={inputRef}
            className={cx(styles.input, value !== '' && styles.inputTransparent)}
            value={value}
            placeholder={PLACEHOLDER}
            aria-label="Filter"
            aria-invalid={error !== undefined}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            rows={2}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => {
              setFocused(false);
              onBlur();
            }}
            onFocus={() => setFocused(true)}
            onScroll={syncScroll}
            onSelect={syncCaret}
            onKeyUp={syncCaret}
            onMouseUp={syncCaret}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === '/') {
                event.preventDefault();
                setHelpOpen((open) => !open);
              }
            }}
          />
        </div>
        <IconButton
          name="question-circle"
          tooltip="Filter syntax"
          aria-label="Filter syntax"
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen((open) => !open)}
        />
      </div>
      {helpOpen && (
        <div className={styles.help} role="dialog" aria-label="Filter syntax">
          <div className={styles.helpHeader}>
            <span className={styles.helpTitle}>Refine your search</span>
            <IconButton
              name="times"
              tooltip="Close"
              aria-label="Close filter syntax"
              onClick={() => setHelpOpen(false)}
            />
          </div>
          <div className={styles.grid}>
            <span className={styles.section}>Refine by</span>
            {FIELD_INSERTS.map((row) => (
              <React.Fragment key={row.insertText}>
                <button type="button" className={styles.chip} onClick={() => insert(row.insertText)}>
                  {row.label}
                </button>
                <code className={styles.example}>{row.example}</code>
                <span>{row.description}</span>
              </React.Fragment>
            ))}
            <span className={styles.section}>Search by</span>
            {MODE_ROWS.map((row) => (
              <React.Fragment key={row.label}>
                <span className={styles.mode}>{row.label}</span>
                <code className={styles.example}>{row.example}</code>
                <span>{row.description}</span>
              </React.Fragment>
            ))}
          </div>
          <p className={styles.note}>
            Join conditions with <code>and</code> and <code>or</code>. <code>and</code> binds tighter; use parentheses
            to group. <code>in</code> matches a comma-separated list, for example <code>@device.name in a,b</code>.
          </p>
        </div>
      )}
    </div>
  );
}

function insertAt(value: string, caret: number, insertText: string): { value: string; caret: number } {
  const bounded = Math.max(0, Math.min(caret, value.length));
  const before = value.slice(0, bounded);
  const after = value.slice(bounded);
  const needsSpace = before.length > 0 && !/\s$/.test(before);
  const text = `${needsSpace ? ' ' : ''}${insertText}`;
  return { value: `${before}${text}${after}`, caret: before.length + text.length };
}

const overlayFont = (theme: GrafanaTheme2) => ({
  margin: 0,
  border: 0,
  padding: theme.spacing(1),
  fontFamily: theme.typography.fontFamily,
  fontSize: theme.typography.body.fontSize,
  fontWeight: theme.typography.fontWeightRegular,
  lineHeight: 1.45,
  letterSpacing: 'normal',
  whiteSpace: 'pre-wrap' as const,
  overflowWrap: 'break-word' as const,
  wordBreak: 'break-word' as const,
});

const getStyles = (theme: GrafanaTheme2) => ({
  root: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    width: '100%',
    minWidth: 0,
  }),
  field: css({
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(0.5),
    width: '100%',
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.shape.radius.default,
    background: theme.colors.background.primary,
    '&:focus-within': {
      borderColor: theme.colors.primary.border,
    },
  }),
  fieldInvalid: css({
    borderColor: theme.colors.error.border,
  }),
  editor: css({
    position: 'relative',
    flex: 1,
    minWidth: 0,
  }),
  overlay: css({
    ...overlayFont(theme),
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    color: 'transparent',
    pointerEvents: 'none',
    userSelect: 'none',
  }),
  syntax: css({
    color: theme.colors.text.primary,
  }),
  input: css({
    ...overlayFont(theme),
    position: 'relative',
    zIndex: 1,
    display: 'block',
    width: '100%',
    minHeight: theme.spacing(4),
    resize: 'vertical',
    background: 'transparent',
    color: theme.colors.text.primary,
    caretColor: theme.colors.text.primary,
    outline: 'none',
    '&::placeholder': {
      color: theme.colors.text.disabled,
    },
  }),
  inputTransparent: css({
    color: 'transparent',
  }),
  tokenOperator: css({
    color: theme.colors.info.text,
  }),
  tokenLogic: css({
    color: theme.colors.primary.text,
  }),
  tokenParen: css({
    color: theme.colors.text.secondary,
  }),
  tokenParenMatch: css({
    color: theme.colors.primary.text,
    textShadow: '0.4px 0 currentColor, -0.4px 0 currentColor',
  }),
  tokenParenUnmatched: css({
    color: theme.colors.error.text,
    textShadow: '0.4px 0 currentColor, -0.4px 0 currentColor',
  }),
  band: css({
    padding: '1px 0',
  }),
  bandA: css({
    background: theme.colors.primary.transparent,
  }),
  bandB: css({
    background: theme.colors.info.transparent,
  }),
  bandStart: css({
    borderTopLeftRadius: theme.shape.radius.default,
    borderBottomLeftRadius: theme.shape.radius.default,
  }),
  bandEnd: css({
    borderTopRightRadius: theme.shape.radius.default,
    borderBottomRightRadius: theme.shape.radius.default,
  }),
  squiggle: css({
    textDecorationLine: 'underline',
    textDecorationStyle: 'wavy',
    textDecorationColor: theme.colors.error.text,
    textDecorationSkipInk: 'none',
  }),
  help: css({
    padding: theme.spacing(1.5),
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    background: theme.colors.background.secondary,
    maxWidth: 720,
  }),
  helpHeader: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing(1),
  }),
  helpTitle: css({
    fontWeight: theme.typography.fontWeightMedium,
  }),
  grid: css({
    display: 'grid',
    gridTemplateColumns: 'max-content max-content minmax(0, 1fr)',
    alignItems: 'center',
    columnGap: theme.spacing(2),
    rowGap: theme.spacing(1),
  }),
  section: css({
    gridColumn: '1 / -1',
    fontSize: theme.typography.bodySmall.fontSize,
    fontWeight: theme.typography.fontWeightBold,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: theme.colors.text.secondary,
    borderBottom: `1px solid ${theme.colors.border.weak}`,
    paddingBottom: theme.spacing(0.5),
  }),
  chip: css({
    justifySelf: 'start',
    border: 0,
    borderRadius: theme.shape.radius.default,
    padding: theme.spacing(0.25, 1),
    color: theme.colors.primary.text,
    background: theme.colors.primary.transparent,
    cursor: 'pointer',
    font: 'inherit',
    fontWeight: theme.typography.fontWeightMedium,
  }),
  mode: css({
    fontWeight: theme.typography.fontWeightMedium,
  }),
  example: css({
    fontFamily: theme.typography.fontFamilyMonospace,
    color: theme.colors.text.secondary,
    whiteSpace: 'nowrap',
  }),
  note: css({
    margin: theme.spacing(1.5, 0, 0),
    color: theme.colors.text.secondary,
  }),
});
