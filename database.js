// database.js
import mariadb from "mariadb";
import dotenv from "dotenv";
dotenv.config();

const pool = mariadb.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 5
});

export async function connectDB() {
  return {
    run: async (sql, params) => {
      let conn;
      try {
        conn = await pool.getConnection();
        return await conn.query(sql, params);
      } finally {
        if (conn) conn.release();
      }
    },

    get: async (sql, params) => {
      let conn;
      try {
        conn = await pool.getConnection();
        const rows = await conn.query(sql, params);
        return rows[0];
      } finally {
        if (conn) conn.release();
      }
    },

    all: async (sql, params) => {
      let conn;
      try {
        conn = await pool.getConnection();
        return await conn.query(sql, params);
      } finally {
        if (conn) conn.release();
      }
    }
  };
}
