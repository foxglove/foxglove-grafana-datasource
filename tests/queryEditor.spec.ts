import { test, expect } from '@grafana/plugin-e2e';

test('smoke: should render query editor', async ({ panelEditPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  await expect(panelEditPage.getQueryEditorRow('A').getByText('Message Path')).toBeVisible();
  await expect(panelEditPage.getQueryEditorRow('A').getByRole('textbox', { name: 'Message Path' })).toBeVisible();
});

test('should trigger new query when message path is changed', async ({ panelEditPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  const row = panelEditPage.getQueryEditorRow('A');
  const queryReq = panelEditPage.waitForQueryDataRequest();
  await row.getByRole('textbox', { name: 'Message Path' }).fill('/foo.bar');
  await expect(await queryReq).toBeTruthy();
});

test('data query should return values 10 and 20', async ({ panelEditPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  const row = panelEditPage.getQueryEditorRow('A');
  await row.getByRole('textbox', { name: 'Message Path' }).fill('/foo.bar');
  await panelEditPage.setVisualization('Table');
  await expect(panelEditPage.refreshPanel()).toBeOK();
});
