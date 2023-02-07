import { pg } from './connection';

const initializeDB = async () => {
  if (!(await pg.schema.hasTable('server'))) {
    await pg.schema
      .createTable('server', table => {
        table.increments('id');
        table.string('externalId').unique().index();
        table.string('contractAddress');
        table.string('categoryChannelId');
        table.string('generalChannelId');
        table.boolean('disablePrivateMessages');
      });
  } else {
    if (!(await pg.schema.hasColumn('server', 'disablePrivateMessages'))) {
      await pg.schema.table('server', table => {
        table.boolean('disablePrivateMessages');
      });
    }
  }

  if (!(await pg.schema.hasTable('role'))) {
    await pg.schema
      .createTable('role', table => {
        table.increments('id');
        table.string('externalId').index();
        table.integer('serverId').references('id').inTable('server');
        table.string('externalServerId').references('externalId').inTable('server').index();
        table.string('tokenId');
        table.decimal('minBalance');
        table.string('metaCondition');
        table.string('rebusNftid');
      });
  } else {
    if (!(await pg.schema.hasColumn('role', 'rebusNftid'))) {
      await pg.schema.table('role', table => {
        table.string('rebusNftid');
      });
    }
  }

  if (!(await pg.schema.hasTable('nonce'))) {
    await pg.schema
      .createTable('nonce', table => {
        table.increments('id');
        table.string('address').notNullable();
        table.bigInteger('nonce').notNullable();
      });
  }

  if (!(await pg.schema.hasTable('holder'))) {
    await pg.schema
      .createTable('holder', table => {
        table.increments('id');
        table.string('address').notNullable();
        table.string('ethAddress').notNullable();
        table.string('userId').notNullable();
        table.string('externalServerId').references('externalId').inTable('server').index();
      });
  }
};

export { initializeDB };
