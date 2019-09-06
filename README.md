# @Astrocoders/postgres-orm ⚡️🔨

### Installation
`yarn add -D @astrocoders/postgres-orm` or `npm install --save-dev @astrocoders/postgres-orm`

### Usage

Create a postgresconfig.js file in the root directory of your project. For example:

```js
require('dotenv').config()

module.exports = {
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT),
  user: process.env.PG_USER,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  databaseConfigFolder: 'pgSql',
}
```

So you can use `import PostgreSQLORM from '@Astrocoders/postgres-orm'`
