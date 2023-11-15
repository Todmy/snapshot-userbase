import mysql from 'mysql2/promise';
import { ConnectionString } from 'connection-string';
export { OkPacket, FieldPacket } from 'mysql2/promise';

const { protocol: remProtocol, hosts: remHosts, path: remPath, ...remConfig } = new ConnectionString(process.env.REMOTE_DATABASE_URL || '');
const remDB: mysql.Pool = mysql.createPool({
  ...remConfig,
  host: remHosts?.[0].name,
  port: remHosts?.[0].port,
  connectionLimit: parseInt(process.env.CONNECTION_LIMIT || '10'),
  multipleStatements: true,
  connectTimeout: 60e3,
  waitForConnections: true,
  charset: 'utf8mb4',
  database: remPath?.[0],
  queueLimit: 0
});

const { protocol: locProtocol, hosts: locHosts, path: locPath, ...locConfig } = new ConnectionString(process.env.LOCAL_DATABASE_URL || '');
const locDB: mysql.Pool = mysql.createPool({
  ...locConfig,
  host: locHosts?.[0].name,
  port: locHosts?.[0].port,
  connectionLimit: parseInt(process.env.CONNECTION_LIMIT || '10'),
  multipleStatements: true,
  connectTimeout: 60e3,
  waitForConnections: true,
  charset: 'utf8mb4',
  database: locPath?.[0],
  queueLimit: 0
});

export {
  remDB,
  locDB
}
