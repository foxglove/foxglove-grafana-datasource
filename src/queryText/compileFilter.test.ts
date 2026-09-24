import { compileFilterText, displayedFilterError, filterTextError, isUncommittedFilterError } from './compileFilter';

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
    expect(compileFilterText('@device.id in {dev_a,dev_b}')).toMatchObject({
      ok: false,
      error: { message: 'A brace-wrapped list is not an in list. Use ${name:csv} for a multi-value variable.' },
    });
  });

  it('rejects visual search, a single equals, and a topic value comparison', () => {
    expect(compileFilterText('visual("pedestrian")')).toMatchObject({
      ok: false,
      error: { message: 'Visual search is not supported in Grafana filters.', index: 0 },
    });
    expect(compileFilterText('@device.name == a and visual("pedestrian")')).toMatchObject({
      ok: false,
      error: { message: 'Visual search is not supported in Grafana filters.', index: 22 },
    });
    expect(compileFilterText('@device.name = husky')).toMatchObject({
      ok: false,
      error: { message: 'Use == to test equality' },
    });
    expect(compileFilterText('/camera/image == 1')).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('exists') },
    });
    expect(compileFilterText('/diagnostics{name}.level > 1')).toMatchObject({
      ok: false,
      error: { message: 'FoxQL expression is incomplete' },
    });
    expect(compileFilterText('/foo. exists')).toMatchObject({
      ok: false,
      error: { message: 'FoxQL expression is incomplete' },
    });
    expect(compileFilterText('/topic.foo[$a].x > 1')).toMatchObject({
      ok: false,
      error: { message: 'FoxQL variable references are not supported' },
    });
    expect(compileFilterText('@device.name == "logs in a, b"')).toMatchObject({
      ok: true,
      filter: { type: 'device', op: 'eq', value: 'logs in a, b' },
    });
    expect(compileFilterText('@device.name == "visual(" and visual("pedestrian")')).toMatchObject({
      ok: false,
      error: { message: 'Visual search is not supported in Grafana filters.', index: 30 },
    });
    expect(compileFilterText('"imu.x" exists')).toMatchObject({
      ok: true,
      filter: { type: 'topic-exists', topic: 'imu.x' },
    });
    expect(compileFilterText('"/imu.x" exists')).toMatchObject({
      ok: true,
      filter: { type: 'topic-exists', topic: '/imu.x' },
    });
    expect(compileFilterText('"foo.bar" > 1')).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('exists') },
    });
    expect(compileFilterText('"cam==era" exists')).toMatchObject({
      ok: true,
      filter: { type: 'topic-exists', topic: 'cam==era' },
    });
    expect(compileFilterText('"a"."b" exists')).toMatchObject({
      ok: true,
      filter: { type: 'message', topic: 'a', selectorPath: [{ kind: 'field', field: 'b' }] },
    });
    expect(compileFilterText('"@device.nam" == x')).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('exists') },
    });
    expect(compileFilterText('@device.name in a, b')).toMatchObject({
      ok: false,
      error: { message: 'Write in lists without spaces, for example a,b' },
    });
  });

  it('shows an unknown field once the caret moves past it', () => {
    expect(displayedFilterError('@device.nam', '@device.nam'.length, true)).toBeUndefined();
    expect(displayedFilterError('@device.nam ', '@device.nam '.length, true)).toEqual({
      message: 'No such field: device.nam',
      index: 0,
    });
    expect(displayedFilterError('@device.nam', '@device.nam'.length, false)?.message).toBe('No such field: device.nam');
    expect(compileFilterText('@device.nam == x')).toMatchObject({
      ok: false,
      error: { message: 'No such field: device.nam' },
    });
    expect(compileFilterText('@device.properties.fleet == x')).toMatchObject({
      ok: true,
      filter: { type: 'device', field: 'properties.fleet', op: 'eq', value: 'x' },
    });
    expect(compileFilterText('@recording.metadata.mission.site == dock')).toMatchObject({ ok: true });
  });

  it('hides an error on the token still being typed', () => {
    const incomplete = filterTextError('@device.name');
    const spaced = filterTextError('@device.name ');
    const continued = filterTextError('@device.name = husky');
    expect(incomplete && isUncommittedFilterError('@device.name', incomplete)).toBe(true);
    expect(spaced && isUncommittedFilterError('@device.name ', spaced)).toBe(true);
    expect(continued && isUncommittedFilterError('@device.name = husky', continued)).toBe(false);
  });

  it('skips live validation when the text contains a template variable', () => {
    expect(filterTextError('@device.name == $device')).toBeUndefined();
    expect(filterTextError('@device.name == ${device:csv}')).toBeUndefined();
    expect(filterTextError('@device.name = husky')?.message).toBe('Use == to test equality');
  });
});
