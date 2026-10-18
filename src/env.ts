// Imported first by entrypoints so process.env is populated before config.ts reads it.
try {
  process.loadEnvFile();
} catch {
  // no .env — fine
}
