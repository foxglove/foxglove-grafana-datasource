import { test, expect } from '@grafana/plugin-e2e';

// These tests exercise UI behavior of the Query Editor only. They open a panel,
// pick the provisioned datasource, and assert on rendered controls — but they
// never run the query (which would invoke the backend).

test('renders the default query editor sections', async ({
  panelEditPage,
  readProvisionedDataSource,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);

  const row = panelEditPage.getQueryEditorRow('A');
  await expect(row.getByText('Selection')).toBeVisible();
  // "Message Path" is both the default selection-combobox value and the label
  // of the path input — at least one of them should be visible.
  await expect(row.getByText('Message Path').first()).toBeVisible();
  await expect(row.getByText('Group By')).toBeVisible();
  await expect(row.getByText('Aggregation')).toBeVisible();
  await expect(row.getByText('Granularity')).toBeVisible();
  await expect(row.getByText('Filter', { exact: true })).toBeVisible();
});

test('message path input accepts text', async ({
  panelEditPage,
  readProvisionedDataSource,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  const row = panelEditPage.getQueryEditorRow('A');

  const messagePath = row.getByPlaceholder('/topic.field.subfield').first();
  await messagePath.fill('/imu.linear_acceleration.x');
  await expect(messagePath).toHaveValue('/imu.linear_acceleration.x');
});

test('granularity input accepts a duration string', async ({
  panelEditPage,
  readProvisionedDataSource,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  const row = panelEditPage.getQueryEditorRow('A');

  // The Granularity input has a "10s, 1m, 1h" placeholder; the Interval input
  // (only visible when an aggregation is chosen) uses the same placeholder, so
  // we scope by the Granularity row.
  const granularity = row.getByPlaceholder('e.g. 10s, 1m, 1h').last();
  await granularity.fill('30s');
  await expect(granularity).toHaveValue('30s');
});

test('filter editor renders with a default condition and can add another', async ({
  panelEditPage,
  readProvisionedDataSource,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  const row = panelEditPage.getQueryEditorRow('A');

  const addCondition = row.getByRole('button', { name: 'Condition', exact: true });
  await expect(addCondition).toBeVisible();
  await expect(row.getByRole('button', { name: 'Group' })).toBeVisible();

  // Each condition row exposes a "Remove condition" tooltip button.
  const removeConditionButtons = row.getByRole('button', { name: 'Remove condition' });
  const initial = await removeConditionButtons.count();
  await addCondition.click();
  await expect(removeConditionButtons).toHaveCount(initial + 1);
});
