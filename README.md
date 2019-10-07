# @Astrocoders/postgres-orm ⚡️🔨

### Installation
`yarn add @astrocoders/postgres-orm postgres` or `npm install @astrocoders/postgres-orm postgres`

### Usage

```js
import createORM from '@Astrocoders/postgres-orm'
import * as pg from 'postgres'

export const pool = new pg.Pool(config)
export const connect = () =>
  pool.connect().then(() => console.log('Connection successful'))

const orm = createORM({ entityMapperClass, tableName, debug, client: pool })
```
