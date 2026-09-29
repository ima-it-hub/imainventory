module.exports = {
  app: {
    port: Number(process.env.PORT || 4000),
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },
  database: {
    odbc: {
      dsn: process.env.ODBC_DSN || 'basse silwan',
      connectionString:
        process.env.ODBC_CONNECTION_STRING ||
        'Driver={PostgreSQL Unicode(x64)};Server=191.164.16.153;Port=5432;Database=rp_central;Uid=postgres;Pwd=;sslmode=disable;',
    },
    postgres: {
      connectionString:
        process.env.POSTGRES_CONNECTION_STRING ||
        'postgresql://postgres.mkvgxkhtwuwdcimuwhmk:STOREima%402023@aws-1-eu-west-1.pooler.supabase.com:5432/postgres',
    },
  },
};
