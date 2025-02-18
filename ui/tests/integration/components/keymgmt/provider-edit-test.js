import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { setupMirage } from 'ember-cli-mirage/test-support';
import { click, triggerEvent, settled, fillIn } from '@ember/test-helpers';
import { format } from 'date-fns';

const ts = 'data-test-kms-provider';
const root = {
  path: 'vault.cluster.secrets.backend.list-root',
  model: 'keymgmt',
  label: 'keymgmt',
  text: 'keymgmt',
};

module('Integration | Component | keymgmt/provider-edit', function (hooks) {
  setupRenderingTest(hooks);
  setupMirage(hooks);

  hooks.beforeEach(function () {
    this.store = this.owner.lookup('service:store');
    this.store.push({
      data: {
        id: 'foo-bar',
        type: 'keymgmt/provider',
        attributes: {
          name: 'foo-bar',
          provider: 'azurekeyvault',
          keyCollection: 'keyvault-1',
          created: new Date(),
        },
      },
    });
    this.model = this.store.peekRecord('keymgmt/provider', 'foo-bar');
    this.created = format(this.model.created, 'MMM d yyyy, h:mm:ss aaa');
    this.root = root;
    this.owner.lookup('service:router').reopen({
      currentURL: '/ui/vault/secrets/keymgmt/show/foo-bar',
      currentRouteName: 'secrets.keymgmt.provider.show',
      urlFor() {
        return '';
      },
    });
  });

  test('it should render show view', async function (assert) {
    assert.expect(13);

    // override capability getters
    Object.defineProperties(this.model, {
      canDelete: { value: true },
      canListKeys: { value: true },
    });

    this.server.get('/keymgmt/kms/foo-bar/key', () => {
      return {
        data: {
          keys: ['testkey-1', 'testkey-2'],
        },
      };
    });
    this.server.delete('/keymgmt/kms/foo-bar', () => {
      assert.ok(true, 'Request made to delete key');
      return {};
    });
    this.owner.lookup('service:router').reopen({
      transitionTo(path, model, { queryParams: { tab } }) {
        assert.equal(path, root.path, 'Root path sent in transitionTo on delete');
        assert.equal(model, root.model, 'Root model sent in transitionTo on delete');
        assert.deepEqual(tab, 'provider', 'Correct query params sent in transitionTo on delete');
      },
    });

    const changeTab = async (tab) => {
      this.set('tab', tab);
      await settled();
    };

    await render(hbs`
      <Keymgmt::ProviderEdit
        @root={{this.root}}
        @model={{this.model}}
        @mode="show"
        @tab={{this.tab}}
      />`);

    assert.dom(`[${ts}-header]`).hasText('Provider foo-bar', 'Page header renders');
    assert.dom(`[${ts}-tab="details"]`).hasClass('is-active', 'Details tab is active');

    const infoRows = this.element.querySelectorAll('[data-test-component="info-table-row"]');
    assert.dom(infoRows[0]).hasText('Provider name foo-bar', 'Provider name field renders');
    assert.dom(infoRows[1]).hasText('Type Azure Key Vault', 'Type field renders');
    assert.dom('svg', infoRows[1]).hasAttribute('data-test-icon', 'azure-color', 'Icon renders for type');
    assert.dom(infoRows[2]).hasText(`Created ${this.created}`, 'Created field renders');
    assert.dom(infoRows[3]).hasText('Key Vault instance name keyvault-1', 'Key collection field renders');
    assert.dom(infoRows[4]).hasText('Keys 2 keys', 'Keys field renders');

    await changeTab('keys');
    assert.dom(`[${ts}-details-actions]`).doesNotExist('Toolbar is hidden on keys tab');
    assert.dom('[data-test-secret-link]').exists({ count: 2 }, 'Keys list renders');

    await changeTab('details');
    assert.dom(`[${ts}-delete] button`).isDisabled('Delete action disabled when keys exist');
    await triggerEvent(`[data-test-tooltip-trigger]`, 'mouseenter');
    assert.dom(`[${ts}-delete-tooltip]`).exists('Tooltip is show when delete action is disabled');

    this.model.keys = [];
    await settled();
    assert
      .dom('[data-test-value-div="Keys"]')
      .hasText('None', 'None is displayed when no keys exist for provider');
    await click(`[${ts}-delete] button`);
    await click('[data-test-confirm-button]');
  });

  test('it should render create view', async function (assert) {
    assert.expect(10);

    this.server.put('/keymgmt/kms/foo', (schema, req) => {
      const params = {
        name: 'foo',
        provider: 'gcpckms',
        key_collection: 'keyvault-1',
        credentials: {
          service_account_file: 'test',
        },
      };
      assert.deepEqual(JSON.parse(req.requestBody), params, 'PUT request made with correct data');
      return {};
    });
    this.owner.lookup('service:router').reopen({
      transitionTo(path, model, { queryParams: { itemType } }) {
        assert.equal(path, 'vault.cluster.secrets.backend.show', 'Show route sent in transitionTo on save');
        assert.equal(model, 'foo', 'Model id sent in transitionTo on save');
        assert.deepEqual(itemType, 'provider', 'Correct query params sent in transitionTo on save');
      },
    });
    this.model = this.store.createRecord('keymgmt/provider');

    await render(hbs`
      <Keymgmt::ProviderEdit
        @root={{this.root}}
        @model={{this.model}}
        @mode="create"
      />`);

    assert.dom(`[${ts}-header]`).hasText('Create provider', 'Page header renders');
    assert.dom(`[${ts}-config-title]`).exists('Config header shown in create mode');
    assert.dom(`[${ts}-creds-title]`).doesNotExist('New credentials header hidden in create mode');

    await click(`[${ts}-submit]`);
    assert
      .dom('[data-test-inline-error-message]')
      .exists({ count: 5 }, 'Required fields are shown on validation');

    ['client_id', 'client_secret', 'tenant_id'].forEach((prop) => {
      assert.dom(`[data-test-input="credentials.${prop}"]`).exists(`Azure ${prop} field renders`);
    });

    await fillIn('[data-test-input="provider"]', 'awskms');
    ['access_key', 'secret_key'].forEach((prop) => {
      assert.dom(`[data-test-input="credentials.${prop}"]`).exists(`AWS ${prop} field renders`);
    });

    await fillIn('[data-test-input="provider"]', 'gcpckms');
    assert.dom(`[data-test-input="credentials.service_account_file"]`).exists(`GCP cred field renders`);

    await fillIn('[data-test-input="name"]', 'foo');
    await fillIn('[data-test-input="keyCollection"]', 'keyvault-1');
    await fillIn('[data-test-input="credentials.service_account_file"]', 'test');
    await click(`[${ts}-submit]`);
  });

  test('it should render edit view', async function (assert) {
    assert.expect(3);

    this.server.put('/keymgmt/kms/foo', (schema, req) => {
      const params = {
        name: 'foo-bar',
        provider: 'azurekeyvault',
        key_collection: 'keyvault-1',
        credentials: {
          client_id: 'client_id test',
          client_secret: 'client_secret test',
          tenant_id: 'tenant_id test',
        },
      };
      assert.deepEqual(JSON.parse(req.requestBody), params, 'PUT request made with correct data');
      return {};
    });
    this.owner.lookup('service:router').reopen({
      transitionTo(path, model, { queryParams: { itemType } }) {
        assert.equal(path, 'vault.cluster.secrets.backend.show', 'Show route sent in transitionTo on save');
        assert.equal(model, 'foo', 'Model id sent in transitionTo on save');
        assert.deepEqual(itemType, 'provider', 'Correct query params sent in transitionTo on save');
      },
    });
    await render(hbs`
      <Keymgmt::ProviderEdit
        @root={{this.root}}
        @model={{this.model}}
        @mode="edit"
      />`);

    assert.dom(`[${ts}-header]`).hasText('Update credentials', 'Page header renders');
    assert.dom(`[${ts}-config-title]`).doesNotExist('Config header hidden in edit mode');
    assert.dom(`[${ts}-creds-title]`).exists('New credentials header shown in edit mode');

    for (const prop of ['client_id', 'client_secret', 'tenant_id']) {
      await fillIn(`[data-test-input="credentials.${prop}"]`, `${prop} test`);
    }
    await click(`[${ts}-submit]`);
  });
});
