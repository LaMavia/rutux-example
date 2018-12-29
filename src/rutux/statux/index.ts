import { Modulux } from "./Modelux"
import { MongoClient, ObjectID, ObjectId, FilterQuery } from "mongodb"
import BSON from "bson-ext";
import { HighConditionQuery, ConditionSettings } from "querifier/dist/src/distionaries/condition.dict";
import { UpdateQuery } from "querifier/dist/src/distionaries/update.dict";
import { get } from "querifier/dist/src/get"
import { update } from "querifier/dist/src/update"

export interface HighUpdateQuery {
  [collection: string]: UpdateQuery
}

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

  get(query: HighConditionQuery, options: Partial<ConditionSettings<any>> = {}) {
    let output: unknown[] = []
    for(const collection in query) {
      const col = this.state[collection]
      if(col) {
        output = output.concat(this.state[collection].get(query[collection], options))
      }
    }

    return output
  }

  update<T>(filter: FilterQuery<T>, query: HighUpdateQuery): StatuxState {
    let err
    for(const col in query) {
      this.state[col]&&
        this.state[col].update(filter, query[col])
          .then(x => {
            process.env["NODE_ENV"] === "development" &&
              console.info(`Updated ${col} with: ${JSON.stringify(query[col])}`)
          })
          .catch(e => err = e)
    }
    if(err) throw err
    return this.state
  }

  create<T>(model: string, data: T) {
    const m = this.state[model]
    if(!m) return;
    m.create(data).catch(console.error)
  }
}

