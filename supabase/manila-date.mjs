// Legacy rules use calendar Date methods. Make them independent of device timezone.
const NativeDate = globalThis.Date;
export class ManilaDate extends NativeDate {
  constructor(...args) {
    if (args.length > 1) super(NativeDate.UTC(...args) - 8 * 3600000);
    else super(...(args.length ? args : [NativeDate.now()]));
  }
  local() { return new NativeDate(this.getTime() + 8 * 3600000); }
  getFullYear() { return this.local().getUTCFullYear(); }
  getMonth() { return this.local().getUTCMonth(); }
  getDate() { return this.local().getUTCDate(); }
  getHours() { return this.local().getUTCHours(); }
  getMinutes() { return this.local().getUTCMinutes(); }
  getSeconds() { return this.local().getUTCSeconds(); }
  getMilliseconds() { return this.local().getUTCMilliseconds(); }
  setHours(...args) {
    const date = this.local(); date.setUTCHours(...args);
    return this.setTime(date.getTime() - 8 * 3600000);
  }
}
export function sourceDate(value) {
  if (!value) return value;
  if (typeof value === 'string' && /^\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value))
    return new ManilaDate('1899-12-30T' + value + '+08:00');
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value))
    return new ManilaDate(/[zZ]$|[+-]\d\d:\d\d$/.test(value) ? value : value + '+08:00');
  return value instanceof NativeDate ? new ManilaDate(value.getTime()) : value;
}
