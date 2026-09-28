import { filterCompletions } from './completions';

function labels(source: string, caret = source.length): string[] {
  return filterCompletions(source, caret)?.items.map((item) => item.insertText) ?? [];
}

describe('filterCompletions', () => {
  it('suggests entity prefixes and then static fields', () => {
    expect(labels('')).toEqual(['@device.', '@event.', '@recording.', '@session.', '@episode.']);
    expect(labels('@device.')).toEqual(['@device.id', '@device.name', '@device.enabled', '@device.properties.']);
    expect(labels('@device.n')).toEqual(['@device.name']);
    expect(labels('@device.name')).toEqual([]);
  });

  it('suggests operators, boolean values, and connectors', () => {
    expect(labels('@device.name ')).toEqual(['==', '!=', 'like', 'contains', 'not-contains', 'exists', 'in']);
    expect(labels('@device.enabled ')).toEqual(['==', '!=', 'exists']);
    expect(labels('@device.enabled == ')).toEqual(['true', 'false']);
    expect(labels('@device.name == husky ')).toEqual(['and', 'or']);
    expect(labels('/imu.x ')).toContain('>');
  });

  it('does not treat a quoted in-list as a field', () => {
    expect(labels('@device.name == "logs in a, b" ')).toEqual(['and', 'or']);
  });
});
