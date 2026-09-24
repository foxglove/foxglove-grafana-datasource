import type { FilterNode } from '../types';

import { compileFilterText } from './compileFilter';
import { filterNodeToText } from './migrateFilter';

describe('filterNodeToText', () => {
  it('renders an empty leaf as no filter', () => {
    const leaf: FilterNode = {
      kind: 'leaf',
      predicateType: 'device',
      op: 'eq',
      field: 'name',
      messagePath: '',
      value: '',
    };
    expect(filterNodeToText(leaf)).toBe('');
    expect(filterNodeToText(undefined)).toBe('');
  });

  it('renders device, message, and in conditions', () => {
    expect(
      filterNodeToText({
        kind: 'leaf',
        predicateType: 'device',
        op: 'eq',
        field: 'name',
        messagePath: '',
        value: 'husky',
      })
    ).toBe('@device.name == husky');
    expect(
      filterNodeToText({
        kind: 'leaf',
        predicateType: 'device',
        op: 'eq',
        field: 'deviceId',
        messagePath: '',
        value: 'dev_1',
      })
    ).toBe('@device.id == dev_1');
    expect(
      filterNodeToText({
        kind: 'leaf',
        predicateType: 'message',
        op: 'lt',
        field: '',
        messagePath: '/battery.percentage',
        value: '20',
      })
    ).toBe('/battery.percentage < 20');
    const filteredPath = filterNodeToText({
      kind: 'leaf',
      predicateType: 'message',
      op: 'gt',
      field: '',
      messagePath: '/diagnostics{name=="motor"}.temperature',
      value: '1',
    });
    expect(filteredPath).toBe('"/diagnostics{name==\\"motor\\"}.temperature" > 1');
    expect(compileFilterText(filteredPath)).toMatchObject({
      ok: true,
      filter: { type: 'message', topic: '/diagnostics' },
    });
    expect(
      filterNodeToText({
        kind: 'leaf',
        predicateType: 'device',
        op: 'in',
        field: 'name',
        messagePath: '',
        value: 'robot-a, robot-b',
      })
    ).toBe('@device.name in robot-a,robot-b');
    expect(
      filterNodeToText({
        kind: 'leaf',
        predicateType: 'device',
        op: 'in',
        field: 'name',
        messagePath: '',
        value: '${device:csv}',
      })
    ).toBe('@device.name in ${device:csv}');
  });

  it('drops empty siblings and parenthesizes a nested group with a different operator', () => {
    const tree: FilterNode = {
      kind: 'group',
      operator: 'and',
      children: [
        {
          kind: 'leaf',
          predicateType: 'device',
          op: 'eq',
          field: 'name',
          messagePath: '',
          value: '',
        },
        {
          kind: 'group',
          operator: 'or',
          children: [
            {
              kind: 'leaf',
              predicateType: 'device',
              op: 'eq',
              field: 'name',
              messagePath: '',
              value: 'a',
            },
            {
              kind: 'leaf',
              predicateType: 'device',
              op: 'eq',
              field: 'name',
              messagePath: '',
              value: 'b',
            },
          ],
        },
        {
          kind: 'leaf',
          predicateType: 'message',
          op: 'gt',
          field: '',
          messagePath: '/imu.x',
          value: '1',
        },
      ],
    };
    expect(filterNodeToText(tree)).toBe('(@device.name == a OR @device.name == b) AND /imu.x > 1');
  });
});
