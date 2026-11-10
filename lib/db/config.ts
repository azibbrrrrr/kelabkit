// The only place outside with-club.ts that names the database variable, so the boundary test
// (tests/db-boundary.test.ts) can keep forbidding the literal everywhere else.
export const DB_CONNECTION_ENV = "DATABASE_URL";
