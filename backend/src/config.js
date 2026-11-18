try {
  require('dotenv').config();
} catch {
  // Optional: process env can still be provided by the host.
}

module.exports = {
  app: {
    port: Number(process.env.PORT || 4000),
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'wh7led5',
    apiKey: process.env.CLOUDINARY_API_KEY || '982532856713325',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
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
