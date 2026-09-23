import { test, expect } from '@grafana/plugin-e2e';

// These tests exercise UI behavior of the Query Editor only. They open a panel,
// pick the provisioned datasource, and assert on rendered controls — but they
// never run the query (which would invoke the backend).

test('renders the default query editor sections', async ({ panelEditPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);

  const row = panelEditPage.getQueryEditorRow('A');
  await expect(row.getByText('Selection')).toBeVisible();
  // Selection defaults to FoxQL Expression; the input field is labeled
  // "Expression". The Combobox selected value may not appear as getByText.
  await expect(row.getByText('Expression', { exact: true })).toBeVisible();
  await expect(row.getByText('Group By')).toBeVisible();
  await expect(row.getByText('Aggregation')).toBeVisible();
  await expect(row.getByText('Granularity')).toBeVisible();
  await expect(row.getByText('Filter', { exact: true })).toBeVisible();
});

test('FoxQL expression input accepts text', async ({ panelEditPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  const row = panelEditPage.getQueryEditorRow('A');

  const expression = row.getByPlaceholder('/topic.field.subfield').first();
  await expression.fill('/imu.linear_acceleration.x');
  await expect(expression).toHaveValue('/imu.linear_acceleration.x');
});

test('granularity input accepts a duration string', async ({ panelEditPage, readProvisionedDataSource }) => {
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

test('filter editor accepts filter text and opens syntax help', async ({
  panelEditPage,
  readProvisionedDataSource,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  const row = panelEditPage.getQueryEditorRow('A');

  const filter = row.getByRole('textbox', { name: 'Filter' });
  await filter.fill('@device.name == husky');
  await expect(filter).toHaveValue('@device.name == husky');

  await row.getByRole('button', { name: 'Filter syntax' }).click();
  await expect(row.getByRole('button', { name: 'Device' })).toBeVisible();
  await expect(row.getByText('@device.name like husky')).toBeVisible();
});
