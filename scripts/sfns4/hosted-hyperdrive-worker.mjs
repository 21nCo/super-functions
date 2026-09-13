// Disposable SFNS-4 canary. Deploy only with a dedicated test database and caching disabled.
import { Hono } from 'hono';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { drizzleAdapter } from '@superfunctions/db/adapters/drizzle';
import { PostgresAdapter, memories, memoryRelationships, ingestEvents } from '@memoryfn/core/storage/pg';
import initial from '../../memoryfn/typescript/migrations/0001-initial.sql';
import lifecycle from '../../memoryfn/typescript/migrations/0002-memory-lifecycle.sql';
const app = new Hono();
const assert = (condition, name) => { if (!condition) throw new Error(name); };
const vector = index => Array.from({length:1536}, (_,i)=>i===index?1:0);
app.post('/run', async c => {
  const provided = new TextEncoder().encode(c.req.header('authorization') || '');
  const expected = new TextEncoder().encode(`Bearer ${c.env.CANARY_TOKEN}`);
  if (!c.env.CANARY_TOKEN || provided.length !== expected.length || !crypto.subtle.timingSafeEqual(provided, expected)) return c.json({ok:false},403);
  const client = postgres(c.env.HYPERDRIVE.connectionString, {max:5, prepare:true, connect_timeout:15, onnotice:()=>{}});
  const checks=[];
  let stage='migrations';
  try {
    // Each migration is transactionally applied using the actual distributed SQL files.
    for (const migration of [initial,lifecycle]) await client.begin(tx=>tx.unsafe(migration));
    checks.push('packaged-migrations');
    const db=drizzle(client,{schema:{memories,memoryRelationships,ingestEvents}});
    const adapter=new PostgresAdapter(db);
    const tenant=`sfns4-${crypto.randomUUID()}`;
    stage='shared-db-rollback';
    const shared=drizzleAdapter({db,dialect:'postgres'});
    const rollbackId=crypto.randomUUID();
    let rolledBack=false;
    try {await shared.transaction(async tx=>{
      await tx.create({model:'memories',data:{id:rollbackId,tenantId:tenant,containerTags:[],type:'conversational',content:'rollback-probe'}});
      throw new Error('expected-shared-rollback');
    });} catch(error){rolledBack=error.message==='expected-shared-rollback';}
    assert(rolledBack && await shared.findOne({model:'memories',where:[{field:'id',operator:'eq',value:rollbackId}]})===null,'shared-adapter-rollback');
    checks.push('shared-adapter-rollback');
    stage='scope';
    const rows=await adapter.insertMemories([
      {tenantId:tenant,containerTags:['shared'],content:'public',embedding:vector(0)},
      {tenantId:tenant,containerTags:['shared','private'],content:'private',embedding:vector(0)},
      {tenantId:tenant+'-other',containerTags:['shared','private'],content:'other',embedding:vector(0)}
    ]);
    const scope={tenantId:tenant,containerTags:['shared','private'],id:rows[1].id};
    const found=await adapter.searchVectors({...scope,embedding:vector(0),topK:10});
    assert(found.length===1 && found[0].id===scope.id,'tenant-tag-isolation');
    let denied=false;
    try {await adapter.deleteMemory({...scope,tenantId:tenant+'-other'});} catch {denied=true;}
    assert(denied,'cross-tenant-delete-denied');checks.push('tenant-tag-isolation','cross-tenant-delete-denied');
    stage='revision';
    const competing=await Promise.allSettled([1,2].map(()=>adapter.updateMemory({...scope,expectedRevision:1,changes:{content:'updated',embedding:vector(1)}})));
    assert(competing.filter(r=>r.status==='fulfilled').length===1,'revision-single-winner');
    assert((await adapter.searchVectors({...scope,embedding:vector(0),threshold:0.9,topK:10})).length===0,'old-vector-denied');
    checks.push('revision-single-winner','old-vector-denied');
    stage='rollback';
    await adapter.insertRelationships([{fromId:rows[0].id,toId:rows[1].id}]);
    // The trigger only targets this run's endpoint, so other runs are unaffected.
    const suffix=crypto.randomUUID().replaceAll('-','');
    const fn=`sfns4_fail_${suffix}`;
    await client.unsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.to_id = '${scope.id}'::uuid THEN RAISE EXCEPTION 'sfns4 expected cleanup failure'; END IF; RETURN OLD; END $$; CREATE TRIGGER ${fn} BEFORE DELETE ON memory_relationships FOR EACH ROW EXECUTE FUNCTION ${fn}();`);
    try {
      let rejected=false;try {await adapter.deleteMemory(scope);} catch {rejected=true;}
      assert(rejected,'cleanup-failure-rejected');
      assert((await adapter.getMemory(scope))?.content==='updated','cleanup-transaction-rollback');
    } finally {await client.unsafe(`DROP TRIGGER IF EXISTS ${fn} ON memory_relationships; DROP FUNCTION IF EXISTS ${fn}();`);}
    checks.push('cleanup-transaction-rollback');
    stage='forget';
    await adapter.deleteMemory(scope);await adapter.deleteMemory(scope);
    const [raw]=await client`SELECT content,embedding,metadata,deleted_at FROM memories WHERE id=${scope.id}`;
    assert(raw.content==='' && raw.embedding===null && Object.keys(raw.metadata).length===0 && raw.deleted_at!==null,'forget-scrub');
    assert((await client`SELECT id FROM memory_relationships WHERE to_id=${scope.id}`).length===0,'relation-cleanup');
    let staleDenied=false;try{await adapter.updateMemory({...scope,expectedRevision:2,changes:{content:'stale'}});}catch{staleDenied=true;}
    assert(staleDenied,'tombstone-no-resurrection');
    checks.push('forget-scrub','relation-cleanup','tombstone-no-resurrection');
    stage='ownership';
    await adapter.close();await client`SELECT 1`;checks.push('injected-client-ownership');
    await client.end({timeout:5});
    stage='reconnect';
    const fresh=postgres(c.env.HYPERDRIVE.connectionString,{max:1,prepare:true,connect_timeout:15,onnotice:()=>{}});
    try {
      const recreated=new PostgresAdapter(drizzle(fresh,{schema:{memories,memoryRelationships,ingestEvents}}));
      assert(await recreated.getMemory(scope)===null,'reconnect-tombstone');
      checks.push('reconnect-tombstone');
      const [version]=await fresh`SELECT current_setting('server_version') AS version, extversion AS vector_version FROM pg_extension WHERE extname='vector'`;
      return c.json({ok:true,checks,version,colo:c.req.raw.cf?.colo??null});
    } finally {await fresh.end({timeout:5});}
  } catch(error) {
    // No credentials, connection strings or query payloads are returned.
    const connection=new URL(c.env.HYPERDRIVE.connectionString);
    let diagnostic=String(error?.message||'').slice(0,500);
    for (const secret of [c.env.HYPERDRIVE.connectionString,connection.password,decodeURIComponent(connection.password)]) if(secret) diagnostic=diagnostic.replaceAll(secret,'[REDACTED]');
    return c.json({ok:false,stage,checks,diagnostic,errorCode:typeof error?.code==='string'?error.code:'CANARY_FAILED'},500);
  } finally {await client.end({timeout:5});}
});
export default app;
