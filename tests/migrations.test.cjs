const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');

test('migrations use the database of the URL, like the app', () => {
  const config = require(path.join(__dirname, '../migrate-mongo-config.js'));
  assert.equal(config.mongodb.databaseName, undefined);
});
