import { parseAndConvertFoxql } from '../foxqlSelection';
import type { Selection } from '../types';

const DEVICE_PROPERTY_PREFIX = '@device.properties.';

const PROPERTY_HINT = 'Enter a device property as @device.properties.key';

export type CompiledSelection = { ok: true; selection?: Selection } | { ok: false; error: string };

/** Text shown for a selection saved by the type dropdown. */
export function selectionToText(selection: Selection | undefined): string {
  if (selection === undefined) {
    return '';
  }
  if (selection.type === 'deviceProperty') {
    return selection.key === '' ? '' : `${DEVICE_PROPERTY_PREFIX}${selection.key}`;
  }
  return selection.messagePath;
}

/** A device-property selection always groups by device, so Group By stays hidden. */
export function isDevicePropertySelectionText(source: string): boolean {
  const text = source.trim();
  return text.startsWith(DEVICE_PROPERTY_PREFIX) && text.length > DEVICE_PROPERTY_PREFIX.length && !text.endsWith('.');
}

/**
 * Compile selection text into the wire selection. Empty text compiles to no selection.
 * A FoxQL expression names a topic with or without a leading `/`. `@device.properties.key`
 * is a device property.
 */
export function compileSelectionText(source: string): CompiledSelection {
  const text = source.trim();
  if (text === '') {
    return { ok: true };
  }
  if (text.startsWith('@')) {
    return compileDeviceProperty(text);
  }
  return compileFoxql(text);
}

/**
 * The error to show in the selection field. While it is focused, an error on the
 * expression still being typed stays hidden, including after a trailing space.
 * It appears when the field blurs. Text that contains a Grafana template variable
 * is skipped.
 */
export function displayedSelectionError(source: string, focused: boolean): string | undefined {
  if (source.trim() === '' || source.includes('$')) {
    return undefined;
  }
  if (focused) {
    return undefined;
  }
  const compiled = compileSelectionText(source);
  return compiled.ok ? undefined : compiled.error;
}

function compileDeviceProperty(text: string): CompiledSelection {
  if (!text.startsWith(DEVICE_PROPERTY_PREFIX) || text.endsWith('.')) {
    return { ok: false, error: PROPERTY_HINT };
  }
  const key = text.slice(DEVICE_PROPERTY_PREFIX.length).trim();
  if (key === '') {
    return { ok: false, error: PROPERTY_HINT };
  }
  return { ok: true, selection: { type: 'deviceProperty', key } };
}

function compileFoxql(text: string): CompiledSelection {
  const converted = parseAndConvertFoxql(text);
  if (!converted.ok) {
    return { ok: false, error: converted.error };
  }
  return {
    ok: true,
    selection: {
      type: 'messagePath',
      messagePath: text,
      messagePathString: text,
      topic: converted.parsed.topic,
      selectorPath: converted.parsed.selectorPath,
    },
  };
}
