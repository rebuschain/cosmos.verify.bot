import knex from 'knex';

const pg = knex({
  client: 'pg',
  connection: process.env.DB_DSN,
});

export { pg };
