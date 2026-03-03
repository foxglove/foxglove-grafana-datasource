import { test, expect } from '@grafana/plugin-e2e';

test('smoke: should render query editor', async ({ panelEditPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  await expect(panelEditPage.getQueryEditorRow('A').getByRole('textbox', { name: 'Device Name' })).toBeVisible();
});

test('should trigger new query when Constant field is changed', async ({
  panelEditPage,
  readProvisionedDataSource,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  const queryReq = panelEditPage.waitForQueryDataRequest();
  await panelEditPage.getQueryEditorRow('A').getByRole('textbox', { name: 'Device Name' }).fill('device-123');
  await expect(await queryReq).toBeTruthy();
});

test('data query should return values 10 and 20', async ({ createDataSource, panelEditPage }) => {
  const ds = await createDataSource({
    type: 'foxglovedev-foxglove-datasource',
    jsonData: { baseUrl: process.env.FOXGLOVE_API_BASE_URL ?? '' },
    secureJsonData: { apiKey: process.env.FOXGLOVE_API_KEY ?? '' },
  });
  await panelEditPage.datasource.set(ds.name);
  await panelEditPage.getQueryEditorRow('A').getByRole('textbox', { name: 'Device Name' }).fill('device-123');
  await panelEditPage.setVisualization('Table');
  await expect(panelEditPage.refreshPanel()).toBeOK();
});
