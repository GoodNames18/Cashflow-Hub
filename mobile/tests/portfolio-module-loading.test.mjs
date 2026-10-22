import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('portfolio UI, live sync and offline cache load the same module instance',()=>{
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 const sync=readFileSync(new URL('../../supabase/cfh-browser.mjs',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../../sw.js',import.meta.url),'utf8');
 const entry=html.match(/src="([^"\s]*cfh-portfolio\.mjs[^"\s]*)"/)[1];
 const imported=sync.match(/from ['"]([^'"]*cfh-portfolio\.mjs[^'"]*)['"]/)[1];
 const cached=sw.match(/"([^"\s]*cfh-portfolio\.mjs[^"\s]*)"/)[1];
 const origin='https://example.com/Cashflow-Hub/';
 assert.equal(new URL(entry,origin).href,new URL(imported,origin+'supabase/cfh-browser.mjs').href);
 assert.equal(new URL(entry,origin).href,new URL(cached,origin).href);
});
