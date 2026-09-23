import { compileFilterText, filterTextError } from './compileFilter';

function compiled(source: string) {
  const result = compileFilterText(source);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.filter;
}

describe('compileFilterText', () => {
  it('compiles an empty filter to nothing', () => {
    expect(compileFilterText('')).toEqual({ ok: true });
    expect(compileFilterText('   ')).toEqual({ ok: true });
  });

  it('compiles entity, message, and topic filters', () => {
    expect(compiled('@device.name like husky')).toEqual({
      type: 'device',
      op: 'like',
      field: 'name',
      value: 'husky',
    });
    expect(compiled('@device.id == dev_1')).toEqual({
      type: 'device',
      op: 'eq',
      field: 'deviceId',
      value: 'dev_1',
    });
    expect(compiled('@event.eventTypeId == collision')).toEqual({
      type: 'event',
      op: 'eq',
      field: 'eventTypeId',
      value: 'collision',
    });
    expect(compiled('@episode.metadata.label == dock')).toEqual({
      type: 'episode',
      op: 'eq',
      field: 'metadata.label',
      value: 'dock',
    });
    expect(compiled('@session.key == abc123')).toEqual({
      type: 'session',
      op: 'eq',
      field: 'key',
      value: 'abc123',
    });
    expect(compiled('/diagnostics.level > 1')).toEqual({
      type: 'message',
      op: 'gt',
      topic: '/diagnostics',
      selectorPath: [{ kind: 'field', field: 'level' }],
      value: '1',
    });
    expect(compiled('/camera/image exists')).toEqual({
      type: 'topic-exists',
      topic: '/camera/image',
    });
  });

  it('compiles contains, not-contains, and exists', () => {
    expect(compiled('@event.properties.tags contains obstacle')).toMatchObject({
      type: 'event',
      op: 'contains',
      field: 'properties.tags',
      value: 'obstacle',
    });
    expect(compiled('@recording.metadata.labels not-contains ignore')).toMatchObject({
      op: 'not-contains',
      field: 'metadata.labels',
    });
    expect(compiled('@device.name exists')).toEqual({
      type: 'device',
      op: 'is-not-null',
      field: 'name',
    });
    expect(compiled('/diagnostics.level exists')).toMatchObject({
      type: 'message',
      op: 'is-not-null',
      topic: '/diagnostics',
    });
  });

  it('binds and tighter than or and honors parentheses', () => {
    expect(compiled('/a.x > 1 OR /b.y > 2 AND /c.z > 3')).toMatchObject({
      type: 'or',
      left: { type: 'message', topic: '/a' },
      right: {
        type: 'and',
        left: { type: 'message', topic: '/b' },
        right: { type: 'message', topic: '/c' },
      },
    });
    expect(compiled('(@device.name == a OR @device.name == b) AND /imu.x > 1')).toMatchObject({
      type: 'and',
      left: { type: 'or' },
      right: { type: 'message', topic: '/imu' },
    });
  });

  it('splits in lists', () => {
    expect(compiled('@device.name in a,b')).toMatchObject({
      op: 'in',
      value: ['a', 'b'],
    });
    expect(compiled('@device.name in "a, b"')).toMatchObject({
      op: 'in',
      value: ['a', 'b'],
    });
  });

  it('rejects visual search, a single equals, and a topic value comparison', () => {
    expect(compileFilterText('visual("pedestrian")')).toMatchObject({
      ok: false,
      error: { message: 'Visual search is not supported in Grafana filters.' },
    });
    expect(compileFilterText('@device.name = husky')).toMatchObject({
      ok: false,
      error: { message: 'Use == to test equality' },
    });
    expect(compileFilterText('/camera/image == 1')).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('exists') },
    });
  });

  it('skips live validation when the text contains a template variable', () => {
    expect(filterTextError('@device.name == $device')).toBeUndefined();
    expect(filterTextError('@device.name == ${device:csv}')).toBeUndefined();
    expect(filterTextError('@device.name = husky')?.message).toBe('Use == to test equality');
  });
});
