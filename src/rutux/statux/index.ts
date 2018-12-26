import { get, HighConditionQuery, ConditionSettings, UpdateQuery, update, ObjectLit } from "querifier"
import { Modulux } from "./Modelux"
import { MongoClient, ObjectID, ObjectId } from "mongodb"
import BSON from "bson-ext";

export interface StatuxState {
  [modelName: string]: Modulux
}

export class Statux {
  // @ts-ignore
  static BSON = new BSON([BSON.Binary, BSON.Code, BSON.DBRef, BSON.Decimal128, BSON.Double, BSON.Int32, BSON.Long, BSON.Map, BSON.MaxKey, BSON.MinKey, BSON.ObjectId, BSON.BSONRegExp, BSON.Symbol, BSON.Timestamp])
  private state: StatuxState

  constructor(initialState: StatuxState = {}) {
    this.state = initialState
  }

  get<T>(query: HighConditionQuery, options: ConditionSettings = {}): T[] {
    let output: unknown[] = []
    for(const collection in query) {
      const col = this.state[collection]
      if(col) {
        output = output.concat(this.state[collection].get(query[collection], options) as any[])
      }
    }

    return output as T[]
  }

  update(query: UpdateQuery) {
    this.state = update(this.state, query)
    return this.state
  }

  create<T>(model: string, data: T) {
    const m = this.state[model]
    if(!m) return;
    m.create(data).catch(console.error)
  }
}

