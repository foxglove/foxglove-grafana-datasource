export const ENTITY_SIGIL = '@';

const PREDICATE_TYPES = ['event', 'recording', 'device', 'session', 'episode'] as const;

export type EntityPredicateType = (typeof PREDICATE_TYPES)[number];

const PREDICATE_TYPE_SET: ReadonlySet<string> = new Set(PREDICATE_TYPES);

const TEXT_TO_WIRE_FIELD = new Map<string, string>([
  ['device.id', 'device.deviceId'],
  ['event.id', 'event.eventId'],
  ['recording.id', 'recording.recordingId'],
  ['session.id', 'session.sessionId'],
  ['episode.id', 'episode.episodeId'],
]);

const WIRE_TO_TEXT_FIELD = new Map(Array.from(TEXT_TO_WIRE_FIELD, ([textField, wireField]) => [wireField, textField]));

export function entityFieldToWire(text: string): string {
  if (!text.startsWith(ENTITY_SIGIL)) {
    return text;
  }
  const textField = text.slice(ENTITY_SIGIL.length);
  return TEXT_TO_WIRE_FIELD.get(textField) ?? textField;
}

export function wireFieldToText(field: string): string {
  return `${ENTITY_SIGIL}${WIRE_TO_TEXT_FIELD.get(field) ?? field}`;
}

export function isEntityFieldText(text: string): boolean {
  return text.startsWith(ENTITY_SIGIL);
}

export function parseFieldKey(fieldKey: string): { predicateType: EntityPredicateType; field: string } | undefined {
  const dotIndex = fieldKey.indexOf('.');
  if (dotIndex === -1) {
    return undefined;
  }
  const prefix = fieldKey.substring(0, dotIndex);
  if (!PREDICATE_TYPE_SET.has(prefix)) {
    return undefined;
  }
  const field = fieldKey.substring(dotIndex + 1);
  if (field === '') {
    return undefined;
  }
  return { predicateType: prefix as EntityPredicateType, field };
}
