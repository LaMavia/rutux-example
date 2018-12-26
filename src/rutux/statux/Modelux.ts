import m, { MongoClient, UpdateQuery } from "mongodb"
import BSON, {
	Int32,
	DBRef,
	ObjectID,
	Timestamp,
	Long,
	BSONRegExp,
	Double,
	Binary,
	Code,
	Decimal128,
	MinKey,
	MaxKey,
	Symbol,
  ObjectId,
} from "bson-ext"
import { ConditionQuery } from "querifier/dist/src/distionaries/condition.dict";
import { ConditionSettings, get, update, HighConditionQuery, ObjectLit } from "querifier";
import { Statux } from ".";

/**
 * | Int32
	| DBRef
	| ObjectID
	| Timestamp
	| String
	| Long
	| BSON
	| BSONRegExp
	| Double
	| Binary
	| Code
	| Decimal128
	| MinKey
	| MaxKey
	| Symbol
 */
type ModuluxSchemeValue = any

export interface ModuluxSchemeInput {
  [key: string]: ModuluxSchemeValue
}

export interface ModuluxScheme extends ObjectLit {
  _id: typeof ObjectID
} 

export interface ModuluxState {
  [id: string]: Uint8Array
}

export class Modulux {
  client: MongoClient
  dbName: string
	collection: string
  scheme: Function
  private state: Map<string, Uint8Array>

	constructor(client: MongoClient, dbName: string, collection: string, scheme: Function) {
    this.client = client
    this.dbName = dbName
		this.collection = collection
    this.scheme = scheme
    this.state = new Map()

    this.get({posts: {$exec() {return true}}},{},true)
  }
  

  public get this() {
    return this.state
  }

  get(query: ConditionQuery, options: ConditionSettings = {}, forceDB?: boolean): ModuluxScheme[] { 
    let output: ModuluxScheme[] = []
    const q = {[this.collection]: query}
    const o = {[this.collection]: this.state}
    if(!forceDB) {
      output = get(o, q, {
        ...options,
        $mapper: options.$mapper || (([key, x]: any[]) => {
          debugger
          return Statux.BSON.deserialize(x)
        })
      })
      if(output.length !== 0) return output
    }

    if(this.client.isConnected()) {
      debugger
      const db = this.client.db(this.dbName)
      db.collection(this.collection)
        .find(query[this.collection])
        .toArray()
          .then((v: ModuluxScheme[]) => {
            debugger
            output = v
            for(const x of v) {
              this.state.set(String(x._id), Statux.BSON.serialize(x))
            }
          })
          .catch(e => {
            console.error(e)
          })
    } else {
      this.client.connect()
        .then(() => {
          output = this.get(query, options)
        })
        .catch(console.error)
    }

    return output
  }

  async create(input: ObjectLit): Promise<ObjectLit> {
    return new Promise((res, rej) => {
      try {
        debugger
        // @ts-ignore
        const s = Object.assign(new this.scheme(input) as ObjectLit, {_id: new BSON.ObjectId()})
        const obj = Statux.BSON.serialize(s)
        res(obj)
        this.state.set(s._id.toHexString(), obj)
        // Push to the database
        this.pushToDB(s)
      }
      catch(e) {
        rej(new Error(`[Rutux]> Error creating model.\nInput: "${JSON.stringify(input)}"\nError: "${e}"`))
      }
    })
  }

  private pushToDB(data: ObjectLit) {
    if(this.client.isConnected()) {
      const db = this.client.db(this.dbName)
      db.collection(this.collection)
        .insertOne(data)
          .then(_ => console.info(`Wrote to the db->${this.collection}->${String(data._id)}`))
          .catch(err => {
            console.error(err)
          })
        
    } else {
      this.client.connect()
        .then(this.get.bind(this, data))
        .catch(console.error)
    }
  }

  update() {

  }
}
