import * as eres from 'eres'
import * as Future from 'fluture'
import * as R from 'ramda'
import { reduce } from 'lodash'
import { pgsql } from './PostgreSQLConfig'
import { FutureInstance } from 'fluture'
import * as pg from 'pg'

export const toBase64 = (str: string) => Buffer.from(str, 'ascii').toString('base64')
export const fromBase64 = (b64: string) => Buffer.from(b64, 'base64').toString('ascii')
// @ts-ignore
export const sanitizePayload = payload =>
  Object.keys(payload).reduce(
    (acc, key) =>
      payload[key] !== undefined
        ? {
            ...acc,
            [key]: payload[key],
          }
        : acc,
    {},
  )

interface Payload {
  [k: string]: any
}

interface Query {
  text: string
  values: string[]
}

interface QueryResult<T> extends pg.QueryResultBase {
  rows: T[]
}

export const getFields = (fields: Payload) =>
  reduce(
    fields,
    (acc, value, key) =>
      R.isNil(value)
        ? acc
        : {
            ...acc,
            [key]: value,
          },
    {},
  )

interface GeneratePgCustomUpdate {
  payload: Payload
  table: string
  clause: Payload
}

export const generatePgCustomUpdate = ({ payload, table, clause }: GeneratePgCustomUpdate) => {
  const fields = getFields(payload)
  const fieldsKeys = Object.keys(fields)

  const values = fieldsKeys.map((_, idx) => `$${idx + 1}`)
  const clauseKeysCount = Object.keys(clause).length === 0
  const where = clauseKeysCount
    ? ''
    : `
    where ${Object.keys(clause)
      .map((key, index) => `${key} = $${index + 1 + values.length}`)
      .join(' and ')}
  `

  const update = `
    update ${table}
    set ${fieldsKeys.map((key, index) => `${key} = ${values[index]}`).join(' , ')}
    ${where}
    RETURNING *
  `

  return {
    text: update,
    values: Object.values(fields).concat(Object.values(clause)),
  }
}

export const getWhereClauseFromObject = ({ payload }: { payload: Payload }): string =>
  R.pipe(
    R.keys,
    R.filter(key => payload[key] !== undefined),
    R.map(key => `${key} = '${payload[key]}'`),
    R.join(' and '),
  )(payload)

interface GenerateCustomDelete {
  table: string
  clause: Payload
}

export const generateCustomDelete = ({ table, clause }: GenerateCustomDelete): Query => {
  const remove = `
    delete from ${table}
    where ${Object.keys(clause)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(' and ')}
  `

  return {
    text: remove,
    values: Object.values(clause),
  }
}

type EntityMapperClass<T, Raw> = {
  new (values: Raw): T
  toRaw(values: Partial<T>): Partial<Raw>
}

// @ts-ignore
export const generatePgInsert = ({ payload, table }): Query => {
  const fields = getFields(payload)
  const fieldsKeys = Object.keys(fields)
  const values = fieldsKeys.map((_, idx) => `$${idx + 1}`)
  const insert = `
    INSERT INTO ${table}
    (${fieldsKeys.join(', ')})
    VALUES (${values.join(', ')})
    RETURNING *
  `

  return {
    text: insert,
    values: Object.values(fields),
  }
}

interface FindWithCursorInput {
  orderByColumn: string
  query?: string | null
  first?: number | null
  last?: number | null
  after?: string | null
  before?: string | null
}

interface Edge<T> {
  node: T
  cursor: string
}

