import { openDatabase, migrate } from '../apps/system/backend/src/infrastructure/database/connection.js';
const db = openDatabase();
migrate(db);
db.close();
console.log('Migrations aplicadas.');
