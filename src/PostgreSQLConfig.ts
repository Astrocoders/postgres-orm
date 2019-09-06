import * as pg from 'pg'
import * as path from 'path'

const root = process.cwd()
const configFile = path.join(root, 'postgresconfig.js')
const config: pg.ConnectionConfig = require(configFile)

const pool = new pg.Pool(config)

pool.on('error', error => {
  throw new Error(error.toString())
})

export const pgsql = pool
export const connect = () => pool.connect()
