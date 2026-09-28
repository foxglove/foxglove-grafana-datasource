import {
  compileSelectionText,
  displayedSelectionError,
  isDevicePropertySelectionText,
  selectionToText,
} from './selectionText';

describe('selection text', () => {
  it('compiles a FoxQL expression', () => {
    expect(compileSelectionText('/imu.x')).toMatchObject({
      ok: true,
      selection: {
        type: 'messagePath',
        messagePath: '/imu.x',
        topic: '/imu',
        selectorPath: [{ kind: 'field', field: 'x' }],
      },
    });
  });

  it('compiles a device property and keeps dotted keys', () => {
    expect(compileSelectionText('@device.properties.version')).toEqual({
      ok: true,
      selection: { type: 'deviceProperty', key: 'version' },
    });
    expect(compileSelectionText('@device.properties.fleet.site')).toEqual({
      ok: true,
      selection: { type: 'deviceProperty', key: 'fleet.site' },
    });
    expect(isDevicePropertySelectionText('@device.properties.version')).toBe(true);
    expect(isDevicePropertySelectionText('/imu.x')).toBe(false);
  });

  it('compiles a topic that does not start with a slash', () => {
    expect(compileSelectionText('imu.x')).toMatchObject({
      ok: true,
      selection: { type: 'messagePath', topic: 'imu', selectorPath: [{ kind: 'field', field: 'x' }] },
    });
    expect(compileSelectionText('some0/nice_topic.with')).toMatchObject({
      ok: true,
      selection: { type: 'messagePath', topic: 'some0/nice_topic' },
    });
  });

  it('rejects a device field that is not a property', () => {
    expect(compileSelectionText('@device.name')).toMatchObject({
      ok: false,
      error: 'Enter a device property as @device.properties.key',
    });
    expect(compileSelectionText('@device.properties.')).toMatchObject({ ok: false });
  });

  it('hides a selection error while the field is focused', () => {
    expect(displayedSelectionError('@device.', true)).toBeUndefined();
    expect(displayedSelectionError('@device. ', true)).toBeUndefined();
    expect(displayedSelectionError('@device.name', false)).toBe('Enter a device property as @device.properties.key');
    expect(displayedSelectionError('@device.properties.$key', false)).toBeUndefined();
  });

  it('renders a saved selection as text', () => {
    expect(selectionToText({ type: 'messagePath', messagePath: '/imu.x' })).toBe('/imu.x');
    expect(selectionToText({ type: 'deviceProperty', key: 'version' })).toBe('@device.properties.version');
    expect(compileSelectionText('')).toEqual({ ok: true });
  });
});
