import {DatabaseSync} from 'node:sqlite';
import {chmodSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

const migrations=[`
CREATE TABLE users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
 bio TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL,
 rating INTEGER NOT NULL DEFAULT 1200 CHECK(rating>=100), rated_games INTEGER NOT NULL DEFAULT 0,
 wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id,created_at);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE progress (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 data_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);
CREATE TABLE tournaments (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('registration','active','ended')),
 max_players INTEGER NOT NULL CHECK(max_players BETWEEN 2 AND 16), time_control INTEGER NOT NULL,
 bracket_json TEXT NOT NULL DEFAULT '[]', rounds INTEGER NOT NULL DEFAULT 0,
 winner_id TEXT REFERENCES users(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE tournament_entrants (
 tournament_id TEXT NOT NULL REFERENCES tournaments(id), user_id TEXT NOT NULL REFERENCES users(id),
 seed_rating INTEGER NOT NULL, seed INTEGER, joined_at INTEGER NOT NULL,
 PRIMARY KEY(tournament_id,user_id)
);
CREATE TABLE matches (
 id TEXT PRIMARY KEY, white_id TEXT NOT NULL REFERENCES users(id), black_id TEXT REFERENCES users(id),
 ranked INTEGER NOT NULL DEFAULT 0 CHECK(ranked IN (0,1)), join_code TEXT UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('waiting','active','ended','cancelled')),
 state_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 time_control INTEGER NOT NULL, white_ms INTEGER NOT NULL, black_ms INTEGER NOT NULL,
 running TEXT CHECK(running IN ('w','b')), clock_at INTEGER NOT NULL,
 opening_deadline INTEGER, waiting_expires INTEGER, result_json TEXT,
 rated_settled INTEGER NOT NULL DEFAULT 0 CHECK(rated_settled IN (0,1)),
 tournament_id TEXT REFERENCES tournaments(id), tournament_round INTEGER, tournament_slot INTEGER,
 draw_index INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 CHECK(white_id<>black_id)
);
CREATE INDEX matches_white ON matches(white_id,status,created_at);
CREATE INDEX matches_black ON matches(black_id,status,created_at);
CREATE INDEX matches_active ON matches(status,opening_deadline);
CREATE TABLE engagements (
 user_id TEXT PRIMARY KEY REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('match','queue','tournament')),
 resource_id TEXT NOT NULL
);
CREATE TABLE queue (
 user_id TEXT PRIMARY KEY REFERENCES users(id), pool TEXT NOT NULL CHECK(pool IN ('ranked','casual')),
 time_control INTEGER NOT NULL, joined_at INTEGER NOT NULL, heartbeat_at INTEGER NOT NULL
);
CREATE INDEX queue_matching ON queue(pool,time_control,joined_at);
CREATE TABLE commands (
 match_id TEXT NOT NULL REFERENCES matches(id), command_id TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id), fingerprint TEXT NOT NULL, revision INTEGER NOT NULL,
 PRIMARY KEY(match_id,command_id)
);
CREATE TABLE match_events (
 match_id TEXT NOT NULL REFERENCES matches(id), sequence INTEGER NOT NULL,
 event_json TEXT NOT NULL, PRIMARY KEY(match_id,sequence)
);
CREATE TABLE reports (
 id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL REFERENCES users(id), match_id TEXT NOT NULL REFERENCES matches(id),
 category TEXT NOT NULL CHECK(category IN ('cheating','abuse','other')), details TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved','dismissed')),
 note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(reporter_id,match_id,category)
);
CREATE TABLE audit_events (
 id INTEGER PRIMARY KEY, actor_id TEXT REFERENCES users(id), kind TEXT NOT NULL,
 resource_id TEXT, data_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, window_at INTEGER NOT NULL, hits INTEGER NOT NULL);
CREATE INDEX rate_limits_window ON rate_limits(window_at);
`,
`ALTER TABLE tournaments ADD COLUMN cancelled INTEGER NOT NULL DEFAULT 0 CHECK(cancelled IN (0,1));`,
`UPDATE match_events SET event_json=json_remove(event_json,'$.state') WHERE json_type(event_json,'$.state') IS NOT NULL;`
];

export class Database {
 constructor(path=':memory:') {
  if(path!==':memory:')mkdirSync(dirname(resolve(path)),{recursive:true,mode:0o700});
  this.connection=new DatabaseSync(path);
  if(path!==':memory:')chmodSync(path,0o600);
  this.connection.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  this.statements=new Map();
  this.transaction(()=>{
   const current=this.connection.prepare('PRAGMA user_version').get().user_version;
   if(current>migrations.length)throw new Error('Database schema is newer than this server.');
   for(let index=current;index<migrations.length;index++){this.connection.exec(migrations[index]);this.connection.exec(`PRAGMA user_version=${index+1}`);}
  });
 }
 statement(sql){if(!this.statements.has(sql))this.statements.set(sql,this.connection.prepare(sql));return this.statements.get(sql);}
 run(sql,...args){return this.statement(sql).run(...args);}
 get(sql,...args){return this.statement(sql).get(...args);}
 all(sql,...args){return this.statement(sql).all(...args);}
 transaction(callback){
  if(this.inTransaction)throw new Error('Nested database transaction is not supported.');
  this.connection.exec('BEGIN IMMEDIATE');this.inTransaction=true;
  try{const result=callback();if(result&&typeof result.then==='function')throw new Error('Transactions must be synchronous.');this.connection.exec('COMMIT');return result;}
  catch(error){this.connection.exec('ROLLBACK');throw error;}
  finally{this.inTransaction=false;}
 }
 close(){this.statements.clear();this.connection.close();}
}