interface FindWithCursorPayload<T> {
  edges: Edge<T>[]
  count: number
  pageInfo: {
    startCursor: string | null
    endCursor: string | null
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

// @ts-ignore
export function createORM<T, Raw>({
  tableName,
  debug = false,
  entityMapperClass,
}: {
  tableName: string
  debug?: boolean
  entityMapperClass: EntityMapperClass<T, Raw>
}) {
  type PgResult = QueryResult<T>

  const insert = (values: Payload) => {
    const query = generatePgInsert({ payload: values, table: tableName })

    return (
      Future.tryP<never, PgResult>(() => pgsql.query(query.text, query.values))
        .map(debug ? R.tap<PgResult>(console.log) : R.identity)
        // @ts-ignore
        .map(value => new entityMapperClass(value.rows[0]))
    )
  }

  const count = (values: Payload): Future.FutureInstance<never, number> => {
    const query = getWhereClauseFromObject({ payload: values })

    return (
      Future.tryP<never, PgResult>(() =>
        pgsql.query(`select count(*) from ${tableName} ${query.length !== 0 ? `where ${query}` : ''}`),
      )
        .map(debug ? R.tap<PgResult>(console.log) : R.identity)
        // @ts-ignore
        .map(value => value.rows[0].count)
        .map(Number)
    )
  }

  const countWithRawQuery = (sql: string): Future.FutureInstance<never, number> => {
    const query = `select count(*) from ${tableName} ${sql.length !== 0 ? `where ${sql}` : ''}`

    return (
      Future.tryP<never, PgResult>(() => pgsql.query(query))
        .map(debug ? R.tap<PgResult>(console.log) : R.identity)
        // @ts-ignore
        .map(value => value.rows[0].count)
        .map(Number)
    )
  }

  const mapResults = (result: Future.FutureInstance<never, PgResult>) =>
    // @ts-ignore
    result.pipe(Future.map(value => value.rows)).pipe(Future.map(R.map(data => new entityMapperClass(data))))

  const find = (payload: Payload) => {
    const clause = getWhereClauseFromObject({ payload })

    return (
      Future.tryP<never, PgResult>(() =>
        pgsql.query(`select * from ${tableName} ${clause.length !== 0 ? `where ${clause}` : ''}`),
      )
        .map(value => value.rows)
        // @ts-ignore
        .map(R.map(data => new entityMapperClass(data)))
    )
  }

  const findWithRawQuery = (rawWhere: string) => {
    return (
      Future.tryP<never, PgResult>(() => pgsql.query(`select * from ${tableName} where ${rawWhere}`))
        .map(value => value.rows)
        // @ts-ignore
        .map(R.map(data => new entityMapperClass(data)))
    )
  }

  const findOne = (payload: Partial<T>) => {
    const clause = getWhereClauseFromObject({ payload })

    return (
      Future.tryP<never, PgResult>(() =>
        pgsql.query(`select * from ${tableName} ${clause.length !== 0 ? `where ${clause}` : ''}`),
      )
        .map(value => value.rows[0] || null)
        // @ts-ignore
        .map(data => (data ? new entityMapperClass(data) : null))
    )
  }

  const update = (clause: Payload, values: Payload) => {
    const query = generatePgCustomUpdate({ payload: values, table: tableName, clause })
    return Future.tryP<never, PgResult>(() => pgsql.query(query.text, query.values)).map(
      // @ts-ignore
      value => new entityMapperClass(value.rows[0]) || null,
    )
  }

  /*
   * This implementation uses the index position as the cursor for each edge as our system
   * */
  const MAX_FIRST = 100
  const findWithCursor = async ({
    query = '',
    after,
    before = null,
    first = MAX_FIRST,
    last = null,
    orderByColumn,
  }: FindWithCursorInput): Promise<FindWithCursorPayload<T>> => {
    const order = R.is(Number, last) ? 'asc' : 'desc'
    const offset = Number(fromBase64(after || before || toBase64('0')))
    const limit = Math.min(MAX_FIRST, first || last || MAX_FIRST)
    const errorReturn = {
      edges: [],
      count: 0,
      pageInfo: {
        startCursor: null,
        endCursor: null,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    }

    const whereClause = query ? `where ${query}` : ''
    const paginationClause = `order by ${orderByColumn ||
      'created_at'} ${order} offset ${offset} rows fetch next ${limit} rows only`
    const [countErr, countResult] = await eres<PgResult, Error>(
      pgsql.query(`select count(${orderByColumn || 'id'}) from ${tableName} ${whereClause}`),
    )

    if (countErr) {
      console.log('Count err', countErr)
      return errorReturn
    }

    const total = R.pathOr(0, ['rows', '0', 'count'], countResult)

    if (total === 0) {
      return errorReturn
    }

    // console.time('edges mapping')
    const [resultErr, result] = await eres<PgResult, Error>(
      pgsql.query(`select * from ${tableName} ${whereClause} ${paginationClause}`),
    )

    if (resultErr) {
      console.log('Result err', countErr, resultErr)
      return errorReturn
    }

    const edges = result.rows.map((row, index) => ({
      // @ts-ignore
      node: new entityMapperClass(row),
      cursor: toBase64(String(offset + index)),
    }))
    const startCursor = offset
    const endCursor = startCursor + (edges.length - 1)
    // console.timeEnd('edges mapping')

    return {
      edges,
      count: total,
      pageInfo: {
        startCursor: toBase64(String(startCursor)),
        endCursor: toBase64(String(endCursor)),
        //          hasPreviousPage = start cursor in front of offset                                                                         hasNextPage = endCursor behind total count
        //   ___________________________|______________________________                                                       _____________________________________|_________________________________
        //   |                                                         |                                                     |                                                                      |
        //                             offset                        start cursor ---------------- limit ------------- end cursor
        //                               ^                             ^                                                    ^
        //         items                 |            items            |                             items                  |                                        items
        // ______________________________|_____________________________|____________________________________________________|_______________________________________________________________________
        //                                                                                                                                                                               total count
        hasNextPage: total - endCursor > 1,
        hasPreviousPage: startCursor - offset >= 0 && startCursor > 0,
      },
    }
  }

  const requestRaw = (query: string): FutureInstance<never, T[]> => {
    // @ts-ignore
    return Future.tryP(() => pgsql.query(query)).pipe(mapResults)
  }

  return {
    tableName,
    insert: (values: Partial<T>) => insert(sanitizePayload(entityMapperClass.toRaw(values))),
    findWithRawQuery,
    find: (values: Partial<T>) => find(sanitizePayload(entityMapperClass.toRaw(values))),
    findOne: (values: Partial<T>) => findOne(sanitizePayload(entityMapperClass.toRaw(values))),
    findWithCursor,
    count: (values: Partial<T>) => count(sanitizePayload(entityMapperClass.toRaw(values))),
    countWithRawQuery,
    update: (query: Partial<T>, payload: Partial<T>) =>
      update(sanitizePayload(entityMapperClass.toRaw(query)), sanitizePayload(entityMapperClass.toRaw(payload))),
    mapResults,
    requestRaw,
  }
}
