import { test, expect } from '@grafana/plugin-e2e';

// These tests exercise UI behavior of the Config Editor only. They never call
// "Save & test" because that would invoke the backend's CheckHealth handler,
// which is intentionally out of scope here.

test('renders all config editor fields', async ({
  createDataSourceConfigPage,
  readProvisionedDataSource,
  page,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await createDataSourceConfigPage({ type: ds.type });

  await expect(page.getByPlaceholder('https://api.foxglove.dev')).toBeVisible();
  await expect(page.getByPlaceholder('Enter your API key')).toBeVisible();
  await expect(page.getByPlaceholder('proj_...')).toBeVisible();
  await expect(page.getByPlaceholder('site_...')).toBeVisible();
  await expect(page.getByPlaceholder('0 = no limit')).toBeVisible();

  await expect(page.getByText('API Base URL')).toBeVisible();
  await expect(page.getByText('Project ID')).toBeVisible();
  await expect(page.getByText('Site ID')).toBeVisible();
  await expect(page.getByText('Query Timeout (seconds)')).toBeVisible();
});

test('text fields accept input', async ({
  createDataSourceConfigPage,
  readProvisionedDataSource,
  page,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await createDataSourceConfigPage({ type: ds.type });

  const baseUrl = page.getByPlaceholder('https://api.foxglove.dev');
  await baseUrl.fill('https://example.test');
  await expect(baseUrl).toHaveValue('https://example.test');

  const projectId = page.getByPlaceholder('proj_...');
  await projectId.fill('proj_abc123');
  await expect(projectId).toHaveValue('proj_abc123');

  const siteId = page.getByPlaceholder('site_...');
  await siteId.fill('site_xyz789');
  await expect(siteId).toHaveValue('site_xyz789');
});

test('query timeout accepts integers and can be cleared', async ({
  createDataSourceConfigPage,
  readProvisionedDataSource,
  page,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await createDataSourceConfigPage({ type: ds.type });

  const timeout = page.getByPlaceholder('0 = no limit');
  await timeout.fill('30');
  await expect(timeout).toHaveValue('30');

  // Clearing the field is allowed (means "no plugin-side limit").
  await timeout.fill('');
  await expect(timeout).toHaveValue('');
});

test('API key input accepts a value', async ({
  createDataSourceConfigPage,
  readProvisionedDataSource,
  page,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await createDataSourceConfigPage({ type: ds.type });

  const apiKey = page.getByPlaceholder('Enter your API key');
  await apiKey.fill('not-a-real-key');
  await expect(apiKey).toHaveValue('not-a-real-key');
});
