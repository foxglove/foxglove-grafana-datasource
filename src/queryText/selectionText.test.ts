import {
  compileSelectionText,
  isDevicePropertySelectionText,
  selectionTextError,
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

  it('rejects a field that is neither a FoxQL expression nor a device property', () => {
    expect(compileSelectionText('@device.name')).toMatchObject({
      ok: false,
      error: 'Enter a device property as @device.properties.key',
    });
    expect(compileSelectionText('@device.properties.')).toMatchObject({ ok: false });
    expect(compileSelectionText('version')).toMatchObject({
      ok: false,
      error: 'Enter a FoxQL expression (/topic.x.y) or a device property (@device.properties.key)',
    });
  });

  it('renders a saved selection as text and skips template variables', () => {
    expect(selectionToText({ type: 'messagePath', messagePath: '/imu.x' })).toBe('/imu.x');
    expect(selectionToText({ type: 'deviceProperty', key: 'version' })).toBe('@device.properties.version');
    expect(selectionTextError('@device.properties.$key')).toBeUndefined();
    expect(compileSelectionText('')).toEqual({ ok: true });
  });
});
