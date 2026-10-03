// Database adapter. The current index.html stays on Apps Script until cutover.
// Inject a pinned supabase-js client configured for the Cashflow Hub project.
export const CFH_PROJECT_URL = 'https://mssrsogwxvxyyjnavdiu.supabase.co';
export const CFH_PUBLISHABLE_KEY = 'sb_publishable_qrh_HT7v83geMCv-6xpgYA_yU-hw4JI';
export const CFH_OWNER_ID = '161ecab1-d1d7-4fef-a089-a7300b9da774';
const TABS = new Set(['life_log','twice_as_nyce','printing','cash_in_out',
  'money_flow','konek2card','rental']);

export class CashflowStore {
  constructor(client) {
    this.client = client;
    this.pending = new Map();
    this.listeners = new Set();
  }
  async requireOwner() {
    const { data, error } = await this.client.auth.getUser();
    if (error) throw error;
    if (data?.user?.id !== CFH_OWNER_ID) throw new Error('Sign in to your Cashflow Hub account.');
    return data.user;
  }
  async signIn(email, password) {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    try { return await this.requireOwner(); }
    catch (error) { await this.client.auth.signOut(); throw error; }
  }
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(record) {
    // An observer failure must never turn an acknowledged save into a failed save.
    for (const listener of this.listeners) {
      try { listener(record); } catch (error) { console.error('Cashflow observer failed', error); }
    }
  }
  validateTab(tab) {
    if (!TABS.has(tab)) throw new Error('Unknown Cashflow Hub tab.');
  }
  async firstBatch(tab, options = {}) { return this.history(tab, { ...options, limit: 10 }); }
  async history(tab, { limit = 10, cursor = null, category = null, from = null, to = null } = {}) {
    this.validateTab(tab);
    let query = this.client.from('cfh_records').select('*')
      .eq('owner_id', CFH_OWNER_ID).eq('tab_key', tab).is('deleted_at', null);
    if (category !== null) query = query.eq('category', category);
    if (from !== null) query = query.gte('occurred_at', from);
    if (to !== null) query = query.lt('occurred_at', to);
    if (cursor) {
      const date = new Date(cursor.occurred_at);
      if (Number.isNaN(date.getTime()) || !/^[0-9a-f-]{36}$/i.test(cursor.id))
        throw new Error('Invalid history cursor.');
      // Two-part cursor handles identical timestamps without duplicates or omissions.
      query = query.or('occurred_at.lt.' + date.toISOString() +
        ',and(occurred_at.eq.' + date.toISOString() + ',id.lt.' + cursor.id + ')');
    }
    const size = Math.max(1, Math.min(100, Math.floor(Number(limit) || 10)));
    const { data, error } = await query.order('occurred_at', { ascending: false })
      .order('id', { ascending: false }).limit(size + 1);
    if (error) throw error;
    const items = data.slice(0, size);
    const last = items.at(-1);
    return { items, hasMore: data.length > size,
      cursor: last ? { occurred_at: last.occurred_at, id: last.id } : null };
  }
  // Keep this object/request ID while retrying a timeout. A new tap gets a new ID.
  prepare(record) {
    this.validateTab(record.tab_key);
    const date = new Date(record.occurred_at);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid transaction date.');
    if (record.amount !== null && record.amount !== undefined && !Number.isFinite(Number(record.amount)))
      throw new Error('Invalid transaction amount.');
    return Object.freeze({
      p_request_id: crypto.randomUUID(), p_tab_key: record.tab_key,
      p_occurred_at: date.toISOString(), p_amount: record.amount ?? null,
      p_category: record.category ?? '', p_description: record.description ?? '',
      p_payload: structuredClone(record.payload ?? {}),
      p_source_values: structuredClone(record.source_values ?? [])
    });
  }
  save(prepared) {
    const key = prepared.p_request_id;
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = (async () => {
      const { data, error } = await this.client.rpc('cfh_save_record', prepared);
      if (error) throw error;
      this.emit(data);
      return data; // Sheets sync is deliberately outside this response.
    })().finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
  saveBundle(prepared) {
    const key = prepared.map(record=>record.p_request_id).join(':');
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = (async () => {
      const { data, error } = await this.client.rpc('cfh_save_bundle', {p_records:prepared});
      if (error) throw error;
      for (const record of data) this.emit(record);
      return data;
    })().finally(()=>this.pending.delete(key));
    this.pending.set(key,promise);
    return promise;
  }
  async setDeleted(record, deleted) {
    const { data, error } = await this.client.rpc('cfh_set_deleted', {
      p_id: record.id, p_expected_revision: record.revision, p_deleted: deleted
    });
    if (error) throw error;
    this.emit(data);
    return data;
  }
  delete(record) { return this.setDeleted(record, true); }
  restore(record) { return this.setDeleted(record, false); }
}
