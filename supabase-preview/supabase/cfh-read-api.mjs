import * as rules from './legacy-rules.mjs?v=financial5';
import { sourceDate } from './manila-date.mjs?v=financial5';
import { withRecords } from './rules-environment.mjs?v=financial5';
const routes = {
  lifeLogDashboard:['life_log','getLifeLogDashboardData','year','month'],
  expenseDashboard:['money_flow','getExpenseDashboardData','year','month'],
  dashboard:['money_flow','getExpenseDashboardData','year','month'],
  rentalDashboard:['rental','getRentalDashboardData','year','month'],
  testDashboard:['konek2card','getTestDashboardData','year','month'],
  twiceDashboard:['twice_as_nyce','getTwiceAsNyceDashboardData','year','month'],
  printingDashboard:['printing','getPrintingBusinessDashboardData','year','month'],
  gcashDashboard:['cash_in_out','getGcashBusinessDashboardData','year','month'],
  lifeLogTransactions:['life_log','getLifeLogTransactions','filter','year','month','issue','cursor','limit'],
  rentalTransactions:['rental','getRentalTransactions','category','filter','year','month','cursor','limit'],
  moneyFlowTransactions:['money_flow','getMoneyFlowTransactions','filter','cursor','limit'],
  testTransactions:['konek2card','getTestTransactions','filter','cursor','limit'],
  gcashTransactions:['cash_in_out','getGcashBusinessTransactions','category','cursor','limit'],
  printingTransactions:['printing','getIncomeExpenseTransactions','@Printing Business','category','cursor','limit'],
  twiceTransactions:['twice_as_nyce','getIncomeExpenseTransactions','@TwiceAsNyce','category','cursor','limit']
};
export class CashflowReadApi {
  constructor(snapshot, referenceCells = {}, konekSeed = null) {
    this.snapshot = snapshot;
    this.referenceCells = referenceCells;
    this.konekSeed = konekSeed;
  }
  handles(action) { return Object.hasOwn(routes,action); }
  async request(params, force = false) {
    const route = routes[params.action];
    if (!route) throw new Error('Unsupported Cashflow read action: '+params.action);
    const [tab,fn,...fields] = route;
    if (tab === 'konek2card') rules.configureKonekSeed(this.konekSeed);
    let records = await this.snapshot.load(tab,force);
    if (params.action === 'gcashTransactions' && params.year && params.month) {
      records = records.filter(record => {
        const date = sourceDate(record.source_values[0]);
        return date && typeof date.getFullYear === 'function' &&
          date.getFullYear() === Number(params.year) && date.getMonth() + 1 === Number(params.month);
      });
    }
    const args = fields.map(field=>field.startsWith('@')?field.slice(1):params[field]);
    const data = withRecords(records,this.referenceCells,()=>rules[fn](...args));
    return { ...data, success:true };
  }
}
